import type { Post } from "./normalize";

const DIMS = 384;

export async function getEmbedding(text: string): Promise<Float64Array> {
  const vec = new Float64Array(DIMS);
  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  for (const word of words) {
    let h1 = 0x811c9dc5;
    let h2 = 0x6b8b4567;
    for (let i = 0; i < word.length; i++) {
      const c = word.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    }
    const idx = (Math.abs(h1 ^ h2) >>> 0) % DIMS;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < DIMS; i++) vec[i] /= norm;
  }
  return vec;
}

export function getPostText(post: Post): string {
  const plain = post.content.replace(/<[^>]+>/g, "").replace(/[#*_~`>|\\-]+/g, " ").replace(/\n+/g, " ").trim();
  return [post.title, post.summary, plain.slice(0, 2000)].filter(Boolean).join(" ");
}
