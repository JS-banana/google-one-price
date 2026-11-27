import { z } from "zod";
import productFacts from "../../data/products.json" with { type: "json" };
import { reviewSchema, textSchema } from "./schema.ts";
import { productLines } from "./tiers.ts";

const storageSizes = z.array(z.int().positive());
const benefitList = z.array(textSchema);

const productSchema = reviewSchema
  .extend({
    name: textSchema,
    storageGb: storageSizes.min(1).nullable(),
    largeStorageOnlyGb: storageSizes.min(1).nullable().optional(),
    aiBenefits: benefitList.nullable(),
    familySharing: z.object({
      supported: z.boolean().nullable(),
      maxAdditionalMembers: z.int().nonnegative().nullable(),
      excludedStorageGb: storageSizes.refine(
        (sizes) => new Set(sizes).size === sizes.length,
        { message: "Duplicate excluded storage sizes" },
      ),
      sharedBenefits: benefitList.nullable(),
      managerOnlyBenefits: benefitList.nullable(),
    }),
    appleSubscription: z.object({
      manage: textSchema.nullable(),
      cancel: textSchema.nullable(),
    }),
    notes: z.array(textSchema).min(1),
  })
  .refine(
    ({ storageGb, familySharing }) =>
      familySharing.excludedStorageGb.every((size) =>
        storageGb?.includes(size),
      ),
    {
      path: ["familySharing", "excludedStorageGb"],
      message: "Excluded storage sizes must appear in storageGb",
    },
  );

export const productsSchema = z.object({
  products: z.record(
    z.enum(Object.keys(productLines) as Array<keyof typeof productLines>),
    productSchema,
  ),
  familyGroup: reviewSchema.extend({
    sameCountryRequired: z.boolean().nullable(),
    switchCooldownMonths: z.int().positive().nullable(),
    maxMembers: z.int().positive().nullable(),
    notes: z.array(textSchema).min(1),
  }),
});

const data = productsSchema.parse(productFacts);
export type ProductFacts = z.infer<typeof productSchema>;

export function getProducts(): Readonly<typeof data.products> {
  return data.products;
}

export function getGoogleFamilyGroup(): Readonly<typeof data.familyGroup> {
  return data.familyGroup;
}
