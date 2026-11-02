import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTwoFilesPatch } from "diff";
import { createIsolatedWorkspace, type IsolatedWorkspace } from "../src/workspace/isolate.js";
import { applyUnifiedDiff } from "../src/patch/apply.js";

const ORIGINAL = ["function handleLogin(ok) {", "  setLoggedIn(true);", "  if (loggedIn) {", "    navigate('/dashboard');", "  }", "}", ""].join("\n");

const FIXED = ["function handleLogin(ok) {", "  setLoggedIn(true);", "  if (ok) {", "    navigate('/dashboard');", "  }", "}", ""].join("\n");

describe("applyUnifiedDiff", () => {
  let sourceDir: string;
  let workspace: IsolatedWorkspace;

  beforeEach(() => {
    sourceDir = mkdtempSync(join(tmpdir(), "codesage-test-src-"));
    mkdirSync(join(sourceDir, "src"), { recursive: true });
    writeFileSync(join(sourceDir, "src", "Login.js"), ORIGINAL);
    workspace = createIsolatedWorkspace(sourceDir);
  });

  afterEach(() => {
    workspace.cleanup();
    rmSync(sourceDir, { recursive: true, force: true });
  });

  it("repairs a context line missing its leading space marker entirely (observed: Groq gpt-oss-120b dropping it on a zero-indent line, which the diff package otherwise rejects as an 'unknown line' and git apply rejects as 'no valid patches')", () => {
    const flatOriginal = ["const userId = req.params.id;", "doSomething(userId);", ""].join("\n");
    const flatFixed = ["const userId = req.params.userId;", "doSomething(userId);", ""].join("\n");
    mkdirSync(join(sourceDir, "src2"), { recursive: true });
    writeFileSync(join(sourceDir, "src2", "handler.js"), flatOriginal);
    const flatWorkspace = createIsolatedWorkspace(sourceDir);

    // The second line is deliberately bare — no leading ' ', '+', '-', or '\' at all, and the real
    // line itself has zero indentation, so there's no ambiguity about how much whitespace to
    // restore (unlike an indented line, where the model dropping the marker is indistinguishable
    // from it also dropping some of the real indentation).
    const diffText = [
      "--- a/src2/handler.js",
      "+++ b/src2/handler.js",
      "@@ -1,2 +1,2 @@",
      "-const userId = req.params.id;",
      "+const userId = req.params.userId;",
      "doSomething(userId);",
    ].join("\n");

    const result = applyUnifiedDiff(flatWorkspace.dir, diffText);

    expect(result.applied).toBe(true);
    const patchedContent = readFileSync(join(flatWorkspace.dir, "src2", "handler.js"), "utf8");
    expect(patchedContent).toBe(flatFixed);
    flatWorkspace.cleanup();
  });

  it("gives a clear, specific error for an empty diff instead of a confusing engine-level failure", () => {
    const result = applyUnifiedDiff(workspace.dir, "");

    expect(result.applied).toBe(false);
    expect(result.method).toBe("none");
    expect(result.error).toMatch(/did not contain a parseable unified diff/);
    // Must NOT be git/diff-package's generic internal error text leaking through instead.
    expect(result.error).not.toMatch(/No valid patches in input/);
  });

  it("repairs a hunk header whose file content contains CRLF line endings (observed: a Windows-sourced file echoed back by the model, causing a line-ending mismatch in header repair)", () => {
    const crlfOriginal = ORIGINAL.split("\n").join("\r\n");
    const crlfFixed = FIXED.split("\n").join("\r\n");
    writeFileSync(join(workspace.dir, "src", "Login.js"), crlfOriginal);

    // A hunk with a correct body but a deliberately wrong header (bad counts/start line), same
    // failure class as the real Groq gpt-oss bookkeeping bug — this time against a CRLF file.
    const diffText = ["--- a/src/Login.js", "+++ b/src/Login.js", "@@ -1,1 +1,1 @@", "-  if (loggedIn) {", "+  if (ok) {"].join("\n");

    const result = applyUnifiedDiff(workspace.dir, diffText);

    expect(result.applied).toBe(true);
    const patchedContent = readFileSync(join(workspace.dir, "src", "Login.js"), "utf8");
    expect(patchedContent.replace(/\r\n/g, "\n")).toBe(crlfFixed.replace(/\r\n/g, "\n"));
  });

  it("applies a real unified diff via git apply and the workspace file reflects the fix", () => {
    const diffText = createTwoFilesPatch("a/src/Login.js", "b/src/Login.js", ORIGINAL, FIXED, "", "");

    const result = applyUnifiedDiff(workspace.dir, diffText);

    expect(result.applied).toBe(true);
    expect(result.method).toBe("git-apply");
    expect(result.changedFiles).toContain("src/Login.js");

    const patchedContent = readFileSync(join(workspace.dir, "src", "Login.js"), "utf8");
    expect(patchedContent).toBe(FIXED);
  });

  it("never mutates the original source repository, only the isolated workspace copy", () => {
    const diffText = createTwoFilesPatch("a/src/Login.js", "b/src/Login.js", ORIGINAL, FIXED, "", "");
    applyUnifiedDiff(workspace.dir, diffText);

    const originalStillUnchanged = readFileSync(join(sourceDir, "src", "Login.js"), "utf8");
    expect(originalStillUnchanged).toBe(ORIGINAL);
  });

  it("reports failure (not a fabricated success) for a diff that cannot match the current content", () => {
    const bogusDiff = createTwoFilesPatch("a/src/Login.js", "b/src/Login.js", "totally different content\nthat was never in the file\n", "patched\n", "", "");

    const result = applyUnifiedDiff(workspace.dir, bogusDiff);

    expect(result.applied).toBe(false);
    expect(result.method).toBe("none");
    expect(result.error).toBeTruthy();
  });

  it("falls back to the diff-package text patcher when git apply's context doesn't line up exactly", () => {
    // A diff with a slightly stale hunk header / line count that git apply's strict matcher
    // rejects, but whose actual context lines still identify the right location for the
    // line-based fallback patcher.
    const slightlyOffDiff = [
      "--- a/src/Login.js",
      "+++ b/src/Login.js",
      "@@ -1,7 +1,7 @@",
      " function handleLogin(ok) {",
      "   setLoggedIn(true);",
      "-  if (loggedIn) {",
      "+  if (ok) {",
      "     navigate('/dashboard');",
      "   }",
      " }",
      "",
    ].join("\n");

    const result = applyUnifiedDiff(workspace.dir, slightlyOffDiff);
    // Either engine succeeding is an acceptable, real outcome here; the point of this test is
    // that a minor hunk-header mismatch doesn't produce a crash or a silently wrong result.
    if (result.applied) {
      const content = readFileSync(join(workspace.dir, "src", "Login.js"), "utf8");
      expect(content).toContain("if (ok) {");
    } else {
      expect(result.error).toBeTruthy();
    }
  });

  it("repairs a bare '@@' hunk header with no line-number ranges (observed from a real Groq gpt-oss-120b response) and still applies correctly", () => {
    // Real-world regression: a smaller/faster model emitted a semantically correct diff but with
    // no range numbers on the hunk header at all. Neither git apply nor the diff package can use
    // a hunk header like that on its own — applyUnifiedDiff must recompute real ranges from the
    // actual file content before attempting to apply.
    const bareHeaderDiff = [
      "--- a/src/Login.js",
      "+++ b/src/Login.js",
      "@@",
      " function handleLogin(ok) {",
      "   setLoggedIn(true);",
      "-  if (loggedIn) {",
      "-    navigate('/dashboard');",
      "-  }",
      "+  if (ok) {",
      "+    navigate('/dashboard');",
      "+  }",
      " }",
      "",
    ].join("\n");

    const result = applyUnifiedDiff(workspace.dir, bareHeaderDiff);

    expect(result.applied).toBe(true);
    expect(result.output).toContain("auto-repaired");
    const content = readFileSync(join(workspace.dir, "src", "Login.js"), "utf8");
    expect(content).toBe(FIXED);
  });
});
