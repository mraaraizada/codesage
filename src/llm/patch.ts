// Asks the configured LLM provider for a concrete unified diff fixing the investigated root
// cause. The model is given the REAL current contents of the files it wants to patch (read from
// the isolated workspace, the same bytes that will actually receive the patch) — never asked to
// fabricate a diff against content it hasn't seen.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getProvider } from "./client.js";
import type { LLMProvider } from "./provider.js";
import type { InvestigationResult, PatchResult } from "../types.js";

function extractDiffBlock(text: string): string | null {
  const fence = text.match(/```diff\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const altFence = text.match(/```\s*([\s\S]*?---[\s\S]*?\+\+\+[\s\S]*?)```/);
  if (altFence) return altFence[1].trim();
  const idx = text.indexOf("--- a/");
  if (idx >= 0) return text.slice(idx).trim();
  return null;
}

export async function proposePatch(
  workspaceDir: string,
  investigation: InvestigationResult,
  bugReport: string,
  opts: { previousAttemptError?: string; provider?: LLMProvider } = {}
): Promise<PatchResult> {
  const provider = opts.provider ?? getProvider();

  const fileContents = investigation.filesToPatch
    .map((relPath) => {
      const abs = join(workspaceDir, relPath);
      if (!existsSync(abs)) return `### ${relPath}\n(file not found in workspace)`;
      const content = readFileSync(abs, "utf8");
      return `### ${relPath}\n\`\`\`\n${content}\n\`\`\``;
    })
    .join("\n\n");

  const system = [
    "You are CodeSage's patch-generation step. You already investigated a bug and found its root cause.",
    "Produce a minimal, correct fix as a standard unified diff (git diff format), and nothing else of substance.",
    "",
    "Strict requirements:",
    "- Output a short one-sentence explanation first, then a fenced ```diff code block.",
    "- The diff MUST use headers in the form `--- a/<relPath>` and `+++ b/<relPath>` exactly matching the given relative paths.",
    "- Include correct @@ hunk headers with accurate line numbers and at least 3 lines of context, matching the file content given to you EXACTLY (including whitespace).",
    "- Copy every context line byte-for-byte from the file content you are given below. Do not add, remove, or reposition any blank line that isn't really there — a hallucinated or dropped blank line is the single most common reason a patch fails to apply.",
    "- Only touch the files necessary to fix the root cause. Keep the diff minimal.",
    "- Do not invent new files unless strictly required.",
  ].join("\n");

  const retryNote = opts.previousAttemptError
    ? [
        "",
        "IMPORTANT: your previous attempt at this diff FAILED to apply, with this exact error:",
        `"""\n${opts.previousAttemptError}\n"""`,
        "This almost always means a context or removed line in your diff did not match the real file content character-for-character (commonly: an extra or missing blank line, or wrong indentation). Re-read the file content below very carefully and produce a corrected diff that matches it exactly.",
      ].join("\n")
    : "";

  const userMsg = [
    `Original bug report:\n"""\n${bugReport}\n"""`,
    "",
    `Root cause: ${investigation.rootCause}`,
    `Explanation: ${investigation.explanation}`,
    "",
    "Evidence:",
    ...investigation.evidence.map((e) => `- ${e.relPath}:${e.line} — ${e.snippet}`),
    "",
    "Current contents of the file(s) to patch (this is the exact current state — base your diff on this):",
    fileContents,
    retryNote,
  ].join("\n");

  const text = await provider.complete({ system, userMessage: userMsg, maxTokens: 4096 });

  const diffText = extractDiffBlock(text) ?? "";
  const explanation = text.replace(/```diff[\s\S]*?```/i, "").trim();

  return { diffText, explanation, rawModelText: text };
}
