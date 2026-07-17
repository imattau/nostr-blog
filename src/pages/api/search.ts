import type { APIRoute } from "astro";
import { isSetupComplete } from "../../lib/state";
import { searchPosts } from "../../lib/graph";
import { getEmbedding } from "../../lib/embed";
import { rateLimit } from "../../lib/rate-limit";

export const GET: APIRoute = async ({ request, url }) => {
  if (!isSetupComplete()) {
    return new Response(JSON.stringify({ error: "Not configured" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  const limit = rateLimit("search", clientIp, 30, 60_000);
  if (!limit.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) },
    });
  }

  const q = url.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return new Response(JSON.stringify({ error: "Query too short" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const threshold = parseFloat(url.searchParams.get("threshold") || "0.15");
  const topK = parseInt(url.searchParams.get("topK") || "20", 10);

  try {
    const vector = await getEmbedding(q);
    const arr: number[] = [];
    for (let i = 0; i < vector.length; i++) arr.push(vector[i]);
    const results = searchPosts(arr, threshold, topK);

    return new Response(JSON.stringify({ posts: results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[nostr-blog] Search failed:", err);
    return new Response(JSON.stringify({ error: "Search failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
