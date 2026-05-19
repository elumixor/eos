import { api, type Section } from "$lib/api";

export type SectionSpec = {
  name: string;
  rangeKind: "calendar" | "relative" | "absolute";
  unit?: "day" | "week" | "month" | "year" | null;
  count?: number | null;
  offset?: number;
  startDate?: string | null;
  endDate?: string | null;
};

class SectionsStore {
  list = $state<Section[]>([]);

  async load() {
    this.list = await api.sections.$get();
  }

  byId(id: string | null | undefined): Section | undefined {
    return id ? this.list.find((s) => s.id === id) : undefined;
  }

  async create(spec: SectionSpec): Promise<Section> {
    const created = await api.sections.$post(spec);
    this.list = [...this.list, created];
    return created;
  }

  async update(id: string, patch: Partial<SectionSpec> & { collapsed?: boolean; order?: number }) {
    const updated = await api.sections(id).$patch(patch);
    this.list = this.list.map((s) => (s.id === id ? updated : s));
    return updated;
  }

  async remove(id: string) {
    await api.sections(id).$delete();
    this.list = this.list.filter((s) => s.id !== id);
  }

  async reorder(ordered: Section[]) {
    this.list = ordered;
    await api.sections.reorder.$post({
      items: ordered.map((s, i) => ({ id: s.id, order: i })),
    });
  }
}

export const sections = new SectionsStore();
