import { useState } from "react";
import { IconChevronRight, IconFileText } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { STAGE_GROUPS, eventsForGroup, groupStatus, type GroupStatus } from "@/lib/stages";
import type { JobState, PipelineEvent } from "../../types";
import { ReportMarkdownModal } from "./ReportMarkdownModal";

const BADGE_CLASSES: Record<GroupStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  active: "bg-brand/15 text-brand animate-pulse",
  complete: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
  skipped: "bg-muted text-muted-foreground/60",
};

const STATUS_HINT: Record<GroupStatus, string | null> = {
  pending: null,
  active: null,
  complete: null,
  failed: null,
  skipped: "skipped",
};

export function StageList({ events, jobStatus, jobId }: { events: PipelineEvent[]; jobStatus: JobState["status"] | undefined; jobId?: string }) {
  return (
    <div className="border-t border-border">
      {STAGE_GROUPS.map((group) => (
        <StageListRow key={group.key} group={group} events={eventsForGroup(group, events)} status={groupStatus(group, events, STAGE_GROUPS, jobStatus)} jobId={jobId} />
      ))}
    </div>
  );
}

function mdPathOf(e: PipelineEvent): string | null {
  const v = e.data?.mdPath;
  return typeof v === "string" ? v : null;
}

function StageListRow({
  group,
  events,
  status,
  jobId,
}: {
  group: (typeof STAGE_GROUPS)[number];
  events: PipelineEvent[];
  status: GroupStatus;
  jobId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const hint = STATUS_HINT[status];
  return (
    <div className="border-b border-border">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-muted/40">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold", BADGE_CLASSES[status])}>{group.initials}</span>
        <span className={cn("flex-1 text-sm font-medium", status === "skipped" && "text-muted-foreground")}>{group.label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {hint ?? `${events.length} step${events.length === 1 ? "" : "s"}`}
        </span>
        <IconChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="space-y-1 bg-muted/20 px-6 py-3 font-mono text-xs text-muted-foreground">
          {events.length === 0 ? (
            <div>Not reached in this run.</div>
          ) : (
            events.map((e, i) => {
              const mdPath = mdPathOf(e);
              return (
                <div key={i} className="flex items-center gap-2">
                  <span>{e.message}</span>
                  {mdPath && jobId && (
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setShowReport(true);
                      }}
                      className="inline-flex shrink-0 items-center gap-1 text-brand hover:underline"
                    >
                      <IconFileText className="size-3" stroke={1.75} />
                      View report.md
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
      {showReport && jobId && <ReportMarkdownModal jobId={jobId} onClose={() => setShowReport(false)} />}
    </div>
  );
}
