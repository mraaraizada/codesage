// A real syntax-highlighted code/diff viewer (Prism via prism-react-renderer) in place of the
// earlier regex-based heuristic colorizer. The theme maps Prism token types onto this project's
// own CSS variables (not a canned Prism theme), so highlighted code stays on the same token
// system as everything else and follows light/dark automatically.
import { Highlight, type PrismTheme } from "prism-react-renderer";
import { cn } from "@/lib/utils";

const codeTheme: PrismTheme = {
  plain: { color: "var(--foreground)", backgroundColor: "transparent" },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "var(--muted-foreground)", fontStyle: "italic" } },
    { types: ["keyword", "operator", "builtin"], style: { color: "var(--brand)" } },
    { types: ["string", "char", "attr-value"], style: { color: "var(--success)" } },
    { types: ["function", "class-name", "tag"], style: { color: "var(--brand)" } },
    { types: ["number", "boolean", "constant"], style: { color: "var(--brand)" } },
    { types: ["punctuation"], style: { color: "var(--muted-foreground)" } },
    { types: ["attr-name", "property"], style: { color: "var(--foreground)" } },
    { types: ["deleted"], style: { color: "var(--destructive)" } },
    { types: ["inserted"], style: { color: "var(--success)" } },
  ],
};

/** The same real Prism highlighting as CodeBlock, plus a real line-number gutter — used by the
 * full-page VS Code-style code viewer's editor pane, where a gutter is expected chrome. */
export function CodeBlockWithGutter({
  code,
  language = "tsx",
  className,
  highlightLine,
}: {
  code: string;
  language?: string;
  className?: string;
  highlightLine?: number;
}) {
  return (
    <Highlight theme={codeTheme} code={code} language={language}>
      {({ className: prismClassName, style, tokens, getLineProps, getTokenProps }) => (
        <div className={cn("flex font-mono text-xs leading-5", prismClassName, className)} style={style}>
          <div className="select-none border-r border-border/60 bg-black/[0.03] px-3 py-3 text-right text-muted-foreground/70 dark:bg-white/[0.03]" aria-hidden="true">
            {tokens.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <pre className="min-w-0 flex-1 overflow-x-auto py-3 pl-4">
            {tokens.map((line, i) => {
              const { className: lineClassName, ...lineProps } = getLineProps({ line });
              return (
                <div key={i} className={cn(lineClassName, highlightLine === i + 1 && "bg-brand/10")} {...lineProps}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              );
            })}
          </pre>
        </div>
      )}
    </Highlight>
  );
}

export function CodeBlock({ code, language = "tsx", className }: { code: string; language?: string; className?: string }) {
  return (
    <Highlight theme={codeTheme} code={code} language={language}>
      {({ className: prismClassName, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={cn("overflow-x-auto font-mono text-xs leading-5", prismClassName, className)} style={style}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}

/** Unified-diff-aware rendering: whole added/removed lines get a tinted background (the quickest
 * visual read for a diff) on top of real per-token syntax highlighting within each line. */
export function DiffBlock({ diffText, className }: { diffText: string; className?: string }) {
  if (!diffText.trim()) {
    return <p className="text-sm text-muted-foreground">No diff was produced.</p>;
  }
  return (
    <Highlight theme={codeTheme} code={diffText} language="diff">
      {({ className: prismClassName, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={cn("overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-xs leading-5", prismClassName, className)} style={style}>
          {tokens.map((line, i) => {
            const types = new Set(line.flatMap((t) => t.types));
            const isAdded = types.has("inserted");
            const isRemoved = types.has("deleted");
            const isHunk = types.has("coord") || line[0]?.content?.startsWith("@@");
            const { className: lineClassName, ...lineProps } = getLineProps({ line });
            return (
              <div
                key={i}
                className={cn(lineClassName, "px-1", isAdded && "bg-success/10", isRemoved && "bg-destructive/10", isHunk && "text-brand")}
                {...lineProps}
              >
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            );
          })}
        </pre>
      )}
    </Highlight>
  );
}
