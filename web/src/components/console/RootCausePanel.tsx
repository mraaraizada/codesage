import type { InvestigationResult } from "../../types";
import { CodeBlock } from "@/components/ui/code-block";
import { prismLanguageForPath } from "@/lib/prismLanguage";

export function RootCausePanel({ investigation }: { investigation: InvestigationResult }) {
  return (
    <div className="border-b border-border px-6 py-6">
      <h3 className="text-sm font-semibold">Root cause</h3>
      <p className="mt-1 text-sm">{investigation.rootCause}</p>
      <p className="mt-1 text-sm text-muted-foreground">{investigation.explanation}</p>

      {investigation.evidence.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Evidence ({investigation.evidence.length})</div>
          {investigation.evidence.map((e, i) => (
            <div key={i} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-b border-border bg-muted/30 px-3 py-1.5">
                <span className="text-xs font-bold">
                  {i + 1}. <span className="font-mono text-brand">{e.relPath}:{e.line}</span>
                </span>
              </div>
              <div className="px-3 py-2">
                <CodeBlock code={e.snippet} language={prismLanguageForPath(e.relPath)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
