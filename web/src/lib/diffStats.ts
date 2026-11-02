export interface FileDiffStat {
  path: string;
  changeType: "A" | "M" | "D";
  added: number;
  removed: number;
  /** This file's own slice of the unified diff (its `---`/`+++` headers plus hunks), so the UI
   * can show the real diff for one file on demand instead of only the summarized counts. */
  segment: string;
}

/** Parses a unified diff client-side into real per-file added/removed line counts and each
 * file's own diff segment — the same bytes the server applied via `git apply`, summarized for
 * the "Effects" panel's grouped file list, with the real diff still available per file. */
export function parseDiffStats(diffText: string): FileDiffStat[] {
  if (!diffText.trim()) return [];
  const stats: FileDiffStat[] = [];
  let current: FileDiffStat | null = null;
  let segmentLines: string[] = [];
  let oldPath = "";
  let oldHeaderLine = "";

  const flush = () => {
    if (current) {
      current.segment = segmentLines.join("\n");
      stats.push(current);
    }
    current = null;
    segmentLines = [];
  };

  for (const line of diffText.split("\n")) {
    if (line.startsWith("--- ")) {
      flush();
      oldPath = line.slice(4).trim().replace(/\t.*$/, "");
      oldHeaderLine = line;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const newPath = line.slice(4).trim().replace(/\t.*$/, "");
      const isAdded = oldPath === "/dev/null";
      const isDeleted = newPath === "/dev/null";
      const rawPath = (isDeleted ? oldPath : newPath).replace(/^[ab]\//, "");
      current = { path: rawPath, changeType: isDeleted ? "D" : isAdded ? "A" : "M", added: 0, removed: 0, segment: "" };
      segmentLines = [oldHeaderLine, line];
      continue;
    }
    if (!current) continue;
    segmentLines.push(line);
    if (line.startsWith("+")) current.added++;
    else if (line.startsWith("-")) current.removed++;
  }
  flush();
  return stats;
}

export function totalStats(stats: FileDiffStat[]): { added: number; removed: number } {
  return stats.reduce((acc, s) => ({ added: acc.added + s.added, removed: acc.removed + s.removed }), { added: 0, removed: 0 });
}
