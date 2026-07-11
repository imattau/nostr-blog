import type { Post, Profile } from "./normalize";

export function buildArticleJsonLd(
  post: Post,
  siteUrl: string,
  authorName: string,
  authorUrl?: string
): Record<string, unknown> {
  const url = `${siteUrl.replace(/\/$/, "")}/post/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.summary || undefined,
    image: post.image || undefined,
    datePublished: new Date(post.publishedAt * 1000).toISOString(),
    dateModified: new Date(post.publishedAt * 1000).toISOString(),
    author: {
      "@type": "Person",
      name: authorName,
      ...(authorUrl ? { url: authorUrl } : {}),
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    url,
  };
}

export function buildPersonJsonLd(
  profile: Profile,
  siteUrl: string
): Record<string, unknown> {
  const name = profile.displayName || profile.name;
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    ...(profile.about ? { description: profile.about } : {}),
    ...(profile.picture ? { image: profile.picture } : {}),
    ...(profile.website ? { url: profile.website.startsWith("http") ? profile.website : `https://${profile.website}` } : {}),
    ...(profile.nip05 ? { identifier: profile.nip05 } : {}),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${siteUrl.replace(/\/$/, "")}/about`,
    },
  };
}

export function buildBreadcrumbJsonLd(
  items: { name: string; url: string }[]
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function jsonLdToString(data: Record<string, unknown>): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

export function ogType(kind: 1 | 30023): string {
  return kind === 30023 ? "article" : "article";
}

export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const truncated = text.slice(0, max).trimEnd();
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > max * 0.8 ? truncated.slice(0, lastSpace) : truncated) + "…";
}
