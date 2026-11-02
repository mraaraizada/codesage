// The tab bar + editor pane. Every opened file gets its own closable tab (real VS Code tab
// behavior — opening a second file adds a tab rather than silently swapping the pane's content).
import { IconFile, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { CodeBlockWithGutter } from "@/components/ui/code-block";
import { prismLanguageForPath } from "@/lib/prismLanguage";

export interface OpenTab {
  path: string;
}

export function EditorArea({
  tabs,
  activePath,
  onSelectTab,
  onCloseTab,
  content,
  loading,
  error,
}: {
  tabs: OpenTab[];
  activePath: string | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  content: string | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#1e1e1e]">
      <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-black/40 bg-[#252526]">
        {tabs.map((tab) => {
          const active = tab.path === activePath;
          const name = tab.path.split("/").pop() ?? tab.path;
          return (
            <div
              key={tab.path}
              onClick={() => onSelectTab(tab.path)}
              className={cn(
                "group flex max-w-52 shrink-0 cursor-pointer items-center gap-1.5 border-r border-black/40 px-2.5 text-[13px]",
                active ? "bg-[#1e1e1e] text-white" : "bg-[#2d2d2d] text-white/60 hover:bg-[#2a2a2a]",
              )}
              title={tab.path}
            >
              <IconFile className="size-3.5 shrink-0 text-white/50" stroke={1.75} />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.path);
                }}
                className="flex size-4 shrink-0 items-center justify-center rounded text-white/50 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100"
                aria-label={`Close ${name}`}
              >
                <IconX className="size-3" stroke={2} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!activePath ? (
          <div className="flex h-full items-center justify-center text-sm text-white/30">Select a file from the Explorer to open it.</div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-sm text-white/40">Loading file…</div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">{error}</div>
        ) : content !== null ? (
          <CodeBlockWithGutter code={content} language={prismLanguageForPath(activePath)} className="min-h-full" />
        ) : null}
      </div>
    </div>
  );
}
