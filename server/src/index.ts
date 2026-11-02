import { fileURLToPath } from "node:url";
import { dirname, join, resolve, basename } from "node:path";
import { existsSync } from "node:fs";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");

// Load the shared .env from the project root (CodeSage/.env), regardless of cwd the server was
// started from.
dotenv.config({ path: join(REPO_ROOT, ".env") });

import express from "express";
import cors from "cors";
import { renderMarkdown, renderMultiMarkdown } from "../../src/report/generate.js";
import { isLLMConfigured } from "../../src/llm/client.js";
import { startJob, getJob, workspaceAvailable, effectiveWorkspaceDir, startWorkspaceRetentionSweeper, loadJobsFromDisk } from "./jobs.js";
import { listWorkspaceFiles, readWorkspaceFile, streamWorkspaceZip, PathTraversalError, FileTooLargeError } from "./files.js";
import { uploadMiddleware, materializeUpload, UploadRejectedError } from "./upload.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// `PORT` is the standard env var most hosts (Render, Railway, Heroku) inject and require the app
// to bind to; `CODESAGE_SERVER_PORT` is this project's own override for local dev. `PORT` wins
// when both are set, since a host-injected port is not optional — the platform's own router won't
// reach the app on any other port.
const PORT = Number(process.env.PORT) || Number(process.env.CODESAGE_SERVER_PORT) || 8787;
const EXAMPLE_REPO_PATH = join(REPO_ROOT, "examples", "buggy-react-login");
const EXAMPLE_BUG_REPORT =
  "After a user enters correct credentials and clicks 'Log in', the app shows they're logged in, but it never navigates to /dashboard. The auth state updates correctly, navigation just doesn't happen.";

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, llmConfigured: isLLMConfigured() });
});

app.get("/api/example", (_req, res) => {
  res.json({ repoPath: EXAMPLE_REPO_PATH, bugReport: EXAMPLE_BUG_REPORT });
});

app.post("/api/jobs", (req, res) => {
  const { repoPath, bugReport, dryRun, maxIterations, multiBug } = req.body ?? {};
  if (typeof repoPath !== "string" || !repoPath.trim()) {
    res.status(400).json({ error: "repoPath is required (local path or git URL)." });
    return;
  }
  if (typeof bugReport !== "string" || !bugReport.trim()) {
    res.status(400).json({ error: "bugReport is required." });
    return;
  }
  const job = startJob({
    repoPath: repoPath.trim(),
    bugReport: bugReport.trim(),
    dryRun: Boolean(dryRun),
    maxIterations: typeof maxIterations === "number" ? maxIterations : undefined,
    multiBug: typeof multiBug === "boolean" ? multiBug : undefined,
  });
  res.status(202).json({ jobId: job.id });
});

// --- Folder upload (drag-and-drop "New investigation" alternative to typing a path) ---

app.post("/api/upload", (req, res) => {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      const tooLarge = typeof err === "object" && err !== null && (err as { code?: string }).code === "LIMIT_FILE_SIZE";
      res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? `A file exceeded the per-file size limit.` : message });
      return;
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    try {
      const { repoPath, fileCount, totalBytes } = materializeUpload(files, req.body?.paths);
      res.json({ repoPath, fileCount, totalBytes });
    } catch (e) {
      const status = e instanceof UploadRejectedError ? 413 : 400;
      res.status(status).json({ error: (e as Error).message });
    }
  });
});

// --- Completed-job file browser + download (reads the isolated post-patch workspace) ---

function requireWorkspace(id: string, res: express.Response): { job: NonNullable<ReturnType<typeof getJob>>; workspaceDir: string } | null {
  const job = getJob(id);
  if (!job) {
    res.status(404).json({ error: "Unknown job id." });
    return null;
  }
  // Prefers the permanent saved copy (server/.data/projects/..., survives a restart) over the
  // temp isolated workspace, falling back to the temp one if saving hasn't happened/succeeded yet
  // — see jobs.ts's effectiveWorkspaceDir() and projectStore.ts.
  const workspaceDir = effectiveWorkspaceDir(job);
  if (!workspaceDir) {
    res.status(409).json({
      error:
        job.status === "running"
          ? "The investigation hasn't finished yet."
          : "This job's workspace is no longer available (neither a permanent saved copy nor the temporary workspace exists on disk).",
    });
    return null;
  }
  return { job, workspaceDir };
}

app.get("/api/jobs/:id/files", (req, res) => {
  const ctx = requireWorkspace(req.params.id, res);
  if (!ctx) return;
  try {
    res.json({ files: listWorkspaceFiles(ctx.workspaceDir) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get(/^\/api\/jobs\/([^/]+)\/files\/(.*)$/, (req, res) => {
  const id = req.params[0];
  const relPath = decodeURIComponent(req.params[1]);
  const ctx = requireWorkspace(id, res);
  if (!ctx) return;
  try {
    const content = readWorkspaceFile(ctx.workspaceDir, relPath);
    res.json({ path: relPath, content });
  } catch (e) {
    if (e instanceof PathTraversalError) {
      res.status(400).json({ error: e.message });
    } else if (e instanceof FileTooLargeError) {
      res.status(413).json({ error: e.message });
    } else {
      res.status(404).json({ error: (e as Error).message });
    }
  }
});

app.get("/api/jobs/:id/download", (req, res) => {
  const ctx = requireWorkspace(req.params.id, res);
  if (!ctx) return;
  const repoName = basename(ctx.job.report!.repoPath.replace(/[/\\]+$/, ""));
  streamWorkspaceZip(ctx.workspaceDir, `${repoName || "codesage-project"}-fixed.zip`, res);
});

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Unknown job id." });
    return;
  }
  res.json(job);
});

app.get("/api/jobs/:id/report.md", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).send("Unknown job id.");
    return;
  }
  if (!job.report) {
    res.status(409).send("Report not ready yet.");
    return;
  }
  res.type("text/markdown").send(job.report.kind === "multi" ? renderMultiMarkdown(job.report) : renderMarkdown(job.report));
});

// Optional production mode: if the web UI has been built (`cd web && npm run build`), serve the
// static bundle from the same server so the whole app can run as a single process + port.
const webDist = join(REPO_ROOT, "web", "dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(join(webDist, "index.html"));
  });
}

const restoredJobCount = loadJobsFromDisk();
startWorkspaceRetentionSweeper();

app.listen(PORT, () => {
  console.log(`CodeSage server listening on http://localhost:${PORT}`);
  console.log(`  LLM configured: ${isLLMConfigured()}`);
  console.log(`  Example fixture: ${EXAMPLE_REPO_PATH}`);
  console.log(`  Restored ${restoredJobCount} job(s) from disk.`);
});
