import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SESSION_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;

const challenges = new Map<string, number>();

const secret = randomBytes(32);

export function createChallenge(): string {
  const chal = randomBytes(16).toString("hex");
  challenges.set(chal, Date.now());
  return chal;
}

export function consumeChallenge(chal: string): boolean {
  const ts = challenges.get(chal);
  if (!ts) return false;
  challenges.delete(chal);
  return Date.now() - ts < CHALLENGE_MS;
}

export function createSession(pubkey: string): string {
  const payload = `${pubkey}:${Date.now() + SESSION_MS}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}:${sig}`;
}

export function verifySession(token: string): string | null {
  const sep = token.lastIndexOf(":");
  if (sep === -1) return null;
  const payload = token.slice(0, sep);
  const sig = token.slice(sep + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  const pubkey = payload.slice(0, payload.lastIndexOf(":"));
  const expiry = parseInt(payload.slice(payload.lastIndexOf(":") + 1), 10);
  if (Date.now() > expiry) return null;
  return pubkey;
}

export function getSessionPubkey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifySession(auth.slice(7));
}
