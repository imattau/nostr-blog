export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

export function sanitizeImageUrl(url: string): string {
  const allowedProtocols = ["https:", "http:"];
  try {
    const parsed = new URL(url);
    if (!allowedProtocols.includes(parsed.protocol)) return "";
    return url;
  } catch {
    return "";
  }
}

const IMAGE_EXT = /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|mov)(\?.*)?$/i;
const YOUTUBE_RE = /^(?:https?:)?\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\//;
const VIMEO_RE = /^(?:https?:)?\/\/(?:www\.)?vimeo\.com\/\d+/;

function isImageUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return (url.protocol === "http:" || url.protocol === "https:") && IMAGE_EXT.test(url.pathname);
  } catch {
    return false;
  }
}

function isVideoUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return (url.protocol === "http:" || url.protocol === "https:") && VIDEO_EXT.test(url.pathname);
  } catch {
    return false;
  }
}

function getYoutubeEmbed(str: string): string | null {
  try {
    const url = new URL(str);
    let id: string | null = null;
    if (url.hostname.includes("youtu.be")) {
      id = url.pathname.slice(1).split("/")[0] || null;
    } else if (url.pathname.startsWith("/embed/")) {
      id = url.pathname.split("/")[2] || null;
    } else {
      id = url.searchParams.get("v");
    }
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
      return id;
    }
    return null;
  } catch {
    return null;
  }
}

function getVimeoEmbed(str: string): string | null {
  try {
    const url = new URL(str);
    const id = url.pathname.split("/")[1];
    if (id && /^\d+$/.test(id)) {
      return id;
    }
    return null;
  } catch {
    return null;
  }
}

function embedVideo(url: string): string {
  const ytId = getYoutubeEmbed(url);
  if (ytId) {
    return `<div class="my-4 aspect-video"><iframe src="https://www.youtube-nocookie.com/embed/${ytId}" title="YouTube video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-full rounded-xl"></iframe></div>`;
  }

  const vimeoId = getVimeoEmbed(url);
  if (vimeoId) {
    return `<div class="my-4 aspect-video"><iframe src="https://player.vimeo.com/video/${vimeoId}" title="Vimeo video" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen class="w-full h-full rounded-xl"></iframe></div>`;
  }

  return `<div class="my-4"><video src="${sanitizeImageUrl(url)}" controls class="rounded-xl w-full max-h-[70vh] bg-black"></video></div>`;
}

export function renderNoteContent(content: string): string {
  return content
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const trimmed = block.trim();
      if (isImageUrl(trimmed)) {
        return `<div class="my-4"><img src="${sanitizeImageUrl(trimmed)}" alt="" loading="lazy" class="rounded-xl w-full object-cover" /></div>`;
      }
      if (isVideoUrl(trimmed) || YOUTUBE_RE.test(trimmed) || VIMEO_RE.test(trimmed)) {
        return embedVideo(trimmed);
      }
      return `<p class="my-4 leading-relaxed text-gray-700 dark:text-gray-300">${escapeHtml(trimmed)}</p>`;
    })
    .join("");
}
