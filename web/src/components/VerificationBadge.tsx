import type { VerificationStatus } from "../types";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const VARIANTS: Record<VerificationStatus, BadgeVariant> = {
  "verified-fixed": "success",
  "tests-still-failing": "destructive",
  "patch-did-not-apply": "destructive",
  "no-tests-detected": "warning",
  "dry-run-no-llm": "brand",
  inconclusive: "warning",
};

const LABELS: Record<VerificationStatus, string> = {
  "verified-fixed": "Verified Fixed",
  "tests-still-failing": "Tests Still Failing",
  "patch-did-not-apply": "Patch Did Not Apply",
  "no-tests-detected": "No Tests Detected",
  "dry-run-no-llm": "Dry Run (No LLM Stage)",
  inconclusive: "Inconclusive",
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <Badge variant={VARIANTS[status]} className="text-[0.8rem]">
      <span className="size-1.5 rounded-full bg-current" />
      {LABELS[status]}
    </Badge>
  );
}
