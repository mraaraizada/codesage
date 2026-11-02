import { useState } from "react";

/** A folder uploaded via drag-and-drop that hasn't had an investigation started against it yet.
 * Lives in the same left-sidebar list as past investigation runs (see LeftSidebar.tsx) so an
 * upload is a first-class entry point, not a disconnected one-off action. Once an investigation
 * is actually started against its `repoPath`, the entry is removed — the real investigation run
 * (tracked by useInvestigationRuns) takes over that slot in the sidebar. */
export interface UploadedProject {
  id: string;
  name: string;
  repoPath: string;
  fileCount: number;
  totalBytes: number;
  uploadedAtMs: number;
}

const STORAGE_KEY = "codesage-uploads-v1";
const MAX_UPLOADS = 20;

function load(): UploadedProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(list: UploadedProject[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_UPLOADS)));
  } catch {
    // best-effort only
  }
}

export function useUploadedProjects() {
  const [uploads, setUploads] = useState<UploadedProject[]>(() => load());

  function addUpload(project: Omit<UploadedProject, "id" | "uploadedAtMs">): UploadedProject {
    const entry: UploadedProject = { ...project, id: crypto.randomUUID(), uploadedAtMs: Date.now() };
    setUploads((prev) => {
      const next = [entry, ...prev].slice(0, MAX_UPLOADS);
      save(next);
      return next;
    });
    return entry;
  }

  function removeUpload(id: string) {
    setUploads((prev) => {
      const next = prev.filter((u) => u.id !== id);
      save(next);
      return next;
    });
  }

  /** Called once an investigation is actually started from a repo path — drops the matching
   * upload entry(ies) since a real run now represents that project in the sidebar instead. */
  function promoteByPath(repoPath: string) {
    setUploads((prev) => {
      const next = prev.filter((u) => u.repoPath !== repoPath);
      if (next.length !== prev.length) save(next);
      return next;
    });
  }

  return { uploads, addUpload, removeUpload, promoteByPath };
}
