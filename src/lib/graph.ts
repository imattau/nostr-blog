import { PolyGraph } from "@0xx0lostcause0xx0/polypack";
import type { Post, Profile } from "./normalize";

const NODE_TYPE_POST = "post";
const NODE_TYPE_AUTHOR = "author";
const NODE_TYPE_RELAY = "relay";

export const graph = new PolyGraph();

function authorId(hex: string): string {
  return `author:${hex}`;
}

// ── Author ──

export function addAuthor(hex: string, npub: string, profile: Profile): void {
  graph.addNode({
    id: authorId(hex),
    type: NODE_TYPE_AUTHOR,
    data: { npub, hex, ...profile },
    insertedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export function getAuthorByPubkey(hex: string): { npub: string; hex: string; profile: Profile } | null {
  const node = graph.getNode(authorId(hex));
  if (!node) return null;
  const d = node.data as Record<string, unknown>;
  return {
    npub: d.npub as string,
    hex: d.hex as string,
    profile: {
      name: (d.name as string) ?? "",
      displayName: (d.displayName as string) ?? "",
      picture: (d.picture as string) ?? "",
      banner: (d.banner as string) ?? "",
      about: (d.about as string) ?? "",
      nip05: (d.nip05 as string) ?? "",
      website: (d.website as string) ?? "",
    },
  };
}

export function getAllAuthors(): Array<{ npub: string; hex: string; profile: Profile }> {
  return graph.query()
    .whereNodeType(NODE_TYPE_AUTHOR)
    .toArray()
    .map(n => {
      const d = n.data as Record<string, unknown>;
      return {
        npub: d.npub as string,
        hex: d.hex as string,
        profile: {
          name: (d.name as string) ?? "",
          displayName: (d.displayName as string) ?? "",
          picture: (d.picture as string) ?? "",
          banner: (d.banner as string) ?? "",
          about: (d.about as string) ?? "",
          nip05: (d.nip05 as string) ?? "",
          website: (d.website as string) ?? "",
        },
      };
    });
}

export function removeAuthor(hex: string): void {
  graph.removeNode(authorId(hex));
}

// ── Post ──

export function addPost(post: Post, vector?: Float64Array): void {
  graph.addNode({
    id: post.slug,
    type: NODE_TYPE_POST,
    data: post as unknown as Record<string, unknown>,
    vector: vector,
    insertedAt: Date.now(),
    updatedAt: Date.now(),
  });
  graph.addEdge(authorId(post.pubkey), "wrote", post.slug, undefined, "owned");
}

export function getPost(slug: string): Post | undefined {
  const node = graph.getNode(slug);
  return node?.data as unknown as Post | undefined;
}

export function getAllPosts(): Post[] {
  return graph.query()
    .whereNodeType(NODE_TYPE_POST)
    .orderBy("publishedAt", "desc")
    .toArray()
    .map(n => n.data as unknown as Post);
}

export function getPostsByAuthor(hex: string): Post[] {
  const slugs = graph.getEdgeTargets(authorId(hex), "wrote");
  const posts: Post[] = [];
  for (const slug of slugs) {
    const node = graph.getNode(slug);
    if (node) posts.push(node.data as unknown as Post);
  }
  return posts.sort((a, b) => b.publishedAt - a.publishedAt);
}

export function clearPosts(): void {
  const authors = graph.query().whereNodeType(NODE_TYPE_AUTHOR).ids();
  for (const id of authors) {
    graph.removeEdges(id, "wrote");
  }
  const slugs = graph.query().whereNodeType(NODE_TYPE_POST).ids();
  for (const slug of slugs) {
    graph.removeNode(slug);
  }
}

// ── Relay ──

export function setRelays(relays: string[]): void {
  const old = graph.query().whereNodeType(NODE_TYPE_RELAY).ids();
  for (const id of old) {
    graph.removeNode(id);
  }
  for (const url of relays) {
    graph.addNode({
      id: url,
      type: NODE_TYPE_RELAY,
      data: { url },
      insertedAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
}

export function getRelays(): string[] {
  return graph.query()
    .whereNodeType(NODE_TYPE_RELAY)
    .ids();
}

// ── Search ──

export function searchPosts(vector: number[], threshold: number, topK: number): Post[] {
  return graph.query()
    .whereNodeType(NODE_TYPE_POST)
    .similarTo(vector, threshold, topK)
    .orderBy("publishedAt", "desc")
    .toArray()
    .map(n => n.data as unknown as Post);
}
