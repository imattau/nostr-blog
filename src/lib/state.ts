import { SimplePool, nip19 } from "nostr-tools";
import { useWebSocketImplementation } from "nostr-tools/pool";
import WebSocket from "ws";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeEvent, type Post, type Profile } from "./normalize";

useWebSocketImplementation(WebSocket);

const POST_CACHE_MAX = 5;

interface Config {
  npub: string | null;
}

class LRUCache<T> {
  private max: number;
  private map: Map<string, T>;

  constructor(max: number) {
    this.max = max;
    this.map = new Map();
  }

  get(key: string): T | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }

  getAll(): T[] {
    return [...this.map.values()];
  }

  get size(): number {
    return this.map.size;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPaths = [
  path.resolve(__dirname, "../../data/config.json"),
  path.resolve(process.cwd(), "data/config.json"),
];

const BOOTSTRAP_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

const FETCH_INTERVAL_MS = 15 * 60 * 1000;

let config: Config = { npub: null };
let profile: Profile | null = null;
let currentRelays: string[] = [...BOOTSTRAP_RELAYS];
let fetchTimer: ReturnType<typeof setInterval> | null = null;
const postCache = new LRUCache<Post>(POST_CACHE_MAX);

function resolveConfigPath(): string {
  for (const p of configPaths) {
    try {
      fs.accessSync(p, fs.constants.R_OK);
      return p;
    } catch {

    }
  }
  return configPaths[0];
}

let resolvedConfigPath = resolveConfigPath();

function loadConfig(): Config {
  for (const p of configPaths) {
    try {
      const raw = fs.readFileSync(p, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && (parsed.npub === null || typeof parsed.npub === "string")) {
        resolvedConfigPath = p;
        return parsed as Config;
      }
    } catch {

    }
  }
  return { npub: null };
}

function saveConfigFile(cfg: Config): void {
  const dir = path.dirname(resolvedConfigPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolvedConfigPath, JSON.stringify(cfg, null, 2));
}

async function discoverRelays(pubkeyHex: string): Promise<string[]> {
  const pool = new SimplePool();
  try {
    const event = await pool.get(
      BOOTSTRAP_RELAYS,
      { kinds: [10002], authors: [pubkeyHex] },
      { maxWait: 5000 }
    );
    if (event?.tags) {
      const relays = event.tags
        .filter((t) => t[0] === "r")
        .map((t) => t[1])
        .filter(Boolean);
      if (relays.length > 0) {
        console.log(`[nostr-blog] Discovered ${relays.length} relays from author`);
        return [...new Set(relays)];
      }
    }
  } catch (err) {
    console.warn("[nostr-blog] Relay discovery failed:", err);
  }
  pool.close(BOOTSTRAP_RELAYS);
  return BOOTSTRAP_RELAYS;
}

async function fetchProfile(pubkeyHex: string, relays: string[]): Promise<Profile | null> {
  const pool = new SimplePool();
  try {
    const event = await pool.get(
      relays,
      { kinds: [0], authors: [pubkeyHex] },
      { maxWait: 8000 }
    );
    if (event?.content) {
      let meta: Record<string, unknown>;
      try {
        meta = JSON.parse(event.content);
      } catch {
        console.warn("[nostr-blog] Failed to parse profile metadata JSON");
        return null;
      }
      if (!meta || typeof meta !== "object") {
        console.warn("[nostr-blog] Profile metadata is not an object");
        return null;
      }
      return {
        name: typeof meta.name === "string" ? meta.name : "",
        displayName: typeof meta.display_name === "string" ? meta.display_name : (typeof meta.name === "string" ? meta.name : ""),
        picture: typeof meta.picture === "string" ? meta.picture : "",
        banner: typeof meta.banner === "string" ? meta.banner : "",
        about: typeof meta.about === "string" ? meta.about : "",
        nip05: typeof meta.nip05 === "string" ? meta.nip05 : "",
        website: typeof meta.website === "string" ? meta.website : "",
      };
    }
  } catch (err) {
    console.warn("[nostr-blog] Failed to fetch profile:", err);
  }
  pool.close(relays);
  return null;
}

async function fetchPosts(pubkeyHex: string, relays: string[], limit?: number): Promise<Post[]> {
  console.log(`[nostr-blog] Fetching posts from ${relays.length} relays`);

  const filter: any = {
    kinds: [1, 30023],
    authors: [pubkeyHex],
    "#t": ["nostrblog"],
  };
  if (limit) filter.limit = limit;

  const pool = new SimplePool();
  try {
    const events = await pool.querySync(
      relays,
      filter,
      { maxWait: 10000 }
    );
    return events
      .map(normalizeEvent)
      .filter((p): p is Post => p !== null)
      .sort((a, b) => b.publishedAt - a.publishedAt);
  } catch (err) {
    console.error("Failed to fetch events:", err);
    return [];
  } finally {
    pool.close(relays);
  }
}

async function refreshAll(): Promise<void> {
  if (!config.npub) return;
  console.log("[nostr-blog] Refreshing...");

  let pubkeyHex: string;
  try {
    const decoded = nip19.decode(config.npub);
    pubkeyHex = decoded.data as string;
  } catch {
    return;
  }

  const relays = await discoverRelays(pubkeyHex);
  currentRelays = relays;

  const [fetched, prof] = await Promise.all([
    fetchPosts(pubkeyHex, relays, 10),
    fetchProfile(pubkeyHex, relays),
  ]);

  if (fetched.length > 0) {
    postCache.clear();
    const latest = fetched.slice(0, POST_CACHE_MAX);
    for (const post of latest) {
      postCache.set(post.slug, post);
    }
    console.log(`[nostr-blog] Cached ${latest.length} posts (LRU max ${POST_CACHE_MAX})`);
  }
  if (prof) {
    profile = prof;
    console.log(`[nostr-blog] Cached profile for ${prof.displayName || prof.name}`);
  }
}

function startBackgroundFetcher(): void {
  if (fetchTimer) clearInterval(fetchTimer);
  if (!config.npub) return;
  refreshAll();
  fetchTimer = setInterval(refreshAll, FETCH_INTERVAL_MS);
}

export function getPosts(): Post[] {
  return postCache.getAll();
}

export function getPostBySlug(slug: string): Post | undefined {
  return postCache.get(slug);
}

export function getProfile(): Profile | null {
  return profile;
}

export function getNpub(): string | null {
  return config.npub;
}

export function getRelays(): string[] {
  return currentRelays;
}

export function getPubkeyHex(): string | null {
  if (!config.npub) return null;
  try {
    const decoded = nip19.decode(config.npub);
    return decoded.data as string;
  } catch {
    return null;
  }
}

export function isSetupComplete(): boolean {
  return config.npub !== null && config.npub.length > 0;
}

export function getCachedData(): { posts: Post[]; profile: Profile | null; relays: string[]; pubkeyHex: string | null } {
  return {
    posts: postCache.getAll(),
    profile,
    relays: currentRelays,
    pubkeyHex: getPubkeyHex(),
  };
}

export function saveNpub(npub: string): void {
  config.npub = npub;
  saveConfigFile(config);
  startBackgroundFetcher();
}

config = loadConfig();
if (config.npub) {
  startBackgroundFetcher();
}
