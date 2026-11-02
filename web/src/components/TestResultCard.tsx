import { useState } from "react";
import type { TestRunResult } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function TestResultCard({ label, result }: { label: string; result: TestRunResult | null }) {
  const [showOutput, setShowOutput] = useState(false);

  if (!result) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 dark:border-transparent">
        <h4 className="text-sm font-semibold">{label}</h4>
        <p className="mt-1 text-sm text-muted-foreground">Not run.</p>
      </div>
    );
  }

  const passing = result.ran && result.exitCode === 0;
  return (
    <div className="rounded-lg border border-border bg-card p-4 dark:border-transparent">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{label}</h4>
        <Badge variant={passing ? "success" : "destructive"}>exit {result.exitCode ?? "n/a"}</Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground font-mono break-all">{result.command}</p>
      <p className="mt-2 text-sm">
        {result.passed ?? "?"} passed / {result.failed ?? "?"} failed
        {result.timedOut ? " (timed out)" : ""} &middot; {result.durationMs}ms
      </p>
      {result.summaryLine && <p className="mt-1 text-xs text-muted-foreground">{result.summaryLine}</p>}
      <Button type="button" variant="link" size="sm" className="mt-2 h-auto p-0" onClick={() => setShowOutput((v) => !v)}>
        {showOutput ? "Hide raw output" : "Show raw output"}
      </Button>
      {showOutput && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-background p-2 text-[11px] leading-4 whitespace-pre-wrap">
          {(result.stdout + "\n" + result.stderr).trim() || "(no output captured)"}
        </pre>
      )}
    </div>
  );
}
