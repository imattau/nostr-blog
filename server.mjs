import http from "node:http";
import { handler } from "./dist/server/entry.mjs";

const port = process.env.PORT ? parseInt(process.env.PORT) : 4321;
const host = process.env.HOST || "127.0.0.1";

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

function addSecurityHeaders(res) {
  const headers = res.getHeaders();
  if (!headers["content-security-policy"]) {
    res.setHeader("content-security-policy", CSP);
  }
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("x-xss-protection", "0");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
}

const server = http.createServer((req, res) => {
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function (statusCode, ...args) {
    addSecurityHeaders(res);
    return originalWriteHead(statusCode, ...args);
  };
  handler(req, res);
});

server.listen(port, host);
console.log(`[nostr-blog] Listening on http://${host}:${port}`);
