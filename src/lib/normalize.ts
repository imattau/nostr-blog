export interface Post {
  id: string;
  slug: string;
  kind: 1 | 30023;
  title: string;
  summary: string;
  image: string | null;
  content: string;
  publishedAt: number;
  pubkey: string;
}

export interface Profile {
  name: string;
  displayName: string;
  picture: string;
  banner: string;
  about: string;
  nip05: string;
  website: string;
}

function findTag(tags: string[][], name: string): string | undefined {
  return tags.find((t) => t[0] === name)?.[1];
}

export function normalizeEvent(event: any): Post | null {
  const content = event.content?.trim();
  if (!content) return null;

  if (event.kind === 30023) {
    const title = findTag(event.tags, "title") || "Untitled";
    const summary = findTag(event.tags, "summary") || "";
    const image = findTag(event.tags, "image") || null;
    const d = findTag(event.tags, "d") || event.id.slice(0, 8);
    const publishedAt = findTag(event.tags, "published_at");
    return {
      id: event.id,
      slug: d,
      kind: 30023,
      title,
      summary,
      image,
      content: event.content,
      publishedAt: publishedAt ? parseInt(publishedAt, 10) : event.created_at,
      pubkey: event.pubkey,
    };
  }

  if (event.kind === 1) {
    const title =
      content.length > 80
        ? content.slice(0, 80).trimEnd() + "..."
        : content;
    return {
      id: event.id,
      slug: event.id.slice(0, 8),
      kind: 1,
      title,
      summary:
        content.length > 200
          ? content.slice(0, 200).trimEnd() + "..."
          : content,
      image: null,
      content,
      publishedAt: event.created_at,
      pubkey: event.pubkey,
    };
  }

  return null;
}
