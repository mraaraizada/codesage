// The real collapsible Explorer folder tree — VS Code chrome: chevrons, a caps project-name root
// node, indented nested files, a small toolbar above the tree (refresh + collapse-all + download).
import { useState } from "react";
import { IconChevronRight, IconDownload, IconFile, IconFolder, IconRefresh, IconFoldersOff } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import type { TreeNode } from "@/lib/fileTree";

function FileIcon() {
  return <IconFile className="size-3.5 shrink-0 text-white/50" stroke={1.75} />;
}

function Row({
  node,
  depth,
  collapsed,
  toggleCollapsed,
  activePath,
  onOpenFile,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  toggleCollapsed: (path: string) => void;
  activePath: string | null;
  onOpenFile: (node: TreeNode) => void;
}) {
  const isCollapsed = collapsed.has(node.path);
  const indent = 8 + depth * 14;

  if (node.isDir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => toggleCollapsed(node.path)}
          className="flex w-full items-center gap-1 py-[3px] text-left text-[13px] text-white/85 hover:bg-white/5"
          style={{ paddingLeft: indent }}
        >
          <IconChevronRight className={cn("size-3.5 shrink-0 text-white/50 transition-transform", !isCollapsed && "rotate-90")} />
          <IconFolder className="size-3.5 shrink-0 text-[#c09553]" stroke={1.75} />
          <span className="truncate">{node.name}</span>
        </button>
        {!isCollapsed &&
          node.children.map((child) => (
            <Row key={child.path} node={child} depth={depth + 1} collapsed={collapsed} toggleCollapsed={toggleCollapsed} activePath={activePath} onOpenFile={onOpenFile} />
          ))}
      </div>
    );
  }

  const active = activePath === node.path;
  return (
    <button
      type="button"
      onClick={() => onOpenFile(node)}
      className={cn(
        "flex w-full items-center gap-1.5 py-[3px] text-left text-[13px] text-white/75 hover:bg-white/5",
        active && "bg-[#37373d] text-white",
      )}
      style={{ paddingLeft: indent + 14 }}
    >
      <FileIcon />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function ExplorerPanel({
  root,
  loading,
  error,
  activePath,
  onOpenFile,
  onRefresh,
  onDownload,
}: {
  root: TreeNode | null;
  loading: boolean;
  error: string | null;
  activePath: string | null;
  onOpenFile: (node: TreeNode) => void;
  onRefresh: () => void;
  onDownload: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleCollapsed(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function collapseAll() {
    if (!root) return;
    const all = new Set<string>();
    const walk = (node: TreeNode) => {
      if (node.isDir && node.path !== "") all.add(node.path);
      node.children.forEach(walk);
    };
    walk(root);
    setCollapsed(all);
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col bg-[#252526] text-white">
      <div className="flex h-9 shrink-0 items-center justify-between pr-2 pl-4">
        <span className="text-[11px] font-semibold tracking-wide text-white/60">Explorer</span>
        <div className="flex items-center gap-0.5">
          <Tooltip content="Refresh">
            <button type="button" onClick={onRefresh} className="flex size-6 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white">
              <IconRefresh className="size-3.5" stroke={1.75} />
            </button>
          </Tooltip>
          <Tooltip content="Collapse all">
            <button type="button" onClick={collapseAll} className="flex size-6 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white">
              <IconFoldersOff className="size-3.5" stroke={1.75} />
            </button>
          </Tooltip>
          <Tooltip content="Download post-patch workspace (.zip)">
            <button type="button" onClick={onDownload} className="flex size-6 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white">
              <IconDownload className="size-3.5" stroke={1.75} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {loading ? (
          <p className="px-4 py-3 text-xs text-white/50">Loading workspace…</p>
        ) : error ? (
          <p className="px-4 py-3 text-xs text-destructive">{error}</p>
        ) : root ? (
          <div>
            <div className="py-[3px] pl-2 text-[12px] font-bold tracking-wide text-white/90 uppercase">{root.name}</div>
            {root.children.map((child) => (
              <Row key={child.path} node={child} depth={0} collapsed={collapsed} toggleCollapsed={toggleCollapsed} activePath={activePath} onOpenFile={onOpenFile} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
