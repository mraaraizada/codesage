// Builds the structured engineering report (Markdown + JSON) from real pipeline outputs. The
// verification status is computed purely from real test exit codes / pass-fail counts elsewhere
// (see pipeline.ts `decideVerification`) — this module only renders it, never invents it.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CodeSageReport, MultiBugReport, TestRunResult } from "../types.js";

function fmtTestResult(label: string, r: TestRunResult | null): string {
  if (!r) return `**${label}:** not run.`;
  const counts = r.passed !== null || r.failed !== null ? `${r.passed ?? "?"} passed / ${r.failed ?? "?"} failed` : "(counts not parseable from output)";
  return [
    `**${label}:** \`${r.command}\``,
    `- exit code: ${r.exitCode === null ? "n/a (process error)" : r.exitCode}`,
    `- timed out: ${r.timedOut}`,
    `- duration: ${r.durationMs}ms`,
    `- result: ${counts}`,
    r.summaryLine ? `- tool summary line: \`${r.summaryLine}\`` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderMarkdown(report: CodeSageReport): string {
  const lines: string[] = [];
  lines.push(`# CodeSage Engineering Report`);
  lines.push("");
  lines.push(`Generated: ${report.generatedAtIso}`);
  lines.push(`Repository: \`${report.repoPath}\``);
  lines.push("");
  lines.push(`## Verification status: ${statusBadge(report.verification)}`);
  lines.push("");
  lines.push(report.verificationReason);
  lines.push("");

  lines.push("## Problem");
  lines.push("");
  lines.push("> " + report.bugReport.split("\n").join("\n> "));
  lines.push("");

  lines.push("## Codebase understanding");
  lines.push("");
  lines.push(`- Detected stack: ${report.stack.kinds.join(", ")}`);
  lines.push(`- Package manager: ${report.stack.packageManager ?? "unknown"}`);
  lines.push(`- Files indexed: ${report.filesIndexed} (${(report.totalSizeBytes / 1024).toFixed(1)} KB)`);
  if (report.stack.notes.length) lines.push(...report.stack.notes.map((n) => `- Note: ${n}`));
  lines.push("");

  lines.push("## Search: candidate files");
  lines.push("");
  if (report.searchHits.length === 0) {
    lines.push("_No keyword matches found in the repository for terms extracted from the bug report._");
  } else {
    for (const h of report.searchHits.slice(0, 10)) {
      lines.push(`- \`${h.relPath}\` — score ${h.score}, ${h.matchCount} line match(es)`);
    }
  }
  lines.push("");

  lines.push("## Root cause");
  lines.push("");
  if (report.investigation) {
    lines.push(`**${report.investigation.rootCause}**`);
    lines.push("");
    lines.push(report.investigation.explanation);
    lines.push("");
    lines.push(`Confidence: ${report.investigation.confidence} (agentic loop used ${report.investigation.iterationsUsed} iteration(s), ${report.investigation.toolCallLog.length} tool call(s))`);
    lines.push("");
    lines.push("Evidence:");
    for (const e of report.investigation.evidence) {
      lines.push(`- \`${e.relPath}:${e.line}\` — ${e.snippet}`);
    }
  } else {
    lines.push("_Not run (dry-run mode or no API key configured)._");
  }
  lines.push("");

  lines.push("## Proposed patch");
  lines.push("");
  if (report.patch) {
    if (report.patch.explanation) {
      lines.push(report.patch.explanation);
      lines.push("");
    }
    lines.push("```diff");
    lines.push(report.patch.diffText || "(no diff produced)");
    lines.push("```");
  } else {
    lines.push("_Not run._");
  }
  lines.push("");

  lines.push("## Patch application");
  lines.push("");
  if (report.apply) {
    lines.push(`- Applied: ${report.apply.applied}`);
    lines.push(`- Method: ${report.apply.method}`);
    if (report.apply.changedFiles.length) lines.push(`- Changed files: ${report.apply.changedFiles.join(", ")}`);
    if (report.apply.error) lines.push(`- Error: ${report.apply.error}`);
  } else {
    lines.push("_Not run._");
  }
  lines.push("");

  lines.push("## Test results");
  lines.push("");
  lines.push(fmtTestResult("Before patch", report.testsBefore));
  lines.push("");
  lines.push(fmtTestResult("After patch", report.testsAfter));
  lines.push("");

  lines.push("## Sandboxing / isolation limitations (honest disclosure)");
  lines.push("");
  for (const l of report.limitations) lines.push(`- ${l}`);
  if (report.workspaceDir) lines.push(`- Isolated workspace used for patch + tests: \`${report.workspaceDir}\``);
  lines.push("");

  return lines.join("\n");
}

function statusBadge(status: CodeSageReport["verification"]): string {
  switch (status) {
    case "verified-fixed":
      return "VERIFIED FIXED";
    case "tests-still-failing":
      return "TESTS STILL FAILING";
    case "patch-did-not-apply":
      return "PATCH DID NOT APPLY";
    case "no-tests-detected":
      return "NO TESTS DETECTED";
    case "dry-run-no-llm":
      return "DRY RUN (NO LLM STAGE)";
    default:
      return "INCONCLUSIVE";
  }
}

export function writeReport(report: CodeSageReport, outDir: string): { mdPath: string; jsonPath: string } {
  mkdirSync(outDir, { recursive: true });
  const mdPath = join(outDir, "report.md");
  const jsonPath = join(outDir, "report.json");
  writeFileSync(mdPath, renderMarkdown(report), "utf8");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  return { mdPath, jsonPath };
}

// --- Multi-bug report rendering -------------------------------------------------------------

export function renderMultiMarkdown(report: MultiBugReport): string {
  const lines: string[] = [];
  lines.push(`# CodeSage Multi-Bug Engineering Report`);
  lines.push("");
  lines.push(`Generated: ${report.generatedAtIso}`);
  lines.push(`Repository: \`${report.repoPath}\``);
  lines.push(`Split method: ${report.splitMethod}`);
  lines.push("");
  lines.push(`## Overall verdict: ${report.overallVerdict}`);
  lines.push("");

  lines.push("## Original bug report");
  lines.push("");
  lines.push("> " + report.originalBugReport.split("\n").join("\n> "));
  lines.push("");

  lines.push("## Codebase understanding");
  lines.push("");
  lines.push(`- Detected stack: ${report.stack.kinds.join(", ")}`);
  lines.push(`- Package manager: ${report.stack.packageManager ?? "unknown"}`);
  lines.push(`- Files indexed: ${report.filesIndexed} (${(report.totalSizeBytes / 1024).toFixed(1)} KB)`);
  lines.push("");

  lines.push("## Baseline tests (before any sub-investigation)");
  lines.push("");
  lines.push(fmtTestResult("Baseline", report.testsBaseline));
  lines.push("");

  for (const sub of report.subBugs) {
    lines.push(`## Bug ${sub.index}: ${sub.title}`);
    lines.push("");
    lines.push(`**Status: ${subStatusBadge(sub)}**`);
    lines.push("");
    lines.push(sub.verificationReason);
    lines.push("");
    lines.push("Sub-bug report investigated:");
    lines.push("");
    lines.push("> " + sub.bugReport.split("\n").join("\n> "));
    lines.push("");
    if (sub.investigation) {
      lines.push(`Root cause: **${sub.investigation.rootCause}**`);
      lines.push("");
      lines.push(sub.investigation.explanation);
      lines.push("");
      for (const e of sub.investigation.evidence) lines.push(`- \`${e.relPath}:${e.line}\` — ${e.snippet}`);
      lines.push("");
    }
    if (sub.patch?.diffText) {
      lines.push("```diff");
      lines.push(sub.patch.diffText);
      lines.push("```");
      lines.push("");
    }
    if (sub.testsBefore || sub.testsAfter) {
      lines.push(fmtTestResult("Full suite before this sub-bug", sub.testsBefore));
      lines.push("");
      lines.push(fmtTestResult("Full suite after this sub-bug's patch", sub.testsAfter));
      lines.push("");
    }
    lines.push(`Files changed (kept: ${sub.kept}): ${sub.filesChanged.length ? sub.filesChanged.join(", ") : "(none)"}`);
    if (sub.crashed) lines.push(`CRASHED: ${sub.error}`);
    lines.push("");
  }

  lines.push("## Final regression test (after the last kept fix)");
  lines.push("");
  lines.push(fmtTestResult("Final", report.finalRegressionTests));
  lines.push("");

  lines.push("## Files changed across the whole batch");
  lines.push("");
  if (report.filesChangedAcrossBatch.length === 0) {
    lines.push("_No files were kept changed._");
  } else {
    for (const f of report.filesChangedAcrossBatch) lines.push(`- \`${f}\``);
  }
  lines.push("");

  lines.push("## Limitations (honest disclosure)");
  lines.push("");
  for (const l of report.limitations) lines.push(`- ${l}`);
  if (report.workspaceDir) lines.push(`- Shared isolated workspace: \`${report.workspaceDir}\``);
  lines.push("");

  return lines.join("\n");
}

function subStatusBadge(sub: MultiBugReport["subBugs"][number]): string {
  if (sub.crashed) return "CRASHED (rolled back)";
  return statusBadge(sub.verification) + (sub.kept ? "" : " (rolled back)");
}

export function writeMultiReport(report: MultiBugReport, outDir: string): { mdPath: string; jsonPath: string } {
  mkdirSync(outDir, { recursive: true });
  const mdPath = join(outDir, "report.md");
  const jsonPath = join(outDir, "report.json");
  writeFileSync(mdPath, renderMultiMarkdown(report), "utf8");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  return { mdPath, jsonPath };
}
