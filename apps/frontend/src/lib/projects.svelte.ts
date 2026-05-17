import { api, type Project } from "$lib/api";

class ProjectsStore {
  list = $state<Project[]>([]);
  filterId = $state<string | null>(null);

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
}

export const projects = new ProjectsStore();
