import { useState, useEffect, useCallback } from "react";
import { useInvestigationRuns } from "./hooks/useInvestigationRuns";
import { useUploadedProjects, type UploadedProject } from "./hooks/useUploadedProjects";
import { LeftSidebar } from "./components/console/LeftSidebar";
import { MainPane } from "./components/console/MainPane";
import { EffectsPanel } from "./components/console/EffectsPanel";
import { StatusBar } from "./components/console/StatusBar";
import { Toaster, useToasts } from "./components/ui/toast";
import { CodeViewer } from "./components/codeviewer/CodeViewer";
import { basenameOfPath } from "./lib/format";
import { apiUrl } from "./lib/apiBase";
import type { UploadResult } from "./lib/folderUpload";
import type { CodeSageReport, JobState, MultiBugReport, VerificationStatus } from "./types";

/** The full-page code viewer (CodeViewer.tsx) and its VS Code-style status bar were built against
 * a single-bug CodeSageReport. Rather than fork that whole real file-browsing UI for multi-bug
 * jobs, adapt a MultiBugReport into the same shape using its own real fields (overall verdict,
 * batch-wide baseline/final-regression tests, the original bug report) — every value shown is
 * genuine multi-bug data, just reshaped so the existing viewer can render it. */
function asCodeViewerReport(report: MultiBugReport): CodeSageReport {
  const allFixed = report.subBugs.length > 0 && report.subBugs.every((s) => s.verification === "verified-fixed");
  const noneFixed = report.subBugs.every((s) => s.verification !== "verified-fixed");
  const verification: VerificationStatus = allFixed ? "verified-fixed" : noneFixed ? "tests-still-failing" : "inconclusive";
  return {
    generatedAtIso: report.generatedAtIso,
    repoPath: report.repoPath,
    bugReport: report.originalBugReport,
    stack: report.stack,
    filesIndexed: report.filesIndexed,
    totalSizeBytes: report.totalSizeBytes,
    searchHits: [],
    investigation: null,
    patch: null,
    apply: null,
    testsBefore: report.testsBaseline,
    testsAfter: report.finalRegressionTests,
    verification,
    verificationReason: report.overallVerdict,
    workspaceDir: report.workspaceDir,
    limitations: report.limitations,
  };
}

const VERIFICATION_TOAST: Record<VerificationStatus, { title: string; variant: "success" | "destructive" | "brand" | "default" }> = {
  "verified-fixed": { title: "Verified fixed", variant: "success" },
  "tests-still-failing": { title: "Tests still failing", variant: "destructive" },
  "patch-did-not-apply": { title: "Patch did not apply", variant: "destructive" },
  "no-tests-detected": { title: "No tests detected", variant: "default" },
  "dry-run-no-llm": { title: "Dry run complete", variant: "brand" },
  inconclusive: { title: "Inconclusive", variant: "default" },
};

export default function App() {
  const { toasts, push, dismiss } = useToasts();

  const handleSettled = useCallback(
    (_id: string, job: JobState) => {
      if (job.status === "error") {
        push({ title: "Investigation failed", description: job.error ?? "Unknown error", variant: "destructive" });
        return;
      }
      if (job.report?.kind === "multi") {
        const allFixed = job.report.subBugs.every((s) => s.verification === "verified-fixed");
        const noneFixed = job.report.subBugs.every((s) => s.verification !== "verified-fixed");
        push({
          title: job.report.overallVerdict,
          description: basenameOfPath(job.report.repoPath),
          variant: allFixed ? "success" : noneFixed ? "destructive" : "default",
        });
      } else if (job.report) {
        const { title, variant } = VERIFICATION_TOAST[job.report.verification];
        push({ title, description: basenameOfPath(job.report.repoPath), variant });
      }
    },
    [push],
  );

  const { metas, statusBarRuns, jobsById, selectedId, select, registerRun, hideFromStatusBar, reorderRuns, now } = useInvestigationRuns(handleSettled);
  const { uploads, addUpload, removeUpload, promoteByPath } = useUploadedProjects();

  const [repoPath, setRepoPath] = useState("");
  const [bugReport, setBugReport] = useState("");
  const [dryRun, setDryRun] = useState(false);
  // Explicit override for the auto-detected single-vs-multi-bug split (src/llm/splitBugReport.ts
  // decides automatically by default — this only forces the LLM-splitting path on, for a report
  // whose structure the heuristics can't detect). undefined = auto-detect (the common case).
  const [multiBug, setMultiBug] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const [viewingCodeJobId, setViewingCodeJobId] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/health"))
      .then((r) => r.json())
      .then((d) => setLlmConfigured(Boolean(d.llmConfigured)))
      .catch(() => setLlmConfigured(null));
  }, []);

  async function loadDemo() {
    const res = await fetch(apiUrl("/api/example"));
    const data = await res.json();
    setRepoPath(data.repoPath);
    setBugReport(data.bugReport);
  }

  async function startInvestigation() {
    setSubmitError(null);
    if (!repoPath.trim() || !bugReport.trim()) {
      setSubmitError("Both a repo path/URL and a bug report are required.");
      return;
    }
    setStarting(true);
    try {
      const res = await fetch(apiUrl("/api/jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath, bugReport, dryRun, multiBug: multiBug ? true : undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setSubmitError(body.error || "Failed to start job.");
        return;
      }
      const { jobId } = await res.json();
      registerRun({ id: jobId, repoPath, bugReport, startedAtMs: Date.now() });
      promoteByPath(repoPath); // a real run now represents this path — drop any matching upload entry
      push({ title: "Investigation started", description: basenameOfPath(repoPath), variant: "brand" });
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  function handleFolderUploaded(result: UploadResult, name: string) {
    addUpload({ name, repoPath: result.repoPath, fileCount: result.fileCount, totalBytes: result.totalBytes });
  }

  function goToNewInvestigationWithPath(repoPath: string) {
    setRepoPath(repoPath);
    setSubmitError(null);
    select("new");
  }

  function handleSelectUpload(upload: UploadedProject) {
    goToNewInvestigationWithPath(upload.repoPath);
  }

  function startFreshInvestigation() {
    setRepoPath("");
    setBugReport("");
    setDryRun(false);
    setMultiBug(false);
    setSubmitError(null);
    select("new");
  }

  const selectedRun = selectedId === "new" ? null : (metas.find((m) => m.id === selectedId) ?? null);
  const selectedJob = selectedId === "new" ? undefined : jobsById[selectedId];

  if (viewingCodeJobId) {
    const job = jobsById[viewingCodeJobId];
    if (job?.report) {
      const codeViewerReport = job.report.kind === "multi" ? asCodeViewerReport(job.report) : job.report;
      return <CodeViewer jobId={viewingCodeJobId} report={codeViewerReport} onClose={() => setViewingCodeJobId(null)} />;
    }
    // Report vanished (e.g. a stale link) — fall back to the normal console instead of a dead screen.
    setViewingCodeJobId(null);
  }

  return (
    <div className="flex h-dvh min-w-0 bg-background text-foreground">
      <LeftSidebar
        runs={metas}
        uploads={uploads}
        jobsById={jobsById}
        selectedId={selectedId}
        onSelect={select}
        onSelectUpload={handleSelectUpload}
        onRemoveUpload={removeUpload}
        onInvestigateAgain={goToNewInvestigationWithPath}
        onNew={startFreshInvestigation}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <MainPane
            run={selectedRun}
            job={selectedJob}
            now={now}
            newForm={{
              repoPath,
              setRepoPath,
              bugReport,
              setBugReport,
              dryRun,
              setDryRun,
              multiBug,
              setMultiBug,
              onLoadDemo: loadDemo,
              onSubmit: startInvestigation,
              submitError,
              llmConfigured,
              starting,
              onFolderUploaded: handleFolderUploaded,
            }}
            onViewCode={selectedId !== "new" ? () => setViewingCodeJobId(selectedId) : undefined}
          />
          <EffectsPanel report={selectedJob?.report ?? null} running={selectedJob?.status === "running"} />
        </div>
        <StatusBar runs={statusBarRuns} jobsById={jobsById} selectedId={selectedId} onSelect={select} onRemove={hideFromStatusBar} onReorder={reorderRuns} />
      </div>

      <Toaster toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
