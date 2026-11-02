// Dependency installation inside the isolated workspace. Honesty note: installing dependencies
// requires real network access (npm registry / PyPI) unless they were already vendored in the
// source repo's node_modules and got copied into the workspace. CodeSage does NOT fake this step
// — if install fails (e.g. offline), the caller is told plainly and the test run is marked
// "no-tests-detected" / failed rather than invented.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import type { StackInfo } from "../types.js";

export interface InstallResult {
  attempted: boolean;
  skippedReason: string | null;
  ok: boolean;
  output: string;
}

export function ensureDependenciesInstalled(workspaceDir: string, stack: StackInfo, timeoutMs: number): Promise<InstallResult> {
  return new Promise((resolve) => {
    if (stack.kinds.includes("node")) {
      const nodeModules = join(workspaceDir, "node_modules");
      if (existsSync(nodeModules)) {
        resolve({ attempted: false, skippedReason: "node_modules already present in workspace copy.", ok: true, output: "" });
        return;
      }
      const cmd = stack.packageManager === "yarn" ? "yarn" : stack.packageManager === "pnpm" ? "pnpm" : "npm";
      const args = cmd === "npm" ? ["install", "--no-audit", "--no-fund", "--silent"] : ["install"];
      const child = execFile(cmd, args, { cwd: workspaceDir, timeout: timeoutMs, windowsHide: true, shell: process.platform === "win32" }, (error, stdout, stderr) => {
        resolve({ attempted: true, skippedReason: null, ok: !error, output: `${stdout}\n${stderr}`.trim() });
      });
      void child;
      return;
    }
    if (stack.kinds.includes("python")) {
      const req = join(workspaceDir, "requirements.txt");
      if (!existsSync(req)) {
        resolve({ attempted: false, skippedReason: "No requirements.txt found; assuming environment already satisfies dependencies.", ok: true, output: "" });
        return;
      }
      const child = execFile("pip", ["install", "-r", "requirements.txt", "-q"], { cwd: workspaceDir, timeout: timeoutMs, windowsHide: true, shell: process.platform === "win32" }, (error, stdout, stderr) => {
        resolve({ attempted: true, skippedReason: null, ok: !error, output: `${stdout}\n${stderr}`.trim() });
      });
      void child;
      return;
    }
    resolve({ attempted: false, skippedReason: "Unknown stack; no install step defined.", ok: true, output: "" });
  });
}
