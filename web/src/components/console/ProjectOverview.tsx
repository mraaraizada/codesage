// Opens a sidebar entry into a full "project record" rather than a bare verdict screen: who/what
// was investigated, when, and with what bug report — with the investigation flow (verdict, root
// cause, stages) continuing as sections below this one in the same scrolling view. Every value
// here is real data already on the job/report (src/types.ts CodeSageReport) or the RunMeta the
// sidebar already tracks (web/src/hooks/useInvestigationRuns.ts) — nothing invented.
import type { ReactNode } from "react";
import { IconClock, IconStack2, IconFileText, IconPackage } from "@tabler/icons-react";
import { basenameOfPath, formatBytes, formatDateTime } from "@/lib/format";
import type { CodeSageReport } from "../../types";
import type { RunMeta } from "../../hooks/useInvestigationRuns";

function MetaItem({ icon: Icon, label, value }: { icon: typeof IconPackage; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" stroke={1.75} />
      <div className="min-w-0">
        <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
        <div className="truncate text-sm font-medium" title={typeof value === "string" ? value : undefined}>
          {value}
        </div>
      </div>
    </div>
  );
}

export function ProjectOverview({ run, report }: { run: RunMeta; report: CodeSageReport | null }) {
  const stackLabel = report ? (report.stack.kinds.length ? report.stack.kinds.join(", ") : "unknown") : "detecting…";
  const packageManager = report?.stack.packageManager;
  const filesLabel = report ? `${report.filesIndexed} file(s) · ${formatBytes(report.totalSizeBytes)}` : "indexing…";

  return (
    <div className="border-b border-border bg-muted/20 px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-widest text-muted-foreground">PROJECT</div>
          <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight">{basenameOfPath(run.repoPath)}</h1>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={run.repoPath}>
            {run.repoPath}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetaItem icon={IconClock} label="Started" value={formatDateTime(run.startedAtMs)} />
        <MetaItem icon={IconStack2} label="Stack" value={stackLabel} />
        <MetaItem icon={IconPackage} label="Package manager" value={packageManager ?? (report ? "none detected" : "detecting…")} />
        <MetaItem icon={IconFileText} label="Files indexed" value={filesLabel} />
      </div>

      <div className="mt-4">
        <div className="text-[11px] tracking-wide text-muted-foreground uppercase">Bug report</div>
        <p className="mt-1 max-w-3xl rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm whitespace-pre-wrap">{run.bugReport}</p>
      </div>
    </div>
  );
}
