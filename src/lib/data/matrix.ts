import type { Country, Quote, Snapshot } from "./schema.ts";

export const matrixColumns = [
  { label: "30TB(com.one)", skuId: "com.google.one.30tb.m" },
  { label: "30TB(g1.ios)", skuId: "g1.ios.30tb.m" },
  { label: "30TB(gemini)", skuId: "com.google.gemini.30tb.m" },
  { label: "Ultra50%×3(g1)", skuId: "g1.ios.30tb.ai.pro.m.3month_ip_50p" },
  {
    label: "Ultra50%×3(gem)",
    skuId: "com.google.gemini.30tb.ai.pro.m.3months_ip_50p",
  },
  { label: "Ultra原价", skuId: "com.google.gemini.30tb.ai.pro.m" },
  { label: "20TB(老组)", skuId: "com.google.one.20tb.m" },
  { label: "20TB(v2)", skuId: "g1.ios.20tb.m.v2" },
  { label: "10TB", skuId: "com.google.gemini.10tb.m" },
  { label: "5TB", skuId: "com.google.gemini.5tb.m" },
  { label: "AIPro99%×3", skuId: "com.google.gemini.2tb.ai.m.3month_ip_99p" },
  { label: "AIPro月付", skuId: "com.google.gemini.2tb.ai.m" },
  { label: "AIPro年付", skuId: "com.google.gemini.2tb.ai.a" },
  { label: "AIPlus67%×3", skuId: "com.google.gemini.helium.m.ip_3mo_67p" },
  { label: "AIPlus月付", skuId: "com.google.gemini.helium.m" },
] as const;

export type MatrixSkuId = (typeof matrixColumns)[number]["skuId"];
export type Matrix = {
  columns: typeof matrixColumns;
  rows: { country: Country; quotes: ReadonlyMap<MatrixSkuId, Quote | null> }[];
};

export function activeQuoteIndex(data: Snapshot): ReadonlyMap<string, Quote> {
  return new Map(
    data.quotes
      .filter((quote) => quote.status === "active")
      .map((quote) => [`${quote.countryCode}/${quote.skuId}`, quote]),
  );
}

export function buildMatrix(data: Snapshot): Matrix {
  const quotes = activeQuoteIndex(data);
  return {
    columns: matrixColumns,
    rows: data.countries.map((country) => ({
      country,
      quotes: new Map(
        matrixColumns.map(({ skuId }) => [
          skuId,
          quotes.get(`${country.code}/${skuId}`) ?? null,
        ]),
      ),
    })),
  };
}
