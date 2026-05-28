import type { DisplayBucket } from "$lib/tokens";

export type SectionKey = DisplayBucket;

export const SECTION_ORDER: readonly SectionKey[] = ["overdue", "today", "week", "later"];

export const SECTION_TITLE: Record<SectionKey, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
};

export const HIDDEN_BUCKETS_KEY = "hiddenBuckets";

export type HiddenBuckets = Record<SectionKey, boolean>;

export const defaultHidden = (): HiddenBuckets => ({
  overdue: false,
  today: false,
  week: false,
  later: false,
});
