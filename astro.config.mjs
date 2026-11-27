import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://googleone.laifuyou.com",
  output: "static",
  trailingSlash: "never",
  integrations: [
    react(),
    sitemap({
      filter: (page) => !/^\/404(?:\.html|\/)?$/.test(new URL(page).pathname),
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});
