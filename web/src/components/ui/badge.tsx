// CodeSage's own primitive (OpenBot's ui/ set has no badge.tsx) — written in the same cva +
// token-driven style as the ported primitives so it reads as part of the same system.
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors [&_svg]:pointer-events-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        success: "border-success/30 bg-success/10 text-success dark:bg-success/15",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/15",
        warning: "border-warning/30 bg-warning/10 text-warning dark:bg-warning/15",
        brand: "border-brand/30 bg-brand/10 text-brand dark:bg-brand/15",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
