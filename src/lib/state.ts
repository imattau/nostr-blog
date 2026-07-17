import { SimplePool, nip19 } from "nostr-tools";
import { useWebSocketImplementation } from "nostr-tools/pool";
import WebSocket from "ws";
import fs from "node:fs";
import path from "node:path";
import { normalizeEvent, type Post, type Profile } from "./normalize";
import { addPost, clearPosts, getPost, getAllPosts, addAuthor, getAuthorByPubkey, getAllAuthors, removeAuthor, setRelays, getRelays as getGraphRelays, searchPosts } from "./graph";
import { getEmbedding, getPostText } from "./embed";

useWebSocketImplementation(WebSocket);

interface Config {
  authors: string[];
  admins?: string[];
}

const configPaths = [
  path.resolve(process.cwd(), "data/config.json"),
];

const BOOTSTRAP_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

const FETCH_INTERVAL_MS = 15 * 60 * 1000;

let config: Config = { authors: [], admins: [] };
let fetchTimer: ReturnType<typeof setInterval> | null = null;
let currentRelays: string[] = [...BOOTSTRAP_RELAYS];

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
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.authors)) {
          resolvedConfigPath = p;
          return parsed as Config;
        }
        if (typeof parsed.npub === "string") {
          resolvedConfigPath = p;
          return { authors: [parsed.npub] };
        }
      }
    } catch {

    }
  }
  return { authors: [] };
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
        console.log(`[nostr-blog] Discovered ${relays.length} relays from ${pubkeyHex.slice(0, 8)}`);
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

async function refreshAuthor(pubkeyHex: string, npub: string): Promise<void> {
  try {
    const relays = await discoverRelays(pubkeyHex);
    for (const r of relays) {
      if (!currentRelays.includes(r)) currentRelays.push(r);
    }
    setRelays(currentRelays);

    const [fetched, prof] = await Promise.all([
      fetchPosts(pubkeyHex, relays, 10),
      fetchProfile(pubkeyHex, relays),
    ]);

    if (prof) {
      addAuthor(pubkeyHex, npub, prof);
      console.log(`[nostr-blog] Cached profile for ${prof.displayName || prof.name}`);
    }

    if (fetched.length > 0) {
      for (const post of fetched) {
        const text = getPostText(post);
        const vector = await getEmbedding(text);
        addPost(post, vector);
      }
      console.log(`[nostr-blog] Cached ${fetched.length} posts from ${npub.slice(0, 12)}...`);
    }
  } catch (err) {
    console.error(`[nostr-blog] Refresh failed for ${npub.slice(0, 12)}:`, err);
  }
}

async function refreshAll(): Promise<void> {
  if (config.authors.length === 0) return;
  console.log(`[nostr-blog] Refreshing ${config.authors.length} authors...`);

  const allRelays: string[] = [...BOOTSTRAP_RELAYS];
  const authorEntries: Array<{ hex: string; npub: string }> = [];

  for (const npub of config.authors) {
    try {
      const decoded = nip19.decode(npub);
      const hex = decoded.data as string;
      authorEntries.push({ hex, npub });
    } catch {
      console.warn(`[nostr-blog] Invalid npub in config: ${npub.slice(0, 12)}`);
    }
  }

  clearPosts();

  for (const entry of authorEntries) {
    try {
      const relays = await discoverRelays(entry.hex);
      for (const r of relays) {
        if (!allRelays.includes(r)) allRelays.push(r);
      }

      const [fetched, prof] = await Promise.all([
        fetchPosts(entry.hex, relays, 10),
        fetchProfile(entry.hex, relays),
      ]);

      if (prof) {
        addAuthor(entry.hex, entry.npub, prof);
        console.log(`[nostr-blog] Cached profile for ${prof.displayName || prof.name}`);
      }

      for (const post of fetched) {
        const text = getPostText(post);
        const vector = await getEmbedding(text);
        addPost(post, vector);
      }
      console.log(`[nostr-blog] Cached ${fetched.length} posts from ${entry.npub.slice(0, 12)}...`);
    } catch (err) {
      console.error(`[nostr-blog] Refresh failed for ${entry.npub.slice(0, 12)}:`, err);
    }
  }

  currentRelays = allRelays;
  setRelays(allRelays);
  console.log(`[nostr-blog] Refresh complete — ${getAllPosts().length} total posts`);
}

function startBackgroundFetcher(): void {
  if (fetchTimer) clearInterval(fetchTimer);
  if (config.authors.length === 0) return;
  refreshAll();
  fetchTimer = setInterval(refreshAll, FETCH_INTERVAL_MS);
}

export function getPosts(): Post[] {
  return getAllPosts();
}

export function getPostBySlug(slug: string): Post | undefined {
  return getPost(slug);
}

export function getProfile(): Profile | null {
  const authors = getAllAuthors();
  return authors.length > 0 ? authors[0].profile : null;
}

export function getNpub(): string | null {
  const authors = getAllAuthors();
  return authors.length > 0 ? authors[0].npub : null;
}

export function getPubkeyHex(): string | null {
  const authors = getAllAuthors();
  return authors.length > 0 ? authors[0].hex : null;
}

export function getRelays(): string[] {
  return currentRelays;
}

export function isSetupComplete(): boolean {
  return config.authors.length > 0;
}

export function getCachedData() {
  const authors = getAllAuthors();
  return {
    posts: getAllPosts(),
    profile: authors.length > 0 ? authors[0].profile : null,
    pubkeyHex: authors.length > 0 ? authors[0].hex : null,
    relays: currentRelays,
    authors,
  };
}

export function saveNpub(npub: string): void {
  if (config.authors.includes(npub)) return;
  config.authors.push(npub);
  try {
    const decoded = nip19.decode(npub);
    const hex = decoded.data as string;
    if (!config.admins) config.admins = [];
    if (!config.admins.includes(hex)) config.admins.push(hex);
  } catch {

  }
  saveConfigFile(config);
  if (config.authors.length === 1) {
    startBackgroundFetcher();
  } else {
    refreshAll();
  }
}

export function getAdminPubkeys(): string[] {
  return config.admins ?? [];
}

export function addAuthorNpub(npub: string): void {
  if (config.authors.includes(npub)) return;
  config.authors.push(npub);
  saveConfigFile(config);
  refreshAll();
}

export function removeAuthorNpub(npub: string): void {
  config.authors = config.authors.filter(a => a !== npub);
  saveConfigFile(config);
  try {
    const decoded = nip19.decode(npub);
    const hex = decoded.data as string;
    removeAuthor(hex);
  } catch {

  }
}

export function getAuthors(): Array<{ npub: string; hex: string; profile: Profile }> {
  return getAllAuthors();
}

export function searchForPosts(query: string, threshold = 0.15, topK = 20): Promise<Post[]> {
  return getEmbedding(query).then(vec => {
    const arr: number[] = [];
    for (let i = 0; i < vec.length; i++) arr.push(vec[i]);
    return searchPosts(arr, threshold, topK);
  });
}

config = loadConfig();
if (config.authors.length > 0) {
  startBackgroundFetcher();
}
