import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { guideFrontmatterSchema } from "./lib/data/guide.ts";

export const collections = {
  guide: defineCollection({
    loader: glob({ base: "./src/content/guide", pattern: "*.md" }),
    schema: guideFrontmatterSchema,
  }),
};
