// Real patch application. Primary path uses `git apply` inside the isolated workspace's fresh
// git repo (git's hunk-matching is more forgiving and auditable than hand-rolled patching).
// Fallback path uses the `diff` npm package's text-based `applyPatch`, which tolerates small
// line-offset drift in LLM-produced diffs. Both are real patch engines — nothing here fabricates
// success.
import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPatch, parsePatch } from "diff";
import type { ApplyResult } from "../types.js";

/**
 * Smaller/faster LLMs (observed with Groq's gpt-oss-120b) are frequently unreliable at unified
 * diff *bookkeeping* even when the actual edit they describe is correct: a bare `@@ @@` with no
 * ranges at all, or a syntactically fine `@@ -15,5 +15,4 @@` whose counts don't match the body's
 * actual `+`/`-` lines, or whose claimed start line isn't where that content really is. Neither
 * `git apply` nor the `diff` package tolerates any of that.
 *
 * Rather than special-case each failure mode, every hunk's header is unconditionally recomputed
 * from two sources of truth: the body's own `+`/`-`/context lines (for the old/new counts) and
 * the ACTUAL current file content in the workspace (for the start line, found by locating the
 * hunk's first unchanged-or-removed line verbatim). This corrects bookkeeping the model got
 * wrong; it never invents a fix or guesses at content it hasn't verified — if the referenced line
 * truly isn't in the file, the subsequent git apply / diff-package attempt still fails honestly.
 */
function repairHunkHeaders(diffText: string, workspaceDir: string): string {
  const lines = diffText.split("\n");
  const out: string[] = [];
  let currentFileLines: string[] | null = null;
  let searchFromIndex = 0;
  let lineDelta = 0; // cumulative (added - removed) from earlier repaired hunks in this file

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("--- ")) {
      out.push(line);
      continue;
    }

    if (line.startsWith("+++ ")) {
      out.push(line);
      const path = line.slice(4).trim().replace(/\t.*$/, "").replace(/^[ab]\//, "");
      // Read the file leniently: strip a trailing \r from every line so a CRLF source file (common
      // on Windows, and the model may have echoed its content verbatim including the \r) still
      // compares equal to the diff body's context/removed lines below, which may or may not carry
      // their own \r depending on how the model reproduced them.
      try {
        currentFileLines = readFileSync(join(workspaceDir, path), "utf8").split("\n").map((l) => l.replace(/\r$/, ""));
      } catch {
        currentFileLines = null;
      }
      searchFromIndex = 0;
      lineDelta = 0;
      continue;
    }

    if (line.startsWith("@@")) {
      let j = i + 1;
      const rawBody: string[] = [];
      while (j < lines.length && !lines[j].startsWith("@@") && !lines[j].startsWith("--- ") && !lines[j].startsWith("+++ ")) {
        rawBody.push(lines[j]);
        j++;
      }

      // A unified diff's body requires every line to start with ' ' (context), '+', '-', or '\'
      // (no-newline marker) — nothing else is valid syntax, for either `git apply` or the `diff`
      // package. Smaller/faster models (observed with Groq's gpt-oss-120b) sometimes drop the
      // leading space on an otherwise-correct context line, producing bare text that both engines
      // reject outright (git: "No valid patches in input"; diff-package: "Unknown line ..."). An
      // empty line is always context too (its single space is often trimmed away by the model or
      // by markdown-fence post-processing). This is sanitized unconditionally, not just when a repo
      // file was found below, since it's a syntax problem independent of path/line-number repair.
      const body = rawBody.map((raw) => {
        const l = raw.replace(/\r$/, "");
        // A truly empty line is already valid as-is (an empty blank-context line) — don't turn it
        // into a line containing a literal space, which would change the file's actual content.
        if (l === "" || l.startsWith("+") || l.startsWith("-") || l.startsWith("\\") || l.startsWith(" ")) return l;
        return ` ${l}`;
      });

      if (!currentFileLines) {
        out.push(line, ...body);
      } else {
        let oldCount = 0;
        let newCount = 0;
        let firstOldLine: string | null = null;
        for (const l of body) {
          if (l.startsWith("+")) {
            newCount++;
          } else if (l.startsWith("-")) {
            oldCount++;
            if (firstOldLine === null) firstOldLine = l.slice(1);
          } else {
            // context line (already guaranteed to start with a space by the sanitize step above)
            const text = l.slice(1);
            oldCount++;
            newCount++;
            if (firstOldLine === null) firstOldLine = text;
          }
        }

        let startLine = searchFromIndex + 1;
        if (firstOldLine !== null) {
          const idx = currentFileLines.findIndex((fl, fi) => fi >= searchFromIndex && fl === firstOldLine);
          if (idx >= 0) startLine = idx + 1;
        }

        const newStart = startLine + lineDelta;
        out.push(`@@ -${startLine},${oldCount} +${newStart},${newCount} @@`, ...body);
        searchFromIndex = startLine - 1 + oldCount;
        lineDelta += newCount - oldCount;
      }

      i = j - 1;
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

function tryGitApply(workspaceDir: string, diffText: string): { ok: boolean; output: string; error: string | null } {
  const patchDir = mkdtempSync(join(tmpdir(), "codesage-patch-"));
  const patchFile = join(patchDir, "fix.patch");
  writeFileSync(patchFile, diffText.endsWith("\n") ? diffText : diffText + "\n", "utf8");
  try {
    const output = execFileSync("git", ["apply", "--whitespace=fix", "--recount", patchFile], {
      cwd: workspaceDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output: output || "git apply: patch applied cleanly.", error: null };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; message: string };
    const stderr = e.stderr ? e.stderr.toString() : e.message;
    return { ok: false, output: "", error: stderr };
  } finally {
    rmSync(patchDir, { recursive: true, force: true });
  }
}

/** Text-based fallback: apply each file's hunks directly against the current file content on
 * disk using the `diff` package, tolerant of minor context drift. */
function tryDiffPackageApply(workspaceDir: string, diffText: string): { ok: boolean; output: string; error: string | null; changedFiles: string[] } {
  let patches;
  try {
    patches = parsePatch(diffText);
  } catch (err) {
    return { ok: false, output: "", error: `Could not parse diff text: ${(err as Error).message}`, changedFiles: [] };
  }

  if (patches.length === 0) {
    return { ok: false, output: "", error: "Diff text contained no parseable file patches.", changedFiles: [] };
  }

  const changedFiles: string[] = [];
  for (const patch of patches) {
    const rawPath = (patch.newFileName ?? patch.oldFileName ?? "").replace(/^[ab]\//, "");
    if (!rawPath) continue;
    const abs = join(workspaceDir, rawPath);
    if (!existsSync(abs)) {
      return { ok: false, output: "", error: `Target file does not exist in workspace: ${rawPath}`, changedFiles };
    }
    const original = readFileSync(abs, "utf8");
    const patched = applyPatch(original, patch);
    if (patched === false) {
      return { ok: false, output: "", error: `Hunk(s) did not match current content of ${rawPath}`, changedFiles };
    }
    writeFileSync(abs, patched, "utf8");
    changedFiles.push(rawPath);
  }
  return { ok: true, output: `diff-package fallback applied ${changedFiles.length} file(s).`, error: null, changedFiles };
}

function gitChangedFiles(workspaceDir: string): string[] {
  try {
    const out = execFileSync("git", ["diff", "--name-only"], { cwd: workspaceDir, encoding: "utf8" });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function applyUnifiedDiff(workspaceDir: string, rawDiffText: string): ApplyResult {
  if (!rawDiffText.trim()) {
    // Short-circuit instead of handing an empty string to git/diff-package: both engines would
    // otherwise fail with a generic, confusing error ("No valid patches in input" / "contained no
    // parseable file patches") that reads like an engine problem. The real cause is upstream — the
    // model's response didn't contain a diff block llm/patch.ts could extract at all — so say that
    // plainly instead.
    return {
      applied: false,
      method: "none",
      output: "",
      error: "The model's response did not contain a parseable unified diff (no ```diff fenced block or --- a/ / +++ b/ header pair was found).",
      changedFiles: [],
    };
  }

  const diffText = repairHunkHeaders(rawDiffText, workspaceDir);
  const repaired = diffText !== rawDiffText;

  const gitResult = tryGitApply(workspaceDir, diffText);
  if (gitResult.ok) {
    return {
      applied: true,
      method: "git-apply",
      output: repaired ? `(hunk header(s) auto-repaired from the model's output)\n${gitResult.output}` : gitResult.output,
      error: null,
      changedFiles: gitChangedFiles(workspaceDir),
    };
  }

  const fallback = tryDiffPackageApply(workspaceDir, diffText);
  if (fallback.ok) {
    return {
      applied: true,
      method: "diff-package",
      output: `git apply failed (${gitResult.error?.trim().slice(0, 300)}); fell back to diff-package text patcher.${repaired ? " (hunk header(s) auto-repaired from the model's output)" : ""}\n${fallback.output}`,
      error: null,
      changedFiles: fallback.changedFiles,
    };
  }

  return {
    applied: false,
    method: "none",
    output: "",
    error: `git apply failed: ${gitResult.error?.trim().slice(0, 500)}\ndiff-package fallback failed: ${fallback.error}`,
    changedFiles: [],
  };
}
