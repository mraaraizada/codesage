// Multi-bug orchestrator. A single bug report can describe several independent, unrelated bugs
// (see examples/fixora-test-03-react/BUG_REPORT.md for a real one: login navigation, logout state,
// a protected-route vulnerability, and profile sync are four unrelated bugs in one report). Asking
// the single-bug pipeline's one investigation loop to find and fix all of them at once reliably
// fails to converge (observed directly: 12 and 40 iteration budgets, a mid-investigation rate
// limit, and a blank-model-response failure, all on the same combined report).
//
// This module splits that report into N sub-bug-reports (src/llm/splitBugReport.ts) and runs the
// existing single-bug machinery (investigate -> patch -> apply -> test) once per sub-bug, against
// ONE shared, accumulating isolated workspace: sub-bug 2 investigates and patches a repo that
// already has sub-bug 1's verified fix applied, not a fresh copy of the original. Every kept fix is
// a durable checkpoint (a real git commit inside the workspace); every sub-bug's outcome re-runs
// the FULL test suite as a regression check, and a sub-bug that fails for any reason (rate limit,
// blank response, patch-did-not-apply, ran out of iterations, or an outright crash) is rolled back
// to the last checkpoint and recorded honestly — never silently dropped — while the batch moves on
// to the next sub-bug. When the report only describes one bug, this delegates straight to
// runPipeline() with zero orchestration overhead.
import { join } from "node:path";
import { execFileSync } from "node:child_process";
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
import { splitBugReport, type SubBugReport } from "./llm/splitBugReport.js";
import { runPipeline, decideVerification, BASE_LIMITATIONS, defaultOutDir, type PipelineStage } from "./pipeline.js";
import { writeMultiReport } from "./report/generate.js";
import type { CodeSageReport, MultiBugReport, SubBugResult, TestCommand, TestRunResult, RepoIndex } from "./types.js";

export type MultiPipelineStage = PipelineStage | "splitting" | "regression-testing" | "sub-bug-start" | "sub-bug-done";

export interface MultiPipelineEvent {
  stage: MultiPipelineStage;
  message: string;
  data?: Record<string, unknown>;
}

export interface MultiPipelineOptions {
  repoPath: string;
  bugReport: string;
  outDir?: string;
  dryRun?: boolean;
  keepWorkspace?: boolean;
  /** Per-sub-investigation iteration budget (each sub-bug gets its own fresh budget). */
  maxIterations?: number;
  /** Test-only hook: override the iteration budget for one specific 1-indexed sub-bug, so
   * resilience (one sub-bug starved into "inconclusive") can be exercised deterministically
   * without starving every sub-bug in the batch. Not exposed in the UI. */
  subMaxIterationsOverride?: Record<number, number>;
  testTimeoutMs?: number;
  forceSingle?: boolean;
  forceMulti?: boolean;
  onEvent?: (e: MultiPipelineEvent) => void;
}

export type MultiPipelineResult = { kind: "single"; report: CodeSageReport } | { kind: "multi"; report: MultiBugReport };

const DEFAULT_TEST_TIMEOUT_MS = Number(process.env.CODESAGE_TEST_TIMEOUT_MS) || 120_000;

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function currentCommit(dir: string): string {
  return git(dir, ["rev-parse", "HEAD"]).trim();
}

/** Discards any uncommitted changes (tracked-file edits AND new untracked files a bad patch may
 * have created) and returns the workspace to `commit` — used to undo a sub-bug's patch that was
 * not verified-fixed, so the next sub-bug starts from the last KNOWN-GOOD state, never a
 * half-applied one. */
function rollbackTo(dir: string, commit: string): void {
  git(dir, ["reset", "--hard", commit]);
  git(dir, ["clean", "-fd"]);
}

function commitCheckpoint(dir: string, message: string): void {
  git(dir, ["add", "-A"]);
  // --allow-empty: a "kept" outcome with no test command to verify against still deserves a
  // checkpoint even if, in some edge case, the diff net-changed nothing.
  git(dir, ["commit", "-q", "--allow-empty", "-m", message]);
}

export function countsImproved(before: TestRunResult | null, after: TestRunResult | null): boolean {
  if (!before || !after || before.failed === null || after.failed === null || before.passed === null || after.passed === null) return false;
  return after.failed < before.failed && after.passed >= before.passed;
}

export function countsRegressed(before: TestRunResult | null, after: TestRunResult | null): boolean {
  if (!before || !after || before.failed === null || after.failed === null || before.passed === null || after.passed === null) {
    // Can't parse counts either side — fall back to the stricter whole-suite exit-code check used
    // by the single-bug pipeline (decideVerification) rather than assuming no regression.
    return Boolean(before && after && before.exitCode === 0 && after.exitCode !== 0);
  }
  return after.failed > before.failed || after.passed < before.passed;
}

export async function runMultiBugPipeline(opts: MultiPipelineOptions): Promise<MultiPipelineResult> {
  const emit = (stage: MultiPipelineStage, message: string, data?: Record<string, unknown>) => opts.onEvent?.({ stage, message, data });
  const testTimeoutMs = opts.testTimeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;

  emit("splitting", "Checking whether this bug report describes one bug or several...");
  const split = await splitBugReport(opts.bugReport, { forceSingle: opts.forceSingle, forceMulti: opts.forceMulti });

  if (split.subBugs.length <= 1) {
    emit("splitting", "Detected a single bug — running the standard single-bug pipeline with no orchestration overhead.");
    const report = await runPipeline({
      repoPath: opts.repoPath,
      bugReport: opts.bugReport,
      outDir: opts.outDir,
      dryRun: opts.dryRun,
      keepWorkspace: opts.keepWorkspace,
      maxIterations: opts.maxIterations,
      testTimeoutMs: opts.testTimeoutMs,
      onEvent: (e) => opts.onEvent?.(e),
    });
    return { kind: "single", report };
  }

  emit(
    "splitting",
    `Split into ${split.subBugs.length} independent sub-bug(s) via ${split.method === "structural" ? "structural parsing (numbered/headed list detected, no LLM call needed)" : "an LLM splitting call"}.`,
    { method: split.method, titles: split.subBugs.map((b) => b.title) },
  );

  emit("indexing", `Indexing repository at ${opts.repoPath}...`);
  const baselineIndex: RepoIndex = buildRepoIndex(opts.repoPath);
  emit("indexing", `Indexed ${baselineIndex.totalFiles} files. Stack: ${baselineIndex.stack.kinds.join(", ")}.`);

  emit("creating-workspace", "Creating ONE shared isolated workspace for the whole batch (every sub-bug's fixes accumulate here)...");
  const workspace = createIsolatedWorkspace(opts.repoPath, { keep: opts.keepWorkspace });
  emit("creating-workspace", `Shared isolated workspace ready at ${workspace.dir}`);

  const testCommandTemplate = baselineIndex.stack.testCommand;

  if (testCommandTemplate) {
    const install = await ensureDependenciesInstalled(workspace.dir, baselineIndex.stack, testTimeoutMs);
    emit("testing-before", install.attempted ? `Dependency install ${install.ok ? "succeeded" : "FAILED"}.` : `Dependency install skipped: ${install.skippedReason}`);
  }

  let lastGoodFullTest: TestRunResult | null = null;
  let testsBaseline: TestRunResult | null = null;
  if (testCommandTemplate) {
    emit("testing-before", "Running the FULL test suite baseline (before any sub-investigation)...");
    const cmd = rebindTestCommand(testCommandTemplate, workspace.dir);
    testsBaseline = await runTests(cmd, testTimeoutMs);
    lastGoodFullTest = testsBaseline;
    emit("testing-before", `Baseline: exit code ${testsBaseline.exitCode}, ${testsBaseline.passed ?? "?"} passed / ${testsBaseline.failed ?? "?"} failed.`, { testsBaseline });
  } else {
    emit("testing-before", "No test command detected for this project; sub-bug fixes will be applied without automated verification.");
  }

  const subResults: SubBugResult[] = [];
  const filesChangedAcrossBatch = new Set<string>();

  for (let i = 0; i < split.subBugs.length; i++) {
    const subBug: SubBugReport = split.subBugs[i];
    const idx = i + 1;
    const title = subBug.title && !/^bug$/i.test(subBug.title) ? subBug.title : `Sub-bug ${idx}`;
    emit("sub-bug-start", `[${idx}/${split.subBugs.length}] Investigating: ${title}`, { index: idx, title });

    const preCommit = currentCommit(workspace.dir);
    const subMaxIterations = opts.subMaxIterationsOverride?.[idx] ?? opts.maxIterations;

    let result: SubBugResult;
    try {
      result = await runOneSubBug({
        idx,
        title,
        subBug,
        workspaceDir: workspace.dir,
        testCommandTemplate,
        testTimeoutMs,
        maxIterations: subMaxIterations,
        dryRun: opts.dryRun,
        lastGoodFullTest,
        preCommit,
        emit,
      });
    } catch (err) {
      // An unhandled crash (e.g. every configured LLM backend exhausted and threw, an unexpected
      // I/O error) must not abort the whole batch. Roll back whatever partial state this attempt
      // may have left on disk and record the failure honestly, then continue.
      rollbackTo(workspace.dir, preCommit);
      const message = (err as Error).message ?? String(err);
      result = {
        index: idx,
        title,
        bugReport: subBug.body,
        investigation: null,
        patch: null,
        apply: null,
        testsBefore: lastGoodFullTest,
        testsAfter: null,
        verification: "inconclusive",
        verificationReason: `This sub-investigation crashed with an unhandled error and was rolled back to the last known-good state: ${message}`,
        filesChanged: [],
        crashed: true,
        error: message,
        kept: false,
      };
      emit("sub-bug-done", `[${idx}/${split.subBugs.length}] CRASHED (rolled back): ${message}`, { index: idx });
    }

    if (result.kept) {
      for (const f of result.filesChanged) filesChangedAcrossBatch.add(f);
      if (result.testsAfter) lastGoodFullTest = result.testsAfter;
    }
    subResults.push(result);
    if (!result.crashed) {
      emit("sub-bug-done", `[${idx}/${split.subBugs.length}] ${title}: ${result.verification} (${result.kept ? "kept" : "rolled back"})`, { index: idx, verification: result.verification });
    }
  }

  let finalRegressionTests: TestRunResult | null = null;
  if (testCommandTemplate) {
    emit("regression-testing", "Running the FULL test suite one final time against the final workspace state...");
    const cmd = rebindTestCommand(testCommandTemplate, workspace.dir);
    finalRegressionTests = await runTests(cmd, testTimeoutMs);
    emit(
      "regression-testing",
      `Final regression result: exit code ${finalRegressionTests.exitCode}, ${finalRegressionTests.passed ?? "?"} passed / ${finalRegressionTests.failed ?? "?"} failed.`,
      { finalRegressionTests },
    );
  }

  const fixedCount = subResults.filter((r) => r.verification === "verified-fixed").length;
  const otherCount = subResults.length - fixedCount;
  const overallVerdict =
    otherCount === 0
      ? `All ${subResults.length} of ${subResults.length} bugs verified fixed.`
      : `${fixedCount} of ${subResults.length} bug(s) verified fixed, ${otherCount} inconclusive/failed.`;

  emit("reporting", "Generating the consolidated multi-bug report...");
  const report: MultiBugReport = {
    kind: "multi",
    generatedAtIso: new Date().toISOString(),
    repoPath: opts.repoPath,
    originalBugReport: opts.bugReport,
    stack: baselineIndex.stack,
    filesIndexed: baselineIndex.totalFiles,
    totalSizeBytes: baselineIndex.totalSizeBytes,
    splitMethod: split.method,
    subBugs: subResults,
    testsBaseline,
    finalRegressionTests,
    filesChangedAcrossBatch: [...filesChangedAcrossBatch].sort(),
    overallVerdict,
    workspaceDir: workspace.dir,
    limitations: [
      ...BASE_LIMITATIONS,
      "Each sub-bug's patch is only kept (committed) in the shared workspace when it was verified-fixed by a full-suite test-count improvement with no regression, or when no test command exists to verify against at all; otherwise it is rolled back via `git reset --hard` before the next sub-bug runs.",
      "Per-sub-bug verification compares full-suite pass/fail COUNTS (not just the suite's overall exit code) before vs. after that sub-bug's patch, so bug 2's fix can be recognized as real progress even while bugs 3 and 4 (not yet reached) still keep the suite's exit code non-zero.",
    ],
  };

  const outDir = opts.outDir ?? defaultOutDir();
  const { mdPath, jsonPath } = writeMultiReport(report, outDir);
  emit("done", `Done. ${overallVerdict} Report written to ${mdPath}`, { mdPath, jsonPath, report });

  workspace.cleanup();
  return { kind: "multi", report };
}

async function runOneSubBug(args: {
  idx: number;
  title: string;
  subBug: SubBugReport;
  workspaceDir: string;
  testCommandTemplate: TestCommand | null;
  testTimeoutMs: number;
  maxIterations: number | undefined;
  dryRun: boolean | undefined;
  lastGoodFullTest: TestRunResult | null;
  preCommit: string;
  emit: (stage: MultiPipelineStage, message: string, data?: Record<string, unknown>) => void;
}): Promise<SubBugResult> {
  const { idx, title, subBug, workspaceDir, testCommandTemplate, testTimeoutMs, maxIterations, dryRun, lastGoodFullTest, preCommit, emit } = args;

  const empty: Omit<SubBugResult, "verification" | "verificationReason" | "kept"> = {
    index: idx,
    title,
    bugReport: subBug.body,
    investigation: null,
    patch: null,
    apply: null,
    testsBefore: lastGoodFullTest,
    testsAfter: null,
    filesChanged: [],
    crashed: false,
    error: null,
  };

  if (dryRun || !isLLMConfigured()) {
    return { ...empty, verification: "dry-run-no-llm", verificationReason: "Dry-run requested, or no LLM provider configured — sub-investigation skipped.", kept: false };
  }

  // Re-index the workspace fresh for THIS sub-bug so the investigation sees the CURRENT state of
  // the repo, including every prior sub-bug's already-kept fix — not the original, pre-batch repo.
  const liveIndex = buildRepoIndex(workspaceDir);
  const keywords = extractKeywords(subBug.body);
  const hits = searchIndex(liveIndex, keywords);

  emit("investigating", `[${idx}] Running agentic investigation...`);
  const investigation = await investigateBug(liveIndex, subBug.body, hits, {
    maxIterations,
    onIteration: (n, note) => emit("investigating", `[${idx}] iteration ${n}: ${note}`),
  });
  emit("investigating", `[${idx}] Investigation complete: ${investigation.rootCause}`);

  if (investigation.filesToPatch.length === 0) {
    return {
      ...empty,
      investigation,
      verification: "inconclusive",
      verificationReason: `${investigation.rootCause} No patch was attempted — nothing changed in the shared workspace.`,
      kept: false,
    };
  }

  emit("patching", `[${idx}] Requesting a patch...`);
  let patch = await proposePatch(workspaceDir, investigation, subBug.body);
  emit("applying-patch", `[${idx}] Applying patch...`);
  let apply = applyUnifiedDiff(workspaceDir, patch.diffText);

  if (!apply.applied && patch.diffText.trim() && apply.error) {
    emit("patching", `[${idx}] Patch did not apply — retrying once with the error fed back...`);
    const retryPatch = await proposePatch(workspaceDir, investigation, subBug.body, { previousAttemptError: apply.error });
    const retryApply = applyUnifiedDiff(workspaceDir, retryPatch.diffText);
    patch = retryPatch;
    apply = retryApply;
  }

  if (!apply.applied) {
    return {
      ...empty,
      investigation,
      patch,
      apply,
      verification: "patch-did-not-apply",
      verificationReason: `The proposed patch could not be applied: ${apply.error ?? "unknown error"}. Nothing changed in the shared workspace.`,
      kept: false,
    };
  }

  if (!testCommandTemplate) {
    // Nothing to verify against — mirror the single-bug pipeline's behavior: keep the patch, but
    // say plainly that it's unverified.
    commitCheckpoint(workspaceDir, `codesage: sub-bug ${idx} (${title}) — applied, unverified (no test command)`);
    return {
      ...empty,
      investigation,
      patch,
      apply,
      filesChanged: apply.changedFiles,
      verification: "no-tests-detected",
      verificationReason: "No automated test command was detected for this project, so this patch could not be verified — it was kept as the best available fix.",
      kept: true,
    };
  }

  emit("testing-after", `[${idx}] Running the FULL test suite after this patch (also a regression check against earlier fixes)...`);
  const cmd = rebindTestCommand(testCommandTemplate, workspaceDir);
  const testsAfter = await runTests(cmd, testTimeoutMs);
  emit("testing-after", `[${idx}] After-patch full suite: exit code ${testsAfter.exitCode}, ${testsAfter.passed ?? "?"} passed / ${testsAfter.failed ?? "?"} failed.`);

  if (countsRegressed(lastGoodFullTest, testsAfter)) {
    rollbackTo(workspaceDir, preCommit);
    return {
      ...empty,
      investigation,
      patch,
      apply,
      testsAfter,
      verification: "tests-still-failing",
      verificationReason: `This patch REGRESSED the full test suite (before: ${lastGoodFullTest?.passed ?? "?"} passed/${lastGoodFullTest?.failed ?? "?"} failed -> after: ${testsAfter.passed ?? "?"} passed/${testsAfter.failed ?? "?"} failed). Rolled back to the state before this sub-bug ran.`,
      kept: false,
    };
  }

  if (countsImproved(lastGoodFullTest, testsAfter)) {
    commitCheckpoint(workspaceDir, `codesage: sub-bug ${idx} (${title}) — verified fixed`);
    return {
      ...empty,
      investigation,
      patch,
      apply,
      testsAfter,
      filesChanged: apply.changedFiles,
      verification: "verified-fixed",
      verificationReason: `Full test suite improved (before: ${lastGoodFullTest?.passed ?? "?"} passed/${lastGoodFullTest?.failed ?? "?"} failed -> after: ${testsAfter.passed ?? "?"} passed/${testsAfter.failed ?? "?"} failed) with no regression. Kept and committed to the shared workspace.`,
      kept: true,
    };
  }

  // Also fall back to the single-bug pipeline's stricter before/after decision when pass/fail
  // counts genuinely couldn't be parsed from the test output, so this case isn't silently treated
  // as "no change" when it might actually be a clear exit-code flip.
  const decided = decideVerification({
    testCommand: testCommandTemplate,
    investigationDegraded: false,
    apply,
    testsBefore: lastGoodFullTest,
    testsAfter,
  });
  if (decided.status === "verified-fixed") {
    commitCheckpoint(workspaceDir, `codesage: sub-bug ${idx} (${title}) — verified fixed`);
    return { ...empty, investigation, patch, apply, testsAfter, filesChanged: apply.changedFiles, verification: decided.status, verificationReason: decided.reason, kept: true };
  }

  // No measurable improvement and no regression — applied, but unverified. Roll back per the
  // spec's "don't carry forward a non-verified-fixed state" rule.
  rollbackTo(workspaceDir, preCommit);
  return {
    ...empty,
    investigation,
    patch,
    apply,
    testsAfter,
    verification: "inconclusive",
    verificationReason: `The patch applied but produced no measurable improvement in the full test suite (before: ${lastGoodFullTest?.passed ?? "?"} passed/${lastGoodFullTest?.failed ?? "?"} failed -> after: ${testsAfter.passed ?? "?"} passed/${testsAfter.failed ?? "?"} failed). Rolled back to the state before this sub-bug ran.`,
    kept: false,
  };
}
