import { createPublicKey, createVerify } from "node:crypto";
import { env } from "env";
import { createError } from "h3";
import { trackEvent } from "services/analytics";
import { createJWT } from "services/auth";
import { mergeAnonymousUser } from "services/merge-anonymous";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

interface AppleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

let cachedKeys: { keys: AppleJwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 1000 * 60 * 60;

async function getAppleJwks(): Promise<AppleJwk[]> {
  if (cachedKeys && Date.now() - cachedKeys.fetchedAt < JWKS_TTL_MS) return cachedKeys.keys;
  const res = await fetch("https://appleid.apple.com/auth/keys");
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: "Could not fetch Apple keys" });
  const data = (await res.json()) as { keys: AppleJwk[] };
  cachedKeys = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function base64urlToBuffer(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

interface AppleIdTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string;
  email?: string;
}

async function verifyAppleIdToken(idToken: string, expectedAudiences: string[]): Promise<AppleIdTokenPayload> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw createError({ statusCode: 401, statusMessage: "Malformed Apple token" });
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(base64urlToBuffer(headerB64).toString("utf8")) as { kid: string; alg: string };
  if (header.alg !== "RS256") throw createError({ statusCode: 401, statusMessage: "Unsupported Apple token alg" });

  const keys = await getAppleJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw createError({ statusCode: 401, statusMessage: "Apple signing key not found" });

  const publicKey = createPublicKey({ key: jwk as never, format: "jwk" });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  const valid = verifier.verify(publicKey, base64urlToBuffer(signatureB64));
  if (!valid) throw createError({ statusCode: 401, statusMessage: "Invalid Apple token signature" });

  const payload = JSON.parse(base64urlToBuffer(payloadB64).toString("utf8")) as AppleIdTokenPayload;
  if (payload.iss !== "https://appleid.apple.com")
    throw createError({ statusCode: 401, statusMessage: "Invalid Apple token issuer" });
  if (!expectedAudiences.includes(payload.aud))
    throw createError({ statusCode: 401, statusMessage: "Apple token audience mismatch" });
  if (payload.exp * 1000 < Date.now()) throw createError({ statusCode: 401, statusMessage: "Apple token expired" });

  return payload;
}

export default handler(
  { body: { idToken: z.string().min(1), name: z.string().optional() } },
  async ({ user: caller, body: { idToken, name } }) => {
    const audiences = [env.APPLE_CLIENT_ID, env.APPLE_WEB_CLIENT_ID].filter((aud): aud is string => !!aud);
    const payload = await verifyAppleIdToken(idToken, audiences);

    // Apple only returns email on the first sign-in. Fall back to a synthetic
    // email derived from `sub` so we always have a unique key.
    const email = payload.email ?? `apple_${payload.sub}@privaterelay.appleid.invalid`;

    const anonymousId = caller && !caller.email ? caller.id : null;

    let user = await prisma.user.findUnique({ where: { email } });
    const wasNew = !user;

    if (!user) {
      if (anonymousId) {
        user = await prisma.user.update({
          where: { id: anonymousId },
          data: { email, name: name ?? null },
        });
      } else {
        user = await prisma.user.create({ data: { email, name: name ?? null } });
      }
    } else if (anonymousId && anonymousId !== user.id) {
      await mergeAnonymousUser(anonymousId, user.id);
    }

    trackEvent(wasNew ? "signup" : "signin", user.id, {
      provider: "apple",
      mergedAnonymous: Boolean(anonymousId),
    });

    return { token: createJWT(user), anonymousId };
  },
);
