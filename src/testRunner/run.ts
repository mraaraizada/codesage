// Real test execution via child_process, with a hard timeout and real stdout/stderr/exit-code
// capture. Pass/fail counts are parsed from real tool output (Jest/Vitest/pytest summary lines);
// when parsing fails we report null counts rather than guessing.
import { spawn, execFileSync } from "node:child_process";
import type { TestCommand, TestRunResult } from "../types.js";

// On Windows, when shell:true is used (required to resolve .cmd shims like npm/yarn/pnpm), the
// process Node actually spawns is cmd.exe, with the real test runner as a grandchild. Calling
// child.kill() only terminates cmd.exe, leaving the real (possibly hung) process running and the
// "close" event never firing. taskkill's /T flag kills the whole process tree, which is the
// standard fix for this well-known Node-on-Windows limitation.
function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    } catch {
      // process may have already exited between the timeout firing and taskkill running
    }
  } else {
    try {
      process.kill(-pid, "SIGKILL"); // negative pid targets the whole process group (requires detached:true)
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // already exited
      }
    }
  }
}

// Test runners (Vitest/Jest/pytest) colorize their terminal output with ANSI SGR escape codes,
// often interleaved mid-word (e.g. "\x1b[31m1\x1b[39m failed"). Strip them before both count
// parsing and before the output is shown in the Markdown report / web UI, where raw escape codes
// would otherwise render as garbage.
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

export function parseCounts(output: string): { passed: number | null; failed: number | null; summaryLine: string | null } {
  // Jest / Vitest: "Tests:       3 failed, 7 passed, 10 total"
  const jestLike = output.match(/Tests:\s*(?:(\d+)\s*failed,?\s*)?(?:(\d+)\s*passed,?\s*)?(?:(\d+)\s*skipped,?\s*)?\d+\s*total/i);
  if (jestLike) {
    const failed = jestLike[1] ? parseInt(jestLike[1], 10) : 0;
    const passed = jestLike[2] ? parseInt(jestLike[2], 10) : 0;
    return { passed, failed, summaryLine: jestLike[0].trim() };
  }

  // Vitest alt format: " ✓ 7 passed" / " ✗ 3 failed" lines, or "Test Files  1 failed (1)"
  const vitestSummary = output.match(/Tests\s+(\d+)\s+failed(?:\s*\|\s*(\d+)\s+passed)?/i);
  if (vitestSummary) {
    const failed = parseInt(vitestSummary[1], 10);
    const passed = vitestSummary[2] ? parseInt(vitestSummary[2], 10) : 0;
    return { passed, failed, summaryLine: vitestSummary[0].trim() };
  }
  const vitestAllPassed = output.match(/Tests\s+(\d+)\s+passed/i);
  if (vitestAllPassed) {
    return { passed: parseInt(vitestAllPassed[1], 10), failed: 0, summaryLine: vitestAllPassed[0].trim() };
  }

  // pytest: the final summary line always ends in "in <seconds>s" but the counts before it can
  // appear in either order ("3 passed, 1 failed in 0.4s" or "1 failed, 3 passed in 0.4s"), so each
  // count is matched independently within that line rather than assuming a fixed sequence.
  const pytestLine = output.match(/^.*\bin\s[\d.]+s\b.*$/m);
  if (pytestLine) {
    const line = pytestLine[0];
    const passedM = line.match(/(\d+)\s*passed/);
    const failedM = line.match(/(\d+)\s*failed/);
    const errorM = line.match(/(\d+)\s*error/);
    if (passedM || failedM || errorM) {
      const passed = passedM ? parseInt(passedM[1], 10) : 0;
      const failed = (failedM ? parseInt(failedM[1], 10) : 0) + (errorM ? parseInt(errorM[1], 10) : 0);
      return { passed, failed, summaryLine: line.trim() };
    }
  }

  return { passed: null, failed: null, summaryLine: null };
}

export function runTests(cmd: TestCommand, timeoutMs: number): Promise<TestRunResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const isWin = process.platform === "win32";
    // When shell:true on Windows, the command line is handed to cmd.exe verbatim — Node does NOT
    // quote the command for you the way it does for direct (non-shell) spawns. A command path
    // containing a space (e.g. "C:\Program Files\nodejs\node.exe") would otherwise be split into
    // two tokens by cmd.exe and fail to launch at all.
    const command = isWin && cmd.command.includes(" ") && !cmd.command.startsWith('"') ? `"${cmd.command}"` : cmd.command;
    const child = spawn(command, cmd.args, {
      cwd: cmd.cwd,
      windowsHide: true,
      shell: isWin,
      detached: !isWin,
      env: { ...process.env, CI: "true" },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killProcessTree(child.pid);
    }, timeoutMs);

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ran: false,
        command: `${cmd.command} ${cmd.args.join(" ")}`,
        exitCode: null,
        timedOut: false,
        durationMs: Date.now() - start,
        stdout,
        stderr: `${stderr}\n${err.message}`.trim(),
        passed: null,
        failed: null,
        summaryLine: null,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const cleanStdout = stripAnsi(stdout);
      const cleanStderr = stripAnsi(stderr);
      const counts = parseCounts(cleanStdout + "\n" + cleanStderr);
      resolve({
        ran: true,
        command: `${cmd.command} ${cmd.args.join(" ")}`,
        exitCode: code,
        timedOut,
        durationMs: Date.now() - start,
        stdout: cleanStdout,
        stderr: cleanStderr,
        passed: counts.passed,
        failed: counts.failed,
        summaryLine: counts.summaryLine,
      });
    });
  });
}
