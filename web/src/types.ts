// Minimal client-side mirror of the server's JSON contract (server/src/jobs.ts + src/types.ts).
// Kept as plain type declarations, decoupled from the backend's TypeScript build.

export type PipelineStage =
  | "indexing"
  | "searching"
  | "investigating"
  | "creating-workspace"
  | "testing-before"
  | "patching"
  | "applying-patch"
  | "testing-after"
  | "reporting"
  | "done"
  | "error"
  // Multi-bug-only stages (src/multiPipeline.ts) — a single-bug job never emits these.
  | "splitting"
  | "regression-testing"
  | "sub-bug-start"
  | "sub-bug-done";

export interface PipelineEvent {
  stage: PipelineStage;
  message: string;
  data?: Record<string, unknown>;
}

export interface Evidence {
  relPath: string;
  line: number;
  snippet: string;
}

export interface InvestigationResult {
  rootCause: string;
  explanation: string;
  evidence: Evidence[];
  filesToPatch: string[];
  confidence: "low" | "medium" | "high";
  iterationsUsed: number;
  toolCallLog: Array<{ tool: string; input: unknown; resultSummary: string }>;
}

export interface PatchResult {
  diffText: string;
  explanation: string;
}

export interface ApplyResult {
  applied: boolean;
  method: "git-apply" | "diff-package" | "none";
  output: string;
  error: string | null;
  changedFiles: string[];
}

export interface TestRunResult {
  ran: boolean;
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  passed: number | null;
  failed: number | null;
  summaryLine: string | null;
}

export type VerificationStatus =
  | "verified-fixed"
  | "tests-still-failing"
  | "patch-did-not-apply"
  | "no-tests-detected"
  | "applied-unverified"
  | "dry-run-no-llm"
  | "inconclusive";

export interface CodeSageReport {
  kind?: "single";
  generatedAtIso: string;
  repoPath: string;
  bugReport: string;
  stack: { kinds: string[]; packageManager: string | null; notes: string[] };
  filesIndexed: number;
  totalSizeBytes: number;
  searchHits: Array<{ relPath: string; score: number; matchCount: number }>;
  investigation: InvestigationResult | null;
  patch: PatchResult | null;
  apply: ApplyResult | null;
  testsBefore: TestRunResult | null;
  testsAfter: TestRunResult | null;
  verification: VerificationStatus;
  verificationReason: string;
  workspaceDir: string | null;
  limitations: string[];
}

export type SplitMethod = "structural" | "llm" | "single";

export interface SubBugResult {
  index: number;
  title: string;
  bugReport: string;
  investigation: InvestigationResult | null;
  patch: PatchResult | null;
  apply: ApplyResult | null;
  testsBefore: TestRunResult | null;
  testsAfter: TestRunResult | null;
  verification: VerificationStatus;
  verificationReason: string;
  filesChanged: string[];
  crashed: boolean;
  error: string | null;
  kept: boolean;
  reproTest: {
    relPath: string;
    failedBeforePatch: boolean | null;
    passedAfterPatch: boolean | null;
  } | null;
}

export interface MultiBugReport {
  kind: "multi";
  generatedAtIso: string;
  repoPath: string;
  originalBugReport: string;
  stack: { kinds: string[]; packageManager: string | null; notes: string[] };
  filesIndexed: number;
  totalSizeBytes: number;
  splitMethod: SplitMethod;
  subBugs: SubBugResult[];
  testsBaseline: TestRunResult | null;
  finalRegressionTests: TestRunResult | null;
  filesChangedAcrossBatch: string[];
  overallVerdict: string;
  workspaceDir: string | null;
  limitations: string[];
}

export interface JobState {
  id: string;
  status: "running" | "done" | "error";
  createdAtIso: string;
  events: PipelineEvent[];
  report: CodeSageReport | MultiBugReport | null;
  error: string | null;
}

// Mirrors server/src/files.ts's FileTreeEntry — the real post-patch workspace file list backing
// the full-page code viewer.
export interface FileTreeEntry {
  relPath: string;
  sizeBytes: number;
  extension: string;
  language: string | null;
  isSource: boolean;
}
