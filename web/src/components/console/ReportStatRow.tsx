// The report's visual summary strip: a row of real stat tiles (files scanned, candidates found,
// agentic iterations, tool calls, lines changed) plus a confidence badge and, when both before and
// after test runs produced parseable counts, a compact before/after pass-count comparison bar.
// Every number comes from CodeSageReport — nothing here is illustrative-only.
import { IconArrowRight } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { buildReportStats, hasBeforeAfterCounts } from "@/lib/reportStats";
import type { CodeSageReport } from "../../types";

const CONFIDENCE_VARIANT: Record<"low" | "medium" | "high", "destructive" | "warning" | "success"> = {
  low: "destructive",
  medium: "warning",
  high: "success",
};

function TestBar({ label, passed, failed }: { label: string; passed: number; failed: number }) {
  const total = passed + failed;
  const passedPct = total === 0 ? 0 : (passed / total) * 100;
  const failedPct = total === 0 ? 0 : 100 - passedPct;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="text-success">{passed} passed</span>
          {failed > 0 && <span className="text-destructive"> · {failed} failed</span>}
        </span>
      </div>
      <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {total === 0 ? (
          <div className="h-full w-full bg-muted-foreground/20" />
        ) : (
          <>
            {passedPct > 0 && <div className="h-full bg-success" style={{ width: `${passedPct}%` }} />}
            {failedPct > 0 && <div className="h-full bg-destructive" style={{ width: `${failedPct}%` }} />}
          </>
        )}
      </div>
    </div>
  );
}

export function ReportStatRow({ report }: { report: CodeSageReport }) {
  const stats = buildReportStats(report);
  const confidence = report.investigation?.confidence;
  const showBars = hasBeforeAfterCounts(report);

  if (stats.length === 0 && !confidence && !showBars) return null;

  return (
    <div className="mt-5 space-y-4">
      {(stats.length > 0 || confidence) && (
        <div className="flex flex-wrap items-stretch gap-2">
          {stats.map((s) => (
            <div key={s.label} className="min-w-[6.5rem] rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-base font-semibold tabular-nums">{s.value}</div>
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
          {confidence && (
            <div className="flex items-center">
              <Badge variant={CONFIDENCE_VARIANT[confidence]} className="capitalize">
                {confidence} confidence
              </Badge>
            </div>
          )}
        </div>
      )}

      {showBars && report.testsBefore && report.testsAfter && (
        <div className="flex max-w-xl items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <TestBar label="Before" passed={report.testsBefore.passed ?? 0} failed={report.testsBefore.failed ?? 0} />
          <IconArrowRight className="size-4 shrink-0 text-muted-foreground" stroke={1.75} />
          <TestBar label="After" passed={report.testsAfter.passed ?? 0} failed={report.testsAfter.failed ?? 0} />
        </div>
      )}
    </div>
  );
}
