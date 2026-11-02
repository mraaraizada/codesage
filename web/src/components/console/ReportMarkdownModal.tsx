// A small real-content viewer for the generated report.md, opened from the "done" stage's log
// line (StageList.tsx) instead of leaving that line as inert text. Fetches the actual markdown
// from GET /api/jobs/:id/report.md (server/src/index.ts) — that route calls the same
// renderMarkdown(report) the server already wrote to disk at data.mdPath, so this is byte-for-byte
// the same real report content, not a re-fabricated summary. Deliberately plain (monospace text,
// no markdown-to-HTML rendering pulled in for this) per the brief: real and readable is enough.
import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";

export function ReportMarkdownModal({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jobs/${jobId}/report.md`)
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) throw new Error(text || `Failed to load report.md (${res.status}).`);
        return text;
      })
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="report.md"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <span className="font-mono text-sm font-semibold">report.md</span>
          <button type="button" onClick={onClose} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <IconX className="size-4" stroke={1.75} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : content === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <pre className="font-mono text-xs leading-5 whitespace-pre-wrap">{content}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
