import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  integrations: [
    tailwind(),
    sitemap({
      filter: (page) => !page.includes("/api/"),
    }),
  ],
  output: "server",
  adapter: node({ mode: "standalone" }),
  site: "https://nostr-blog.example.com",
  trailingSlash: "never",
});
