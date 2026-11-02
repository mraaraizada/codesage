import type { JobState, PipelineEvent, PipelineStage } from "../types";

export interface StageGroup {
  key: string;
  label: string;
  initials: string;
  stages: PipelineStage[];
}

export const STAGE_GROUPS: StageGroup[] = [
  // "splitting" only ever appears on a multi-bug job (src/multiPipeline.ts); a single-bug job
  // simply never emits it, so this group stays "skipped" for every ordinary run.
  { key: "split", label: "Split bug report", initials: "SP", stages: ["splitting"] },
  { key: "index", label: "Index repository", initials: "IX", stages: ["indexing"] },
  { key: "search", label: "Search for evidence", initials: "SR", stages: ["searching"] },
  { key: "investigate", label: "Investigate root cause", initials: "IV", stages: ["investigating", "sub-bug-start", "sub-bug-done"] },
  { key: "test-before", label: "Baseline tests", initials: "TB", stages: ["creating-workspace", "testing-before"] },
  { key: "patch", label: "Propose patch", initials: "PT", stages: ["patching"] },
  { key: "apply-test", label: "Apply & re-test", initials: "AT", stages: ["applying-patch", "testing-after", "regression-testing"] },
  { key: "report", label: "Final report", initials: "RP", stages: ["reporting", "done"] },
];

export type GroupStatus = "pending" | "active" | "complete" | "failed" | "skipped";

export function eventsForGroup(group: StageGroup, events: PipelineEvent[]): PipelineEvent[] {
  return events.filter((e) => (group.stages as string[]).includes(e.stage));
}

/**
 * A group's status from the FULL event list, not from "did a later group get reached" — the
 * pipeline can legitimately skip straight from `searching` to `done` (dry-run, no API key, no
 * test command, a patch that fails to apply), so "any later stage happened" does not imply "every
 * earlier stage happened". Each group's own events are what decide whether it ran.
 */
export function groupStatus(group: StageGroup, allEvents: PipelineEvent[], allGroups: StageGroup[], jobStatus: JobState["status"] | undefined): GroupStatus {
  const hasEvents = eventsForGroup(group, allEvents).length > 0;

  if (!hasEvents) {
    return jobStatus === "running" || jobStatus === undefined ? "pending" : "skipped";
  }

  const reached = new Set(allEvents.map((e) => e.stage));
  let lastGroupIndexWithEvents = -1;
  allGroups.forEach((g, i) => {
    if (g.stages.some((s) => reached.has(s))) lastGroupIndexWithEvents = i;
  });
  const thisIndex = allGroups.findIndex((g) => g.key === group.key);
  const isLastTouched = thisIndex === lastGroupIndexWithEvents;

  if (jobStatus === "error" && isLastTouched) return "failed";
  if (jobStatus === "running" && isLastTouched) return "active";
  return "complete";
}
