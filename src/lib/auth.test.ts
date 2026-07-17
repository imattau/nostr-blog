import { describe, it, expect } from "vitest";
import { createChallenge, consumeChallenge, createSession, verifySession, getSessionPubkey } from "./auth";

describe("challenge lifecycle", () => {
  it("creates and consumes a challenge", () => {
    const chal = createChallenge();
    expect(chal).toBeTruthy();
    expect(typeof chal).toBe("string");
    expect(chal.length).toBeGreaterThan(0);
    expect(consumeChallenge(chal)).toBe(true);
  });

  it("rejects double-consumed challenge", () => {
    const chal = createChallenge();
    consumeChallenge(chal);
    expect(consumeChallenge(chal)).toBe(false);
  });

  it("rejects unknown challenge", () => {
    expect(consumeChallenge("nonexistent")).toBe(false);
  });
});

describe("session tokens", () => {
  it("creates and verifies a session", () => {
    const pubkey = "abc123def456";
    const token = createSession(pubkey);
    expect(typeof token).toBe("string");
    expect(token).toContain(":");
    expect(verifySession(token)).toBe(pubkey);
  });

  it("rejects tampered token", () => {
    const token = createSession("pubkey1");
    const badToken = token.slice(0, -1) + "x";
    expect(verifySession(badToken)).toBeNull();
  });

  it("rejects garbage token", () => {
    expect(verifySession("not-a-token")).toBeNull();
    expect(verifySession("")).toBeNull();
  });

  it("extracts pubkey from request", () => {
    const pubkey = "test-pubkey-789";
    const token = createSession(pubkey);
    const req = new Request("http://localhost", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getSessionPubkey(req)).toBe(pubkey);
  });

  it("returns null without auth header", () => {
    const req = new Request("http://localhost");
    expect(getSessionPubkey(req)).toBeNull();
  });

  it("returns null with invalid auth header", () => {
    const req = new Request("http://localhost", {
      headers: { authorization: "Bearer invalid" },
    });
    expect(getSessionPubkey(req)).toBeNull();
  });
});
