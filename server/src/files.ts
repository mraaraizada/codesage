// Real file-browser backend for a completed job's isolated workspace: list the real file tree,
// read one real file's content, or stream a real .zip of the whole (patched) directory. Reuses
// the core repo indexer so the file list is the same real walk (.gitignore-aware, node_modules
// excluded) the rest of the pipeline already relies on — no separate ad hoc directory walker.
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import type { Response } from "express";
import { ZipArchive } from "archiver";
import { buildRepoIndex } from "../../src/repo/indexer.js";
import { META_FILENAME } from "./projectStore.js";

export interface FileTreeEntry {
  relPath: string;
  sizeBytes: number;
  extension: string;
  language: string | null;
  isSource: boolean;
}

const MAX_READ_BYTES = 2_000_000;

export function listWorkspaceFiles(workspaceDir: string): FileTreeEntry[] {
  const index = buildRepoIndex(workspaceDir);
  return index.files
    .filter((f) => f.relPath !== META_FILENAME)
    .map((f) => ({
      relPath: f.relPath,
      sizeBytes: f.sizeBytes,
      extension: f.extension,
      language: f.language,
      isSource: f.isSource,
    }));
}

export class PathTraversalError extends Error {}
export class FileTooLargeError extends Error {}

/** Resolves a user-supplied relative path against the workspace root, refusing anything that
 * would escape it (`..`, an absolute path, a symlink is not specially handled but cpSync never
 * copies one across the workspace boundary in practice here). */
export function safeWorkspacePath(workspaceDir: string, relPath: string): string {
  const abs = resolve(workspaceDir, relPath);
  const rel = relative(workspaceDir, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new PathTraversalError(`Refused to read path outside the workspace: ${relPath}`);
  }
  return abs;
}

export function readWorkspaceFile(workspaceDir: string, relPath: string): string {
  if (relPath === META_FILENAME) {
    throw new Error(`File not found: ${relPath}`); // internal bookkeeping, never a real project file
  }
  const abs = safeWorkspacePath(workspaceDir, relPath);
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${relPath}`);
  }
  const size = statSync(abs).size;
  if (size > MAX_READ_BYTES) {
    throw new FileTooLargeError(`File too large to display (${size} bytes): ${relPath}`);
  }
  return readFileSync(abs, "utf8");
}

/** Streams the workspace (minus node_modules/.git, via the same real indexer walk as the rest of
 * the app) to `res` as a .zip — real archiving via the `archiver` package (v8's `ZipArchive`
 * class API; it dropped the older `archiver('zip', opts)` factory and `.glob()` helper), not a
 * placeholder. */
export function streamWorkspaceZip(workspaceDir: string, archiveName: string, res: Response): void {
  res.attachment(archiveName);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("error", (err: unknown) => {
    // Headers may already be flushed by the time archiver hits a read error mid-stream; end the
    // response rather than trying to send a second error response.
    if (!res.headersSent) res.status(500);
    res.end();
    console.error("zip stream error:", err);
  });
  archive.pipe(res);

  const index = buildRepoIndex(workspaceDir);
  for (const f of index.files) {
    if (f.relPath === META_FILENAME) continue;
    archive.file(f.absPath, { name: f.relPath });
  }

  void archive.finalize();
}
