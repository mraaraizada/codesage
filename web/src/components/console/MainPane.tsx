import type { JobState, CodeSageReport, MultiBugReport } from "../../types";
import type { RunMeta } from "../../hooks/useInvestigationRuns";
import type { UploadResult } from "@/lib/folderUpload";
import { InvestigationHeader } from "./InvestigationHeader";
import { ProjectOverview } from "./ProjectOverview";
import { VerdictBlock } from "./VerdictBlock";
import { RootCausePanel } from "./RootCausePanel";
import { MultiBugResultPanel } from "./MultiBugResultPanel";
import { StageList } from "./StageList";
import { NewInvestigationForm } from "./NewInvestigationForm";

interface NewFormProps {
  repoPath: string;
  setRepoPath: (v: string) => void;
  bugReport: string;
  setBugReport: (v: string) => void;
  dryRun: boolean;
  setDryRun: (v: boolean) => void;
  multiBug: boolean;
  setMultiBug: (v: boolean) => void;
  onLoadDemo: () => void;
  onSubmit: () => void;
  submitError: string | null;
  llmConfigured: boolean | null;
  starting: boolean;
  onFolderUploaded?: (result: UploadResult, name: string) => void;
}

export function MainPane({
  run,
  job,
  now,
  newForm,
  onViewCode,
}: {
  run: RunMeta | null;
  job: JobState | undefined;
  now: number;
  newForm: NewFormProps;
  onViewCode?: () => void;
}) {
  if (!run) {
    const { starting, ...rest } = newForm;
    return (
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <NewInvestigationForm {...rest} running={starting} />
      </main>
    );
  }

  const running = job?.status === "running";
  const errored = job?.status === "error";
  const report = job?.report ?? null;
  const multiReport: MultiBugReport | null = report?.kind === "multi" ? report : null;
  const singleReport: CodeSageReport | null = report && report.kind !== "multi" ? report : null;

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background">
      <InvestigationHeader run={run} job={job} now={now} onViewCode={report?.workspaceDir ? onViewCode : undefined} />
      {!multiReport && <ProjectOverview run={run} report={singleReport} />}
      {multiReport ? (
        <MultiBugResultPanel report={multiReport} pending={running} />
      ) : (
        <>
          <VerdictBlock report={singleReport} pending={running} />
          {singleReport?.investigation && <RootCausePanel investigation={singleReport.investigation} />}
        </>
      )}
      {errored && job?.error && (
        <div className="border-b border-border bg-destructive/10 px-6 py-4 text-sm text-destructive">Pipeline error: {job.error}</div>
      )}
      <StageList events={job?.events ?? []} jobStatus={job?.status} jobId={job?.id} />
    </main>
  );
}
