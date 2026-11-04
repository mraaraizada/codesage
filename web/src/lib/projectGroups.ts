// Groups the flat lists the two sidebar data sources already track (useInvestigationRuns'
// RunMeta[] and useUploadedProjects' UploadedProject[]) into "a project with many investigations"
// for the left sidebar — purely a client-side regrouping of data that already exists, no new
// backend data source. A project is keyed by a normalized repo path: every past run against the
// same repo (or the same uploaded folder's materialized temp path — stable per upload, per the
// brief) lands in the same group.
import { basenameOfPath } from "./format";
import type { RunMeta } from "../hooks/useInvestigationRuns";
import type { UploadedProject } from "../hooks/useUploadedProjects";

export interface ProjectGroup {
  key: string;
  repoPath: string;
  name: string;
  /** Past investigations against this project, most recent first. */
  runs: RunMeta[];
  /** Set only when this project has an uploaded-but-not-yet-investigated folder waiting — once an
   * investigation starts, useUploadedProjects.promoteByPath() removes the upload entry, so this
   * and a non-empty `runs` list are not expected to coexist in practice, but nothing breaks if
   * they briefly do (e.g. a second upload of the same temp path, which can't really happen, or a
   * race while a job is starting). */
  upload: UploadedProject | null;
  latestAtMs: number;
}

/** Best-effort equality for "is this the same repo" across how a path might be typed/slashed —
 * grouping only, never used for filesystem access or security decisions. */
export function normalizeRepoKey(repoPath: string): string {
  return repoPath.trim().replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
}

export function groupByProject(runs: RunMeta[], uploads: UploadedProject[], nameOverrides: Record<string, string> = {}): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>();

  for (const run of runs) {
    const key = normalizeRepoKey(run.repoPath);
    const existing = map.get(key);
    if (existing) {
      existing.runs.push(run);
      existing.latestAtMs = Math.max(existing.latestAtMs, run.startedAtMs);
    } else {
      map.set(key, { key, repoPath: run.repoPath, name: basenameOfPath(run.repoPath), runs: [run], upload: null, latestAtMs: run.startedAtMs });
    }
  }

  for (const upload of uploads) {
    const key = normalizeRepoKey(upload.repoPath);
    const existing = map.get(key);
    if (existing) {
      existing.upload = upload;
      existing.latestAtMs = Math.max(existing.latestAtMs, upload.uploadedAtMs);
    } else {
      map.set(key, { key, repoPath: upload.repoPath, name: upload.name, runs: [], upload, latestAtMs: upload.uploadedAtMs });
    }
  }

  for (const group of map.values()) {
    group.runs.sort((a, b) => b.startedAtMs - a.startedAtMs);
    const override = nameOverrides[group.key];
    if (override) group.name = override;
  }
  return Array.from(map.values()).sort((a, b) => b.latestAtMs - a.latestAtMs);
}
