import { pillElement } from "$lib/pillHtml";
import { projects } from "$lib/projects.svelte";
import type { Segment } from "$lib/tokens";
import type { Item } from "./types";

// Resolve a picker item into the pill HTML that should replace the typed
// "@query" in the editor.
export async function itemToPillHtml(item: Item): Promise<string> {
  if (item.kind === "project") {
    return pillElement({ kind: "project", id: item.project.id, project: item.project });
  }
  if (item.kind === "create") {
    const p = await projects.create(item.name);
    return pillElement({ kind: "project", id: p.id, project: p });
  }
  if (item.kind === "place") {
    return pillElement({ kind: "place", name: item.place.name, lat: item.place.lat, lng: item.place.lng });
  }
  if (item.kind === "link") {
    return pillElement({ kind: "link", url: item.url });
  }
  const t = item.sug.token;
  let seg: Segment;
  if (t.startsWith("@dur:")) seg = { kind: "dur", minutes: Number(t.slice(5)) };
  else {
    const v = t.slice(6);
    seg = { kind: "time", date: new Date(v), hasTime: v.includes("T") };
  }
  return pillElement(seg);
}
