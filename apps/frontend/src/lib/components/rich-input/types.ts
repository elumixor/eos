import type { Project } from "$lib/api";
import type { Place } from "$lib/placeSearch";
import type { Suggestion } from "$lib/tokens";

export type Item =
  | { kind: "project"; project: Project }
  | { kind: "create"; name: string }
  | { kind: "token"; sug: Suggestion }
  | { kind: "place"; place: Place }
  | { kind: "link"; url: string };
