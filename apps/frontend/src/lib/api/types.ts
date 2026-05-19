import type { api } from "./client";

export type Task = (typeof api.tasks.$get.$response)[number];
export type Project = (typeof api.projects.$get.$response)[number];
export type Section = (typeof api.sections.$get.$response)[number];
