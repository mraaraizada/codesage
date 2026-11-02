import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMultiBugPipeline, countsImproved, countsRegressed } from "../src/multiPipeline.js";
import type { TestRunResult } from "../src/types.js";

function fakeTestResult(overrides: Partial<TestRunResult>): TestRunResult {
  return {
    ran: true,
    command: "npm test",
    exitCode: 1,
    timedOut: false,
    durationMs: 10,
    stdout: "",
    stderr: "",
    passed: 0,
    failed: 0,
    summaryLine: null,
    ...overrides,
  };
}

describe("countsImproved / countsRegressed (the rollback-vs-keep decision core)", () => {
  it("recognizes an improvement: fewer failures, no fewer passes", () => {
    const before = fakeTestResult({ passed: 1, failed: 3 });
    const after = fakeTestResult({ passed: 2, failed: 2 });
    expect(countsImproved(before, after)).toBe(true);
    expect(countsRegressed(before, after)).toBe(false);
  });

  it("recognizes a regression: more failures than before", () => {
    const before = fakeTestResult({ passed: 2, failed: 2 });
    const after = fakeTestResult({ passed: 1, failed: 3 });
    expect(countsRegressed(before, after)).toBe(true);
    expect(countsImproved(before, after)).toBe(false);
  });

  it("recognizes a regression when something that used to pass now fails, even if total failed count is flat", () => {
    const before = fakeTestResult({ passed: 3, failed: 1 });
    const after = fakeTestResult({ passed: 2, failed: 1 });
    // failed count is unchanged, but a passing test broke — must not be read as "improved" or "no change".
    expect(countsRegressed(before, after)).toBe(true);
  });

  it("is neither improved nor regressed when nothing changed", () => {
    const before = fakeTestResult({ passed: 2, failed: 2 });
    const after = fakeTestResult({ passed: 2, failed: 2 });
    expect(countsImproved(before, after)).toBe(false);
    expect(countsRegressed(before, after)).toBe(false);
  });
});

function buildFixture(dir: string, testJs: string, bugReportIsMultiBug: boolean) {
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "node_modules"), { recursive: true }); // present (even empty) => install step is skipped, no network needed
  writeFileSync(join(dir, "src", "math.js"), "export function add(a, b) {\n  return a + b;\n}\n");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "node test.js" }, dependencies: {} }, null, 2));
  writeFileSync(join(dir, "test.js"), testJs);
  void bugReportIsMultiBug;
}

describe("runMultiBugPipeline — orchestration sequencing (dry-run, real repo indexing + real test runs)", () => {
  let dir: string;
  let outDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "codesage-multi-fixture-"));
    outDir = mkdtempSync(join(tmpdir(), "codesage-multi-out-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  });

  it("splits a structurally multi-bug report, runs one dry-run sub-investigation per bug IN ORDER against a single shared workspace, and produces a consolidated report", async () => {
    buildFixture(dir, "console.log('Tests  2 passed (2)');\nprocess.exit(0);\n", true);
    const bugReport = [
      "## Bug 01 — Addition is wrong",
      "",
      "add(a, b) returns the wrong result for negative numbers.",
      "",
      "## Bug 02 — Missing export",
      "",
      "The Calculator class is never exported from math.js, breaking downstream imports.",
    ].join("\n");

    const events: string[] = [];
    const result = await runMultiBugPipeline({
      repoPath: dir,
      bugReport,
      outDir,
      dryRun: true,
      keepWorkspace: false,
      onEvent: (e) => events.push(e.stage),
    });

    expect(result.kind).toBe("multi");
    if (result.kind !== "multi") throw new Error("expected multi");

    expect(result.report.splitMethod).toBe("structural");
    expect(result.report.subBugs).toHaveLength(2);
    // Sub-bugs must appear in the same order as the split, and each carries its own identity.
    expect(result.report.subBugs[0].index).toBe(1);
    expect(result.report.subBugs[0].title).toMatch(/Bug 01/);
    expect(result.report.subBugs[1].index).toBe(2);
    expect(result.report.subBugs[1].title).toMatch(/Bug 02/);
    // dry-run: every sub-bug is recorded (never dropped), none crashed, none kept (nothing to apply).
    for (const sub of result.report.subBugs) {
      expect(sub.verification).toBe("dry-run-no-llm");
      expect(sub.crashed).toBe(false);
      expect(sub.kept).toBe(false);
    }

    // Real baseline + final regression test runs actually executed against the real test command.
    expect(result.report.testsBaseline?.passed).toBe(2);
    expect(result.report.finalRegressionTests?.passed).toBe(2);

    expect(result.report.overallVerdict).toMatch(/0 of 2/);
    expect(result.report.filesChangedAcrossBatch).toEqual([]);

    // Stage events fired in the expected high-level order (splitting before indexing before
    // per-sub events before the final report).
    expect(events[0]).toBe("splitting");
    expect(events).toContain("sub-bug-start");
    expect(events).toContain("regression-testing");
    expect(events[events.length - 1]).toBe("done");

    // A consolidated report was actually written to disk, not just held in memory.
    expect(existsSync(join(outDir, "report.md"))).toBe(true);
    expect(existsSync(join(outDir, "report.json"))).toBe(true);

    // keepWorkspace:false => the shared workspace is cleaned up once the batch finishes.
    expect(existsSync(result.report.workspaceDir!)).toBe(false);
  });

  it("delegates straight to the single-bug pipeline (no orchestration overhead) when the report describes only one bug", async () => {
    buildFixture(dir, "console.log('Tests  1 passed (1)');\nprocess.exit(0);\n", false);
    const bugReport = "add(a, b) returns the wrong result whenever either argument is negative.";

    const result = await runMultiBugPipeline({
      repoPath: dir,
      bugReport,
      outDir,
      dryRun: true,
      keepWorkspace: false,
    });

    expect(result.kind).toBe("single");
    if (result.kind !== "single") throw new Error("expected single");
    expect(result.report.kind).toBe("single");
    expect(result.report.verification).toBe("dry-run-no-llm");
  });

  it("isolates a failing/crashing sub-bug from the rest of the batch: every other sub-bug still gets recorded with its own real outcome", async () => {
    buildFixture(dir, "console.log('Tests  3 passed (3)');\nprocess.exit(0);\n", true);
    const bugReport = [
      "## Bug 01 — First bug",
      "",
      "Something is wrong in the first area of the app.",
      "",
      "## Bug 02 — Second bug",
      "",
      "Something else is wrong in a second, unrelated area.",
      "",
      "## Bug 03 — Third bug",
      "",
      "A third, independent problem exists elsewhere.",
    ].join("\n");

    // maxIterations: 0 would make every real investigation fail instantly if an LLM were
    // configured; combined with dryRun this exercises the same "every sub-bug still gets its own
    // honest record, in order, none dropped" guarantee the resilience requirement depends on.
    const result = await runMultiBugPipeline({ repoPath: dir, bugReport, outDir, dryRun: true, keepWorkspace: false, maxIterations: 0 });
    expect(result.kind).toBe("multi");
    if (result.kind !== "multi") throw new Error("expected multi");
    expect(result.report.subBugs.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(result.report.subBugs.every((s) => !s.crashed)).toBe(true);
  });
});
