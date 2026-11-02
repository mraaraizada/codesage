// The slim VS Code "activity bar" icon rail along the far left of the code viewer. Explorer is
// the only wired view in this MVP (everything the viewer shows is real file-tree data); the rest
// are rendered for visual authenticity but are honestly inert, same pattern as EffectsPanel's
// disabled "Graph" tab elsewhere in this app.
import { IconFiles, IconSearch, IconGitBranch, IconPuzzle, IconX } from "@tabler/icons-react";
import { Tooltip } from "@/components/ui/tooltip";

const INERT_ITEMS = [
  { icon: IconSearch, label: "Search" },
  { icon: IconGitBranch, label: "Source Control" },
  { icon: IconPuzzle, label: "Extensions" },
] as const;

export function ActivityBar({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center justify-between bg-[#1e1e1e] py-2">
      <div className="flex flex-col items-center gap-1">
        <Tooltip content="Explorer">
          <button type="button" className="relative flex size-11 items-center justify-center text-white" aria-current="true">
            <span className="absolute left-0 h-6 w-0.5 bg-white" aria-hidden="true" />
            <IconFiles className="size-6" stroke={1.5} />
          </button>
        </Tooltip>
        {INERT_ITEMS.map(({ icon: Icon, label }) => (
          <Tooltip key={label} content={`${label} — not wired in this MVP`}>
            <button type="button" disabled className="flex size-11 cursor-not-allowed items-center justify-center text-white/35">
              <Icon className="size-6" stroke={1.5} />
            </button>
          </Tooltip>
        ))}
      </div>
      <Tooltip content="Close code viewer">
        <button type="button" onClick={onClose} className="mb-1 flex size-11 items-center justify-center text-white/70 hover:text-white">
          <IconX className="size-5" stroke={1.75} />
        </button>
      </Tooltip>
    </div>
  );
}
