// The agentic investigation loop: the model is given the bug report, a repo summary, and the two
// real tools from tools.ts. It must call tools to gather file:line evidence before concluding —
// it is never handed the whole repo blind. This is a genuine multi-turn tool-use loop (max N
// iterations) driven by whichever LLMProvider is configured (Anthropic or Groq — see client.ts).
import { getProvider, DEFAULT_MAX_ITERATIONS } from "./client.js";
import { AGENT_TOOLS, executeToolCall } from "./tools.js";
import type { RepoIndex, InvestigationResult, SearchHit } from "../types.js";

function buildSystemPrompt(index: RepoIndex, searchHits: SearchHit[]): string {
  const stackLine = `Stack: ${index.stack.kinds.join(", ")} (package manager: ${index.stack.packageManager ?? "unknown"})`;
  const topFiles = searchHits
    .slice(0, 10)
    .map((h) => `- ${h.relPath} (keyword-match score ${h.score})`)
    .join("\n");

  return [
    "You are CodeSage, an evidence-driven debugging agent. You investigate a real bug report against a real codebase.",
    "",
    "Rules:",
    "1. You MUST use the read_file and search_code tools to gather evidence before concluding. Never invent file contents, line numbers, or behavior you have not actually read.",
    "2. Every claim in your root cause must cite a concrete relPath:line from a file you actually read via read_file.",
    "3. Be efficient: use search_code to locate relevant files, then read_file on the most promising ones. You have a limited number of tool-call turns.",
    "4. When you are confident, STOP calling tools and respond with ONLY a fenced ```json code block (no prose outside it) matching this exact shape:",
    "```json",
    "{",
    '  "rootCause": "one or two sentence root cause statement",',
    '  "explanation": "a short paragraph explaining the mechanism of the bug",',
    '  "evidence": [{"relPath": "src/foo.js", "line": 12, "snippet": "the exact or paraphrased line"}],',
    '  "filesToPatch": ["src/foo.js"],',
    '  "confidence": "low" | "medium" | "high"',
    "}",
    "```",
    "",
    `Repository root: ${index.root}`,
    stackLine,
    `Indexed files: ${index.totalFiles}`,
    "",
    "Keyword search over the bug report already surfaced these candidate files (highest score first) — start by reading the most promising ones:",
    topFiles || "(no keyword matches — rely on search_code tool calls)",
  ].join("\n");
}

function extractJsonBlock(text: string): string | null {
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  // Smaller models sometimes use a bare ``` fence instead of ```json — accept it as long as it
  // looks like an object (starts with `{` once trimmed).
  const bareFence = text.match(/```\s*([\s\S]*?)```/);
  if (bareFence && bareFence[1].trim().startsWith("{")) return bareFence[1].trim();
  // fallback: maybe the model emitted raw JSON without fences
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }
  return null;
}

/** Best-effort recovery for near-valid JSON a smaller model commonly produces: a trailing comma
 * before `}`/`]`, or smart/curly quotes instead of straight ones. Still a real parse — this only
 * normalizes syntax, never guesses at missing content — so a genuinely malformed block still
 * fails and falls through to the honest degraded result below. */
function tryParseLeniently(jsonBlock: string): unknown | null {
  try {
    return JSON.parse(jsonBlock);
  } catch {
    // fall through to the normalized retry below
  }
  try {
    const normalized = jsonBlock
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

export async function investigateBug(
  index: RepoIndex,
  bugReport: string,
  searchHits: SearchHit[],
  opts: { maxIterations?: number; onIteration?: (n: number, note: string) => void } = {}
): Promise<InvestigationResult> {
  const provider = getProvider();
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const system = buildSystemPrompt(index, searchHits);

  const { finalText, toolCallLog, iterationsUsed, stoppedReason } = await provider.runAgentLoop({
    system,
    userMessage: `Bug report from the user:\n"""\n${bugReport}\n"""\n\nInvestigate the root cause. Use your tools first; only produce the final JSON verdict once you have concrete file:line evidence.`,
    tools: AGENT_TOOLS,
    maxIterations,
    executeTool: (name, input) => executeToolCall(index, name, input),
    onIteration: opts.onIteration,
  });

  const jsonBlock = extractJsonBlock(finalText);
  const parsed = jsonBlock ? tryParseLeniently(jsonBlock) : null;
  if (parsed && typeof parsed === "object") {
    const p = parsed as Record<string, unknown>;
    return {
      rootCause: String(p.rootCause ?? "Unspecified root cause."),
      explanation: String(p.explanation ?? ""),
      evidence: Array.isArray(p.evidence)
        ? p.evidence.map((e: any) => ({ relPath: String(e.relPath ?? ""), line: Number(e.line ?? 0), snippet: String(e.snippet ?? "") }))
        : [],
      filesToPatch: Array.isArray(p.filesToPatch) ? p.filesToPatch.map(String) : [],
      confidence: ["low", "medium", "high"].includes(p.confidence as string) ? (p.confidence as "low" | "medium" | "high") : "medium",
      iterationsUsed,
      toolCallLog,
      rawModelText: finalText,
    };
  }

  // Distinguish the two distinct degraded causes instead of one generic message — this directly
  // tells the user which lever actually helps: a higher iteration budget only helps the first case.
  const rootCause =
    stoppedReason === "max-iterations"
      ? `The investigation ran out of its ${maxIterations}-iteration budget while still gathering evidence (it was still calling tools, not yet concluding) — it needed more turns than allotted. Re-run with a higher iteration budget.`
      : stoppedReason === "provider-error"
        ? "The LLM provider rejected a request mid-investigation (see the tool-call log for the exact error) — this ended the investigation early with whatever evidence had already been gathered."
        : "The model stopped calling tools on its own but its final response did not contain a parseable structured verdict (malformed or missing JSON). This is a model-output reliability issue, not an iteration-budget issue — re-running the same investigation is the main option.";

  return {
    rootCause,
    explanation: finalText || "(no model text captured)",
    evidence: [],
    filesToPatch: [],
    confidence: "low",
    iterationsUsed,
    toolCallLog,
    rawModelText: finalText,
  };
}
