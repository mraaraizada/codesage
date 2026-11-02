import { IconCode } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { basenameOfPath, formatElapsed, truncateMiddle } from "@/lib/format";
import type { JobState } from "../../types";
import type { RunMeta } from "../../hooks/useInvestigationRuns";

export function InvestigationHeader({
  run,
  job,
  now,
  onViewCode,
}: {
  run: RunMeta;
  job: JobState | undefined;
  now: number;
  onViewCode?: () => void;
}) {
  const repoName = basenameOfPath(run.repoPath);
  const finishedAtMs = job?.report ? new Date(job.report.generatedAtIso).getTime() : now;
  const elapsedMs = (job?.status === "running" ? now : finishedAtMs) - run.startedAtMs;

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
      <div className="min-w-0">
        <div className="truncate text-xs text-muted-foreground" title={`CodeSage / ${run.repoPath} / ${run.bugReport}`}>
          CodeSage / {repoName} / {truncateMiddle(run.bugReport, 60)}
        </div>
        <div className="truncate text-sm font-semibold">{repoName} investigation</div>
      </div>
      <div className="flex shrink-0 items-center gap-3 pl-4">
        {onViewCode && (
          <Button type="button" variant="outline" size="sm" onClick={onViewCode}>
            <IconCode className="size-3.5" stroke={1.75} />
            View code
          </Button>
        )}
        <div className="text-xs text-muted-foreground tabular-nums">
          {job?.status === "running" ? "running · " : ""}
          {formatElapsed(elapsedMs)}
        </div>
      </div>
    </div>
  );
}
