import type { Project } from "$lib/api";
import { newId } from "$lib/db/id";
import { del, getAll, put, putMany } from "$lib/db/idb";
import { enqueue } from "$lib/db/outbox";
import { onPulled, sync } from "$lib/sync.svelte";

// Offline-first projects store. Hydrates from IndexedDB on construction so
// the UI renders instantly with cached rows, then `boot()` kicks off a sync
// pull to reconcile with the server. Every mutation is applied optimistically
// to the in-memory list + IDB, then enqueued in the outbox for the sync
// runner to push.

class ProjectsStore {
  list = $state<Project[]>([]);
  filterId = $state<string | null>(null);
  showHidden = $state(false);
  scrollRequestTick = $state(0);
  private previousFilterId: string | null = null;
  private booted = false;

  get visible(): Project[] {
    return this.list.filter((p) => !p.hidden);
  }
  get hiddenList(): Project[] {
    return this.list.filter((p) => p.hidden);
  }
  get filter(): Project | undefined {
    return this.list.find((p) => p.id === this.filterId);
  }

  async boot() {
    if (this.booted) return;
    this.booted = true;
    // Hydrate from IDB synchronously (well, one async tick). UI can render
    // these rows immediately — no network gate.
    const cached = await getAll<Project>("projects");
    this.list = cached.filter((p) => !(p as Project & { deletedAt?: string | null }).deletedAt).sort(byOrder);
    // Subscribe to sync deltas — apply server changes into the live list.
    onPulled(({ projects }) => {
      if (!projects.length) return;
      const map = new Map(this.list.map((p) => [p.id, p]));
      for (const p of projects) {
        if ((p as Project & { deletedAt?: string | null }).deletedAt) map.delete(p.id);
        else map.set(p.id, p);
      }
      this.list = Array.from(map.values()).sort(byOrder);
      this.reconcileFilters();
    });
    sync.schedule(0);
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
    const id = newId();
    const now = new Date().toISOString();
    const created = {
      id,
      userId: "", // server fills; not used client-side
      name: name.trim(),
      avatarType: "auto",
      emoji: null,
      image: null,
      hue: null,
      hidden: false,
      capitalization: "sentence",
      order: (this.list.at(-1)?.order ?? -1) + 1,
      parentIds: [],
      createdAt: now,
      updatedAt: now,
    } as unknown as Project;
    this.list = [...this.list, created];
    await put("projects", created);
    await enqueue({
      kind: "project.create",
      id,
      name: created.name,
      order: created.order,
    });
    sync.schedule(0);
    return created;
  }

  async update(id: string, patch: Partial<Project>): Promise<Project | undefined> {
    const cur = this.byId(id);
    if (!cur) return undefined;
    const now = new Date().toISOString();
    const updated = { ...cur, ...patch, updatedAt: now } as Project;
    this.list = this.list.map((p) => (p.id === id ? updated : p));
    await put("projects", updated);
    await enqueue({
      kind: "project.update",
      id,
      clientUpdatedAt: cur.updatedAt as unknown as string,
      patch: patch as never,
    });
    sync.schedule(0);
    return updated;
  }

  async remove(id: string) {
    const cur = this.byId(id);
    if (!cur) return;
    this.list = this.list.filter((p) => p.id !== id);
    if (this.filterId === id) this.filterId = null;
    if (this.previousFilterId === id) this.previousFilterId = null;
    await del("projects", id);
    await enqueue({
      kind: "project.delete",
      id,
      clientUpdatedAt: cur.updatedAt as unknown as string,
    });
    sync.schedule(0);
  }

  toggleFilter(id: string) {
    this.previousFilterId = null;
    this.filterId = this.filterId === id ? null : id;
  }

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

  async reorder(ids: string[]) {
    const byId = new Map(this.list.map((p) => [p.id, p]));
    const reordered: Project[] = [];
    const now = new Date().toISOString();
    for (let i = 0; i < ids.length; i++) {
      const p = byId.get(ids[i]);
      if (p) reordered.push({ ...p, order: i, updatedAt: now } as Project);
    }
    for (const p of this.list) if (!ids.includes(p.id)) reordered.push(p);
    this.list = reordered;
    await putMany("projects", reordered);
    for (const p of reordered) {
      await enqueue({
        kind: "project.update",
        id: p.id,
        clientUpdatedAt: now,
        patch: { order: p.order },
      });
    }
    sync.schedule(0);
  }

  parentsOf(id: string | null | undefined): Project[] {
    const p = this.byId(id);
    if (!p) return [];
    return p.parentIds.map((pid) => this.byId(pid)).filter((x): x is Project => !!x);
  }

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

  private reconcileFilters() {
    const ids = new Set(this.list.map((p) => p.id));
    if (this.filterId && !ids.has(this.filterId)) this.filterId = null;
    if (this.previousFilterId && !ids.has(this.previousFilterId)) this.previousFilterId = null;
  }
}

function byOrder(a: { order: number }, b: { order: number }) {
  return a.order - b.order;
}

export const projects = new ProjectsStore();
