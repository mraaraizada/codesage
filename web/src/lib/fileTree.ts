// Builds a nested folder/file tree (for the code viewer's Explorer panel) out of the flat
// relPath list the server's /api/jobs/:id/files endpoint returns (server/src/files.ts, itself a
// thin wrapper over the real repo indexer walk).
import type { FileTreeEntry } from "@/types";

export interface TreeNode {
  name: string;
  path: string; // relPath from the workspace root ("" for the synthetic root)
  isDir: boolean;
  children: TreeNode[];
  file?: FileTreeEntry;
}

export function buildFileTree(files: FileTreeEntry[], rootName: string): TreeNode {
  const root: TreeNode = { name: rootName, path: "", isDir: true, children: [] };
  const dirIndex = new Map<string, TreeNode>([["", root]]);

  function ensureDir(path: string): TreeNode {
    const existing = dirIndex.get(path);
    if (existing) return existing;
    const lastSlash = path.lastIndexOf("/");
    const parentPath = lastSlash === -1 ? "" : path.slice(0, lastSlash);
    const name = lastSlash === -1 ? path : path.slice(lastSlash + 1);
    const parent = ensureDir(parentPath);
    const node: TreeNode = { name, path, isDir: true, children: [] };
    parent.children.push(node);
    dirIndex.set(path, node);
    return node;
  }

  for (const f of files.slice().sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    const normalized = f.relPath.replace(/\\/g, "/");
    const lastSlash = normalized.lastIndexOf("/");
    const dirPath = lastSlash === -1 ? "" : normalized.slice(0, lastSlash);
    const name = lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
    const parent = ensureDir(dirPath);
    parent.children.push({ name, path: normalized, isDir: false, children: [], file: f });
  }

  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) if (child.isDir) sortTree(child);
}
