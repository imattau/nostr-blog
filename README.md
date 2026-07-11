# nostr-blog

A server-side rendered blog powered by [Nostr](https://nostr.com). Configure once with an npub and it fetches and displays kind 1 (notes) and kind 30023 (long-form articles) tagged `#nostrblog` from Nostr relays.

## Features

- SSR blog with Astro + Node.js
- Kind 30023 long-form articles rendered via Markdown
- Kind 1 short notes with inline image/video embedding
- Featured post with hero image
- "Load More" pagination
- Light/dark mode
- Nostr-native comments via Disgus
- Author profile page
- Background cache refreshes every 15 minutes
- LRU cache (5 posts) for fast responses

## Getting Started

### Setup

```bash
npm ci
npm run dev
```

Open `http://localhost:4321` and enter the author's npub in the setup form (one-time).

### Production

```bash
npm run build
node server.mjs
```

Configure via environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4321` | HTTP server port |
| `HOST` | `127.0.0.1` | Bind address |

### Deploy to Remote

```bash
scripts/deploy-remote.sh --host user@server --domain blog.example.com
```

See `scripts/deploy-remote.sh --help` for options (Caddy/nginx reverse proxy, systemd service, etc.).

## How It Works

1. On setup, the configured npub is saved to `data/config.json`.
2. The server discovers the author's preferred relays from their kind 10002 event.
3. It fetches kind 1 and kind 30023 events with tag `#nostrblog`.
4. Posts are cached in an LRU cache and refreshed every 15 minutes.
5. The blog renders server-side with a client-side fallback for cache misses.

## Security

- All user-facing text is HTML-escaped before DOM injection
- Markdown content is stripped of raw HTML before parsing
- Image/video URLs are validated against allowed protocols
- Content Security Policy headers are set on all responses
- API endpoints have CSRF origin validation and rate limiting
- Server binds to `127.0.0.1` by default (reverse proxy expected)
- The bundled Disgus comments library handles all key material client-side

## Tech Stack

- [Astro](https://astro.build) 5 (SSR, Node.js adapter)
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) 2
- [marked](https://marked.js.org) 15
- [Tailwind CSS](https://tailwindcss.com) 3
