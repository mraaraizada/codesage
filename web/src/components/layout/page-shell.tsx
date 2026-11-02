// CodeSage's own top-level chrome (not a port): OpenBot's page-shell.tsx is wired to
// TanStack Router and a collapsible multi-channel sidebar, neither of which apply to a
// single-screen tool like CodeSage. This keeps the same visual language instead — a slim top
// bar using the sidebar tokens, the same bordered-card surfaces, and PageColumn/PageHeader below
// it — scaled down to what one page needs.
import type * as React from "react";

import { PageColumn, PageHeader } from "@/components/layout/page-parts";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-4">
        <div className="flex size-6 items-center justify-center rounded-md bg-brand text-brand-foreground text-xs font-bold">CS</div>
        <span className="text-sm font-semibold text-sidebar-foreground">CodeSage</span>
        <span className="text-xs text-muted-foreground">Understand. Investigate. Fix. Verify.</span>
        <ThemeToggle />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

export function PageShell({
  action,
  children,
  description,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  description?: React.ReactNode;
  title: string;
}) {
  return (
    <PageColumn>
      <PageHeader title={title} action={action} description={description} />
      {children}
    </PageColumn>
  );
}
