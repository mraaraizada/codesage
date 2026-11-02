// Ported from OpenBot's components/layout/page-parts.tsx (MIT) — this file has no router
// dependency upstream either, so PageColumn/PageHeader/PageSection/PageRows/PageCard/PageEmpty
// come across with only cosmetic trims (OpenBot's internal design-rationale comments are
// summarized rather than reproduced verbatim).
import type * as React from "react";

import { cn } from "@/lib/utils";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** The centered reading column every CodeSage screen sits in — OpenBot's "prose" width. */
export function PageColumn({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn("mx-auto flex w-full max-w-3xl flex-col px-4 pt-12 pb-16", "[&>header+*]:mt-8", className)}>{children}</div>
    </div>
  );
}

/** The page's title, its one primary action, and an optional description. */
export function PageHeader({ action, description, title }: { action?: React.ReactNode; description?: React.ReactNode; title: string }) {
  return (
    <header className="flex flex-col gap-2" data-slot="page-header">
      <div className="flex flex-row items-center justify-between gap-4">
        <h1 className="font-bold text-2xl" data-slot="page-title">
          {title}
        </h1>
        {action}
      </div>
      {description ? <p className="max-w-prose text-pretty text-muted-foreground text-sm leading-relaxed">{description}</p> : null}
    </header>
  );
}

/** A titled group of content, spaced generously from whatever precedes it. */
export function PageSection({
  action,
  children,
  className,
  description,
  title,
}: {
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  title?: string;
}) {
  return (
    <section className={cn("mt-12", className)}>
      {title ? (
        <div className="flex min-h-8 flex-row items-center justify-between gap-4">
          <h2 className="font-bold text-lg">{title}</h2>
          {action}
        </div>
      ) : null}
      {description ? <p className="mt-1 max-w-prose text-pretty text-muted-foreground text-sm leading-relaxed">{description}</p> : null}
      {children}
    </section>
  );
}

/** The bordered card a list of <Item/> rows lives in, divided by <ItemSeparator/>. */
export function PageRows({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mt-4 overflow-hidden rounded-lg border border-border bg-card dark:border-transparent",
        "[&_[data-slot=item]]:rounded-none [&_[data-slot=item]]:min-h-14",
        "[&_[data-slot=separator][data-orientation=horizontal]]:mx-4 [&_[data-slot=separator][data-orientation=horizontal]]:w-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The bordered card a form or free-form content block sits in, padded rather than divided. */
export function PageCard({ children, className, footer }: { children: React.ReactNode; className?: string; footer?: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4 dark:border-transparent", className)}>
      {children}
      {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
    </div>
  );
}

/** What a section says when it has nothing to show yet. */
export function PageEmpty({
  action,
  children,
  icon: Icon,
  title,
}: {
  action?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
}) {
  return (
    <Empty className="mt-4 rounded-lg border border-border">
      <EmptyHeader>
        {Icon ? (
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
        ) : null}
        {title ? <EmptyTitle>{title}</EmptyTitle> : null}
        {children ? <EmptyDescription>{children}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <div className="flex w-full max-w-sm flex-col items-center gap-2.5">{action}</div> : null}
    </Empty>
  );
}
