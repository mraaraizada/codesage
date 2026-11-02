// Styled to match OpenBot's components/ui/checkbox.tsx (MIT) but built on a native
// <input type="checkbox"> instead of the Base UI primitive, to avoid pulling in a whole
// additional UI-primitives library for one control.
import { IconCheck } from "@tabler/icons-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <span
      className={cn(
        "relative inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input shadow-xs transition-[background-color,border-color,box-shadow] duration-150 ease-out has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[:checked]:border-primary has-[:checked]:bg-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        className,
      )}
    >
      <input type="checkbox" data-slot="checkbox" className="peer absolute inset-0 m-0 size-full cursor-pointer appearance-none" {...props} />
      <IconCheck className="pointer-events-none size-3 text-primary-foreground opacity-0 peer-checked:opacity-100" />
    </span>
  );
}

export { Checkbox };
