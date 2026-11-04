import { useState } from "react";
import { IconChevronRight, IconGitCompare } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { truncateMiddle } from "@/lib/format";
import { parseDiffStats, totalStats, type FileDiffStat } from "@/lib/diffStats";
import { DiffBlock } from "@/components/ui/code-block";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import type { CodeSageReport, MultiBugReport } from "../../types";

/** The combined text of every KEPT sub-bug's patch, concatenated in batch order — each already
 * carries its own `--- a/...` / `+++ b/...` headers, so parseDiffStats (which walks headers to
 * split a diff back into per-file segments) handles several concatenated diffs the same way it
 * handles one. */
function combinedDiffText(report: MultiBugReport): string {
  return report.subBugs
    .filter((s) => s.kept && s.patch?.diffText)
    .map((s) => s.patch!.diffText)
    .join("\n");
}

const CHANGE_TYPE_CLASSES: Record<FileDiffStat["changeType"], string> = {
  A: "bg-success/15 text-success",
  M: "bg-warning/15 text-warning",
  D: "bg-destructive/15 text-destructive",
};

const TABS = ["Diff", "Graph"] as const;

function FileRow({ stat }: { stat: FileDiffStat }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs transition-colors hover:bg-accent/60"
      >
        <IconChevronRight className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold", CHANGE_TYPE_CLASSES[stat.changeType])}>
          {stat.changeType}
        </span>
        <Tooltip content={stat.path}>
          <span className="min-w-0 flex-1 truncate font-mono">{truncateMiddle(stat.path, 26)}</span>
        </Tooltip>
        <span className="shrink-0 text-success">+{stat.added}</span>
        <span className="shrink-0 text-destructive">-{stat.removed}</span>
      </button>
      {open && (
        <div className="px-4 pb-2">
          <DiffBlock diffText={stat.segment} className="max-h-72" />
        </div>
      )}
    </div>
  );
}

function DiffLoadingSkeleton() {
  return (
    <div className="space-y-3 px-4 py-4">
      <Skeleton className="h-3 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-5/6" />
        <Skeleton className="h-6 w-4/6" />
      </div>
    </div>
  );
}

export function EffectsPanel({
  report,
  running,
  docked = false,
}: {
  report: CodeSageReport | MultiBugReport | null;
  running: boolean;
  /** Once the final report is in, this panel docks at the bottom-middle of the page
   * instead of sitting pinned to the right edge for the whole investigation. */
  docked?: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Diff");
  const stats = report ? parseDiffStats(report.kind === "multi" ? combinedDiffText(report) : report.patch?.diffText ?? "") : [];
  const totals = totalStats(stats);
  const showLoading = running && stats.length === 0;

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col bg-sidebar text-sidebar-foreground",
        docked
          ? "mx-auto mb-4 w-full max-w-2xl rounded-xl border border-sidebar-border shadow-lg"
          : "w-80 border-l border-sidebar-border",
      )}
      style={docked ? { maxHeight: "40vh" } : undefined}
    >
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-sidebar-border px-3">
        {TABS.map((t) => {
          const disabled = t === "Graph";
          return (
            <Tooltip key={t} content={disabled ? "Not built in this MVP" : `Show ${t.toLowerCase()}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  disabled
                    ? "cursor-not-allowed text-muted-foreground/40"
                    : tab === t
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-sidebar-foreground",
                )}
              >
                {t}
                {disabled && <span className="ml-1 text-[11px]">soon</span>}
              </button>
            </Tooltip>
          );
        })}
      </div>

      {tab === "Graph" ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Dependency/call graph view is not built in this MVP — the Diff tab shows CodeSage's real output today.
        </div>
      ) : showLoading ? (
        <DiffLoadingSkeleton />
      ) : stats.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <IconGitCompare className="size-6 text-muted-foreground/50" stroke={1.5} />
          <p className="text-sm text-muted-foreground">{report ? "No patch applied yet." : "Start an investigation to see the diff here."}</p>
        </div>
      ) : (
        <>
          <div className="border-b border-sidebar-border px-4 py-3 text-xs">
            <span>
              <span className="font-medium">{stats.length}</span> file{stats.length === 1 ? "" : "s"} changed &nbsp;
              <span className="text-success">+{totals.added}</span> <span className="text-destructive">-{totals.removed}</span>
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div>
              <div className="px-4 pt-3 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Apply & re-test ({stats.length})
              </div>
              {stats.map((s) => (
                <FileRow key={s.path} stat={s} />
              ))}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
