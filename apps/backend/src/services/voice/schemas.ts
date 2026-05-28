import { z } from "zod";

export const actionSchema = z.object({
  op: z.enum(["create", "complete", "uncomplete", "edit", "delete"]),
  id: z.string().optional(),
  text: z.string().optional(),
  bucket: z.enum(["today", "week", "later"]).optional(),
});
export type Action = z.infer<typeof actionSchema>;

// Terminal tool — model calls it once at the very end. Reply text streams
// token-by-token because it's the first field, and by the time the model
// writes it, any apply() results from earlier steps are already in context.
export const recordSchema = z.object({
  reply: z
    .string()
    .describe(
      "Short one-sentence reply to the user in their language. Never empty. If the user asked you to show / list / find tasks, put their ids in taskRefs and keep the reply itself short (e.g. 'Here's your list:'). Do NOT enumerate tasks as numbered text — the UI renders taskRefs as proper task chips. If a previous apply() returned any failed results, SAY SO truthfully — do not claim success.",
    ),
  transcript: z.string().describe("Exact transcription of what the user said, in their language."),
  taskRefs: z
    .array(z.string())
    .optional()
    .describe(
      "Ids of existing tasks to show under the reply. Use whenever the user asked to see, list, find, or review tasks. Order matters. Cap at 30.",
    ),
});
export type RecordInput = z.infer<typeof recordSchema>;

export const applySchema = z.object({
  actions: z
    .array(actionSchema)
    .describe(
      "Operations to apply, in order. create: needs text. complete/uncomplete/delete: need an EXACT id string from a prior query() result. edit: needs id and (text and/or bucket).",
    ),
});

export const historySchema = z.array(z.object({ transcript: z.string(), message: z.string() }));
