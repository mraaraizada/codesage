// Isolated workspace creation. CodeSage NEVER mutates the user's original repo: every patch
// attempt and every test run happens against a filesystem copy in the OS temp directory, with a
// fresh, local git repo used purely as a reliable diff/apply engine.
//
// Honesty note on isolation limits (see docs/ARCHITECTURE.md "Sandboxing limits"): this is a
// plain directory copy plus `git init`, not a container or VM. It isolates the FILESYSTEM (the
// original repo is never touched) but it does NOT isolate network access, environment variables,
// or OS-level resources. Test subprocesses run with the same network/OS privileges as CodeSage
// itself. A timeout bounds run time; it is not a network or syscall sandbox.
import { mkdtempSync, cpSync, rmSync, existsSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";

export interface IsolatedWorkspace {
  dir: string;
  cleanup: () => void;
}

export function createIsolatedWorkspace(sourceRoot: string, opts: { keep?: boolean } = {}): IsolatedWorkspace {
  const dir = mkdtempSync(join(tmpdir(), "codesage-ws-"));

  cpSync(sourceRoot, dir, {
    recursive: true,
    filter: (src: string) => basename(src) !== ".git",
  });

  // node_modules is copied onto disk (so tests can run without a network-dependent reinstall)
  // but deliberately kept OUT of git tracking: otherwise a test run between the baseline commit
  // and the patch (e.g. a Vitest/Jest cache file written under node_modules) would show up in
  // `git diff --name-only` right alongside the real source-file patch, making "changed files"
  // reporting misleading. Dependencies are never something CodeSage patches.
  appendFileSync(join(dir, ".gitignore"), "\nnode_modules/\n");

  try {
    execFileSync("git", ["init", "-q"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "codesage@local.test"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "CodeSage"], { cwd: dir, stdio: "pipe" });
    // Force deterministic, byte-exact line endings regardless of the user's global git config
    // (Windows machines commonly default core.autocrlf=true, which would silently rewrite LF to
    // CRLF on `git apply`/checkout and make patch application non-deterministic).
    execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["config", "core.safecrlf", "false"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["commit", "-q", "-m", "codesage: baseline snapshot"], { cwd: dir, stdio: "pipe" });
  } catch (err) {
    throw new Error(`Failed to initialize isolated git workspace at ${dir}: ${(err as Error).message}`);
  }

  return {
    dir,
    cleanup: () => {
      if (opts.keep) return;
      if (!existsSync(dir)) return;
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup; leaving a temp dir behind is not fatal
      }
    },
  };
}

export function workspaceDiff(workspaceDir: string): string {
  try {
    return execFileSync("git", ["diff", "--no-color"], { cwd: workspaceDir, encoding: "utf8" });
  } catch (err) {
    return `(failed to compute workspace diff: ${(err as Error).message})`;
  }
}
