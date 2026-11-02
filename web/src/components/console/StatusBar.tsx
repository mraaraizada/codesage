import { useState } from "react";
import { IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { basenameOfPath } from "@/lib/format";
import type { JobState } from "../../types";
import type { RunMeta } from "../../hooks/useInvestigationRuns";
import { StatusDot, statusLabel } from "./StatusDot";

export function StatusBar({
  runs,
  jobsById,
  selectedId,
  onSelect,
  onRemove,
  onReorder,
}: {
  runs: RunMeta[];
  jobsById: Record<string, JobState | undefined>;
  selectedId: string | "new";
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (nextOrder: RunMeta[]) => void;
}) {
  // Native HTML5 drag-and-drop reordering — no extra dependency needed for a flat, single-row list.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setOverId(null);
      return;
    }
    const fromIndex = runs.findIndex((r) => r.id === draggingId);
    const toIndex = runs.findIndex((r) => r.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = runs.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onReorder(next);
    setDraggingId(null);
    setOverId(null);
  }

  return (
    <div className="flex h-8 shrink-0 items-center gap-4 overflow-x-auto border-t border-sidebar-border bg-sidebar px-4 text-xs text-sidebar-foreground">
      {runs.length === 0 ? (
        <span className="text-muted-foreground">No investigations yet — start one to see its status here.</span>
      ) : (
        runs.map((run) => {
          const job = jobsById[run.id];
          return (
            <div
              key={run.id}
              draggable
              onDragStart={() => setDraggingId(run.id)}
              onDragOver={(e) => {
                e.preventDefault();
                if (overId !== run.id) setOverId(run.id);
              }}
              onDragLeave={() => setOverId((current) => (current === run.id ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(run.id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setOverId(null);
              }}
              className={cn(
                "group flex shrink-0 cursor-grab items-center gap-1 whitespace-nowrap rounded px-1 active:cursor-grabbing",
                draggingId === run.id && "opacity-40",
                overId === run.id && draggingId !== run.id && "bg-accent/60",
              )}
              title="Drag to reorder"
            >
              <button
                type="button"
                onClick={() => onSelect(run.id)}
                className={cn("flex items-center gap-1.5", run.id === selectedId ? "font-medium text-sidebar-foreground" : "text-muted-foreground")}
              >
                <StatusDot job={job} />
                {basenameOfPath(run.repoPath)}: {statusLabel(job)}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(run.id);
                }}
                className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                title="Hide from this status bar only (it stays in the sidebar and keeps its report on the server)"
              >
                <IconX className="size-3" stroke={2} />
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
