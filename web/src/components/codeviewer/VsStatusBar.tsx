// A thin VS Code-style status bar at the very bottom — real data only (the job's verification
// status and file counts), no fabricated git-branch indicator or other invented chrome.
import { IconCheck, IconX, IconAlertTriangle, IconFileCode } from "@tabler/icons-react";
import type { CodeSageReport } from "@/types";

const VERDICT_META: Record<CodeSageReport["verification"], { icon: typeof IconCheck; label: string; tone: string }> = {
  "verified-fixed": { icon: IconCheck, label: "Verified fixed", tone: "bg-[#16825d]" },
  "tests-still-failing": { icon: IconX, label: "Tests still failing", tone: "bg-[#c72e2e]" },
  "patch-did-not-apply": { icon: IconX, label: "Patch did not apply", tone: "bg-[#c72e2e]" },
  "no-tests-detected": { icon: IconAlertTriangle, label: "No tests detected", tone: "bg-[#8a6d1e]" },
  "dry-run-no-llm": { icon: IconAlertTriangle, label: "Dry run", tone: "bg-[#2472c8]" },
  inconclusive: { icon: IconAlertTriangle, label: "Inconclusive", tone: "bg-[#8a6d1e]" },
};

export function VsStatusBar({ report, fileCount, activePath }: { report: CodeSageReport; fileCount: number; activePath: string | null }) {
  const verdict = VERDICT_META[report.verification];
  const Icon = verdict.icon;

  return (
    <div className={`flex h-[22px] shrink-0 items-center justify-between px-2.5 text-[11px] text-white ${verdict.tone}`}>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <Icon className="size-3.5" stroke={2} />
          {verdict.label}
        </span>
        <span className="opacity-80">Post-patch workspace · {fileCount} file(s)</span>
      </div>
      <div className="flex items-center gap-3 opacity-90">
        {activePath && (
          <span className="flex items-center gap-1">
            <IconFileCode className="size-3.5" stroke={1.75} />
            {activePath}
          </span>
        )}
      </div>
    </div>
  );
}
