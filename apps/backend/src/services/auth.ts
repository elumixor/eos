import type { User } from "generated:prisma";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "env";
import { createError } from "h3";

export interface SessionUser {
  id: string;
  email: string | null;
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function createJWT(user: User): string {
  const sessionUser: SessionUser = { id: user.id, email: user.email };
  const now = Date.now();
  const payload = { ...sessionUser, iat: now, exp: now + SESSION_TTL_MS };
  const encoded = base64url(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${base64url(signature)}`;
}

export function verifyJWT(token: string): SessionUser | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const actual = base64urlDecode(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(base64urlDecode(encoded).toString("utf8")) as SessionUser & { exp: number };
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireAuth(user: SessionUser | null): asserts user is SessionUser {
  if (!user) throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
}

function base64url(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(base64, "base64");
}

function sign(payload: string) {
  return createHmac("sha256", env.SESSION_SECRET).update(payload).digest();
}
