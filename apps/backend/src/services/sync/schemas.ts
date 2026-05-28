import { z } from "zod";

export const BUCKETS = ["today", "week", "later"] as const;
const CAPS = ["sentence", "lower", "capitalized", "upper"] as const;
const AVATARS = ["auto", "emoji", "image"] as const;

export const TaskCreate = z.object({
  kind: z.literal("task.create"),
  id: z.string().min(1),
  text: z.string(),
  completed: z.boolean().optional(),
  order: z.number().optional(),
  bucket: z.enum(BUCKETS).optional(),
  scheduledAt: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
});

export const TaskUpdate = z.object({
  kind: z.literal("task.update"),
  id: z.string().min(1),
  clientUpdatedAt: z.string(),
  patch: z.object({
    text: z.string().optional(),
    completed: z.boolean().optional(),
    order: z.number().optional(),
    bucket: z.enum(BUCKETS).optional(),
    scheduledAt: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    startTime: z.string().nullable().optional(),
    duration: z.number().nullable().optional(),
  }),
});

export const TaskDelete = z.object({
  kind: z.literal("task.delete"),
  id: z.string().min(1),
  clientUpdatedAt: z.string(),
});

export const TaskRestore = z.object({ kind: z.literal("task.restore"), id: z.string().min(1) });

export const TaskReorder = z.object({
  kind: z.literal("task.reorder"),
  items: z.array(z.object({ id: z.string().min(1), order: z.number(), bucket: z.enum(BUCKETS) })),
});

export const ProjectCreate = z.object({
  kind: z.literal("project.create"),
  id: z.string().min(1),
  name: z.string().min(1),
  avatarType: z.enum(AVATARS).optional(),
  emoji: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  hue: z.number().int().min(0).max(360).nullable().optional(),
  hidden: z.boolean().optional(),
  capitalization: z.enum(CAPS).optional(),
  order: z.number().optional(),
  parentIds: z.array(z.string()).optional(),
});

export const ProjectUpdate = z.object({
  kind: z.literal("project.update"),
  id: z.string().min(1),
  clientUpdatedAt: z.string(),
  patch: z.object({
    name: z.string().min(1).optional(),
    avatarType: z.enum(AVATARS).optional(),
    emoji: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
    hue: z.number().int().min(0).max(360).nullable().optional(),
    hidden: z.boolean().optional(),
    capitalization: z.enum(CAPS).optional(),
    order: z.number().optional(),
    parentIds: z.array(z.string()).optional(),
  }),
});

export const ProjectDelete = z.object({
  kind: z.literal("project.delete"),
  id: z.string().min(1),
  clientUpdatedAt: z.string(),
});

export const Op = z.union([
  TaskCreate,
  TaskUpdate,
  TaskDelete,
  TaskRestore,
  TaskReorder,
  ProjectCreate,
  ProjectUpdate,
  ProjectDelete,
]);
export type OpInput = z.infer<typeof Op>;
export type OpResult = { ok: true } | { ok: false; reason: "conflict" | "not_found" | "error"; detail?: string };
