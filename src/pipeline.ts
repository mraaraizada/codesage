// The single orchestration module. Both the CLI (src/cli.ts) and the HTTP server
// (server/src/jobs.ts) call runPipeline() — there is exactly one implementation of the
// "investigate -> patch -> test -> report" workflow, reused by both interfaces.
import { join } from "node:path";
import { buildRepoIndex } from "./repo/indexer.js";
import { rebindTestCommand } from "./repo/stack.js";
import { extractKeywords, searchIndex } from "./search/grep.js";
import { createIsolatedWorkspace } from "./workspace/isolate.js";
import { ensureDependenciesInstalled } from "./testRunner/install.js";
import { runTests } from "./testRunner/run.js";
import { applyUnifiedDiff } from "./patch/apply.js";
import { isLLMConfigured } from "./llm/client.js";
import { investigateBug } from "./llm/investigate.js";
import { proposePatch } from "./llm/patch.js";
import { writeReport } from "./report/generate.js";
import type {
  CodeSageReport,
  RepoIndex,
  SearchHit,
  TestRunResult,
  ApplyResult,
  PatchResult,
  TestCommand,
  VerificationStatus,
} from "./types.js";

export type PipelineStage =
  | "indexing"
  | "searching"
  | "investigating"
  | "creating-workspace"
  | "testing-before"
  | "patching"
  | "applying-patch"
  | "testing-after"
  | "reporting"
  | "done"
  | "error";

export interface PipelineEvent {
  stage: PipelineStage;
  message: string;
  data?: Record<string, unknown>;
}

export interface PipelineOptions {
  repoPath: string;
  bugReport: string;
  outDir?: string;
  dryRun?: boolean;
  keepWorkspace?: boolean;
  maxIterations?: number;
  testTimeoutMs?: number;
  onEvent?: (e: PipelineEvent) => void;
}

const DEFAULT_TEST_TIMEOUT_MS = Number(process.env.CODESAGE_TEST_TIMEOUT_MS) || 120_000;

export const BASE_LIMITATIONS = [
  "Isolation is a plain filesystem copy plus a fresh local git repository, not a container or VM: it guarantees the ORIGINAL repository is never mutated, but it does not sandbox network access, CPU/memory limits, or other OS-level side effects of whatever the test command does.",
  "Dependency installation (npm/pip install) requires real network access unless dependencies were already vendored in the source repo's node_modules and got copied into the workspace.",
  "A wall-clock timeout bounds each test subprocess; this is a time limit, not a network or syscall-level sandbox.",
];

function summarizeHits(hits: SearchHit[]): CodeSageReport["searchHits"] {
  return hits.map((h) => ({ relPath: h.relPath, score: h.score, matchCount: h.matches.length }));
}

export function decideVerification(args: {
  testCommand: TestCommand | null;
  investigationDegraded: boolean;
  investigationDegradedReason?: string;
  apply: ApplyResult | null;
  testsBefore: TestRunResult | null;
  testsAfter: TestRunResult | null;
}): { status: VerificationStatus; reason: string } {
  const { testCommand, investigationDegraded, investigationDegradedReason, apply, testsBefore, testsAfter } = args;

  if (investigationDegraded) {
    return {
      status: "inconclusive",
      reason:
        `${investigationDegradedReason ?? "The investigation did not identify any specific file(s) to patch."} No patch was generated — attempting one anyway, with no real evidence to base it on, would have produced a meaningless diff.`,
    };
  }
  if (!testCommand) {
    return { status: "no-tests-detected", reason: "No automated test command could be detected for this project (no usable package.json test script, pytest.ini, pyproject.toml, or requirements.txt found), so pass/fail verification is not possible." };
  }
  if (!apply || !apply.applied) {
    return { status: "patch-did-not-apply", reason: `The proposed patch could not be applied to the isolated workspace: ${apply?.error ?? "unknown error"}` };
  }
  if (!testsBefore || !testsBefore.ran) {
    return { status: "inconclusive", reason: "Baseline ('before patch') test run did not complete, so no before/after comparison is possible." };
  }
  if (!testsAfter || !testsAfter.ran) {
    return { status: "inconclusive", reason: "The patch applied, but the 'after patch' test run did not complete (process error or timeout), so the fix cannot be verified." };
  }

  const beforeFailing = testsBefore.exitCode !== 0;
  const afterFailing = testsAfter.exitCode !== 0;

  if (beforeFailing && !afterFailing) {
    return { status: "verified-fixed", reason: `Tests failed before the patch (exit code ${testsBefore.exitCode}) and passed after applying it (exit code ${testsAfter.exitCode}). This is a real before/after flip, not an LLM claim.` };
  }
  if (beforeFailing && afterFailing) {
    return { status: "tests-still-failing", reason: `Tests failed before the patch (exit code ${testsBefore.exitCode}) and still fail after applying it (exit code ${testsAfter.exitCode}).` };
  }
  if (!beforeFailing) {
    return { status: "inconclusive", reason: `Tests already passed before the patch (exit code ${testsBefore.exitCode}), so a before/after test delta cannot confirm this patch fixed anything. Review the diff manually.` };
  }
  return { status: "inconclusive", reason: "Could not determine a clear verification outcome from the test results." };
}

export async function runPipeline(opts: PipelineOptions): Promise<CodeSageReport> {
  const emit = (stage: PipelineStage, message: string, data?: Record<string, unknown>) => opts.onEvent?.({ stage, message, data });
  const testTimeoutMs = opts.testTimeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;

  emit("indexing", `Indexing repository at ${opts.repoPath}...`);
  const index: RepoIndex = buildRepoIndex(opts.repoPath);
  emit("indexing", `Indexed ${index.totalFiles} files (${(index.totalSizeBytes / 1024).toFixed(1)} KB). Stack: ${index.stack.kinds.join(", ")}.`, {
    totalFiles: index.totalFiles,
    stack: index.stack,
  });

  emit("searching", "Extracting keywords from the bug report and searching the repo...");
  const keywords = extractKeywords(opts.bugReport);
  const hits = searchIndex(index, keywords);
  emit("searching", `Keyword search found ${hits.length} candidate file(s).`, { keywords, hits: summarizeHits(hits).slice(0, 10) });

  const baseReport = (overrides: Partial<CodeSageReport>): CodeSageReport => ({
    kind: "single",
    generatedAtIso: new Date().toISOString(),
    repoPath: opts.repoPath,
    bugReport: opts.bugReport,
    stack: index.stack,
    filesIndexed: index.totalFiles,
    totalSizeBytes: index.totalSizeBytes,
    searchHits: summarizeHits(hits),
    investigation: null,
    patch: null,
    apply: null,
    testsBefore: null,
    testsAfter: null,
    verification: "inconclusive",
    verificationReason: "",
    workspaceDir: null,
    limitations: BASE_LIMITATIONS,
    ...overrides,
  });

  if (opts.dryRun || !isLLMConfigured()) {
    const reason = opts.dryRun
      ? "Dry-run requested via --dry-run / dryRun: true: skipped the LLM investigation and patch stages. Repository indexing and keyword search above are real."
      : "ANTHROPIC_API_KEY is not configured: skipped the LLM investigation and patch stages. Repository indexing and keyword search above are real. Set ANTHROPIC_API_KEY (see .env.example) to run the full pipeline.";
    emit("done", reason);
    const report = baseReport({ verification: "dry-run-no-llm", verificationReason: reason });
    const outDir = opts.outDir ?? defaultOutDir();
    const { mdPath, jsonPath } = writeReport(report, outDir);
    emit("done", `Report written to ${mdPath}`, { mdPath, jsonPath });
    return report;
  }

  emit("investigating", "Running agentic investigation with Claude (tool-calling loop)...");
  const investigation = await investigateBug(index, opts.bugReport, hits, {
    maxIterations: opts.maxIterations,
    onIteration: (n, note) => emit("investigating", `iteration ${n}: ${note}`),
  });
  emit("investigating", `Investigation complete: ${investigation.rootCause}`, { investigation });

  emit("creating-workspace", "Creating isolated workspace copy (original repo is never modified)...");
  const workspace = createIsolatedWorkspace(opts.repoPath, { keep: opts.keepWorkspace });
  emit("creating-workspace", `Isolated workspace ready at ${workspace.dir}`);

  const testCommandTemplate = index.stack.testCommand;
  let testsBefore: TestRunResult | null = null;

  if (testCommandTemplate) {
    emit("testing-before", "Ensuring dependencies are installed in the isolated workspace...");
    const install = await ensureDependenciesInstalled(workspace.dir, index.stack, testTimeoutMs);
    emit("testing-before", install.attempted ? `Dependency install ${install.ok ? "succeeded" : "FAILED"}.` : `Dependency install skipped: ${install.skippedReason}`);

    emit("testing-before", "Running tests BEFORE the patch...");
    const cmd = rebindTestCommand(testCommandTemplate, workspace.dir);
    testsBefore = await runTests(cmd, testTimeoutMs);
    emit("testing-before", `Before-patch tests finished: exit code ${testsBefore.exitCode}, ${testsBefore.passed ?? "?"} passed / ${testsBefore.failed ?? "?"} failed.`, { testsBefore });
  } else {
    emit("testing-before", "No test command detected for this project; skipping before/after test verification.");
  }

  // If the investigation never settled on concrete file(s) to patch (ran out of its iteration
  // budget without a structured verdict, or the model's response was unstable/empty), asking it
  // for a diff anyway is pointless: proposePatch would have zero real file content to work from
  // and could only hallucinate a plausible-looking diff against files it guessed at — which then
  // fails to apply in a way that looks like an engine bug rather than what it really is (a failed
  // investigation). Skip straight to an honest "inconclusive" instead of wasting an LLM call on a
  // patch attempt that can't possibly succeed.
  const investigationDegraded = investigation.filesToPatch.length === 0;

  let patch: PatchResult | null = null;
  let apply: ApplyResult | null = null;
  let testsAfter: TestRunResult | null = null;

  if (investigationDegraded) {
    emit("patching", "Skipping patch generation: the investigation did not identify any files to patch.");
    emit("testing-after", "Skipped: no patch was generated.");
  } else {
    emit("patching", "Requesting a concrete unified-diff patch from Claude...");
    patch = await proposePatch(workspace.dir, investigation, opts.bugReport);
    emit("patching", patch.diffText ? "Patch proposal received." : "Model did not return a parseable diff.", { patch });

    emit("applying-patch", "Applying the patch inside the isolated workspace...");
    apply = applyUnifiedDiff(workspace.dir, patch.diffText);
    emit("applying-patch", `Patch applied: ${apply.applied} (method: ${apply.method}).`, { apply });

    // One automatic retry when the patch is syntactically a real diff but its content doesn't
    // match the real file (the most common recoverable failure: the model hallucinated or dropped
    // a blank line, or got indentation slightly wrong) — a genuinely different failure class than
    // an unparseable diff, which has nothing worth retrying with. Re-ask once with the exact
    // apply error fed back so the model can see precisely what didn't match, rather than silently
    // reporting "patch did not apply" when a second, better-informed attempt would likely succeed.
    if (!apply.applied && patch.diffText.trim() && apply.error) {
      emit("patching", "Patch did not apply — retrying once with the exact error fed back to the model...");
      const retryPatch = await proposePatch(workspace.dir, investigation, opts.bugReport, { previousAttemptError: apply.error });
      emit("patching", retryPatch.diffText ? "Retry patch proposal received." : "Retry did not return a parseable diff.", { patch: retryPatch });

      const retryApply = applyUnifiedDiff(workspace.dir, retryPatch.diffText);
      emit("applying-patch", `Retry patch applied: ${retryApply.applied} (method: ${retryApply.method}).`, { apply: retryApply });

      patch = retryPatch;
      apply = retryApply;
    }

    if (apply.applied && testCommandTemplate) {
      emit("testing-after", "Running tests AFTER the patch...");
      const cmd = rebindTestCommand(testCommandTemplate, workspace.dir);
      testsAfter = await runTests(cmd, testTimeoutMs);
      emit("testing-after", `After-patch tests finished: exit code ${testsAfter.exitCode}, ${testsAfter.passed ?? "?"} passed / ${testsAfter.failed ?? "?"} failed.`, { testsAfter });
    } else if (!apply.applied) {
      emit("testing-after", "Skipped: patch did not apply.");
    }
  }

  const { status, reason } = decideVerification({
    testCommand: testCommandTemplate,
    investigationDegraded,
    investigationDegradedReason: investigationDegraded ? investigation.rootCause : undefined,
    apply,
    testsBefore,
    testsAfter,
  });

  emit("reporting", "Generating the engineering report...");
  const report = baseReport({
    investigation,
    patch,
    apply,
    testsBefore,
    testsAfter,
    verification: status,
    verificationReason: reason,
    workspaceDir: workspace.dir,
  });
  const outDir = opts.outDir ?? defaultOutDir();
  const { mdPath, jsonPath } = writeReport(report, outDir);
  emit("done", `Done. Verification: ${status}. Report written to ${mdPath}`, { mdPath, jsonPath, report });

  workspace.cleanup();
  return report;
}

export function defaultOutDir(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return join(process.cwd(), `codesage-report-${ts}`);
}
