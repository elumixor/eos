import { api, type Project } from "$lib/api";

class ProjectsStore {
  list = $state<Project[]>([]);
  filterId = $state<string | null>(null);
  showHidden = $state(false);

  get visible(): Project[] {
    return this.list.filter((p) => !p.hidden);
  }

  get hiddenList(): Project[] {
    return this.list.filter((p) => p.hidden);
  }

  get filter(): Project | undefined {
    return this.list.find((p) => p.id === this.filterId);
  }

  async load() {
    this.list = await api.projects.$get();
  }

  byId(id: string | null | undefined): Project | undefined {
    return id ? this.list.find((p) => p.id === id) : undefined;
  }

  byName(name: string): Project | undefined {
    const n = name.trim().toLowerCase();
    return this.list.find((p) => p.name.toLowerCase() === n);
  }

  async create(name: string): Promise<Project> {
    const existing = this.byName(name);
    if (existing) return existing;
    const created = await api.projects.$post({ name: name.trim() });
    this.list = [...this.list, created];
    return created;
  }

  async update(
    id: string,
    patch: {
      name?: string;
      avatarType?: "auto" | "emoji" | "image";
      emoji?: string | null;
      image?: string | null;
      hue?: number | null;
      hidden?: boolean;
      capitalization?: "sentence" | "lower" | "capitalized" | "upper";
      parentIds?: string[];
    },
  ): Promise<Project> {
    const updated = await api.projects(id).$patch(patch);
    this.list = this.list.map((p) => (p.id === id ? updated : p));
    return updated;
  }

  async remove(id: string) {
    await api.projects(id).$delete();
    this.list = this.list.filter((p) => p.id !== id);
    if (this.filterId === id) this.filterId = null;
  }

  toggleFilter(id: string) {
    this.filterId = this.filterId === id ? null : id;
  }

  // Apply a new ordering by id. Optimistically reorders the in-memory list
  // and persists `order` values to the backend. The server is the source of
  // truth on the next load.
  async reorder(ids: string[]) {
    const byId = new Map(this.list.map((p) => [p.id, p]));
    const reordered = ids.map((id, i) => {
      const p = byId.get(id);
      return p ? ({ ...p, order: i } as Project) : null;
    }).filter((p): p is Project => !!p);
    // Append any items missing from `ids` (defensive — shouldn't happen).
    for (const p of this.list) if (!ids.includes(p.id)) reordered.push(p);
    this.list = reordered;
    await api.projects.reorder.$post({
      items: ids.map((id, order) => ({ id, order })),
    });
  }

  // Resolved parent projects of `id`, in stored order (undefined entries
  // dropped). Used for the "parents shown below the name" UX.
  parentsOf(id: string | null | undefined): Project[] {
    const p = this.byId(id);
    if (!p) return [];
    return p.parentIds.map((pid) => this.byId(pid)).filter((x): x is Project => !!x);
  }

  // Every id reachable downward (children, grandchildren, …), including `id`.
  // Used for filtering (parent's filter sweeps in all descendants) and for
  // cycle prevention (forbid choosing self or any descendant as a parent).
  descendantIds(id: string): Set<string> {
    const out = new Set<string>([id]);
    let added = true;
    while (added) {
      added = false;
      for (const p of this.list) {
        if (out.has(p.id)) continue;
        if (p.parentIds.some((pid) => out.has(pid))) {
          out.add(p.id);
          added = true;
        }
      }
    }
    return out;
  }
}

export const projects = new ProjectsStore();
