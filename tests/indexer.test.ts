import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRepoIndex } from "../src/repo/indexer.js";

describe("buildRepoIndex", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "codesage-test-idx-"));
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "node_modules", "whatever"), { recursive: true });
    writeFileSync(join(dir, ".gitignore"), "ignored-dir/\n*.log\n");
    mkdirSync(join(dir, "ignored-dir"), { recursive: true });
    writeFileSync(join(dir, "ignored-dir", "secret.js"), "export function shouldNotBeIndexed() {}\n");
    writeFileSync(join(dir, "debug.log"), "noise");
    writeFileSync(join(dir, "node_modules", "whatever", "index.js"), "module.exports = {}\n");
    writeFileSync(
      join(dir, "src", "math.js"),
      [
        "export function add(a, b) {",
        "  return a + b;",
        "}",
        "",
        "export const multiply = (a, b) => a * b;",
        "",
        "class Calculator {",
        "  square(x) {",
        "    return x * x;",
        "  }",
        "}",
        "",
        "export default Calculator;",
      ].join("\n")
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "fixture", scripts: { test: "vitest run" }, dependencies: {} }, null, 2)
    );
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("walks the real file tree and respects .gitignore + default ignores", () => {
    const index = buildRepoIndex(dir);
    const relPaths = index.files.map((f) => f.relPath);
    expect(relPaths).toContain("src/math.js");
    expect(relPaths).toContain("package.json");
    expect(relPaths).not.toContain("ignored-dir/secret.js");
    expect(relPaths).not.toContain("debug.log");
    expect(relPaths.some((p) => p.startsWith("node_modules/"))).toBe(false);
  });

  it("extracts real top-level symbols with correct line numbers from JS source", () => {
    const index = buildRepoIndex(dir);
    const mathFile = index.files.find((f) => f.relPath === "src/math.js");
    expect(mathFile).toBeDefined();
    const names = mathFile!.symbols.map((s) => s.name);
    expect(names).toContain("add");
    expect(names).toContain("multiply");
    expect(names).toContain("Calculator");
    const addSymbol = mathFile!.symbols.find((s) => s.name === "add");
    expect(addSymbol?.line).toBe(1);
    expect(addSymbol?.kind).toBe("function");
    expect(addSymbol?.exported).toBe(true);
  });

  it("detects the node stack and the real npm test script", () => {
    const index = buildRepoIndex(dir);
    expect(index.stack.kinds).toContain("node");
    expect(index.stack.testCommand).not.toBeNull();
    expect(index.stack.testCommand?.command).toBe("npm");
  });

  it("reports accurate file sizes and total counts", () => {
    const index = buildRepoIndex(dir);
    expect(index.totalFiles).toBe(index.files.length);
    expect(index.totalSizeBytes).toBeGreaterThan(0);
    const mathFile = index.files.find((f) => f.relPath === "src/math.js");
    expect(mathFile?.sizeBytes).toBeGreaterThan(0);
  });
});
