import type { api } from "./client";

export type Task = (typeof api.tasks.$get.$response)[number];
export type Project = (typeof api.projects.$get.$response)[number];
export type Bucket = "today" | "week" | "later";
