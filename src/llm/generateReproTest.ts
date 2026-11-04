// Generates a small, targeted reproduction test for an already-investigated bug, so verification
// can be based on "did THIS specific test flip from failing to passing" instead of only a coarse
// whole-suite pass/fail COUNT. That count-based check is blind to a repo whose existing suite
// already passes end-to-end even with the bug present (observed directly: examples/fixora-test-03
// reports 4/4 passing at baseline despite 4 real bugs) — in that case no full-suite count can ever
// prove a fix did anything. A generated reproduction test gives a real, bug-specific before/after
// signal instead.
//
// The model is shown real sample test file(s) from the repo (when any exist) so the generated test
// follows the project's actual framework and conventions, and is given the real investigation
// evidence so the test targets the actual root cause rather than a generic smoke test. The
// generated test's name always embeds a unique marker so the test runner's text output can be
// grepped for its specific pass/fail line without depending on structured JSON test reporters
// (which vary by framework and are not guaranteed to be configured in an arbitrary repo).
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { getProvider } from "./client.js";
import type { LLMProvider } from "./provider.js";
import type { InvestigationResult, RepoIndex, TestCommand } from "../types.js";

export interface ReproTestResult {
  relPath: string;
  code: string;
  /** Unique token embedded in the generated test's name — grep the test runner's stdout/stderr
   * for this to find that specific test's pass/fail line, independent of test framework. */
  marker: string;
}

const TEST_FILE_PATTERN = /\.(test|spec)\.[jt]sx?$|_test\.py$|test_.*\.py$/;

function sampleExistingTests(index: RepoIndex, max = 2): { relPath: string; content: string }[] {
  const candidates = index.files.filter((f) => f.isSource && TEST_FILE_PATTERN.test(f.relPath)).slice(0, max);
  const out: { relPath: string; content: string }[] = [];
  for (const f of candidates) {
    try {
      out.push({ relPath: f.relPath, content: readFileSync(f.absPath, "utf8").slice(0, 4000) });
    } catch {
      // best-effort sample only
    }
  }
  return out;
}

function extractCodeBlock(text: string): string | null {
  const fence = text.match(/```(?:[a-z]*)\n([\s\S]*?)```/i);
  return fence ? fence[1].trim() : null;
}

/** Returns null (never throws) when the model can't produce a usable test — callers must treat
 * that as "reproduction test unavailable" and fall back to whole-suite verification, not as a
 * hard failure of the sub-bug investigation itself. */
export async function generateReproTest(
  index: RepoIndex,
  investigation: InvestigationResult,
  bugReport: string,
  testCommand: TestCommand,
  provider?: LLMProvider
): Promise<ReproTestResult | null> {
  if (testCommand.type === "unknown") return null;
  const marker = `CODESAGE_REPRO_${randomBytes(4).toString("hex")}`;
  const samples = sampleExistingTests(index);
  const isPython = testCommand.type === "pytest" || testCommand.type === "python-unittest";

  const system = [
    "You are CodeSage's reproduction-test-generation step. An investigation already found a root cause for one specific bug.",
    "Write ONE minimal, real, runnable test that reproduces this exact bug: it must FAIL against the current (unfixed) code and would PASS once the root cause is actually fixed.",
    "",
    "Strict requirements:",
    `- The test's name (describe/it/test block, or Python test function name) MUST contain the exact literal marker "${marker}" somewhere in its name/description, so it can be found in test-runner output.`,
    "- Follow the project's real existing test framework and conventions shown below exactly (same imports, same test runner APIs, same assertion library) — do not introduce a new framework.",
    "- Test only the specific behavior described by the root cause and evidence below. Do not write a broad smoke test.",
    "- Output a short one-sentence explanation of what the test does, then the relative file path on its own line prefixed with `FILE:`, then a single fenced code block with the complete test file content.",
    "- The test file must be self-contained and syntactically complete — it will be written to disk and executed exactly as given.",
  ].join("\n");

  const userMsg = [
    `Original bug report:\n"""\n${bugReport}\n"""`,
    "",
    `Root cause: ${investigation.rootCause}`,
    `Explanation: ${investigation.explanation}`,
    "",
    "Evidence:",
    ...investigation.evidence.map((e) => `- ${e.relPath}:${e.line} — ${e.snippet}`),
    "",
    `Test command this project uses: ${testCommand.command} ${testCommand.args.join(" ")} (${testCommand.source})`,
    "",
    samples.length > 0
      ? `Existing test file(s) in this repo, for convention reference:\n${samples.map((s) => `### ${s.relPath}\n\`\`\`\n${s.content}\n\`\`\``).join("\n\n")}`
      : "No existing test files were found in this repo — use an idiomatic, minimal setup for the detected stack.",
  ].join("\n");

  let text: string;
  try {
    text = await (provider ?? getProvider()).complete({ system, userMessage: userMsg, maxTokens: 2048 });
  } catch {
    return null;
  }

  const code = extractCodeBlock(text);
  if (!code || !code.includes(marker)) return null;

  const fileMatch = text.match(/^FILE:\s*(.+)$/m);
  let relPath = fileMatch?.[1]?.trim().replace(/^\/+/, "");
  if (!relPath) {
    const base = isPython ? samples[0]?.relPath?.replace(/\.py$/, "") ?? "test_codesage_repro" : samples[0]?.relPath?.replace(/\.(test|spec)\.[jt]sx?$/, "") ?? "src/codesage_repro";
    relPath = isPython ? `test_codesage_repro_${marker.slice(-8)}.py` : `${base}.codesage_repro_${marker.slice(-8)}.test.ts`;
  }

  return { relPath, code, marker };
}
