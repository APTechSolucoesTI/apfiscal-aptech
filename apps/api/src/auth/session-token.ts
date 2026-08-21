import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";

export const SESSION_COOKIE = "apfiscal_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type SessionClaims = { sub: string; email: string; sid: string; app: "apfiscal"; iat: number; exp: number };
export type AppUser = { id: string; email: string; fullName?: string | null };

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const decode = <T>(value: string): T | null => {
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T; } catch { return null; }
};
const sign = (value: string, secret: string) => createHmac("sha256", secret).update(value).digest("base64url");

export function createSessionToken(user: AppUser): { token: string; claims: SessionClaims } {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = { sub: user.id, email: user.email, sid: randomUUID(), app: "apfiscal", iat: now, exp: now + SESSION_TTL_SECONDS };
  const encoded = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
  return { token: `${encoded}.${sign(encoded, env("AUTH_SESSION_SECRET"))}`, claims };
}

export function verifySessionToken(token: string): SessionClaims | null {
  const [header, payload, signature, ...extra] = token.split(".");
  if (!header || !payload || !signature || extra.length) return null;
  const expected = sign(`${header}.${payload}`, env("AUTH_SESSION_SECRET"));
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) return null;
  const claims = decode<SessionClaims>(payload);
  if (!claims || claims.app !== "apfiscal" || !claims.sub || !claims.sid || !claims.email || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null;
  return claims;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSupabaseRlsToken(user: AppUser): string {
  const now = Math.floor(Date.now() / 1000);
  const encoded = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ aud: "authenticated", role: "authenticated", sub: user.id, email: user.email, app_metadata: { app: "apfiscal" }, iat: now, exp: now + 600 })}`;
  return `${encoded}.${sign(encoded, env("SUPABASE_JWT_SECRET"))}`;
}

export function sessionMaxAgeMs() { return SESSION_TTL_SECONDS * 1000; }
