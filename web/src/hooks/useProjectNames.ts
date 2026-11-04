// A purely cosmetic, per-viewer override of a project's display name in the sidebar — keyed by the
// same normalized repo-path key projectGroups.ts already groups by. This never touches `repoPath`
// itself (the real path used to run an investigation); it only changes what label the sidebar shows
// for that group, so renaming "buggy-react-login" to "Login bug (client)" doesn't affect anything
// the pipeline actually does with the repo.
import { useState } from "react";

const STORAGE_KEY = "codesage-project-names-v1";

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function save(names: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {
    // best-effort only — a lost rename is not fatal
  }
}

export function useProjectNames() {
  const [names, setNames] = useState<Record<string, string>>(() => load());

  function rename(key: string, name: string) {
    const trimmed = name.trim();
    setNames((prev) => {
      const next = { ...prev };
      if (trimmed) next[key] = trimmed;
      else delete next[key]; // empty name clears the override, falling back to the real basename
      save(next);
      return next;
    });
  }

  return { names, rename };
}
