// Real ripgrep-style text search over the indexed file set. No shelling out to a `rg` binary —
// this is plain Node fs + regex, scoring and ranking candidate files for a bug report.
import { readFileSync } from "node:fs";
import type { RepoIndex, SearchHit, SearchMatch } from "../types.js";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been", "being",
  "to", "of", "in", "on", "for", "with", "at", "by", "from", "up", "about", "into", "over",
  "after", "this", "that", "these", "those", "it", "its", "as", "when", "does", "do", "not",
  "should", "would", "could", "has", "have", "had", "i", "we", "you", "they", "there", "then",
  "but", "so", "if", "than", "but", "page", "app", "user", "bug", "issue", "error", "problem",
  "happens", "happen", "doesn", "doesnt", "won", "wont", "cant", "can", "my", "our",
]);

export function extractKeywords(bugReport: string): string[] {
  const words = bugReport
    .replace(/[`'"]/g, " ")
    .split(/[^A-Za-z0-9_.]+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const keywords = new Set<string>();
  for (const w of words) {
    const lower = w.toLowerCase();
    if (w.length < 3) continue;
    if (STOPWORDS.has(lower)) continue;
    // Keep identifier-looking tokens (camelCase, snake_case, dotted) and meaningful plain words.
    keywords.add(w);
    // Also add a lowercase variant so "Login" and "login" both match case-insensitively; the
    // searchIndex function already searches case-insensitively, this just keeps the keyword list
    // de-duplicated and readable in reports.
  }
  return Array.from(keywords).slice(0, 25);
}

const MAX_FILE_BYTES_FOR_SEARCH = 1_500_000;
const CONTEXT_MATCHES_PER_FILE = 8;

export function searchIndex(index: RepoIndex, keywords: string[], opts: { onlySource?: boolean } = {}): SearchHit[] {
  if (keywords.length === 0) return [];
  const onlySource = opts.onlySource ?? false;
  const patterns = keywords.map((kw) => ({
    kw,
    regex: new RegExp(escapeRegExp(kw), "gi"),
  }));

  const hits: SearchHit[] = [];

  for (const file of index.files) {
    if (onlySource && !file.isSource) continue;
    if (file.sizeBytes === 0 || file.sizeBytes > MAX_FILE_BYTES_FOR_SEARCH) continue;

    let content: string;
    try {
      content = readFileSync(file.absPath, "utf8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    const matches: SearchMatch[] = [];
    let score = 0;
    const keywordsHit = new Set<string>();

    for (const { kw, regex } of patterns) {
      regex.lastIndex = 0;
      let count = 0;
      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= CONTEXT_MATCHES_PER_FILE) break;
        regex.lastIndex = 0;
        if (regex.test(lines[i])) {
          matches.push({ line: i + 1, text: lines[i].trim().slice(0, 240), keyword: kw });
          count++;
        }
      }
      if (count > 0) {
        keywordsHit.add(kw);
        score += count;
      }
    }

    if (matches.length > 0) {
      // Reward files that match several distinct keywords, not just repeated occurrences of one.
      score += keywordsHit.size * 3;
      // Mild boost for files the static indexer already flagged as "source".
      if (file.isSource) score += 1;
      hits.push({ relPath: file.relPath, absPath: file.absPath, score, matches });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
