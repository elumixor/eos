import { api, type Project } from "$lib/api";

class ProjectsStore {
  list = $state<Project[]>([]);
  filterId = $state<string | null>(null);
  showHidden = $state(false);
  // Bumped whenever an in-task pill tap requests a scroll. FilterBar's
  // $effect keys off this so chip-row toggles never yank the bar.
  scrollRequestTick = $state(0);
  // What `filterId` was before a task-pill tap activated the current filter.
  // Re-tapping the same in-task pill restores it ("peek and pop"). Only set
  // via `setFilterFromTask`; the chip-row `toggleFilter` keeps plain toggle
  // semantics so the existing FilterBar UX doesn't change. Intentionally
  // non-reactive — never rendered, only read inside the setter branch.
  private previousFilterId: string | null = null;

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
    // Reconcile filter pointers against the freshly-loaded list: another
    // session may have deleted a project that we still reference, leaving a
    // dangling id that would let `setFilterFromTask`'s pop restore a ghost
    // filter (matches nothing, can't be cleared via the chip row).
    const ids = new Set(this.list.map((p) => p.id));
    if (this.filterId && !ids.has(this.filterId)) this.filterId = null;
    if (this.previousFilterId && !ids.has(this.previousFilterId)) this.previousFilterId = null;
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
    if (this.previousFilterId === id) this.previousFilterId = null;
  }

  toggleFilter(id: string) {
    this.previousFilterId = null;
    this.filterId = this.filterId === id ? null : id;
  }

  // Called when a `@project` pill inside a task is tapped. Switches the
  // active filter to that project while remembering the prior filter so a
  // second tap on the same in-task pill pops back. If the same pill is
  // tapped again but no prior filter exists to pop to (e.g., the user
  // activated the filter from the chip row first), leave state alone — the
  // user's gesture is "focus this" not "drop the filter" — and just
  // re-request the scroll. If the targeted project is hidden, also reveal
  // the hidden chips so the active chip + Clear button remain reachable.
  // The reveal is intentionally sticky; a later `clearFilter()` doesn't
  // re-hide, because the user just exposed those projects deliberately.
  setFilterFromTask(id: string) {
    if (this.filterId === id) {
      if (this.previousFilterId !== null) {
        const restored = this.previousFilterId;
        this.previousFilterId = null;
        this.filterId = restored;
      }
    } else {
      this.previousFilterId = this.filterId;
      this.filterId = id;
      const target = this.byId(id);
      if (target?.hidden) this.showHidden = true;
    }
    this.scrollRequestTick++;
  }

  clearFilter() {
    this.previousFilterId = null;
    this.filterId = null;
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
