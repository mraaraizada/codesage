// Renders a consolidated multi-bug report (server/src/jobs.ts + src/multiPipeline.ts): an overall
// verdict, baseline -> final regression test bars, and one expandable card per sub-bug with its
// own root cause, diff, test evidence, and kept/rolled-back status. Reuses the same design-system
// primitives (Badge, DiffBlock, Skeleton) as the single-bug VerdictBlock/RootCausePanel so a
// multi-bug run renders as a first-class citizen of this UI, not a bolted-on JSON dump.
import { useState } from "react";
import { IconChevronRight } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DiffBlock } from "@/components/ui/code-block";
import { cn } from "@/lib/utils";
import type { MultiBugReport, SubBugResult, TestRunResult, VerificationStatus } from "../../types";

const STATUS_VARIANT: Record<VerificationStatus, "success" | "destructive" | "warning" | "brand" | "outline"> = {
  "verified-fixed": "success",
  "tests-still-failing": "destructive",
  "patch-did-not-apply": "destructive",
  "no-tests-detected": "warning",
  "applied-unverified": "warning",
  "dry-run-no-llm": "brand",
  inconclusive: "warning",
};

const STATUS_LABEL: Record<VerificationStatus, string> = {
  "verified-fixed": "Verified fixed",
  "tests-still-failing": "Tests still failing",
  "patch-did-not-apply": "Patch did not apply",
  "no-tests-detected": "No tests detected",
  "applied-unverified": "Applied, unverified",
  "dry-run-no-llm": "Dry run",
  inconclusive: "Inconclusive",
};

function TestBar({ label, result }: { label: string; result: TestRunResult | null }) {
  const passed = result?.passed ?? 0;
  const failed = result?.failed ?? 0;
  const total = passed + failed;
  const passedPct = total === 0 ? 0 : (passed / total) * 100;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {result ? (
            <>
              <span className="text-success">{passed} passed</span>
              {failed > 0 && <span className="text-destructive"> · {failed} failed</span>}
            </>
          ) : (
            <span className="text-muted-foreground">not run</span>
          )}
        </span>
      </div>
      <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {total === 0 ? (
          <div className="h-full w-full bg-muted-foreground/20" />
        ) : (
          <>
            {passedPct > 0 && <div className="h-full bg-success" style={{ width: `${passedPct}%` }} />}
            {passedPct < 100 && <div className="h-full bg-destructive" style={{ width: `${100 - passedPct}%` }} />}
          </>
        )}
      </div>
    </div>
  );
}

function ReproBadge({ label, state }: { label: string; state: boolean | null }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-medium",
        state === true ? "bg-success/15 text-success" : state === false ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
      )}
    >
      {label}: {state === true ? "passed" : state === false ? "failed" : "unknown"}
    </span>
  );
}

function SubBugCard({ sub }: { sub: SubBugResult }) {
  const [open, setOpen] = useState(sub.verification !== "verified-fixed");
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40">
        <IconChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold">{sub.index}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{sub.title}</span>
        {sub.crashed && <Badge variant="destructive">Crashed</Badge>}
        <Badge variant={STATUS_VARIANT[sub.verification]}>{STATUS_LABEL[sub.verification]}</Badge>
        <span className="shrink-0 text-xs text-muted-foreground">{sub.kept ? "kept" : "rolled back"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-4 py-4">
          <p className="text-sm text-muted-foreground">{sub.verificationReason}</p>

          {sub.investigation && (
            <div>
              <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Root cause</div>
              <p className="mt-1 text-sm">{sub.investigation.rootCause}</p>
              {sub.investigation.evidence.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {sub.investigation.evidence.map((e, i) => (
                    <li key={i} className="font-mono text-xs text-muted-foreground">
                      <span className="text-brand">{e.relPath}:{e.line}</span> — {e.snippet}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {sub.patch?.diffText && (
            <div>
              <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Patch</div>
              <div className="mt-1.5">
                <DiffBlock diffText={sub.patch.diffText} className="max-h-72" />
              </div>
            </div>
          )}

          {(sub.testsBefore || sub.testsAfter) && (
            <div className="flex max-w-xl items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
              <TestBar label="Full suite before" result={sub.testsBefore} />
              <IconChevronRight className="size-4 shrink-0 text-muted-foreground" stroke={1.75} />
              <TestBar label="Full suite after" result={sub.testsAfter} />
            </div>
          )}

          {sub.reproTest && (
            <div className="flex max-w-xl items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-xs">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Bug-specific reproduction test</div>
                <div className="mt-0.5 truncate font-mono text-muted-foreground">{sub.reproTest.relPath}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ReproBadge label="Before" state={sub.reproTest.failedBeforePatch === null ? null : !sub.reproTest.failedBeforePatch} />
                <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground" stroke={1.75} />
                <ReproBadge label="After" state={sub.reproTest.passedAfterPatch} />
              </div>
            </div>
          )}

          {sub.filesChanged.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Files changed: <span className="font-mono">{sub.filesChanged.join(", ")}</span>
            </div>
          )}
          {sub.error && <div className="text-xs text-destructive">{sub.error}</div>}
        </div>
      )}
    </div>
  );
}

export function MultiBugResultPanel({ report, pending }: { report: MultiBugReport | null; pending: boolean }) {
  if (!report) {
    return (
      <div className="border-b border-border px-6 py-6">
        <div className="text-xs font-semibold tracking-widest text-muted-foreground">VERDICT</div>
        <div className="mt-1 text-2xl font-bold text-muted-foreground">{pending ? "Investigating…" : "Not started"}</div>
        {pending && (
          <div className="mt-4 max-w-2xl space-y-2" aria-hidden="true">
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}
      </div>
    );
  }

  const fixedCount = report.subBugs.filter((s) => s.verification === "verified-fixed").length;

  return (
    <>
      <div className="border-b border-border px-6 py-6">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground">
          VERDICT <Badge variant="outline">multi-bug batch · split via {report.splitMethod}</Badge>
        </div>
        <div className={cn("mt-1 text-2xl font-bold", fixedCount === report.subBugs.length ? "text-success" : fixedCount > 0 ? "text-warning" : "text-destructive")}>
          {report.overallVerdict}
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Split into {report.subBugs.length} independent sub-bug(s) and investigated one at a time against a single shared, accumulating isolated workspace.
        </p>

        {(report.testsBaseline || report.finalRegressionTests) && (
          <div className="mt-5 flex max-w-xl items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <TestBar label="Baseline (before batch)" result={report.testsBaseline} />
            <IconChevronRight className="size-4 shrink-0 text-muted-foreground" stroke={1.75} />
            <TestBar label="Final regression (after batch)" result={report.finalRegressionTests} />
          </div>
        )}

        {report.filesChangedAcrossBatch.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Files changed across the whole batch: <span className="font-mono text-foreground">{report.filesChangedAcrossBatch.join(", ")}</span>
          </p>
        )}
      </div>

      <div className="space-y-3 border-b border-border px-6 py-6">
        <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sub-bugs ({report.subBugs.length})</div>
        {report.subBugs.map((sub) => (
          <SubBugCard key={sub.index} sub={sub} />
        ))}
      </div>
    </>
  );
}
