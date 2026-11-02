// Real, lightweight static-analysis symbol extraction. Uses regex scanning rather than a full
// parser — intentionally simple and transparent, but it reads actual file content and reports
// actual line numbers; it never asks an LLM to "guess" what symbols exist.
import type { SymbolEntry, SymbolKind } from "../types.js";

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

interface Rule {
  regex: RegExp;
  kind: SymbolKind;
  nameGroup: number;
  exportedGroup?: number;
}

const JS_TS_RULES: Rule[] = [
  // export function foo(...) / function foo(...)
  { regex: /^[ \t]*(export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)\s*\(/gm, kind: "function", nameGroup: 2, exportedGroup: 1 },
  // export class Foo / class Foo
  { regex: /^[ \t]*(export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)/gm, kind: "class", nameGroup: 2, exportedGroup: 1 },
  // export const foo = (...) => { ... }  OR  export const foo = function
  { regex: /^[ \t]*(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm, kind: "const-fn", nameGroup: 2, exportedGroup: 1 },
  { regex: /^[ \t]*(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function/gm, kind: "const-fn", nameGroup: 2, exportedGroup: 1 },
  // class method shorthand (indented, not "function" keyword, not control-flow keywords)
  { regex: /^[ \t]+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm, kind: "method", nameGroup: 1 },
];

const CONTROL_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "function", "return", "constructor"]);

const PY_RULES: Rule[] = [
  { regex: /^[ \t]*def\s+([A-Za-z_][\w]*)\s*\(/gm, kind: "function", nameGroup: 1 },
  { regex: /^[ \t]*class\s+([A-Za-z_][\w]*)\s*[:(]/gm, kind: "class", nameGroup: 1 },
];

function runRules(content: string, rules: Rule[], filterMethods: boolean): SymbolEntry[] {
  const out: SymbolEntry[] = [];
  const seenAtLine = new Set<string>();
  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.regex.exec(content)) !== null) {
      const name = m[rule.nameGroup];
      if (!name) continue;
      if (filterMethods && rule.kind === "method" && CONTROL_KEYWORDS.has(name)) continue;
      const line = lineOf(content, m.index);
      const key = `${rule.kind}:${name}:${line}`;
      if (seenAtLine.has(key)) continue;
      seenAtLine.add(key);
      const exported = rule.exportedGroup ? Boolean(m[rule.exportedGroup]) : false;
      out.push({ name, kind: rule.kind, line, exported });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

export function extractSymbols(content: string, extension: string): SymbolEntry[] {
  const ext = extension.toLowerCase();
  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)) {
    return runRules(content, JS_TS_RULES, true);
  }
  if (ext === ".py") {
    return runRules(content, PY_RULES, false);
  }
  return [];
}
