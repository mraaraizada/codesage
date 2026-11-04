import { useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconCloudUpload,
  IconFileSearch,
  IconFlask,
  IconFolderUp,
  IconGitPullRequest,
  IconLoader2,
  IconReportAnalytics,
  IconSearch,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageCard } from "@/components/layout/page-parts";
import { Textarea } from "@/components/ui/textarea";
import { DiffBlock } from "@/components/ui/code-block";
import { cn } from "@/lib/utils";
import { collectDroppedFiles, collectInputFiles, folderNameOf, uploadFolder, type UploadResult } from "@/lib/folderUpload";

export function NewInvestigationForm({
  repoPath,
  setRepoPath,
  bugReport,
  setBugReport,
  dryRun,
  setDryRun,
  multiBug,
  setMultiBug,
  onLoadDemo,
  onSubmit,
  submitError,
  llmConfigured,
  running,
  onFolderUploaded,
}: {
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
  running: boolean;
  onFolderUploaded?: (result: UploadResult, name: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ name: string; fileCount: number } | null>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: Awaited<ReturnType<typeof collectDroppedFiles>>) {
    if (files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const name = folderNameOf(files);
      const result = await uploadFolder(files);
      setRepoPath(result.repoPath);
      setUploaded({ name, fileCount: result.fileCount });
      onFolderUploaded?.(result, name);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-10 pt-8 pb-6">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
          <IconSearch className="size-5" stroke={1.75} />
        </div>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-xl font-semibold tracking-tight">New investigation</h2>
          <p className="mt-1 text-base text-pretty text-muted-foreground">Point CodeSage at a real repository and a real bug report to run the full pipeline.</p>
        </div>
      </div>

      {llmConfigured === false && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-warning">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" stroke={1.75} />
          <p>
            <span className="font-medium">No LLM provider configured.</span> Investigation and patch stages will be skipped (dry-run); indexing and keyword
            search still run for real.
          </p>
        </div>
      )}

      <div className="mt-5 grid flex-1 grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-h-0 flex-col">
      <PageCard className="flex-1">
        <FieldGroup className="h-full">
          <Field>
            <FieldLabel htmlFor="repo-path" className="text-base">Repository path</FieldLabel>
            <Input
              id="repo-path"
              value={repoPath}
              onChange={(e) => {
                setRepoPath(e.target.value);
                setUploaded(null);
              }}
              placeholder="C:\path\to\repo"
              className="font-mono text-base h-11"
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void collectDroppedFiles(e.dataTransfer).then(handleFiles);
              }}
              className={cn(
                "mt-2 flex items-center gap-3 rounded-lg border border-dashed px-3.5 py-3 text-sm transition-colors",
                dragging ? "border-brand bg-brand/5" : "border-border",
                uploading && "pointer-events-none opacity-70",
              )}
            >
              {uploading ? (
                <IconLoader2 className="size-4.5 shrink-0 animate-spin text-muted-foreground" stroke={1.75} />
              ) : (
                <IconCloudUpload className="size-4.5 shrink-0 text-muted-foreground" stroke={1.75} />
              )}
              <div className="min-w-0 flex-1">
                {uploading ? (
                  <p className="text-muted-foreground">Uploading folder…</p>
                ) : uploaded ? (
                  <p>
                    <span className="font-medium">{uploaded.name}</span>{" "}
                    <span className="text-muted-foreground">uploaded — {uploaded.fileCount} file(s), ready to investigate.</span>
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Or drag a project folder here to upload it, no local path required.
                  </p>
                )}
                {uploadError && <p className="mt-0.5 text-destructive">{uploadError}</p>}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => dirInputRef.current?.click()} disabled={uploading}>
                <IconFolderUp className="size-3.5" stroke={1.75} />
                Choose folder
              </Button>
              <input
                ref={dirInputRef}
                type="file"
                className="hidden"
                // @ts-expect-error non-standard attributes that enable whole-directory selection
                webkitdirectory=""
                directory=""
                multiple
                onChange={(e) => {
                  if (e.target.files) void handleFiles(collectInputFiles(e.target.files));
                  e.target.value = "";
                }}
              />
            </div>
          </Field>

          <Field className="min-h-0 flex-1">
            <FieldLabel htmlFor="bug-report" className="text-base">Bug report</FieldLabel>
            <Textarea
              id="bug-report"
              value={bugReport}
              onChange={(e) => setBugReport(e.target.value)}
              rows={8}
              className="h-full min-h-40 flex-1 resize-none text-base"
              placeholder="Describe what's wrong, as a user or QA engineer would report it..."
            />
          </Field>

          <label className="flex w-fit items-center gap-2 text-base text-muted-foreground">
            <Checkbox checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry run (indexing + search only, skip LLM calls)
          </label>

          <label className="flex w-fit items-center gap-2 text-base text-muted-foreground">
            <Checkbox checked={multiBug} onChange={(e) => setMultiBug(e.target.checked)} />
            This report describes multiple unrelated bugs
          </label>
          <FieldDescription className="text-sm">
            CodeSage auto-detects a multi-bug report (a numbered/headed list of bugs) and splits it automatically — check this only to force an LLM-based split
            when the report is free-form prose without that structure. Leave unchecked for an ordinary single-bug report.
          </FieldDescription>

          {submitError && <FieldDescription className="text-destructive">{submitError}</FieldDescription>}
        </FieldGroup>
      </PageCard>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="default" onClick={onLoadDemo} className="text-muted-foreground">
          Load demo (buggy-react-login)
        </Button>
        <Button type="button" variant="brand" size="lg" onClick={onSubmit} disabled={running}>
          {running ? "Investigating…" : "Investigate"}
        </Button>
      </div>

        </div>

        <div className="lg:border-l lg:border-border lg:pl-8">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What this runs</p>
          <div className="mt-4 flex flex-col gap-5">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.title} className="flex items-start gap-2.5">
                <step.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" stroke={1.75} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-border pt-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What a finished report looks like</p>
              <Badge variant="outline">Example</Badge>
            </div>
            <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
                <div>
                  <div className="text-xs font-semibold tracking-widest text-muted-foreground">VERDICT</div>
                  <div className="mt-0.5 text-sm font-bold text-success">Verified fixed</div>
                </div>
                <Badge variant="success">tests now passing</Badge>
              </div>
              <p className="border-b border-border px-3.5 py-2.5 text-xs text-muted-foreground">
                Root cause: the login handler updates auth state but never calls <code className="text-foreground">navigate("/dashboard")</code> after a
                successful response, so the UI stalls on the login screen.
              </p>
              <div className="border-b border-border px-3.5 py-2">
                <DiffBlock diffText={EXAMPLE_DIFF} className="rounded-none border-none bg-transparent p-0 text-xs" />
              </div>
              <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-xs">
                <span className="font-mono text-muted-foreground">src/auth/LoginForm.tsx</span>
                <span className="text-success">+2</span>
                <span className="text-destructive">-0</span>
                <span className="text-muted-foreground">before: 3 failed → after: 0 failed</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const EXAMPLE_DIFF = `@@ -18,7 +18,9 @@ async function handleSubmit(credentials) {
   const session = await login(credentials);
   setAuthState(session);
+  navigate("/dashboard");
 }`;

const HOW_IT_WORKS = [
  {
    icon: IconFileSearch,
    title: "Understand & investigate",
    description: "Indexes the repo, greps for candidates, and has the model read real files to find a root cause with file:line evidence.",
  },
  {
    icon: IconGitPullRequest,
    title: "Propose a patch",
    description: "Generates a unified diff and applies it to an isolated copy of the repo — your original files are never touched.",
  },
  {
    icon: IconFlask,
    title: "Verify with real tests",
    description: "Runs the project's test suite before and after the patch and reports pass/fail, not a guess.",
  },
  {
    icon: IconReportAnalytics,
    title: "Report & browse",
    description: "A full verdict with evidence and diffs — downloadable, or browsable file-by-file in a VS Code-style viewer of the patched workspace.",
  },
];
