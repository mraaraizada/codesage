// Real folder-upload handling for the "drag a project folder in" flow.
//
// A real headless-Chrome test (not just Node's fetch) confirmed that `FormData.append(name, blob,
// filename)` does NOT preserve "/" in the filename across to the multipart Content-Disposition
// header — browsers flatten it to a basename. So the relative path can't ride on the file part's
// filename alone; the frontend (web/src/lib/folderUpload.ts) sends it as a matching parallel text
// field instead: one "files" part and one "paths" part per file, in the same order. This module
// pairs them up, materializes the real relative structure into a fresh temp directory with real
// path-traversal checks, and returns that directory so it can be used as a normal `repoPath`.
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute, dirname } from "node:path";
import multer from "multer";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB total, per the brief
export const MAX_UPLOAD_FILES = 4000;

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_UPLOAD_FILES },
}).array("files", MAX_UPLOAD_FILES);

export class UploadRejectedError extends Error {}

/** Turns one file's relative path (forward- or back-slashed) into a safe path under `root`. The
 * dropped folder's own name (the first path segment) is stripped so the project's real files land
 * directly at `root` — `root/src/index.js`, not `root/my-project/src/index.js` — matching what a
 * normal `repoPath` points at. Throws `UploadRejectedError` on any `..`, empty segment, or
 * absolute-looking path. */
function resolveUploadTarget(root: string, relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new UploadRejectedError(`Rejected absolute path in upload: ${relPath}`);
  }
  let segments = normalized.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) {
    throw new UploadRejectedError(`Rejected empty path in upload: ${relPath}`);
  }
  if (segments.some((s) => s === "..")) {
    throw new UploadRejectedError(`Rejected path traversal in upload: ${relPath}`);
  }
  // Strip the dropped folder's own root segment (present whenever a real folder, not a loose
  // file, was dropped/selected).
  if (segments.length > 1) segments = segments.slice(1);

  const target = resolve(root, ...segments);
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new UploadRejectedError(`Rejected path escaping upload root: ${relPath}`);
  }
  return target;
}

function normalizePaths(raw: unknown, count: number): string[] | null {
  if (raw === undefined) return null;
  const arr = Array.isArray(raw) ? raw : [raw];
  if (arr.length !== count || !arr.every((p) => typeof p === "string")) return null;
  return arr as string[];
}

export function materializeUpload(files: Express.Multer.File[], rawPaths: unknown): { repoPath: string; fileCount: number; totalBytes: number } {
  if (files.length === 0) {
    throw new UploadRejectedError("No files in upload.");
  }
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_UPLOAD_BYTES) {
    throw new UploadRejectedError(`Upload too large: ${totalBytes} bytes (limit ${MAX_UPLOAD_BYTES}).`);
  }

  // Prefer the parallel "paths" field (carries real relative paths with folders); fall back to
  // each part's own filename (fine for a handful of loose files with no folder structure, which
  // is all a flattened multipart filename could express anyway).
  const paths = normalizePaths(rawPaths, files.length) ?? files.map((f) => f.originalname);

  const root = mkdtempSync(join(tmpdir(), "codesage-upload-"));
  files.forEach((file, i) => {
    const target = resolveUploadTarget(root, paths[i]);
    const dir = dirname(target);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(target, file.buffer);
  });

  return { repoPath: root, fileCount: files.length, totalBytes };
}
