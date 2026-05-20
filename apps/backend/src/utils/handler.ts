import { createHandler } from "@elumixor/nitro-client/server";
import type { SessionUser } from "services/auth";

export const handler = createHandler({
  user: (event) => event.context.user as SessionUser | null,
});
