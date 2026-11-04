// In-memory job manager. The web UI polls GET /api/jobs/:id to watch real pipeline progress.
// This file contains ZERO investigation/patch/test logic of its own — it only calls
// runPipeline() from the shared core module, exactly like the CLI does.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runMultiBugPipeline, type MultiPipelineEvent } from "../../src/multiPipeline.js";
import { resolveRepoSource } from "../../src/repo/resolveSource.js";
import type { CodeSageReport, MultiBugReport } from "../../src/types.js";
import { saveFixedVersion } from "./projectStore.js";

// jobs.ts keeps the name PipelineEvent for its own exported surface (the web client's type mirror
// still calls it that) even though it's really the wider multi-bug event union — every single-bug
// job's events are a strict subset of it, so nothing about the existing single-bug job shape
// changes.
export type PipelineEvent = MultiPipelineEvent;

// Jobs are also persisted to disk as plain JSON so a completed investigation survives a server
// restart (a dev server gets restarted often; losing every past run on each restart made the web
// UI's "selected run" hydration fall back to the empty "new investigation" screen, which read as a
// bug even though the in-memory store was working as designed). This does NOT persist the isolated
// workspace directory itself (that stays governed by WORKSPACE_RETENTION_MS below) — only the job's
// JSON record (status/events/report/error), so the report/diff/stats survive a restart even if the
// file-browser/zip-download for that job's workspace may 404 once the workspace itself expires.
const JOBS_DIR = join(import.meta.dirname, "..", ".data", "jobs");

function jobFilePath(id: string): string {
  return join(JOBS_DIR, `${id}.json`);
}

function saveJobToDisk(job: JobState): void {
  try {
    mkdirSync(JOBS_DIR, { recursive: true });
    writeFileSync(jobFilePath(job.id), JSON.stringify(job), "utf8");
  } catch {
    // best-effort only — disk persistence failing should never break a live investigation
  }
}

/** Loads all persisted jobs from disk into memory. Call once at server startup. */
export function loadJobsFromDisk(): number {
  let loaded = 0;
  try {
    if (!existsSync(JOBS_DIR)) return 0;
    for (const file of readdirSync(JOBS_DIR)) {
      if (!file.endsWith(".json")) continue;
      try {
        const job = JSON.parse(readFileSync(join(JOBS_DIR, file), "utf8")) as JobState;
        // A job that was still "running" when the process died can never resume — its in-memory
        // pipeline state is gone. Mark it honestly as interrupted rather than showing a stuck
        // spinner forever.
        if (job.status === "running") {
          job.status = "error";
          job.error = "Interrupted by a server restart before the investigation finished.";
        }
        jobs.set(job.id, job);
        settledAt.set(job.id, Date.now());
        loaded++;
      } catch {
        // skip a corrupt/partial job file
      }
    }
  } catch {
    // best-effort only
  }
  return loaded;
}

export type JobStatus = "running" | "done" | "error";

export interface JobState {
  id: string;
  status: JobStatus;
  createdAtIso: string;
  events: PipelineEvent[];
  report: CodeSageReport | MultiBugReport | null;
  error: string | null;
  /** Permanent on-disk copy of this job's patched workspace (server/.data/projects/<id>/<jobId>),
   * set once saveFixedVersion() succeeds — see projectStore.ts. Survives both the temp-workspace
   * retention sweep and a server restart, unlike report.workspaceDir. Null until saved (or if
   * saving never applied — no patch, dry run, etc.), and the on-disk directory itself may later
   * be gone if pruned by the per-project version cap; effectiveWorkspaceDir() below checks both
   * this and the temp path and only trusts whichever still actually exists. */
  savedWorkspaceDir: string | null;
}

const jobs = new Map<string, JobState>();
const MAX_EVENTS = 500;

// Workspace retention policy: a completed job's isolated workspace (report.workspaceDir) is what
// the file-browser and .zip-download endpoints read from, so it must outlive the pipeline run
// itself — unlike the CLI's default (clean up immediately), the server always keeps it. It is NOT
// kept forever: a job that settled (done/error) more than WORKSPACE_RETENTION_MS ago has its
// workspace deleted by a periodic sweep (startWorkspaceRetentionSweeper, called once from
// index.ts). This bounds disk usage for a long-running server without needing a real cache/DB.
// Caveat documented honestly: if the server process itself is restarted, any workspace from a
// prior run is orphaned in the OS temp dir rather than tracked for cleanup — acceptable for a
// demo server, not a production guarantee.
const WORKSPACE_RETENTION_MS = 30 * 60 * 1000; // 30 minutes after the job settles
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

const settledAt = new Map<string, number>();

export interface StartJobInput {
  repoPath: string;
  bugReport: string;
  dryRun?: boolean;
  maxIterations?: number;
  /** Explicit UI override: true forces the splitter straight to the LLM path (skips structural
   * detection); false forces the single-bug pipeline even if the report looks multi-bug. Omitted
   * (the common case) auto-detects via src/llm/splitBugReport.ts. */
  multiBug?: boolean;
}

export function startJob(input: StartJobInput): JobState {
  const id = randomUUID();
  const job: JobState = {
    id,
    status: "running",
    createdAtIso: new Date().toISOString(),
    events: [],
    report: null,
    error: null,
    savedWorkspaceDir: null,
  };
  jobs.set(id, job);
  saveJobToDisk(job);

  // Fire-and-forget: the HTTP handler returns the job id immediately; the pipeline keeps
  // running and mutating `job` in place, which subsequent GET /api/jobs/:id polls observe.
  void runJob(job, input);

  return job;
}

async function runJob(job: JobState, input: StartJobInput): Promise<void> {
  let source: { path: string; cleanup: () => void } | null = null;
  try {
    source = resolveRepoSource(input.repoPath);
    const result = await runMultiBugPipeline({
      repoPath: source.path,
      bugReport: input.bugReport,
      dryRun: input.dryRun,
      // Always true here, regardless of what the CLI default is: the web UI's file browser and
      // .zip download read the isolated workspace AFTER the pipeline finishes, so the server must
      // never let the pipeline delete it. Cleanup instead happens on the retention sweep below.
      keepWorkspace: true,
      maxIterations: input.maxIterations,
      forceMulti: input.multiBug === true,
      forceSingle: input.multiBug === false,
      onEvent: (e) => {
        job.events.push(e);
        if (job.events.length > MAX_EVENTS) job.events.shift();
      },
    });
    const report = result.report;
    job.report = report;
    job.status = "done";

    // Durably save the patched workspace (any completed job that produced one, not only
    // "verified-fixed" — see projectStore.ts's module comment for why) BEFORE the temp workspace
    // is subject to the retention sweep or a restart wipes it from under us.
    if (report.workspaceDir) {
      try {
        job.savedWorkspaceDir = saveFixedVersion({
          repoPath: report.repoPath,
          jobId: job.id,
          workspaceDir: report.workspaceDir,
          verification: report.kind === "multi" ? report.overallVerdict : report.verification,
        });
      } catch (err) {
        // Best-effort: a failed permanent-save should never fail the job itself — the temp
        // workspace is still there and still usable until it expires.
        console.error(`Failed to save a permanent copy of job ${job.id}'s workspace:`, err);
      }
    }
  } catch (err) {
    job.error = (err as Error).message;
    job.status = "error";
  } finally {
    settledAt.set(job.id, Date.now());
    saveJobToDisk(job);
    source?.cleanup();
  }
}

export function getJob(id: string): JobState | undefined {
  return jobs.get(id);
}

/** Every job currently held in memory (includes ones restored from disk at startup) — used for
 * read-only aggregate stats (the settings page), never for anything that mutates state. */
export function getAllJobs(): JobState[] {
  return [...jobs.values()];
}

/** The real directory to read this job's files from — the permanent saved copy if it still
 * exists on disk (survives a restart; see projectStore.ts), falling back to the temp isolated
 * workspace for a job that hasn't been saved yet (still running, or saving failed) or whose
 * saved copy was since pruned by the per-project version cap. Null if neither exists. */
export function effectiveWorkspaceDir(job: JobState): string | null {
  if (job.savedWorkspaceDir && existsSync(job.savedWorkspaceDir)) return job.savedWorkspaceDir;
  const tmp = job.report?.workspaceDir;
  if (tmp && existsSync(tmp)) return tmp;
  return null;
}

/** True while some real copy (permanent or temp) of the job's workspace is on disk and safe to
 * browse/zip. */
export function workspaceAvailable(job: JobState): boolean {
  return Boolean(effectiveWorkspaceDir(job));
}

export function sweepExpiredWorkspaces(now = Date.now()): number {
  let swept = 0;
  for (const [id, job] of jobs) {
    if (job.status === "running") continue;
    const dir = job.report?.workspaceDir;
    if (!dir) continue;
    const at = settledAt.get(id);
    if (!at || now - at < WORKSPACE_RETENTION_MS) continue;
    try {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort; a stray temp dir is not fatal
    }
    settledAt.delete(id);
    swept++;
  }
  return swept;
}

export function startWorkspaceRetentionSweeper(): NodeJS.Timeout {
  return setInterval(() => sweepExpiredWorkspaces(), SWEEP_INTERVAL_MS).unref();
}
