import { describe, it, expect, beforeEach } from "vitest";
import { graph, addAuthor, getAuthorByPubkey, getAllAuthors, removeAuthor, addPost, getPost, getAllPosts, getPostsByAuthor, clearPosts, setRelays, getRelays, searchPosts } from "./graph";
import type { Post, Profile } from "./normalize";

const aliceProfile: Profile = { name: "alice", displayName: "Alice", picture: "", banner: "", about: "Alice's blog", nip05: "", website: "" };
const bobProfile: Profile = { name: "bob", displayName: "Bob", picture: "", banner: "", about: "Bob's blog", nip05: "", website: "" };

function makePost(slug: string, pubkey: string, title: string, publishedAt: number): Post {
  return { id: `id-${slug}`, slug, kind: 30023, title, summary: "", image: null, content: title, publishedAt, pubkey };
}

beforeEach(() => {
  graph.clear();
});

describe("authors", () => {
  it("addAuthor stores author node keyed by hex", () => {
    addAuthor("abc", "npub1abc", aliceProfile);
    const found = getAuthorByPubkey("abc");
    expect(found).not.toBeNull();
    expect(found!.npub).toBe("npub1abc");
    expect(found!.hex).toBe("abc");
    expect(found!.profile.name).toBe("alice");
  });

  it("getAllAuthors returns all added authors", () => {
    addAuthor("abc", "npub1abc", aliceProfile);
    addAuthor("def", "npub1def", bobProfile);
    const all = getAllAuthors();
    expect(all).toHaveLength(2);
    expect(all.map(a => a.npub).sort()).toEqual(["npub1abc", "npub1def"]);
  });

  it("removeAuthor deletes the author node", () => {
    addAuthor("abc", "npub1abc", aliceProfile);
    removeAuthor("abc");
    expect(getAuthorByPubkey("abc")).toBeNull();
    expect(getAllAuthors()).toHaveLength(0);
  });

  it("getAuthorByPubkey returns null for unknown hex", () => {
    expect(getAuthorByPubkey("unknown")).toBeNull();
  });
});

describe("posts with author edges", () => {
  it("addPost with author creates wrote edge", () => {
    addAuthor("abc", "npub1abc", aliceProfile);
    addPost(makePost("post-1", "abc", "Hello", 100));

    const post = getPost("post-1");
    expect(post).not.toBeUndefined();
    expect(post!.title).toBe("Hello");

    const authorPosts = getPostsByAuthor("abc");
    expect(authorPosts).toHaveLength(1);
    expect(authorPosts[0].slug).toBe("post-1");
  });

  it("getAllPosts returns all posts from all authors sorted by publishedAt desc", () => {
    addAuthor("abc", "npub1abc", aliceProfile);
    addAuthor("def", "npub1def", bobProfile);
    addPost(makePost("a", "abc", "Alpha", 100));
    addPost(makePost("b", "def", "Beta", 200));
    addPost(makePost("c", "abc", "Gamma", 50));

    const all = getAllPosts();
    expect(all).toHaveLength(3);
    expect(all[0].title).toBe("Beta");
    expect(all[1].title).toBe("Alpha");
    expect(all[2].title).toBe("Gamma");
  });

  it("getPostsByAuthor returns only that author's posts", () => {
    addAuthor("abc", "npub1abc", aliceProfile);
    addAuthor("def", "npub1def", bobProfile);
    addPost(makePost("a", "abc", "Alice Post", 100));
    addPost(makePost("b", "def", "Bob Post", 200));

    const alicePosts = getPostsByAuthor("abc");
    expect(alicePosts).toHaveLength(1);
    expect(alicePosts[0].title).toBe("Alice Post");

    const bobPosts = getPostsByAuthor("def");
    expect(bobPosts).toHaveLength(1);
    expect(bobPosts[0].title).toBe("Bob Post");
  });

  it("clearPosts removes all posts but preserves authors", () => {
    addAuthor("abc", "npub1abc", aliceProfile);
    addPost(makePost("a", "abc", "Post", 100));
    clearPosts();
    expect(getAllPosts()).toHaveLength(0);
    expect(getAllAuthors()).toHaveLength(1);
  });

  it("owned cascade: removeAuthor deletes their posts too", () => {
    addAuthor("abc", "npub1abc", aliceProfile);
    addAuthor("def", "npub1def", bobProfile);
    addPost(makePost("a", "abc", "Alice Post", 100));
    addPost(makePost("b", "def", "Bob Post", 200));

    removeAuthor("abc");

    expect(getAllPosts()).toHaveLength(1);
    expect(getAllPosts()[0].title).toBe("Bob Post");
    expect(getAllAuthors()).toHaveLength(1);
  });
});

describe("vector search", () => {
  it("searchPosts returns matching posts ranked by similarity", () => {
    addAuthor("abc", "npub1abc", aliceProfile);
    addPost(makePost("quantum", "abc", "Quantum Computing", 100), new Float64Array([0.9, 0.1, 0.0]));
    addPost(makePost("cooking", "abc", "Cooking Pasta", 200), new Float64Array([0.1, 0.9, 0.0]));

    const results = searchPosts([0.85, 0.15, 0.0], 0.5, 5);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].title).toBe("Quantum Computing");
  });

  it("searchPosts returns empty array for no matches", () => {
    addAuthor("abc", "npub1abc", aliceProfile);
    addPost(makePost("post", "abc", "Hello", 100), new Float64Array([0.5, 0.5]));

    const results = searchPosts([-0.5, -0.5], 0.99, 5);
    expect(results).toHaveLength(0);
  });
});

describe("relays", () => {
  it("setRelays replaces relay nodes", () => {
    setRelays(["wss://relay1.com", "wss://relay2.com"]);
    expect(getRelays()).toEqual(["wss://relay1.com", "wss://relay2.com"]);

    setRelays(["wss://relay3.com"]);
    expect(getRelays()).toEqual(["wss://relay3.com"]);
  });
});
