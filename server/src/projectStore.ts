// Durable storage for a completed job's patched code. Without this, the only copy of the fixed
// code lived in an OS-temp-dir isolated workspace (src/workspace/isolate.ts) that is deliberately
// time-bounded (jobs.ts's WORKSPACE_RETENTION_MS sweep) and is NOT itself survivable across a
// server restart (only the job's JSON record is, via jobs.ts's saveJobToDisk/loadJobsFromDisk).
// This module copies that workspace into a permanent location under server/.data/projects/
// (gitignored, same real directory the job-persistence feature already uses) so the fixed code
// outlives both the temp-workspace sweep and a restart.
//
// Design choices, stated plainly:
//  - Organized as .data/projects/<projectId>/<jobId>/ — "project" is keyed off a normalized repo
//    path (see projectIdFor), so every investigation ever run against the same repo/uploaded
//    folder lands under the same project bucket, with one subfolder per job (one saved version
//    per completed job, not per file-change).
//  - Saved for ANY completed job that produced a workspace (apply ran, regardless of the final
//    verification verdict) — not only "verified-fixed". A "tests-still-failing" or "inconclusive"
//    result still represents real patched code a user may want to inspect or download later; it
//    would be dishonest to silently drop it just because the verdict wasn't the best case.
//  - Retention: keeps the KEEP_VERSIONS_PER_PROJECT most-recently-saved versions per project and
//    deletes older ones (by directory mtime). This is a demo-appropriate disk-usage bound, not a
//    production backup/versioning system — there is no per-version size cap, no "keep forever"
//    option, and a pruned version's code is gone for good (the job's JSON report is unaffected
//    and still persists separately).
//  - Reuses the exact same repo-indexer walk the file-browser/zip-download endpoints already
//    trust (src/repo/indexer.ts), so the permanent copy excludes node_modules/.git exactly like
//    what a user already saw in the code viewer or downloaded as a .zip — never a raw recursive
//    copy that could drag gigabytes of vendored deps along.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { buildRepoIndex } from "../../src/repo/indexer.js";

const PROJECTS_DIR = join(import.meta.dirname, "..", ".data", "projects");
const KEEP_VERSIONS_PER_PROJECT = 5;

/** CodeSage's own internal bookkeeping file written alongside each saved version — never a real
 * project file, so files.ts's listWorkspaceFiles/streamWorkspaceZip filter it back out before it
 * reaches the file-tree/zip-download endpoints a user actually sees. */
export const META_FILENAME = ".codesage-meta.json";

/** A stable, filesystem-safe id for "the project at this repo path" — normalizes separators and
 * case (Windows paths are case-insensitive) so the same repo always maps to the same bucket
 * regardless of how its path was typed/slashed, and keeps a human-readable prefix for anyone
 * browsing server/.data/projects/ by hand. */
export function projectIdFor(repoPath: string): string {
  const normalized = resolve(repoPath).replace(/\\/g, "/").toLowerCase();
  const hash = createHash("sha1").update(normalized).digest("hex").slice(0, 10);
  const base = normalized.split("/").filter(Boolean).pop() ?? "project";
  const slug =
    base
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .toLowerCase() || "project";
  return `${slug}-${hash}`;
}

function projectDir(projectId: string): string {
  return join(PROJECTS_DIR, projectId);
}

function versionDir(projectId: string, jobId: string): string {
  return join(projectDir(projectId), jobId);
}

export interface SavedVersionMeta {
  jobId: string;
  repoPath: string;
  savedAtIso: string;
  verification: string;
}

/** Copies `workspaceDir` (a job's isolated post-patch workspace) into permanent per-project
 * storage and returns the new permanent directory. Safe to call once per completed job. */
export function saveFixedVersion(opts: { repoPath: string; jobId: string; workspaceDir: string; verification: string }): string {
  const projectId = projectIdFor(opts.repoPath);
  const target = versionDir(projectId, opts.jobId);
  mkdirSync(target, { recursive: true });

  const index = buildRepoIndex(opts.workspaceDir);
  const allowedFiles = new Set(index.files.map((f) => resolve(f.absPath)));
  const srcRoot = resolve(opts.workspaceDir);

  // A directory may only be descended into if it actually contains (transitively) at least one
  // allowed file — NOT "every directory", which would also let cpSync recurse into and copy
  // node_modules/.git themselves (cpSync's filter has no third option between "copy + recurse"
  // and "skip entirely", so an unconditional true for directories defeats the indexer's own
  // exclusions). Built once from the same real indexer walk the file-browser/zip already trust.
  const allowedDirs = new Set<string>([srcRoot]);
  for (const f of allowedFiles) {
    let dir = dirname(f);
    while (dir.length >= srcRoot.length && !allowedDirs.has(dir)) {
      allowedDirs.add(dir);
      dir = dirname(dir);
    }
  }

  cpSync(opts.workspaceDir, target, {
    recursive: true,
    filter: (src) => {
      const abs = resolve(src);
      if (abs === srcRoot) return true;
      let isDir = false;
      try {
        isDir = statSync(abs).isDirectory();
      } catch {
        return false; // vanished mid-copy; skip rather than throw
      }
      return isDir ? allowedDirs.has(abs) : allowedFiles.has(abs);
    },
  });

  const meta: SavedVersionMeta = { jobId: opts.jobId, repoPath: opts.repoPath, savedAtIso: new Date().toISOString(), verification: opts.verification };
  writeFileSync(join(target, META_FILENAME), JSON.stringify(meta, null, 2), "utf8");

  pruneOldVersions(projectId);
  return target;
}

function pruneOldVersions(projectId: string): void {
  const dir = projectDir(projectId);
  if (!existsSync(dir)) return;
  let entries: { name: string; path: string; mtimeMs: number }[];
  try {
    entries = readdirSync(dir)
      .map((name) => ({ name, path: join(dir, name) }))
      .filter((e) => {
        try {
          return statSync(e.path).isDirectory();
        } catch {
          return false;
        }
      })
      .map((e) => ({ ...e, mtimeMs: statSync(e.path).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return;
  }

  for (const stale of entries.slice(KEEP_VERSIONS_PER_PROJECT)) {
    try {
      rmSync(stale.path, { recursive: true, force: true });
    } catch {
      // best-effort; a stray version directory is not fatal
    }
  }
}

/** Every saved version directory for a given repo path, most recent first — the data the
 * "projects, many investigations" sidebar grouping draws on for "this project has N saved fixed
 * versions" context, independent of whether the in-memory job list still has the job. */
export function savedVersionsForProject(repoPath: string): SavedVersionMeta[] {
  const dir = projectDir(projectIdFor(repoPath));
  if (!existsSync(dir)) return [];
  const out: SavedVersionMeta[] = [];
  for (const name of readdirSync(dir)) {
    const metaPath = join(dir, name, META_FILENAME);
    if (!existsSync(metaPath)) continue;
    try {
      out.push(JSON.parse(readFileSync(metaPath, "utf8")));
    } catch {
      // skip a corrupt meta file
    }
  }
  return out.sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso));
}
