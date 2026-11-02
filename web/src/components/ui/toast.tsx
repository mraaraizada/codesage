// A small, dependency-free toast stack (no Radix/sonner) in the same token system as the rest of
// the ported primitives. App.tsx owns the toast list (job lifecycle events); this file is purely
// presentational plus the id/auto-dismiss bookkeeping.
import { useCallback, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "destructive" | "brand";
}

const VARIANT_CLASSES: Record<NonNullable<ToastItem["variant"]>, string> = {
  default: "border-border bg-popover text-popover-foreground",
  success: "border-success/30 bg-popover text-popover-foreground [&_[data-slot=toast-title]]:text-success",
  destructive: "border-destructive/30 bg-popover text-popover-foreground [&_[data-slot=toast-title]]:text-destructive",
  brand: "border-brand/30 bg-popover text-popover-foreground [&_[data-slot=toast-title]]:text-brand",
};

export function useToasts(autoDismissMs = 5000) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, number>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      window.clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      timers.current[id] = window.setTimeout(() => dismiss(id), autoDismissMs);
      return id;
    },
    [autoDismissMs, dismiss],
  );

  return { toasts, push, dismiss };
}

export function Toaster({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto flex items-start gap-2 rounded-lg border p-3 text-sm shadow-lg animate-[toast-in_180ms_ease-out]",
            VARIANT_CLASSES[t.variant ?? "default"],
          )}
        >
          <div className="min-w-0 flex-1">
            <div data-slot="toast-title" className="font-medium">
              {t.title}
            </div>
            {t.description && <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>}
          </div>
          <button type="button" onClick={() => onDismiss(t.id)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Dismiss notification">
            <IconX className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
