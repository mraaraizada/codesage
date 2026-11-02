import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRepoIndex } from "../src/repo/indexer.js";
import { extractKeywords, searchIndex } from "../src/search/grep.js";

describe("extractKeywords", () => {
  it("pulls identifier-like words out of a natural-language bug report and drops stopwords", () => {
    const kws = extractKeywords("When the user clicks the login button, handleLogin runs but navigate() is never called.");
    expect(kws).toContain("handleLogin");
    expect(kws).toContain("navigate");
    expect(kws).toContain("login");
    expect(kws).not.toContain("the");
    expect(kws).not.toContain("when");
  });
});

describe("searchIndex", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "codesage-test-grep-"));
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "Login.js"),
      [
        "function handleLogin(ok) {",
        "  setLoggedIn(true);",
        "  if (loggedIn) {",
        "    navigate('/dashboard');",
        "  }",
        "}",
      ].join("\n")
    );
    writeFileSync(join(dir, "src", "unrelated.js"), "export const PI = 3.14159;\n");
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("finds real line:file matches for the given keywords, ranked by relevance", () => {
    const index = buildRepoIndex(dir);
    const hits = searchIndex(index, ["handleLogin", "navigate", "loggedIn"]);
    expect(hits.length).toBeGreaterThan(0);
    const top = hits[0];
    expect(top.relPath).toBe("src/Login.js");
    const navigateMatch = top.matches.find((m) => m.keyword === "navigate");
    expect(navigateMatch).toBeDefined();
    expect(navigateMatch!.line).toBe(4);
    expect(navigateMatch!.text).toContain("navigate('/dashboard')");
  });

  it("returns no hits for keywords that do not appear anywhere", () => {
    const index = buildRepoIndex(dir);
    const hits = searchIndex(index, ["doesNotExistAnywhereXYZ"]);
    expect(hits).toHaveLength(0);
  });
});
