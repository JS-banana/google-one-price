import { getCountryMeta } from "./country-meta.ts";
import {
  type Capacity,
  type DecisionData,
  decisionGroup,
  offerFlags,
} from "./decision.ts";
import type { Fx } from "./fx.ts";
import { billingTerms } from "./money.ts";
import { isUsdMarket } from "./offers.ts";
import { getProducts } from "./products.ts";
import type { Snapshot } from "./schema.ts";

export function buildDecisionData(source: Snapshot, fx: Fx): DecisionData {
  const products = getProducts();
  const family = Object.fromEntries(
    Object.entries(products).map(([need, { familySharing }]) => [
      need,
      [familySharing.supported, familySharing.excludedStorageGb],
    ]),
  ) as DecisionData["family"];
  const markets = source.countries.map((country) => ({
    code: country.code,
    name: country.nameZh,
    flag: country.iso2.toLowerCase(),
    access: getCountryMeta(country.code)?.access ?? "unknown",
    usd: isUsdMarket(country),
  }));
  const marketIds = new Map(markets.map(({ code }, id) => [code, id]));
  const rates: DecisionData["rates"] = Object.entries(fx.rates).map(
    ([currency, { unitsPerUsd, date }]) => [currency, unitsPerUsd, date],
  );
  const rateIds = new Map(rates.map(([currency], id) => [currency, id]));
  const skuIndex = new Map(source.skus.map((sku, id) => [sku.id, { sku, id }]));
  const offers: DecisionData["offers"] = {};
  for (const quote of source.quotes) {
    if (quote.status !== "active") continue;
    const group = decisionGroup(quote.skuId);
    if (!group) continue;
    const intro = quote.intro?.local ?? null;
    if (intro !== null && intro > quote.renewal.local) continue;
    const entry = skuIndex.get(quote.skuId);
    const market = marketIds.get(quote.countryCode);
    const rate = rateIds.get(quote.currency);
    if (!entry || market === undefined || rate === undefined)
      throw new Error(
        `Incomplete decision data for ${quote.countryCode} ${quote.skuId}`,
      );
    const { months, trialMonths, introPeriods } = billingTerms(
      quote,
      entry.sku,
    );
    if (intro !== null && intro > 0 && !introPeriods) continue;
    const groupOffers = offers[group] ?? [];
    offers[group] = groupOffers;
    groupOffers.push([
      market,
      entry.id,
      rate,
      months,
      intro,
      introPeriods,
      trialMonths,
      quote.renewal.local,
      offerFlags(quote.skuId, intro),
    ]);
  }
  const capacityOrder: Capacity[] = [
    "30gb",
    "100gb",
    "200gb",
    "2tb",
    "10tb",
    "20tb",
  ];
  return {
    offers,
    markets,
    rates,
    family,
    skus: source.skus.map(({ id }) => id),
    capacities: capacityOrder.filter((cap) => offers[cap]?.length),
    usdToCny: fx.rates.CNY.unitsPerUsd,
  };
}
