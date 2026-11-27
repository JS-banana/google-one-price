import { z } from "zod";
import { reviewSchema, textSchema } from "./schema.ts";

export const guideFrontmatterSchema = reviewSchema.extend({
  title: textSchema,
  summary: textSchema,
  order: z.int().positive(),
});
