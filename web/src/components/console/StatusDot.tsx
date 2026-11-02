import { cn } from "@/lib/utils";
import type { JobState, VerificationStatus } from "../../types";

/** A multi-bug report has no single `verification` — reduce its per-sub-bug outcomes to the
 * closest single-report-shaped status so the status dot/label can treat both job kinds uniformly. */
function effectiveVerification(job: JobState | undefined): VerificationStatus | undefined {
  if (!job?.report) return undefined;
  if (job.report.kind !== "multi") return job.report.verification;
  const subs = job.report.subBugs;
  if (subs.length === 0) return "inconclusive";
  if (subs.every((s) => s.verification === "verified-fixed")) return "verified-fixed";
  if (subs.every((s) => s.verification === "dry-run-no-llm")) return "dry-run-no-llm";
  if (subs.some((s) => s.verification === "verified-fixed")) return "inconclusive"; // partial batch
  if (subs.every((s) => s.verification !== "verified-fixed")) return "tests-still-failing";
  return "inconclusive";
}

export function dotColorClass(job: JobState | undefined): string {
  if (!job) return "bg-muted-foreground/40";
  if (job.status === "running") return "bg-brand animate-pulse";
  if (job.status === "error") return "bg-destructive";
  const v = effectiveVerification(job);
  if (v === "verified-fixed") return "bg-success";
  if (v === "tests-still-failing" || v === "patch-did-not-apply") return "bg-destructive";
  if (v === "dry-run-no-llm") return "bg-brand";
  return "bg-warning";
}

export function statusLabel(job: JobState | undefined): string {
  if (!job) return "pending";
  if (job.status === "running") return "running";
  if (job.status === "error") return "error";
  if (job.report?.kind === "multi") return job.report.overallVerdict;
  return job.report?.verification ?? "done";
}

export function StatusDot({ job, className }: { job: JobState | undefined; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", dotColorClass(job), className)} />;
}
