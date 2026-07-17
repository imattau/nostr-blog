import type { APIRoute } from "astro";
import { createChallenge } from "../../../lib/auth";

export const GET: APIRoute = async () => {
  const challenge = createChallenge();
  return new Response(JSON.stringify({ challenge }), {
    headers: { "Content-Type": "application/json" },
  });
};
