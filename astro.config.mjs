import preact from "@astrojs/preact";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://googleone.laifuyou.com",
  output: "static",
  trailingSlash: "never",
  redirects: {
    "/changes": "/data#changes",
    "/rates": "/data#fx",
  },
  integrations: [
    preact(),
    sitemap({
      filter: (page) =>
        !/^\/(?:404|changes|rates)(?:\.html|\/)?$/.test(new URL(page).pathname),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    define: {
      // Resolve the data file before Astro bundles the server entrypoints.
      "process.env.FX_LIVE_URL": JSON.stringify(
        new URL("./src/data/fx.live.json", import.meta.url).href,
      ),
    },
  },
});
