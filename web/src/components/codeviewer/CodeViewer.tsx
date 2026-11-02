// The full-page (not a side panel) code viewer for a completed investigation's real, isolated
// POST-PATCH workspace. Structured like real VS Code: activity bar, Explorer tree, a tab bar where
// every opened file gets its own closable tab, an editor pane with a real line-number gutter, a
// bottom panel (TERMINAL shows real before/after test stdout/stderr), and a thin status bar.
import { useEffect, useState } from "react";
import { IconTerminal2 } from "@tabler/icons-react";
import { Tooltip } from "@/components/ui/tooltip";
import { basenameOfPath } from "@/lib/format";
import { buildFileTree, type TreeNode } from "@/lib/fileTree";
import { fetchWorkspaceFiles, fetchWorkspaceFileContent, workspaceDownloadUrl, WorkspaceApiError } from "@/lib/workspaceApi";
import type { CodeSageReport, FileTreeEntry } from "@/types";
import { ActivityBar } from "./ActivityBar";
import { ExplorerPanel } from "./ExplorerPanel";
import { EditorArea, type OpenTab } from "./EditorArea";
import { BottomPanel } from "./BottomPanel";
import { VsStatusBar } from "./VsStatusBar";

export function CodeViewer({ jobId, report, onClose }: { jobId: string; report: CodeSageReport; onClose: () => void }) {
  const [files, setFiles] = useState<FileTreeEntry[] | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);

  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [bottomOpen, setBottomOpen] = useState(true);

  const repoName = basenameOfPath(report.repoPath);

  function loadTree() {
    setTreeLoading(true);
    setTreeError(null);
    fetchWorkspaceFiles(jobId)
      .then((f) => setFiles(f))
      .catch((err) => setTreeError(err instanceof WorkspaceApiError ? err.message : "Failed to load the workspace file tree."))
      .finally(() => setTreeLoading(false));
  }

  useEffect(() => {
    loadTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  function openFile(node: TreeNode) {
    setActivePath(node.path);
    setTabs((prev) => (prev.some((t) => t.path === node.path) ? prev : [...prev, { path: node.path }]));
    if (contents[node.path] !== undefined) return;
    setFileLoading(true);
    setFileError(null);
    fetchWorkspaceFileContent(jobId, node.path)
      .then((content) => setContents((prev) => ({ ...prev, [node.path]: content })))
      .catch((err) => setFileError(err instanceof WorkspaceApiError ? err.message : "Failed to load file."))
      .finally(() => setFileLoading(false));
  }

  function closeTab(path: string) {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path);
      const next = prev.filter((t) => t.path !== path);
      if (activePath === path) {
        const fallback = next[idx] ?? next[idx - 1] ?? next[next.length - 1];
        setActivePath(fallback ? fallback.path : null);
      }
      return next;
    });
  }

  const tree: TreeNode | null = files ? buildFileTree(files, repoName) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1e1e1e]" role="dialog" aria-label="Code viewer">
      <div className="flex h-8 shrink-0 items-center justify-center border-b border-black/40 bg-[#323233] px-3 text-[12px] text-white/70">
        <span className="truncate">
          CodeSage — {repoName} <span className="text-white/40">(post-patch workspace)</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <ActivityBar onClose={onClose} />
        <ExplorerPanel
          root={tree}
          loading={treeLoading}
          error={treeError}
          activePath={activePath}
          onOpenFile={openFile}
          onRefresh={loadTree}
          onDownload={() => window.open(workspaceDownloadUrl(jobId), "_blank")}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <EditorArea
            tabs={tabs}
            activePath={activePath}
            onSelectTab={setActivePath}
            onCloseTab={closeTab}
            content={activePath ? (contents[activePath] ?? null) : null}
            loading={fileLoading && activePath !== null && contents[activePath] === undefined}
            error={fileError}
          />
          {bottomOpen && <BottomPanel testsBefore={report.testsBefore} testsAfter={report.testsAfter} onClose={() => setBottomOpen(false)} />}
        </div>
      </div>

      <div className="flex shrink-0">
        <div className="min-w-0 flex-1">
          <VsStatusBar report={report} fileCount={files?.length ?? 0} activePath={activePath} />
        </div>
        {!bottomOpen && (
          <Tooltip content="Show panel">
            <button
              type="button"
              onClick={() => setBottomOpen(true)}
              className="flex h-[22px] w-7 items-center justify-center bg-[#007acc] text-white hover:bg-[#1b86d1]"
            >
              <IconTerminal2 className="size-3.5" stroke={1.75} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
