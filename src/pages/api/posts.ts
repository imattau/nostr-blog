import type { APIRoute } from "astro";
import { isSetupComplete, getCachedData } from "../../lib/state";
import { rateLimit } from "../../lib/rate-limit";

export const GET: APIRoute = async ({ request }) => {
  if (!isSetupComplete()) {
    return new Response(JSON.stringify({ error: "Not configured" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  const limit = rateLimit("posts", clientIp, 60, 60_000);
  if (!limit.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
      },
    });
  }

  const data = getCachedData();
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
};
