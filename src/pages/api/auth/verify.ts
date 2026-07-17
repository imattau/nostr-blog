import type { APIRoute } from "astro";
import { verifyEvent } from "nostr-tools";
import { consumeChallenge, createSession } from "../../../lib/auth";
import { getAdminPubkeys } from "../../../lib/state";

export const POST: APIRoute = async ({ request }) => {
  let body: { event?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const event = body.event as any;
  if (!event || event.kind !== 22242 || !event.content || !event.pubkey || !event.sig) {
    return new Response(JSON.stringify({ error: "Invalid auth event" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!consumeChallenge(event.content)) {
    return new Response(JSON.stringify({ error: "Invalid or expired challenge" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const valid = await verifyEvent(event);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Signature verification failed" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admins = getAdminPubkeys();
  if (!admins.includes(event.pubkey)) {
    return new Response(JSON.stringify({ error: "Not authorized" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = createSession(event.pubkey);

  return new Response(JSON.stringify({ ok: true, token }), {
    headers: { "Content-Type": "application/json" },
  });
};
