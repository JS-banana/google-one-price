import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import preact from "@astrojs/preact";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://googleone.laifuyou.com",
  output: "static",
  trailingSlash: "never",
  integrations: [
    {
      name: "frankfurter-fx",
      hooks: {
        "astro:config:setup": ({ command, logger }) => {
          if (command !== "build" || process.env.FX_LIVE !== "1") return;
          const script = fileURLToPath(
            new URL("./scripts/fx.ts", import.meta.url),
          );
          const result = spawnSync(process.execPath, [script, "--live"], {
            stdio: "inherit",
          });
          if (result.status !== 0) {
            process.env.FX_LIVE = "0";
            logger.warn(
              `Could not refresh Frankfurter rates${result.error ? ` (${result.error.message})` : ""}. Using src/data/fx.json.`,
            );
          }
        },
      },
    },
    preact(),
    sitemap({
      filter: (page) => !/^\/404(?:\.html|\/)?$/.test(new URL(page).pathname),
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});
