import { useState } from "react";
import { IconChevronRight, IconCloudUpload, IconFolder, IconPlus, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { relativeTime, truncateMiddle } from "@/lib/format";
import { groupByProject, type ProjectGroup } from "@/lib/projectGroups";
import type { JobState } from "../../types";
import type { RunMeta } from "../../hooks/useInvestigationRuns";
import type { UploadedProject } from "../../hooks/useUploadedProjects";
import { StatusDot } from "./StatusDot";
import { ThemeToggle } from "@/components/ThemeToggle";

const FILTERS = ["all", "active"] as const;
type Filter = (typeof FILTERS)[number];

function ProjectRow({
  group,
  jobsById,
  selectedId,
  expanded,
  onToggleExpand,
  onSelectRun,
  onInvestigateAgain,
  onSelectUpload,
  onRemoveUpload,
}: {
  group: ProjectGroup;
  jobsById: Record<string, JobState | undefined>;
  selectedId: string | "new";
  expanded: boolean;
  onToggleExpand: () => void;
  onSelectRun: (id: string) => void;
  onInvestigateAgain: (repoPath: string) => void;
  onSelectUpload: (upload: UploadedProject) => void;
  onRemoveUpload: (id: string) => void;
}) {
  const hasRuns = group.runs.length > 0;
  const latestRun = group.runs[0];
  const latestJob = latestRun ? jobsById[latestRun.id] : undefined;
  const isUploadOnly = !hasRuns && group.upload;
  const containsSelected = group.runs.some((r) => r.id === selectedId);

  function handleRowClick() {
    if (isUploadOnly && group.upload) {
      onSelectUpload(group.upload);
      return;
    }
    if (latestRun) onSelectRun(latestRun.id);
    if (!expanded) onToggleExpand();
  }

  return (
    <div className="group/project">
      <div
        className={cn(
          "relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
          containsSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
        )}
      >
        <button type="button" onClick={handleRowClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {isUploadOnly ? (
            <Tooltip content="Uploaded — awaiting a bug report">
              <IconCloudUpload className="size-3.5 shrink-0 text-warning" stroke={2} />
            </Tooltip>
          ) : (
            <StatusDot job={latestJob} />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
          {group.runs.length > 1 && <span className="shrink-0 text-xs text-muted-foreground">{group.runs.length} runs</span>}
        </button>

        <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(group.latestAtMs)}</span>

        {hasRuns ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <IconChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (group.upload) onRemoveUpload(group.upload.id);
            }}
            className="hidden size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground group-hover/project:flex"
            aria-label="Remove uploaded project"
          >
            <IconX className="size-3.5" stroke={1.75} />
          </button>
        )}
      </div>

      {expanded && hasRuns && (
        <div className="mt-0.5 ml-[1.1rem] space-y-0.5 border-l border-sidebar-border pl-3">
          {group.runs.map((run) => {
            const job = jobsById[run.id];
            const active = selectedId === run.id;
            return (
              <button
                key={run.id}
                type="button"
                onClick={() => onSelectRun(run.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <StatusDot job={job} className="size-1.5" />
                <span className="min-w-0 flex-1 truncate">{truncateMiddle(run.bugReport, 42)}</span>
                <span className="shrink-0">{relativeTime(run.startedAtMs)}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onInvestigateAgain(group.repoPath)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-brand hover:bg-brand/10"
          >
            <IconPlus className="size-3" stroke={2} />
            Investigate another bug
          </button>
        </div>
      )}
    </div>
  );
}

export function LeftSidebar({
  runs,
  uploads,
  jobsById,
  selectedId,
  onSelect,
  onSelectUpload,
  onRemoveUpload,
  onInvestigateAgain,
  onNew,
}: {
  runs: RunMeta[];
  uploads: UploadedProject[];
  jobsById: Record<string, JobState | undefined>;
  selectedId: string | "new";
  onSelect: (id: string) => void;
  onSelectUpload: (upload: UploadedProject) => void;
  onRemoveUpload: (id: string) => void;
  onInvestigateAgain: (repoPath: string) => void;
  onNew: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const groups = groupByProject(runs, uploads);
  const visible = groups.filter((g) => {
    if (filter === "all") return true;
    return g.runs.some((r) => jobsById[r.id]?.status === "running");
  });

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex size-6 items-center justify-center rounded-md bg-brand text-brand-foreground text-xs font-bold">CS</div>
        <span className="text-sm font-semibold">CodeSage</span>
        <ThemeToggle />
      </div>

      <div className="p-3">
        <Button type="button" variant="brand" size="sm" className="w-full justify-center" onClick={onNew}>
          <IconPlus className="size-4" />
          New investigation
        </Button>
      </div>

      <div className="flex items-center justify-between gap-1 px-3 pb-2">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                filter === f ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-sidebar-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        {groups.length > 0 && (
          <span className="pr-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {groups.length} project{groups.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <IconFolder className="size-6 text-muted-foreground/50" stroke={1.5} />
            <p className="text-sm text-muted-foreground">{groups.length === 0 ? "No projects yet." : "No active investigations."}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {visible.map((group) => (
              <ProjectRow
                key={group.key}
                group={group}
                jobsById={jobsById}
                selectedId={selectedId}
                expanded={expandedKeys.has(group.key) || group.runs.some((r) => r.id === selectedId)}
                onToggleExpand={() => toggleExpand(group.key)}
                onSelectRun={onSelect}
                onInvestigateAgain={onInvestigateAgain}
                onSelectUpload={onSelectUpload}
                onRemoveUpload={onRemoveUpload}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
