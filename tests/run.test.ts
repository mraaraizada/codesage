import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCounts, runTests } from "../src/testRunner/run.js";
import type { TestCommand } from "../src/types.js";

// child_process + shell:true on Windows means args go through cmd.exe's own quoting rules, so
// inline `node -e "..."` one-liners with embedded quotes are unreliable cross-platform. Writing
// the script to a real temp .js file and invoking `node <file>` sidesteps all of that.
function scriptFixture(dirHolder: { dir: string | null }, code: string): TestCommand {
  const dir = mkdtempSync(join(tmpdir(), "codesage-run-test-"));
  dirHolder.dir = dir;
  const file = join(dir, "script.js");
  writeFileSync(file, code, "utf8");
  return { type: "unknown", command: process.execPath, args: [file], cwd: dir, source: "inline test fixture" };
}

describe("parseCounts", () => {
  it("parses a real Vitest failing-summary line, including ANSI color codes around the numbers", () => {
    // Captured verbatim (minus a few surrounding lines) from a real `npm test` run of the
    // CodeSage buggy-react-login fixture before its bug was fixed.
    const raw = " Test Files  \x1b[1m\x1b[31m1 failed\x1b[39m\x1b[22m (1)\n" + "      Tests  \x1b[1m\x1b[31m1 failed\x1b[39m\x1b[22m | \x1b[1m\x1b[32m1 passed\x1b[39m\x1b[22m (2)\n";
    const result = parseCounts(raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""));
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("parses an all-passing Vitest summary line", () => {
    const result = parseCounts("      Tests  2 passed (2)\n");
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("parses a pytest summary line", () => {
    const result = parseCounts("===== 3 passed, 1 failed in 0.42s =====");
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(1);
  });

  it("returns null counts (not a guess) when nothing recognizable is present", () => {
    const result = parseCounts("some unrelated build output\nno test summary here");
    expect(result.passed).toBeNull();
    expect(result.failed).toBeNull();
  });
});

describe("runTests", () => {
  const dirHolder: { dir: string | null } = { dir: null };
  afterEach(() => {
    if (dirHolder.dir) rmSync(dirHolder.dir, { recursive: true, force: true });
    dirHolder.dir = null;
  });

  it("captures real stdout, a real exit code, and strips ANSI escapes from a live subprocess", async () => {
    const cmd = scriptFixture(dirHolder, "console.log('\\u001b[31mTests\\u001b[39m  1 passed (1)');\nprocess.exit(0);\n");
    const result = await runTests(cmd, 10_000);
    expect(result.ran).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("\u001b[");
    expect(result.passed).toBe(1);
  });

  it("marks a process that never exits as timed out and kills it", async () => {
    const cmd = scriptFixture(dirHolder, "setInterval(() => {}, 1000);\n");
    const result = await runTests(cmd, 300);
    expect(result.timedOut).toBe(true);
  });
});
