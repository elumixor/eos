import { env } from "env";
import { createError } from "h3";
import { trackEvent } from "services/analytics";
import { createJWT } from "services/auth";
import { mergeAnonymousUser } from "services/merge-anonymous";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

export default handler(
  { body: { idToken: z.string().min(1) } },
  async ({ user: caller, body: { idToken } }) => {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!res.ok) throw createError({ statusCode: 401, statusMessage: "Invalid Google token" });

    const data = (await res.json()) as { aud: string; email: string; name?: string; sub: string; exp: string };

    const allowedAudiences = [env.GOOGLE_CLIENT_ID, env.GOOGLE_IOS_CLIENT_ID].filter(Boolean);
    if (!allowedAudiences.includes(data.aud))
      throw createError({ statusCode: 401, statusMessage: "Token audience mismatch" });

    const anonymousId = caller && !caller.email ? caller.id : null;

    let user = await prisma.user.findUnique({ where: { email: data.email } });
    const wasNew = !user;

    if (!user) {
      if (anonymousId) {
        user = await prisma.user.update({
          where: { id: anonymousId },
          data: { email: data.email, name: data.name ?? null },
        });
      } else {
        user = await prisma.user.create({ data: { email: data.email, name: data.name ?? null } });
      }
    } else if (anonymousId && anonymousId !== user.id) {
      await mergeAnonymousUser(anonymousId, user.id);
    }

    trackEvent(wasNew ? "signup" : "signin", user.id, {
      provider: "google",
      mergedAnonymous: Boolean(anonymousId),
    });

    return { token: createJWT(user), anonymousId };
  },
);
