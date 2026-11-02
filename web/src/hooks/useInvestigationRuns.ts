import { useEffect, useRef, useState } from "react";
import { apiUrl } from "../lib/apiBase";
import type { JobState } from "../types";

export interface RunMeta {
  id: string;
  repoPath: string;
  bugReport: string;
  startedAtMs: number;
}

const STORAGE_KEY = "codesage-runs-v1";
const SELECTED_KEY = "codesage-selected-run-v1";
// Ids closed from the bottom status bar specifically — kept separate from `metas` (the sidebar's
// own list) on purpose: closing an entry in the status bar is a "hide from this one strip" action,
// not "forget this investigation everywhere." The sidebar must be unaffected by it.
const STATUS_BAR_HIDDEN_KEY = "codesage-statusbar-hidden-v1";
const MAX_RUNS = 20;
const POLL_INTERVAL_MS = 1200;

function loadHiddenFromStatusBar(): Set<string> {
  try {
    const raw = localStorage.getItem(STATUS_BAR_HIDDEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveHiddenFromStatusBar(ids: Set<string>) {
  try {
    localStorage.setItem(STATUS_BAR_HIDDEN_KEY, JSON.stringify([...ids]));
  } catch {
    // best-effort only
  }
}

/**
 * Returns the remembered selection, and whether one was ever explicitly saved at all. This
 * distinction matters: an explicit "new" (the user clicked "+ New" before reloading) must be
 * honored as-is, not silently overridden back to "most recent run" during hydration below — that
 * would make the New-investigation screen revert to an old run on every reload, which is wrong.
 * Only a key that was never saved (first-ever load, nothing to restore) falls back to "most recent
 * run" once the run list is known.
 */
function loadSelectedId(): { id: string | "new"; wasSaved: boolean } {
  try {
    const raw = localStorage.getItem(SELECTED_KEY);
    return raw === null ? { id: "new", wasSaved: false } : { id: raw, wasSaved: true };
  } catch {
    return { id: "new", wasSaved: false };
  }
}

function saveSelectedId(id: string | "new") {
  try {
    localStorage.setItem(SELECTED_KEY, id);
  } catch {
    // best-effort only — losing the remembered selection is not fatal
  }
}

function loadMetas(): RunMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMetas(metas: RunMeta[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metas.slice(0, MAX_RUNS)));
  } catch {
    // best-effort only — a past-runs sidebar that fails to persist is not fatal
  }
}

async function fetchJob(id: string): Promise<JobState | null> {
  try {
    const res = await fetch(apiUrl(`/api/jobs/${id}`));
    if (!res.ok) return null;
    return (await res.json()) as JobState;
  } catch {
    return null;
  }
}

export function useInvestigationRuns(onSettled?: (id: string, job: JobState) => void) {
  const [metas, setMetas] = useState<RunMeta[]>(() => loadMetas());
  const [hiddenFromStatusBar, setHiddenFromStatusBar] = useState<Set<string>>(() => loadHiddenFromStatusBar());
  const [jobsById, setJobsById] = useState<Record<string, JobState | undefined>>({});
  const initialSelection = useRef(loadSelectedId());
  const [selectedId, setSelectedId] = useState<string | "new">(() => initialSelection.current.id);
  const [now, setNow] = useState(() => Date.now());
  const hydrated = useRef(false);
  // Ids whose "running" state we've actually observed live in this session — only these get a
  // settle notification. A run that was already done/errored when it hydrated from localStorage
  // never fires one; toasts are for things that happened while you were watching.
  const seenRunning = useRef<Set<string>>(new Set());

  // Live clock for elapsed-time display.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // One-time hydration: re-fetch every persisted run from the server's in-memory job store (jobs
  // survive as long as the server process does), drop any the server no longer knows about, and
  // select the most recent survivor.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (metas.length === 0) return;
    (async () => {
      const results = await Promise.all(metas.map((m) => fetchJob(m.id)));
      const survivors: RunMeta[] = [];
      const nextJobs: Record<string, JobState | undefined> = {};
      metas.forEach((m, i) => {
        if (results[i]) {
          survivors.push(m);
          nextJobs[m.id] = results[i] ?? undefined;
        }
      });
      setMetas(survivors);
      saveMetas(survivors);
      setJobsById((prev) => ({ ...prev, ...nextJobs }));
      // Prefer restoring exactly what was open before reload (remembered selection) if it still
      // exists. An explicit "new" (the user was on the empty screen) is honored as-is — it is NOT
      // treated as "nothing was remembered". Only when no selection was ever saved at all (a
      // first-ever load) do we default to the most recent run, purely as a nicer first impression.
      setSelectedId((current) => {
        if (current !== "new" && survivors.some((m) => m.id === current)) return current;
        if (current === "new" && initialSelection.current.wasSaved) return "new";
        return survivors.length > 0 ? survivors[0].id : "new";
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll whichever run is selected while it's still running (and fetch it once immediately on
  // selection even if not running, so switching to an older run shows its real last-known state).
  useEffect(() => {
    if (selectedId === "new") return;
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      const job = await fetchJob(selectedId);
      if (cancelled || !job) return;
      setJobsById((prev) => ({ ...prev, [selectedId]: job }));
      if (job.status === "running") {
        seenRunning.current.add(selectedId);
        timer = window.setTimeout(tick, POLL_INTERVAL_MS);
      } else if (seenRunning.current.has(selectedId)) {
        seenRunning.current.delete(selectedId);
        onSettled?.(selectedId, job);
      }
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [selectedId]);

  function select(id: string | "new") {
    setSelectedId(id);
    saveSelectedId(id);
  }

  function registerRun(meta: RunMeta) {
    setMetas((prev) => {
      const next = [meta, ...prev.filter((m) => m.id !== meta.id)].slice(0, MAX_RUNS);
      saveMetas(next);
      return next;
    });
    setSelectedId(meta.id);
    saveSelectedId(meta.id);
  }

  /** Dismisses a run from the bottom status bar ONLY — the sidebar's run list (`metas`) and the
   * job itself are untouched. Purely a per-strip "hide this" action, reversible by re-running the
   * same investigation (it gets a new job id and reappears) or by clearing this one localStorage
   * key; there's no "undo" UI for it since the user can still find the same run via the sidebar. */
  function hideFromStatusBar(id: string) {
    setHiddenFromStatusBar((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveHiddenFromStatusBar(next);
      return next;
    });
  }

  /** User-driven manual reordering (e.g. drag-and-drop in the status bar) — persisted the same way
   * as every other change to the run list, so the custom order survives a reload. Reordering the
   * status bar also reorders the sidebar, since they share one underlying list — only visibility
   * (hideFromStatusBar, above) is strip-specific. */
  function reorderRuns(nextOrder: RunMeta[]) {
    setMetas(nextOrder);
    saveMetas(nextOrder);
  }

  const statusBarRuns = metas.filter((m) => !hiddenFromStatusBar.has(m.id));

  return { metas, statusBarRuns, jobsById, selectedId, select, registerRun, hideFromStatusBar, reorderRuns, now };
}
