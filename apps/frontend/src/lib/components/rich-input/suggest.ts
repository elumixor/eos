import type { Project } from "$lib/api";
import { isUrlLike, normalizeUrl, suggestTokens } from "$lib/tokens";
import type { Item } from "./types";

// Auto-rank: exact project → strong token → link → projects → places → tokens → create.
export function buildItems(args: { query: string; projects: Project[]; placeItems: Item[] }): Item[] {
  const { query, projects, placeItems } = args;
  const q = query.trim().toLowerCase();
  const list: Item[] = [];

  const matched = projects
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const as = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || a.name.localeCompare(b.name);
    });
  const exact = projects.find((p) => p.name.toLowerCase() === q);

  const tokens = suggestTokens(query).map((sug) => ({ kind: "token", sug }) as Item);
  const linkUrl = isUrlLike(query) ? normalizeUrl(query) : null;

  if (exact) list.push({ kind: "project", project: exact });
  const strong = tokens.filter((t) => t.kind === "token" && t.sug.score >= 9);
  list.push(...strong);
  if (linkUrl) list.push({ kind: "link", url: linkUrl });
  list.push(...matched.filter((p) => p !== exact).map((p) => ({ kind: "project", project: p }) as Item));
  list.push(...placeItems);
  list.push(...tokens.filter((t) => !strong.includes(t)));
  if (q && !exact) list.push({ kind: "create", name: query.trim() });

  return list;
}
