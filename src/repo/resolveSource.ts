// Resolves a user-supplied repo reference — a local filesystem path OR a GitHub (or any git) URL
// — into a local directory CodeSage can index. A URL triggers a real `git clone` (shallow, for
// speed) into a fresh temp directory.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const URL_PATTERN = /^(https?:\/\/|git@)/i;

export interface ResolvedSource {
  path: string;
  cloned: boolean;
  cleanup: () => void;
}

export function resolveRepoSource(input: string): ResolvedSource {
  if (!URL_PATTERN.test(input)) {
    const abs = input;
    if (!existsSync(abs)) {
      throw new Error(`Repo path does not exist: ${abs}`);
    }
    return { path: abs, cloned: false, cleanup: () => {} };
  }

  const dir = mkdtempSync(join(tmpdir(), "codesage-clone-"));
  try {
    execFileSync("git", ["clone", "--depth", "1", input, dir], { stdio: "pipe" });
  } catch (err) {
    const e = err as { stderr?: Buffer };
    throw new Error(`git clone failed for ${input}: ${e.stderr ? e.stderr.toString() : (err as Error).message}`);
  }
  return {
    path: dir,
    cloned: true,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}
