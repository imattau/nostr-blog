import { defineMiddleware } from "astro:middleware";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' wss: ws: https:",
  "img-src 'self' https: data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export const onRequest = defineMiddleware(async ({ request }, next) => {
  const response = await next();
  if (!response.headers.has("content-security-policy")) {
    response.headers.set("content-security-policy", CSP);
  }
  if (!response.headers.has("x-content-type-options")) {
    response.headers.set("x-content-type-options", "nosniff");
  }
  if (!response.headers.has("x-frame-options")) {
    response.headers.set("x-frame-options", "DENY");
  }
  if (!response.headers.has("x-xss-protection")) {
    response.headers.set("x-xss-protection", "0");
  }
  if (!response.headers.has("referrer-policy")) {
    response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  }
  return response;
});
