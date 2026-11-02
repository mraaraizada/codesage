// Real drag-and-drop / directory-picker folder upload for the "New investigation" form, as an
// alternative to typing a repo path. Two browser entry points land here:
//  - A drop event on a dropzone: DataTransferItem.webkitGetAsEntry() gives a FileSystemEntry tree
//    we walk ourselves (directories first, recursively, via FileSystemDirectoryReader).
//  - A plain <input type="file" webkitdirectory> picker: the browser already flattens the chosen
//    tree into a FileList where each File carries `webkitRelativePath`.
// Both paths produce the same CollectedFile[] shape, which materializeUpload() on the server pairs
// back up into a real directory via the parallel "files"/"paths" multipart fields (see
// server/src/upload.ts — a File's own `name` can't carry "/" across multipart form data, so the
// relative path rides as a separate text field per file).

export interface CollectedFile {
  file: File;
  path: string;
}

export interface UploadResult {
  repoPath: string;
  fileCount: number;
  totalBytes: number;
}

/** Directories that are never useful to upload (vendored deps, VCS metadata, build output) — same
 * spirit as the repo indexer's own exclusions elsewhere in the pipeline. Skipping them client-side
 * keeps a dropped project folder well under the server's 50MB upload cap. */
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
]);

function shouldSkipSegment(name: string): boolean {
  return SKIP_DIR_NAMES.has(name);
}

// Uses the DOM lib's own FileSystemEntry/FileSystemFileEntry/FileSystemDirectoryEntry types
// (TypeScript ships these as part of the File and Directory Entries API surface already attached
// to DataTransferItem.webkitGetAsEntry()) rather than redeclaring a parallel shape.

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  // readEntries() only returns a batch at a time (browser-defined chunk size) — must be called
  // repeatedly until it comes back empty, per the File and Directory Entries API spec.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: CollectedFile[]): Promise<void> {
  if (shouldSkipSegment(entry.name)) return;
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
    out.push({ file, path: prefix + entry.name });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const children = await readAllEntries(dirEntry.createReader());
    await Promise.all(children.map((child) => walkEntry(child, `${prefix}${entry.name}/`, out)));
  }
}

/** True only when every dragged item is a plain file with no folder — in that case there is
 * nothing to walk and we fall back to the flat FileList, since `webkitGetAsEntry` is absent on
 * some older/non-Chromium browsers. */
function supportsEntries(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.items).some((item) => typeof item.webkitGetAsEntry === "function");
}

/** Collects every real file under whatever was dropped (one or more folders and/or loose files). */
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<CollectedFile[]> {
  if (!supportsEntries(dataTransfer)) {
    return Array.from(dataTransfer.files).map((file) => ({ file, path: file.name }));
  }
  const items = Array.from(dataTransfer.items);
  const entries = items.map((item) => item.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => Boolean(e));
  const out: CollectedFile[] = [];
  await Promise.all(entries.map((entry) => walkEntry(entry, "", out)));
  return out;
}

/** Collects files from a `<input type="file" webkitdirectory multiple>` change event — the
 * browser already flattened the tree, each File's `webkitRelativePath` carries the structure. */
export function collectInputFiles(fileList: FileList): CollectedFile[] {
  const out: CollectedFile[] = [];
  for (const file of Array.from(fileList)) {
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (relPath.split("/").some((seg) => shouldSkipSegment(seg))) continue;
    out.push({ file, path: relPath });
  }
  return out;
}

/** Uploads real collected files to the server, which materializes them into a fresh temp
 * directory and hands back its path — usable directly as a normal `repoPath`. */
export async function uploadFolder(files: CollectedFile[]): Promise<UploadResult> {
  if (files.length === 0) {
    throw new Error("No files found in the dropped folder (it may be empty, or only contained excluded directories like node_modules).");
  }
  const form = new FormData();
  for (const f of files) {
    form.append("files", f.file, f.file.name);
    form.append("paths", f.path);
  }
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || "Upload failed.");
  }
  return res.json();
}

/** The dropped folder's own display name — the first path segment every collected file shares. */
export function folderNameOf(files: CollectedFile[]): string {
  const first = files[0]?.path ?? "";
  return first.split("/")[0] || "uploaded-project";
}
