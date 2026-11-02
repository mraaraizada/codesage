// Shared types for CodeSage. Kept dependency-free so every module can import freely.

export type SymbolKind = "function" | "class" | "method" | "const-fn" | "export";

export interface SymbolEntry {
  name: string;
  kind: SymbolKind;
  line: number; // 1-indexed
  exported: boolean;
}

export interface FileIndexEntry {
  /** Path relative to the repo root, POSIX separators. */
  relPath: string;
  absPath: string;
  sizeBytes: number;
  extension: string;
  language: string | null;
  /** true if this file is treated as readable source/text for grep + symbol extraction. */
  isSource: boolean;
  symbols: SymbolEntry[];
  lineCount: number | null;
}

export interface StackInfo {
  kinds: string[]; // e.g. ["node", "react"], ["python"]
  packageManager: string | null; // npm | yarn | pnpm | pip | poetry | null
  testCommand: TestCommand | null;
  dependencies: string[];
  devDependencies: string[];
  notes: string[];
}

export interface RepoIndex {
  root: string;
  files: FileIndexEntry[];
  totalFiles: number;
  totalSizeBytes: number;
  stack: StackInfo;
  builtAtIso: string;
}

export interface SearchMatch {
  line: number; // 1-indexed
  text: string;
  keyword: string;
}

export interface SearchHit {
  relPath: string;
  absPath: string;
  score: number;
  matches: SearchMatch[];
}

export interface TestCommand {
  type: "npm" | "yarn" | "pnpm" | "pytest" | "python-unittest" | "unknown";
  command: string;
  args: string[];
  cwd: string;
  source: string; // human-readable description of how this was detected
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
  toolCallLog: ToolCallLogEntry[];
  rawModelText: string;
}

export interface ToolCallLogEntry {
  tool: string;
  input: unknown;
  resultSummary: string;
}

export interface PatchResult {
  diffText: string;
  explanation: string;
  rawModelText: string;
}

export interface ApplyResult {
  applied: boolean;
  method: "git-apply" | "diff-package" | "none";
  output: string;
  error: string | null;
  changedFiles: string[];
}

export type VerificationStatus =
  | "verified-fixed"
  | "tests-still-failing"
  | "patch-did-not-apply"
  | "no-tests-detected"
  | "dry-run-no-llm"
  | "inconclusive";

export interface CodeSageReport {
  /** Discriminator so callers that may receive either a single-bug or multi-bug report can tell
   * them apart (e.g. server job state, the web UI). Optional/absent on older persisted reports —
   * treat missing as "single". */
  kind?: "single";
  generatedAtIso: string;
  repoPath: string;
  bugReport: string;
  stack: StackInfo;
  /** Real counts from the repo indexer (src/repo/indexer.ts) — surfaced on the report so the UI
   * can show "files scanned" without re-deriving it from a pipeline event. */
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

// --- Multi-bug orchestration -------------------------------------------------------------

/** How the original bug report was broken into sub-bug-reports — surfaced on the report so the
 * user can see (and trust) which path was taken rather than treating the split as a black box. */
export type SplitMethod = "structural" | "llm" | "single";

/** The full outcome of running the ordinary single-bug pipeline's stages (investigate -> patch ->
 * apply -> test) for ONE sub-bug-report within a multi-bug batch. Deliberately keeps every
 * intermediate artifact (not just the verdict) so a failed/inconclusive sub-bug is never silently
 * dropped from the consolidated report — see src/multiPipeline.ts. */
export interface SubBugResult {
  /** 1-indexed position in the batch. */
  index: number;
  /** Short human label, e.g. the heading text ("Bug 02 — Logout state synchronization") when the
   * splitter found one, else "Sub-bug 2". */
  title: string;
  /** The self-contained bug-report text this sub-investigation actually ran against. */
  bugReport: string;
  investigation: InvestigationResult | null;
  patch: PatchResult | null;
  apply: ApplyResult | null;
  /** Full test-suite run immediately after this sub-bug's patch was applied — doubles as both
   * this bug's own before/after check AND a regression check against every prior sub-bug's
   * already-applied fix, because the shared workspace carries all prior fixes forward. */
  testsBefore: TestRunResult | null;
  testsAfter: TestRunResult | null;
  verification: VerificationStatus;
  verificationReason: string;
  /** Files this sub-bug's patch touched (empty if nothing was kept). */
  filesChanged: string[];
  /** True only when this sub-investigation's own code threw an unhandled error (e.g. every
   * configured LLM backend was exhausted, or an unexpected I/O failure) — distinct from a clean,
   * honestly-reported "inconclusive"/"patch-did-not-apply" outcome. Either way the batch moves on. */
  crashed: boolean;
  /** Set when crashed is true, or to explain a rollback; null otherwise. */
  error: string | null;
  /** Whether this sub-bug's patch was kept in the shared workspace (verified-fixed, or no test
   * command exists to verify against) or rolled back (tests regressed, stayed failing, patch
   * didn't apply, investigation crashed, or investigation never named files to patch). */
  kept: boolean;
}

export interface MultiBugReport {
  kind: "multi";
  generatedAtIso: string;
  repoPath: string;
  /** The original, un-split bug report text as submitted by the user. */
  originalBugReport: string;
  stack: StackInfo;
  filesIndexed: number;
  totalSizeBytes: number;
  splitMethod: SplitMethod;
  subBugs: SubBugResult[];
  /** Full test-suite result before ANY sub-investigation ran (the true batch baseline). Null if
   * no test command was detected. */
  testsBaseline: TestRunResult | null;
  /** Full test-suite result after the LAST kept fix in the batch — the authoritative final
   * regression check requested by the spec, re-run once more after the loop finishes. */
  finalRegressionTests: TestRunResult | null;
  /** Union of every file touched by every KEPT sub-bug fix, across the whole batch. */
  filesChangedAcrossBatch: string[];
  /** e.g. "3 of 4 bugs verified fixed, 1 inconclusive." Computed, never hand-waved. */
  overallVerdict: string;
  workspaceDir: string | null;
  limitations: string[];
}
