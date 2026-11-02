// Real repository inspection: walks the file tree on disk, respects .gitignore via the `ignore`
// package, records real file sizes, and extracts real top-level symbols for source files.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, relative, sep } from "node:path";
import { createRequire } from "node:module";
import type { FileIndexEntry, RepoIndex } from "../types.js";
import { extractSymbols } from "./symbols.js";
import { detectStack } from "./stack.js";

// `ignore` ships CJS-only typings that don't interop cleanly with NodeNext/ESM default-import
// resolution. It is loaded via createRequire instead of a static `import`, which is the normal,
// supported way to consume a CJS-only package from ESM TypeScript — not a workaround for our own
// logic, just for this one third-party module boundary.
const require = createRequire(import.meta.url);
interface Ignore {
  add(patterns: string | readonly string[]): Ignore;
  ignores(pathname: string): boolean;
}
const ignoreFactory = require("ignore") as () => Ignore;

const ALWAYS_IGNORED = [".git", "node_modules", "dist", "build", "coverage", ".next", ".turbo", ".cache", "__pycache__", ".venv", "venv", ".pytest_cache"];

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".py": "python",
  ".json": "json",
  ".md": "markdown",
  ".css": "css",
  ".html": "html",
};

const SOURCE_EXTS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py"]);
const TEXT_READABLE_EXTS = new Set([...SOURCE_EXTS, ".json", ".md", ".css", ".html", ".yml", ".yaml", ".txt"]);
const MAX_READ_BYTES = 1_500_000; // don't slurp huge generated/minified files

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

function loadIgnore(root: string): Ignore {
  const ig = ignoreFactory();
  ig.add(ALWAYS_IGNORED);
  const gitignorePath = join(root, ".gitignore");
  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath, "utf8"));
  }
  return ig;
}

function walk(root: string, dir: string, ig: Ignore, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const abs = join(dir, name);
    const rel = toPosix(relative(root, abs));
    if (rel === "") continue;
    if (ig.ignores(rel)) continue;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (ig.ignores(rel + "/")) continue;
      walk(root, abs, ig, out);
    } else if (st.isFile()) {
      out.push(abs);
    }
  }
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < content.length; i++) if (content.charCodeAt(i) === 10) n++;
  return n;
}

export function buildRepoIndex(root: string): RepoIndex {
  const absRoot = root;
  const ig = loadIgnore(absRoot);
  const absFiles: string[] = [];
  walk(absRoot, absRoot, ig, absFiles);

  const files: FileIndexEntry[] = [];
  let totalSizeBytes = 0;

  for (const absPath of absFiles) {
    const relPath = toPosix(relative(absRoot, absPath));
    const extension = extname(absPath).toLowerCase();
    let sizeBytes = 0;
    try {
      sizeBytes = statSync(absPath).size;
    } catch {
      continue;
    }
    totalSizeBytes += sizeBytes;
    const isSource = SOURCE_EXTS.has(extension);
    let symbols: FileIndexEntry["symbols"] = [];
    let lineCount: number | null = null;

    if (TEXT_READABLE_EXTS.has(extension) && sizeBytes > 0 && sizeBytes <= MAX_READ_BYTES) {
      try {
        const content = readFileSync(absPath, "utf8");
        lineCount = countLines(content);
        if (isSource) symbols = extractSymbols(content, extension);
      } catch {
        // unreadable (binary disguised with text extension, permission issue, etc.) — skip content analysis
      }
    }

    files.push({
      relPath,
      absPath,
      sizeBytes,
      extension,
      language: LANGUAGE_BY_EXT[extension] ?? null,
      isSource,
      symbols,
      lineCount,
    });
  }

  files.sort((a, b) => a.relPath.localeCompare(b.relPath));

  const stack = detectStack(absRoot, files.map((f) => f.relPath));

  return {
    root: absRoot,
    files,
    totalFiles: files.length,
    totalSizeBytes,
    stack,
    builtAtIso: new Date().toISOString(),
  };
}
