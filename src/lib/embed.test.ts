import { describe, it, expect } from "vitest";
import { getEmbedding, getPostText } from "./embed";
import type { Post } from "./normalize";

describe("getEmbedding", () => {
  it("returns a 384-dimensional Float64Array", async () => {
    const vec = await getEmbedding("hello world");
    expect(vec).toBeInstanceOf(Float64Array);
    expect(vec).toHaveLength(384);
  });

  it("returns a normalized (unit length) vector", async () => {
    const vec = await getEmbedding("quantum computing");
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("returns similar vectors for similar text", async () => {
    const [a, b] = await Promise.all([
      getEmbedding("quantum computing algorithms"),
      getEmbedding("quantum computers and algorithms"),
    ]);
    const [c] = await Promise.all([
      getEmbedding("cooking pasta recipes"),
    ]);
    const simAB = cosine(a, b);
    const simAC = cosine(a, c);
    expect(simAB).toBeGreaterThan(simAC);
  });

  it("returns identical vectors for identical text", async () => {
    const [a, b] = await Promise.all([
      getEmbedding("the same text exactly"),
      getEmbedding("the same text exactly"),
    ]);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBe(b[i]);
    }
  });

  it("handles empty text gracefully", async () => {
    const vec = await getEmbedding("");
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBe(0);
  });
});

describe("getPostText", () => {
  const post: Post = {
    id: "test-id",
    slug: "test-slug",
    kind: 30023,
    title: "My Article",
    summary: "A brief summary",
    image: null,
    content: "<p>Hello <b>world</b></p>",
    publishedAt: 0,
    pubkey: "abc",
  };

  it("includes title, summary, and content", () => {
    const text = getPostText(post);
    expect(text).toContain("My Article");
    expect(text).toContain("A brief summary");
    expect(text).toContain("Hello world");
  });

  it("strips HTML tags from content", () => {
    const text = getPostText(post);
    expect(text).not.toContain("<b>");
    expect(text).not.toContain("</b>");
    expect(text).not.toContain("<p>");
  });

  it("truncates content to 2000 chars", () => {
    const longPost: Post = {
      ...post,
      content: "x".repeat(5000),
    };
    const text = getPostText(longPost);
    expect(text.length).toBeLessThanOrEqual(2100);
  });
});

function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
