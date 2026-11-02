import type { CodeSageReport } from "../../types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportStatRow } from "./ReportStatRow";

const COLOR: Record<CodeSageReport["verification"], string> = {
  "verified-fixed": "text-success",
  "tests-still-failing": "text-destructive",
  "patch-did-not-apply": "text-destructive",
  "no-tests-detected": "text-warning",
  "dry-run-no-llm": "text-brand",
  inconclusive: "text-warning",
};

const LABEL: Record<CodeSageReport["verification"], string> = {
  "verified-fixed": "Verified fixed",
  "tests-still-failing": "Tests still failing",
  "patch-did-not-apply": "Patch did not apply",
  "no-tests-detected": "No tests detected",
  "dry-run-no-llm": "Dry run — no LLM stage",
  inconclusive: "Inconclusive",
};

export function VerdictBlock({ report, pending }: { report: CodeSageReport | null; pending: boolean }) {
  if (!report) {
    return (
      <div className="border-b border-border px-6 py-6">
        <div className="text-xs font-semibold tracking-widest text-muted-foreground">VERDICT</div>
        <div className="mt-1 text-2xl font-bold text-muted-foreground">{pending ? "Investigating…" : "Not started"}</div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {pending ? "The pipeline is still running — the verdict will appear here once testing completes." : "Submit an investigation to see a verdict here."}
        </p>
        {pending && (
          <div className="mt-4 max-w-2xl space-y-2" aria-hidden="true">
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="border-b border-border px-6 py-6">
      <div className="text-xs font-semibold tracking-widest text-muted-foreground">VERDICT</div>
      <div className={cn("mt-1 text-2xl font-bold", COLOR[report.verification])}>{LABEL[report.verification]}</div>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{report.verificationReason}</p>
      <ReportStatRow report={report} />
    </div>
  );
}
