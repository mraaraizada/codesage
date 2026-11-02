// Pulls the numbers for the report's visual stat row + before/after test comparison out of the
// real CodeSageReport — no invented numbers, every value traces back to something the pipeline
// actually measured (src/pipeline.ts / src/repo/indexer.ts / src/testRunner/run.ts).
import type { CodeSageReport } from "../types";
import { parseDiffStats, totalStats } from "./diffStats";

export interface ReportStat {
  label: string;
  value: string;
}

export function buildReportStats(report: CodeSageReport): ReportStat[] {
  // "Files scanned" lives on the project overview header instead (it's project-record context,
  // not an investigation-result number) — this row is specifically what the investigation did.
  const stats: ReportStat[] = [{ label: "Candidates found", value: String(report.searchHits.length) }];

  if (report.investigation) {
    stats.push(
      { label: "Iterations", value: String(report.investigation.iterationsUsed) },
      { label: "Tool calls", value: String(report.investigation.toolCallLog.length) },
    );
  }

  if (report.patch?.diffText) {
    const totals = totalStats(parseDiffStats(report.patch.diffText));
    stats.push({ label: "Lines changed", value: `+${totals.added} / -${totals.removed}` });
  }

  return stats;
}

export interface TestCountSnapshot {
  passed: number | null;
  failed: number | null;
  ran: boolean;
}

/** True only when both before/after runs produced parseable pass/fail counts — the bar comparison
 * needs real numbers on both sides, not a guess filled in for a null. */
export function hasBeforeAfterCounts(report: CodeSageReport): boolean {
  const before = report.testsBefore;
  const after = report.testsAfter;
  return Boolean(before?.ran && after?.ran && before.passed !== null && before.failed !== null && after.passed !== null && after.failed !== null);
}
