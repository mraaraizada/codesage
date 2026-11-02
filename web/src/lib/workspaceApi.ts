// Thin client for the real completed-job workspace endpoints (server/src/index.ts + files.ts):
// browsing the isolated POST-PATCH workspace's file tree, reading one real file's content, and
// building the .zip download link. No fake/mock data — every call hits the real server.
import type { FileTreeEntry } from "@/types";

/** Percent-encodes each path segment separately (not the whole string) so real "/" characters
 * stay in the URL — matches the server's `decodeURIComponent(req.params[1])` on the whole
 * captured remainder (server/src/index.ts's `/api/jobs/:id/files/(.*)` route). */
function encodeRelPath(relPath: string): string {
  return relPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

export class WorkspaceApiError extends Error {}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new WorkspaceApiError(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchWorkspaceFiles(jobId: string): Promise<FileTreeEntry[]> {
  const res = await fetch(`/api/jobs/${jobId}/files`);
  const data = await asJson<{ files: FileTreeEntry[] }>(res);
  return data.files;
}

export async function fetchWorkspaceFileContent(jobId: string, relPath: string): Promise<string> {
  const res = await fetch(`/api/jobs/${jobId}/files/${encodeRelPath(relPath)}`);
  const data = await asJson<{ path: string; content: string }>(res);
  return data.content;
}

export function workspaceDownloadUrl(jobId: string): string {
  return `/api/jobs/${jobId}/download`;
}
