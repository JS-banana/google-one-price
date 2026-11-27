import { z } from "zod";
import countryMeta from "../../data/country-meta.json" with { type: "json" };
import snapshot from "../../data/snapshot.json" with { type: "json" };
import { countryCodeSchema, reviewSchema, textSchema } from "./schema.ts";

const paymentMethodSchema = z.enum([
  "card",
  "paypal",
  "apple-pay",
  "carrier",
  "local-wallet",
  "bank-payment",
  "bank-top-up",
  "account-balance",
  "gift-card",
  "app-store-card",
]);
const giftCardSchema = z.enum(["official", "none", "unknown"]);
const accessSchema = z.enum(["easy", "local-only", "unknown"]);

type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type PaymentAccess = z.infer<typeof accessSchema>;

export function derivePaymentAccess(
  giftCard: z.infer<typeof giftCardSchema>,
  paymentMethods: readonly PaymentMethod[],
): PaymentAccess {
  if (giftCard === "official" || paymentMethods.includes("app-store-card")) {
    return "easy";
  }
  if (
    giftCard === "none" &&
    paymentMethods.some((method) => method !== "account-balance")
  ) {
    return "local-only";
  }
  return "unknown";
}

const countryMetaEntrySchema = reviewSchema
  .extend({
    code: countryCodeSchema,
    giftCard: giftCardSchema,
    paymentMethods: z.array(paymentMethodSchema),
    access: accessSchema,
    notes: textSchema.optional(),
  })
  .refine(
    ({ paymentMethods }) =>
      new Set(paymentMethods).size === paymentMethods.length,
    { path: ["paymentMethods"], message: "Duplicate payment methods" },
  )
  .refine(
    ({ giftCard, paymentMethods }) =>
      (giftCard === "official") === paymentMethods.includes("gift-card"),
    {
      path: ["paymentMethods"],
      message:
        "The gift-card method must match confirmed Apple Gift Card support",
    },
  )
  .refine(
    ({ paymentMethods }) =>
      !(
        paymentMethods.includes("gift-card") ||
        paymentMethods.includes("app-store-card")
      ) || paymentMethods.includes("account-balance"),
    {
      path: ["paymentMethods"],
      message: "Redeemable gift cards require Apple Account balance support",
    },
  )
  .refine(
    ({ giftCard, paymentMethods, access }) =>
      access === derivePaymentAccess(giftCard, paymentMethods),
    { path: ["access"], message: "Access must match the payment evidence" },
  );

const snapshotCodes = new Set(snapshot.countries.map(({ code }) => code));

export const countryMetaSchema = z
  .array(countryMetaEntrySchema)
  .length(snapshotCodes.size)
  .superRefine((entries, ctx) => {
    const missing = new Set(snapshotCodes);
    for (const [index, { code }] of entries.entries()) {
      if (!missing.delete(code)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "code"],
          message: `Duplicate or unexpected market: ${code}`,
        });
      }
    }
    if (missing.size) {
      ctx.addIssue({
        code: "custom",
        message: `Missing markets: ${[...missing].join(", ")}`,
      });
    }
  });

export type CountryMeta = z.infer<typeof countryMetaEntrySchema>;

const countries = new Map(
  countryMetaSchema.parse(countryMeta).map((entry) => [entry.code, entry]),
);

export function getCountryMeta(code: string): CountryMeta | undefined {
  return countries.get(code);
}
