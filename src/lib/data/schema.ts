import { z } from "zod";

export const countryCodeSchema = z.string().regex(/^[A-Z]{3}$/);
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
export const skuIdSchema = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
export const textSchema = z.string().trim().min(1);
export const amountSchema = z.number().nonnegative();
export const rateSchema = z.number().positive();
export const dateTimeSchema = z.iso.datetime({ local: true });

export const sourceSchema = z.union([
  z.enum(["applecommerce_v26", "apple_catalog"]),
  z.string().regex(/^legacy_20261125\w*$/),
]);

export const regions = ["亚太", "欧洲", "美洲", "中东非洲"] as const;

export const countrySchema = z.object({
  code: countryCodeSchema,
  nameZh: textSchema,
  nameEn: textSchema,
  iso2: z.string().regex(/^[A-Z]{2}$/),
  region: z.enum(regions),
  currency: currencySchema,
});

export const skuSchema = z.object({
  id: skuIdSchema,
  family: z.enum(["google-one", "gemini", "g1-ios", "legacy-g1", "other"]),
  storageCodeGb: z.number().int().positive().nullable(),
  billingPeriod: z.enum(["P1M", "P1Y"]).nullable(),
  offer: z
    .object({
      kind: z.enum(["trial", "discount", "fixed"]),
      encodedDuration: z.string().regex(/^P[1-9]\d*[MY]$/),
      discountPercent: z.number().int().min(1).max(99).nullable(),
    })
    .nullable(),
});

const priceSchema = z.object({
  local: amountSchema,
  cny: amountSchema,
});

export const quoteSchema = z
  .object({
    countryCode: countryCodeSchema,
    skuId: skuIdSchema,
    description: textSchema,
    currency: currencySchema,
    source: sourceSchema,
    status: z.enum(["active", "historical"]),
    intro: priceSchema.nullable(),
    introPeriods: z.int().positive().nullable(),
    renewal: priceSchema,
  })
  .refine(
    ({ intro, introPeriods }) => (intro === null) === (introPeriods === null),
    { message: "Intro price and periods must appear together" },
  );

export const changeSchema = z
  .object({
    kind: textSchema,
    countryCode: countryCodeSchema,
    skuId: skuIdSchema,
    description: textSchema,
    currency: currencySchema,
    intro: priceSchema.nullable(),
    renewal: priceSchema,
    introPeriods: z.number().int().positive().nullable(),
    reportedIntroCny: amountSchema.nullable(),
    reportedRenewalCny: amountSchema,
  })
  .refine(
    ({ intro, introPeriods }) => (intro === null) === (introPeriods === null),
    { message: "Intro price and periods must appear together" },
  );

export const exchangeRateSchema = z.object({
  currency: currencySchema,
  nameZh: textSchema,
  unitsPerUsd: rateSchema,
});

export const snapshotSchema = z.object({
  metadata: z.object({
    refreshedAt: dateTimeSchema,
    changesCheckedAt: dateTimeSchema,
    usdToCny: rateSchema,
    fxProvider: textSchema,
    fxPublishedAt: z.iso.datetime(),
  }),
  countries: z.array(countrySchema).length(60),
  skus: z.array(skuSchema).min(1),
  quotes: z.array(quoteSchema).min(1),
  changes: z.array(changeSchema),
  exchangeRates: z.array(exchangeRateSchema).min(1),
});

export type Country = z.infer<typeof countrySchema>;
export type Sku = z.infer<typeof skuSchema>;
export type Quote = z.infer<typeof quoteSchema>;
export type Price = z.infer<typeof priceSchema>;
export type Change = z.infer<typeof changeSchema>;
export type ExchangeRate = z.infer<typeof exchangeRateSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Metadata = Snapshot["metadata"];
