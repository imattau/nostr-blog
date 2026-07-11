import { SimplePool } from "nostr-tools";
import { normalizeEvent, type Post } from "./normalize";
import { escapeHtml, stripHtml, sanitizeImageUrl } from "./sanitize";

export function renderPostCard(post: Post): string {
  const date = new Date(post.publishedAt * 1000);
  const dateStr = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const kindLabel = post.kind === 30023 ? "Article" : "Note";

  return `<a
  href="/post/${post.slug}"
  class="group block rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-700 transition-all"
>
  ${post.image ? `<div class="aspect-[16/9] overflow-hidden bg-gray-100 dark:bg-gray-900">
    <img
      src="${sanitizeImageUrl(post.image)}"
      alt="${escapeHtml(post.title)}"
      loading="lazy"
      class="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
    />
  </div>` : ""}
  <div class="p-5">
    <div class="flex items-center gap-2 mb-2">
      <span class="text-xs text-gray-500 dark:text-gray-400">${dateStr}</span>
      <span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">${kindLabel}</span>
    </div>
    <h3 class="text-lg font-semibold mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
      ${escapeHtml(post.title)}
    </h3>
    ${post.summary ? `<p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
      ${escapeHtml(post.summary)}
    </p>` : ""}
  </div>
</a>`;
}

export function renderFeaturedPost(post: Post): string {
  const date = new Date(post.publishedAt * 1000);
  const dateStr = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<a
  href="/post/${post.slug}"
  class="group block relative overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-900"
>
  ${post.image ? `<div class="aspect-[2/1] sm:aspect-[3/1] overflow-hidden">
    <img
      src="${sanitizeImageUrl(post.image)}"
      alt="${escapeHtml(post.title)}"
      loading="lazy"
      class="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
    />
  </div>` : ""}
  <div class="${post.image ? "p-6 sm:p-8" : "p-6 sm:p-8"}">
    <span class="inline-block text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-3">
      Featured
    </span>
    <h2 class="text-2xl sm:text-3xl font-bold mb-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
      ${escapeHtml(post.title)}
    </h2>
    <p class="text-gray-600 dark:text-gray-400 text-sm">${dateStr}</p>
    ${post.summary ? `<p class="mt-3 text-gray-600 dark:text-gray-400 line-clamp-2">
      ${escapeHtml(post.summary)}
    </p>` : ""}
  </div>
</a>`;
}

export async function fetchOlderPosts(
  pubkeyHex: string,
  relays: string[],
  until: number | undefined,
  knownIds: Set<string>
): Promise<Post[]> {
  const pool = new SimplePool();
  try {
    const filter: any = {
      kinds: [1, 30023],
      authors: [pubkeyHex],
      "#t": ["nostrblog"],
      limit: 20,
    };
    if (until) filter.until = until - 1;
    const events = await pool.querySync(relays, filter);
    return events
      .map(normalizeEvent)
      .filter((p): p is Post => p !== null && !knownIds.has(p.id))
      .sort((a, b) => b.publishedAt - a.publishedAt);
  } catch {
    return [];
  } finally {
    pool.close(relays);
  }
}

export async function fetchPostBySlug(
  pubkeyHex: string,
  relays: string[],
  slug: string
): Promise<Post | undefined> {
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(relays, {
      kinds: [30023],
      authors: [pubkeyHex],
      "#t": ["nostrblog"],
      "#d": [slug],
      limit: 10,
    });
    if (events.length > 0) {
      const post = normalizeEvent(events[0]);
      if (post) return post;
    }

    const noteEvents = await pool.querySync(relays, {
      kinds: [1],
      authors: [pubkeyHex],
      "#t": ["nostrblog"],
      limit: 50,
    });
    const notes = noteEvents.map(normalizeEvent).filter((p): p is Post => p !== null);
    return notes.find((p) => p.slug === slug);
  } catch {
    return undefined;
  } finally {
    pool.close(relays);
  }
}

export function renderMarkdown(content: string, container: HTMLElement): void {
  import("marked").then(({ Marked }) => {
    const marked = new Marked();
    marked.parse(stripHtml(content)).then((html) => {
      container.innerHTML = html;
    });
  });
}


