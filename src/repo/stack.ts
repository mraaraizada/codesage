// Real stack / test-command detection shared by the indexer, the CLI, and the server pipeline —
// written once here so every caller gets identical detection logic instead of re-implementing it.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { StackInfo, TestCommand } from "../types.js";

export function detectStack(root: string, relPaths: string[]): StackInfo {
  const kinds: string[] = [];
  const notes: string[] = [];
  let packageManager: string | null = null;
  let testCommand: TestCommand | null = null;
  let dependencies: string[] = [];
  let devDependencies: string[] = [];

  const pkgJsonPath = join(root, "package.json");
  if (existsSync(pkgJsonPath)) {
    kinds.push("node");
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      dependencies = Object.keys(pkg.dependencies ?? {});
      devDependencies = Object.keys(pkg.devDependencies ?? {});
      if (dependencies.includes("react") || devDependencies.includes("react")) kinds.push("react");
      if (existsSync(join(root, "pnpm-lock.yaml"))) packageManager = "pnpm";
      else if (existsSync(join(root, "yarn.lock"))) packageManager = "yarn";
      else packageManager = "npm";
      if (pkg.scripts && typeof pkg.scripts.test === "string" && pkg.scripts.test.trim() && !pkg.scripts.test.includes("no test specified")) {
        const runner = packageManager === "yarn" ? "yarn" : packageManager === "pnpm" ? "pnpm" : "npm";
        testCommand = {
          type: runner,
          command: runner,
          args: runner === "npm" ? ["test", "--silent"] : ["test"],
          cwd: root,
          source: `package.json scripts.test = "${pkg.scripts.test}"`,
        };
      } else {
        notes.push('package.json has no usable "test" script.');
      }
    } catch (err) {
      notes.push(`Failed to parse package.json: ${(err as Error).message}`);
    }
  }

  const hasPyProject = existsSync(join(root, "pyproject.toml"));
  const hasPytestIni = existsSync(join(root, "pytest.ini"));
  const hasSetupCfg = existsSync(join(root, "setup.cfg"));
  const hasRequirements = existsSync(join(root, "requirements.txt"));
  const hasPyFiles = relPaths.some((p) => p.endsWith(".py"));
  if (hasPyProject || hasPytestIni || hasSetupCfg || hasRequirements || hasPyFiles) {
    kinds.push("python");
    packageManager = packageManager ?? "pip";
    if (!testCommand) {
      testCommand = {
        type: "pytest",
        // Invoked as `python -m pytest`, not a bare `pytest` binary: a bare `pytest` executable is
        // only on PATH when pytest's own console-script entry point was installed into a location
        // PATH actually includes (e.g. an activated venv's Scripts/bin dir) — on a machine where
        // pytest was installed as a library dependency without that happening (common on Windows,
        // and whenever dependencies are installed into an isolated workspace copy rather than an
        // activated venv, which is exactly what this pipeline does), a bare `pytest` command fails
        // to spawn at all (ENOENT) in a few milliseconds — which silently looked like "0 tests, exit
        // code 1" before this fix, rather than the real pass/fail result. `python -m pytest` always
        // works as long as the interpreter that has pytest installed is the one on PATH.
        command: "python",
        args: ["-m", "pytest", "-q"],
        cwd: root,
        source: hasPytestIni ? "pytest.ini present" : hasPyProject ? "pyproject.toml present" : "python source files present",
      };
    }
  }

  if (kinds.length === 0) {
    kinds.push("unknown");
    notes.push("Could not confidently detect a project stack (no package.json / python project files found).");
  }

  return { kinds, packageManager, testCommand, dependencies, devDependencies, notes };
}

/** Re-resolve a previously-detected test command against a different working directory
 * (used when we move from the original repo to an isolated workspace copy). */
export function rebindTestCommand(cmd: TestCommand, newCwd: string): TestCommand {
  return { ...cmd, cwd: newCwd };
}
