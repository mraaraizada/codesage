// Real tool implementations the investigation agent can call. These execute actual filesystem
// reads and actual grep searches against the indexed repo — the model never receives file
// contents it didn't explicitly ask for via a tool call, and it can never read outside the repo
// root (path traversal is rejected).
import { readFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import type { RepoIndex, ToolCallLogEntry } from "../types.js";
import type { ToolSpec } from "./provider.js";
import { searchIndex, extractKeywords } from "../search/grep.js";

export const AGENT_TOOLS: ToolSpec[] = [
  {
    name: "read_file",
    description:
      "Read the real contents of a file in the repository, by its path relative to the repo root. " +
      "Optionally restrict to a line range (1-indexed, inclusive) for long files. Returns the file " +
      "text with line numbers prefixed so you can cite exact file:line evidence.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Repo-relative file path, e.g. src/components/Login.jsx" },
        startLine: { type: "number", description: "Optional 1-indexed start line." },
        endLine: { type: "number", description: "Optional 1-indexed end line (inclusive)." },
      },
      required: ["path"],
    },
  },
  {
    name: "search_code",
    description:
      "Search the repository for a keyword, identifier, or short phrase. Returns matching " +
      "files ranked by relevance with the matching line numbers and line text. Use this to find " +
      "files you haven't looked at yet before deciding what to read_file.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword or short phrase to search for, e.g. 'handleLogin' or 'navigate'." },
      },
      required: ["query"],
    },
  },
];

const MAX_FILE_CHARS = 12_000;

function safeResolve(root: string, relPath: string): string {
  const abs = resolve(root, relPath);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Refused to read path outside the repository root: ${relPath}`);
  }
  return abs;
}

export function executeToolCall(
  index: RepoIndex,
  name: string,
  input: Record<string, unknown>
): { content: string; log: ToolCallLogEntry } {
  if (name === "read_file") {
    const path = String(input.path ?? "");
    try {
      const abs = safeResolve(index.root, path);
      const raw = readFileSync(abs, "utf8");
      const lines = raw.split("\n");
      const start = typeof input.startLine === "number" ? Math.max(1, input.startLine) : 1;
      const end = typeof input.endLine === "number" ? Math.min(lines.length, input.endLine) : lines.length;
      const slice = lines
        .slice(start - 1, end)
        .map((l, i) => `${start + i}: ${l}`)
        .join("\n");
      const truncated = slice.length > MAX_FILE_CHARS ? slice.slice(0, MAX_FILE_CHARS) + "\n...(truncated)" : slice;
      const content = `File: ${path} (lines ${start}-${end} of ${lines.length})\n${truncated}`;
      return {
        content,
        log: { tool: "read_file", input, resultSummary: `Read ${path} lines ${start}-${end}` },
      };
    } catch (err) {
      const msg = `Error reading ${path}: ${(err as Error).message}`;
      return { content: msg, log: { tool: "read_file", input, resultSummary: msg } };
    }
  }

  if (name === "search_code") {
    const query = String(input.query ?? "");
    const keywords = extractKeywords(query).length > 0 ? extractKeywords(query) : [query];
    const hits = searchIndex(index, keywords, { onlySource: false }).slice(0, 8);
    if (hits.length === 0) {
      const msg = `No matches found for "${query}".`;
      return { content: msg, log: { tool: "search_code", input, resultSummary: msg } };
    }
    const content = hits
      .map((h) => {
        const lines = h.matches.map((m) => `  ${h.relPath}:${m.line}: ${m.text}`).join("\n");
        return `${h.relPath} (score ${h.score})\n${lines}`;
      })
      .join("\n\n");
    return {
      content,
      log: { tool: "search_code", input, resultSummary: `Found ${hits.length} candidate file(s) for "${query}"` },
    };
  }

  const msg = `Unknown tool: ${name}`;
  return { content: msg, log: { tool: name, input, resultSummary: msg } };
}
