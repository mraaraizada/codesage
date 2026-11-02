import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectStack, rebindTestCommand } from "../src/repo/stack.js";

describe("detectStack", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("detects a Node project's real package.json test script", () => {
    const dir = mkdtempSync(join(tmpdir(), "codesage-test-stack-node-"));
    dirs.push(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", scripts: { test: "vitest run" }, dependencies: { react: "^18.0.0" } }));
    const stack = detectStack(dir, ["package.json"]);
    expect(stack.kinds).toContain("node");
    expect(stack.kinds).toContain("react");
    expect(stack.testCommand).not.toBeNull();
    expect(stack.testCommand?.type).toBe("npm");
    expect(stack.testCommand?.args).toContain("test");
  });

  it("detects a Python project via pytest.ini", () => {
    const dir = mkdtempSync(join(tmpdir(), "codesage-test-stack-py-"));
    dirs.push(dir);
    writeFileSync(join(dir, "pytest.ini"), "[pytest]\n");
    const stack = detectStack(dir, ["pytest.ini"]);
    expect(stack.kinds).toContain("python");
    expect(stack.testCommand?.type).toBe("pytest");
    // Invoked as `python -m pytest`, not a bare `pytest` binary — see the comment in stack.ts: a
    // bare `pytest` command isn't on PATH on every machine (notably Windows without an activated
    // venv), while `python -m pytest` reliably works wherever the interpreter has pytest installed.
    expect(stack.testCommand?.command).toBe("python");
    expect(stack.testCommand?.args).toEqual(["-m", "pytest", "-q"]);
  });

  it("reports no test command and a clear note when nothing is detectable", () => {
    const dir = mkdtempSync(join(tmpdir(), "codesage-test-stack-none-"));
    dirs.push(dir);
    const stack = detectStack(dir, []);
    expect(stack.kinds).toEqual(["unknown"]);
    expect(stack.testCommand).toBeNull();
    expect(stack.notes.length).toBeGreaterThan(0);
  });

  it("rebindTestCommand re-targets cwd without mutating the original command object", () => {
    const original = { type: "npm" as const, command: "npm", args: ["test"], cwd: "/original", source: "x" };
    const rebound = rebindTestCommand(original, "/workspace-copy");
    expect(rebound.cwd).toBe("/workspace-copy");
    expect(original.cwd).toBe("/original");
  });
});
