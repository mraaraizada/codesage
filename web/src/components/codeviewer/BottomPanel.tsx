// VS Code's bottom panel: PROBLEMS / OUTPUT / DEBUG CONSOLE / TERMINAL tabs. TERMINAL is wired to
// the REAL captured stdout/stderr from the pipeline's before/after test runs (CodeSageReport.
// testsBefore/testsAfter) — real data already produced by src/testRunner/run.ts, not fabricated.
// The other three tabs are honest empty/inert placeholders (no problems/output/debug-console
// collection exists in this MVP's pipeline, so showing fake content there would be a lie).
import { useState } from "react";
import { IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { TestRunResult } from "@/types";

const TABS = ["PROBLEMS", "OUTPUT", "DEBUG CONSOLE", "TERMINAL"] as const;
type BottomTab = (typeof TABS)[number];

function TerminalRun({ label, run }: { label: string; run: TestRunResult | null }) {
  if (!run) {
    return <p className="text-white/40">{label}: not run.</p>;
  }
  return (
    <div>
      <p className="text-[#3dd6c7]">
        $ {run.command} <span className="text-white/40">({label})</span>
      </p>
      {!run.ran ? (
        <p className="mt-1 text-white/50">Did not run.</p>
      ) : (
        <>
          {run.stdout && <pre className="mt-1 whitespace-pre-wrap text-white/85">{run.stdout}</pre>}
          {run.stderr && <pre className="mt-1 whitespace-pre-wrap text-[#f14c4c]">{run.stderr}</pre>}
          <p className="mt-1 text-white/40">
            exit code {run.exitCode ?? "—"} · {run.durationMs}ms{run.timedOut ? " · timed out" : ""}
            {run.summaryLine ? ` · ${run.summaryLine}` : ""}
          </p>
        </>
      )}
    </div>
  );
}

export function BottomPanel({
  testsBefore,
  testsAfter,
  onClose,
}: {
  testsBefore: TestRunResult | null;
  testsAfter: TestRunResult | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<BottomTab>("TERMINAL");

  return (
    <div className="flex h-56 shrink-0 flex-col border-t border-black/40 bg-[#181818] text-white">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-black/30 pr-2 pl-3">
        <div className="flex h-full items-center gap-4 text-[11px] font-medium tracking-wide">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "h-full border-b-2 text-white/50 hover:text-white/80",
                tab === t ? "border-white text-white" : "border-transparent",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="flex size-5 items-center justify-center rounded text-white/50 hover:bg-white/10 hover:text-white">
          <IconX className="size-3.5" stroke={1.75} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-5">
        {tab === "TERMINAL" ? (
          <div className="space-y-3">
            <TerminalRun label="before patch" run={testsBefore} />
            <TerminalRun label="after patch" run={testsAfter} />
          </div>
        ) : (
          <p className="text-white/35">
            {tab === "PROBLEMS" && "No problems collected — CodeSage's pipeline doesn't run a linter/diagnostics pass in this MVP."}
            {tab === "OUTPUT" && "No build/task output channel is wired in this MVP."}
            {tab === "DEBUG CONSOLE" && "No debugger session is wired in this MVP."}
          </p>
        )}
      </div>
    </div>
  );
}
