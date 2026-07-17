import type { APIRoute } from "astro";
import { nip19 } from "nostr-tools";
import { isSetupComplete, addAuthorNpub, removeAuthorNpub, getAuthors } from "../../lib/state";
import { getSessionPubkey } from "../../lib/auth";
import { rateLimit } from "../../lib/rate-limit";

const NPUB_MAX_LENGTH = 200;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function requireAdmin(request: Request): Response | null {
  const pubkey = getSessionPubkey(request);
  if (!pubkey) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

export const GET: APIRoute = async () => {
  const authors = getAuthors();
  return new Response(JSON.stringify({ authors }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const authErr = requireAdmin(request);
  if (authErr) return authErr;

  const clientIp = getClientIp(request);
  const limit = rateLimit("authors", clientIp, 30, 60_000);
  if (!limit.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) },
    });
  }

  let body: { npub?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.npub || typeof body.npub !== "string") {
    return new Response(JSON.stringify({ error: "npub is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const npub = body.npub.trim();
  if (npub.length > NPUB_MAX_LENGTH) {
    return new Response(JSON.stringify({ error: "npub is too long" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    nip19.decode(npub);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid npub format" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const existing = getAuthors();
  if (existing.some(a => a.npub === npub)) {
    return new Response(JSON.stringify({ error: "Author already added" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    addAuthorNpub(npub);
  } catch (err) {
    console.error("[nostr-blog] Failed to add author:", err);
    return new Response(JSON.stringify({ error: "Failed to add author" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ request }) => {
  const authErr = requireAdmin(request);
  if (authErr) return authErr;

  const clientIp = getClientIp(request);
  const limit = rateLimit("authors", clientIp, 30, 60_000);
  if (!limit.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) },
    });
  }

  let body: { npub?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.npub || typeof body.npub !== "string") {
    return new Response(JSON.stringify({ error: "npub is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const npub = body.npub.trim();
  try {
    removeAuthorNpub(npub);
  } catch (err) {
    console.error("[nostr-blog] Failed to remove author:", err);
    return new Response(JSON.stringify({ error: "Failed to remove author" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
