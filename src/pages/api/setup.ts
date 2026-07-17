import type { APIRoute } from "astro";
import { nip19 } from "nostr-tools";
import { isSetupComplete, saveNpub } from "../../lib/state";
import { rateLimit } from "../../lib/rate-limit";

const NPUB_MAX_LENGTH = 200;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

function isValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (!origin && !referer) return false;
  const source = origin || referer || "";
  try {
    const sourceUrl = new URL(source);
    const host = request.headers.get("host");
    if (host && new URL(`http://${host}`).hostname === sourceUrl.hostname) return true;
    if (sourceUrl.hostname === "localhost" || sourceUrl.hostname === "127.0.0.1") return true;
    return false;
  } catch {
    return false;
  }
}

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ complete: isSetupComplete() }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (isSetupComplete()) {
    return new Response(JSON.stringify({ error: "Already configured" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isValidOrigin(request)) {
    return new Response(JSON.stringify({ error: "Invalid origin" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const clientIp = getClientIp(request);
  const limit = rateLimit("setup", clientIp, 10, 60_000);
  if (!limit.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
      },
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

  if (body.npub.length > NPUB_MAX_LENGTH) {
    return new Response(JSON.stringify({ error: "npub is too long" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const npub = body.npub.trim();
  try {
    nip19.decode(npub);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid npub format" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    saveNpub(npub);
  } catch (err) {
    console.error("[nostr-blog] Failed to save npub:", err);
    return new Response(JSON.stringify({ error: "Failed to save configuration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
