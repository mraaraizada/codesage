// Splits a single (possibly multi-bug) bug report into N self-contained sub-bug-report strings,
// so a multi-bug submission can be investigated one bug at a time instead of forcing one
// investigation loop to understand several unrelated bugs at once (see src/multiPipeline.ts for
// why that consistently fails to converge).
//
// Two strategies, tried in order:
//   (a) structural: the report already looks like a numbered/headed list of distinct bugs (e.g.
//       "## Bug 01 — ...", "## Bug 02 — ...", or "1. ...", "2. ..."). Parsed directly with no LLM
//       call: free, deterministic, and exactly matches real BUG_REPORT.md files like
//       examples/fixora-test-03-react/BUG_REPORT.md.
//   (b) llm: no structure detected, so a real LLM call asks the model to split the prose into a
//       numbered list of independent, self-contained bug descriptions — the flexible path for a
//       bug report pasted as free-form prose.
// If neither finds more than one bug, the report is treated as a single bug (method "single") so
// the caller can skip all orchestration overhead and just run the normal single-bug pipeline.
import { getProvider, isLLMConfigured } from "./client.js";
import type { LLMProvider } from "./provider.js";
import type { SplitMethod } from "../types.js";

export interface SubBugReport {
  title: string;
  body: string;
}

export interface SplitResult {
  method: SplitMethod;
  subBugs: SubBugReport[];
}

interface HeadingMatch {
  level: number;
  title: string;
  headingStart: number;
  contentStart: number;
}

// Requires a following number ("Bug 01", "Issue #2", "Problem 3:") so a document TITLE that merely
// contains the word "bug" (e.g. "# FIXORA ... Bug Report") is never itself mistaken for one of the
// numbered bug sections it introduces.
const BUG_HEADING_RE = /\b(?:bug|issue|defect|problem)\b\s*#?\s*\d+/i;
// "## Bug 01 — Login navigation failure", "### Issue 2: foo", "Bug 3 -", etc.
const HEADING_LINE_RE = /^(#{1,6})\s+(.+)$/gm;

function findHeadingSections(text: string): HeadingMatch[] {
  const matches: HeadingMatch[] = [];
  let m: RegExpExecArray | null;
  HEADING_LINE_RE.lastIndex = 0;
  while ((m = HEADING_LINE_RE.exec(text)) !== null) {
    matches.push({
      level: m[1].length,
      title: m[2].trim(),
      headingStart: m.index,
      contentStart: m.index + m[0].length,
    });
  }
  return matches;
}

/** Strategy (b) structural, markdown-heading variant: "## Bug 01 — ...", "## Issue 2: ...". */
function splitByHeadings(text: string): SubBugReport[] {
  const headings = findHeadingSections(text);
  const bugHeadings = headings.filter((h) => BUG_HEADING_RE.test(h.title));
  if (bugHeadings.length < 2) return [];

  const subBugs: SubBugReport[] = [];
  for (let i = 0; i < bugHeadings.length; i++) {
    const h = bugHeadings[i];
    // Content runs until the next heading of ANY level (bug-related or not) — this naturally
    // excludes trailing shared sections like "## FIXORA investigation requirements" from being
    // appended onto the last bug's body, since that heading itself doesn't match BUG_HEADING_RE
    // but still terminates the preceding section.
    const nextHeadingStart = headings.find((o) => o.headingStart > h.headingStart)?.headingStart ?? text.length;
    const body = text.slice(h.contentStart, nextHeadingStart).trim();
    subBugs.push({ title: h.title, body: `${h.title}\n\n${body}` });
  }
  return subBugs;
}

/** Strategy (b) structural, plain numbered-list variant: top-level "1. ...", "2. ..." items, each
 * with substantial (not single-clause) content — guards against misreading a short instructional
 * checklist (e.g. "1. Run tests. 2. Apply patch.") as separate bugs. */
function splitByNumberedList(text: string): SubBugReport[] {
  const itemRe = /^(\d{1,2})[.)]\s+(.+)$/gm;
  const starts: Array<{ n: number; start: number; contentStart: number; firstLine: string }> = [];
  let m: RegExpExecArray | null;
  itemRe.lastIndex = 0;
  while ((m = itemRe.exec(text)) !== null) {
    starts.push({ n: parseInt(m[1], 10), start: m.index, contentStart: m.index + m[0].length, firstLine: m[2] });
  }
  // Must be a real sequential list (1, 2, 3, ...) of at least 2 items.
  if (starts.length < 2) return [];
  for (let i = 0; i < starts.length; i++) {
    if (starts[i].n !== i + 1) return [];
  }

  const subBugs: SubBugReport[] = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].start : text.length;
    const body = (starts[i].firstLine + "\n" + text.slice(starts[i].contentStart, end)).trim();
    // Reject lists whose items are short imperative clauses (a checklist/requirements list, not
    // bug descriptions) — require real substance per item.
    if (body.length < 40) return [];
    subBugs.push({ title: `Item ${starts[i].n}`, body });
  }
  return subBugs;
}

function tryStructuralSplit(text: string): SubBugReport[] {
  // Headings require an explicit "Bug N" / "Issue N" wording in the heading itself
  // (BUG_HEADING_RE) — a strong, low-false-positive signal, trusted as-is.
  const byHeadings = splitByHeadings(text);
  if (byHeadings.length >= 2) return byHeadings;

  // A plain numbered list has no such semantic signal — length>=40 alone does not distinguish a
  // real list of distinct bugs from a numbered PROCEDURE/instructions list (observed in practice:
  // a report's own "Investigation requirements" numbered steps, e.g. "1. Inspect the complete
  // repository... 2. Identify the affected files...", got misdetected as separate bugs). Apply the
  // same genuine-bug-split validator used for the LLM path here too.
  const byList = splitByNumberedList(text);
  if (byList.length >= 2 && looksLikeGenuineBugSplit(byList, text)) return byList;

  return [];
}

function parseLlmNumberedList(text: string): SubBugReport[] {
  // Expect "1. <self-contained bug description...>" blocks, each running until the next "N. ".
  const itemRe = /^(\d{1,2})[.)]\s+/gm;
  const starts: Array<{ n: number; start: number }> = [];
  let m: RegExpExecArray | null;
  itemRe.lastIndex = 0;
  while ((m = itemRe.exec(text)) !== null) starts.push({ n: parseInt(m[1], 10), start: m.index });
  if (starts.length === 0) return [];

  const subBugs: SubBugReport[] = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].start : text.length;
    const chunk = text.slice(starts[i].start, end).trim();
    const body = chunk.replace(/^\d{1,2}[.)]\s+/, "").trim();
    if (body) subBugs.push({ title: `Bug ${i + 1}`, body });
  }
  return subBugs;
}

const SPLIT_SYSTEM_PROMPT = [
  "You split a user's bug report into one or more INDEPENDENT, self-contained bug DESCRIPTIONS.",
  "",
  "Rules:",
  "- If the report genuinely describes only ONE bug, respond with exactly one numbered item containing the whole report (restated if useful, but do not fabricate a second bug).",
  "- If it describes multiple UNRELATED bugs, respond with one numbered item per bug.",
  "- Each item must be a SELF-CONTAINED bug description: include enough restated context (what area of the app, what's expected vs. actual) that it can be investigated completely on its own, without seeing the other items or the original report.",
  "- Do not merge unrelated bugs into one item, and do not split one bug's symptoms into multiple items.",
  "",
  "CRITICAL — what NOT to do:",
  "- Do NOT invent a generic step-by-step debugging PROCEDURE (things like \"set up a reproducible environment\", \"run the test suite\", \"generate a git patch\", \"validate patches\", \"manual verification steps\"). Those are instructions about HOW to investigate, not descriptions of WHAT is broken, and must never appear as an item.",
  "- Every item you output MUST restate a real, specific symptom that is ALREADY described somewhere in the bug report given to you below. If you cannot find at least one additional real bug beyond the first, output only one item.",
  "- Respond with ONLY a numbered list (\"1. ...\", \"2. ...\"), no preamble, no extra commentary, no markdown headings.",
].join("\n");

/** Phrases that mark an item as a generic debugging PROCEDURE step rather than a bug description
 * — these are near-universally present in any "how to investigate/fix this" checklist and never
 * in an actual description of broken behavior, so their presence is a reliable rejection signal. */
const PROCEDURAL_PHRASES = [
  "reproducible environment",
  "clone the repository",
  "npm ci",
  "npm install",
  "run the test suite",
  "run the existing test",
  "run all tests",
  "git diff",
  "git apply",
  "unified git patch",
  "generate.{0,20}patch",
  "validate.{0,20}patch",
  "manual verification steps",
  "record.{0,20}(results|findings)",
];
const PROCEDURAL_RE = new RegExp(PROCEDURAL_PHRASES.join("|"), "i");

/** Rejects an LLM split result that is actually a generic debugging procedure (see
 * PROCEDURAL_PHRASES) rather than real bug descriptions — observed in practice: a smaller/weaker
 * model asked to "split the bug report" sometimes ignores that and answers a DIFFERENT, more
 * familiar question ("how would I go about fixing bugs in general"), producing a numbered
 * how-to-debug checklist instead. Every item must also share real content with the original
 * report — a genuine split restates specifics from it, a hallucinated generic procedure doesn't. */
export function looksLikeGenuineBugSplit(subBugs: SubBugReport[], originalReport: string): boolean {
  if (subBugs.some((s) => PROCEDURAL_RE.test(s.body))) return false;

  const originalWords = new Set(
    originalReport
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 5)
  );
  if (originalWords.size === 0) return true; // nothing substantial to compare against — don't block

  const overlapping = subBugs.filter((s) => {
    const words = s.body.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 5);
    return words.some((w) => originalWords.has(w));
  });
  // Require at least half the items to genuinely reference the source report's own vocabulary.
  return overlapping.length >= Math.ceil(subBugs.length / 2);
}

/** Strategy (a): a real LLM call via the existing provider/fallback chain. Returns a single-item
 * list (the whole original report, verbatim) on any failure/misconfiguration, so the caller falls
 * through to the single-bug pipeline rather than fabricating a split. */
async function tryLlmSplit(bugReport: string, providerOverride?: LLMProvider): Promise<SubBugReport[]> {
  if (!isLLMConfigured()) return [];
  try {
    const provider = providerOverride ?? getProvider();
    const text = await provider.complete({
      system: SPLIT_SYSTEM_PROMPT,
      userMessage: `Bug report:\n"""\n${bugReport}\n"""`,
      maxTokens: 2048,
    });
    const parsed = parseLlmNumberedList(text);
    return parsed;
  } catch {
    return [];
  }
}

export interface SplitOptions {
  /** Explicit UI override: skip detection entirely and run the single-bug pipeline. */
  forceSingle?: boolean;
  /** Explicit UI override: skip structural detection and go straight to the LLM splitter (still
   * collapses to "single" if the model itself returns only one item). */
  forceMulti?: boolean;
  /** Use this provider for the LLM split call instead of the default chain — multiPipeline.ts
   * passes its OpenRouter-only provider here when forceMulti is set, so the split call doesn't spend
   * Groq quota on a batch the user already told us is a multi-bug report. */
  provider?: LLMProvider;
}

export async function splitBugReport(bugReport: string, opts: SplitOptions = {}): Promise<SplitResult> {
  const trimmed = bugReport.trim();

  if (opts.forceSingle) {
    return { method: "single", subBugs: [{ title: "Bug", body: trimmed }] };
  }

  if (!opts.forceMulti) {
    const structural = tryStructuralSplit(trimmed);
    if (structural.length >= 2) return { method: "structural", subBugs: structural };
  }

  const llmSplit = await tryLlmSplit(trimmed, opts.provider);
  if (llmSplit.length >= 2 && looksLikeGenuineBugSplit(llmSplit, trimmed)) {
    return { method: "llm", subBugs: llmSplit };
  }

  // Neither strategy found more than one distinct bug (or the LLM path wasn't available/failed) —
  // genuinely a single bug (or we can't responsibly claim otherwise). Run it as one.
  return { method: "single", subBugs: [{ title: "Bug", body: trimmed }] };
}
