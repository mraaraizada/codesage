// Ported from OpenBot's components/ui/field.tsx (MIT) — plain React already, no changes needed
// beyond trimming the parts (FieldSet/FieldLegend/FieldSeparator/FieldError) CodeSage's simple
// two-field form doesn't use.
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn("flex w-full flex-col gap-5", className)} {...props} />;
}

const fieldVariants = cva("group/field flex w-full gap-2 data-[invalid=true]:text-destructive", {
  variants: {
    orientation: {
      vertical: "flex-col *:w-full",
      horizontal: "flex-row items-center justify-between",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

function Field({ className, orientation = "vertical", ...props }: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return <div role="group" data-slot="field" data-orientation={orientation} className={cn(fieldVariants({ orientation }), className)} {...props} />;
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-left text-sm leading-normal font-normal text-muted-foreground [&>a]:underline [&>a]:underline-offset-4", className)}
      {...props}
    />
  );
}

export { Field, FieldDescription, FieldGroup, FieldLabel };
