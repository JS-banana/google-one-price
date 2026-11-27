import { billingTerms } from "./money.ts";
import type { Quote, Sku } from "./schema.ts";
import { quoteLine } from "./tiers.ts";

export function groupCountryQuotes(
  quotes: readonly Quote[],
  skus: readonly Sku[],
) {
  const skuById = new Map(skus.map((sku) => [sku.id, sku]));
  const groups = new Map<string, Quote[]>();
  for (const quote of quotes) {
    const { months, trialMonths, introPeriods } = billingTerms(
      quote,
      skuById.get(quote.skuId),
    );
    const [product, , ...offer] = quote.description.split(" · ");
    const key = JSON.stringify([
      quote.countryCode,
      quote.status,
      quote.currency,
      quoteLine(quote),
      product,
      months,
      trialMonths || introPeriods,
      trialMonths ? null : offer,
      quote.intro?.local ?? null,
      quote.renewal.local,
    ]);
    const group = groups.get(key);
    if (group) group.push(quote);
    else groups.set(key, [quote]);
  }
  return [...groups.values()].map((group) =>
    group.sort(
      (a, b) =>
        a.skuId.length - b.skuId.length || a.skuId.localeCompare(b.skuId, "en"),
    ),
  );
}
