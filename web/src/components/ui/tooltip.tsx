// A small, dependency-free tooltip — CSS-driven (no positioning library), shown on hover and on
// keyboard focus so it's reachable without a mouse. Not a port (OpenBot's own tooltip.tsx uses
// Base UI, which would pull in a whole extra primitives library for one component); same token
// system and the same shape the ported primitives use.
import type * as React from "react";
import { cn } from "@/lib/utils";

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className="group/tooltip relative inline-flex min-w-0">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-xs -translate-x-1/2 scale-95 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-md transition-[opacity,transform] duration-100 group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100 group-focus-within/tooltip:scale-100 group-focus-within/tooltip:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
