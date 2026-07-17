import type { APIRoute } from "astro";
import { getSessionPubkey } from "../../../lib/auth";

export const GET: APIRoute = async ({ request }) => {
  const pubkey = getSessionPubkey(request);
  if (!pubkey) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, pubkey }), {
    headers: { "Content-Type": "application/json" },
  });
};
