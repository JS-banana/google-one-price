import baselineFx from "../../data/fx.json" with { type: "json" };
import snapshot from "../../data/snapshot.json" with { type: "json" };
import {
  currencyNames,
  type ExchangeRate,
  fxSchema,
  loadFx,
  requiredCurrencies,
} from "./fx.ts";
import { buildMatrix, type Matrix } from "./matrix.ts";
import { createPricing } from "./money.ts";
import { summarizeFreeTrials } from "./offers.ts";
import type { Change, Country, Quote, Sku, Snapshot } from "./schema.ts";
import {
  quoteTier,
  type RankedQuote,
  rankTier,
  type TierId,
  tierIds,
  tierOfferTerms,
  tierQuotes,
  tiers,
} from "./tiers.ts";
import { type PriceView, priceViews } from "./views.ts";

export { groupChanges, summarizeChanges } from "./changes.ts";
export type { Matrix, MatrixSkuId } from "./matrix.ts";
export {
  hasHistoricalPriceAnomaly,
  homeCardNotice,
  isUsdMarket,
  renewalMultiplier,
  renewalTrap,
} from "./offers.ts";
export type {
  Change,
  Country,
  Price,
  Quote,
  Sku,
} from "./schema.ts";
export { regions } from "./schema.ts";
export {
  compareTierLeaders,
  productLines,
  quoteLine,
  type RankedQuote,
  summarizeRanking,
  type TierId,
  tierGroups,
  tierIds,
  tierOfferTerms,
  tiers,
  withoutUsdMarkets,
} from "./tiers.ts";
export { type PriceView, priceViews, relativeToLowest } from "./views.ts";

const livePath = new URL(
  process.env.FX_LIVE_URL ?? "../../data/fx.live.json",
  import.meta.url,
);
const fx = loadFx(
  fxSchema.parse(baselineFx),
  process.env.FX_LIVE === "1" ? livePath : undefined,
);
const source = snapshot as Snapshot;
const pricing = createPricing(source.skus, fx);
const data = {
  ...source,
  quotes: source.quotes.map((quote) => pricing.withCny(quote)),
  changes: source.changes.map((change) => pricing.withCny(change)),
};
export const { priceFor, describePrice, cnyPerLocal } = pricing;
export const getFreeTrials = () => summarizeFreeTrials(source, describePrice);

export function getMetadata() {
  return {
    ...data.metadata,
    fxDate: fx.date,
    fxProvider: fx.provider,
    usdToCny: fx.rates.CNY.unitsPerUsd,
  };
}

export function getCountries(): readonly Country[] {
  return data.countries;
}

export function getSkus(): readonly Sku[] {
  return data.skus;
}

export function getCountryQuotes(
  countryCode: string,
  status?: Quote["status"],
): Quote[] {
  return data.quotes.filter(
    (quote) =>
      quote.countryCode === countryCode &&
      (status === undefined || quote.status === status),
  );
}

const rankings = new Map<string, RankedQuote[]>();

export function getTierRanking(
  tierId: TierId,
  view: PriceView = "year",
): RankedQuote[] {
  const key = `${tierId}/${view}`;
  const cached = rankings.get(key);
  if (cached) return cached.slice();
  const ranking = rankTier(data.quotes, pricing, tierId, view);
  rankings.set(key, ranking);
  return ranking.slice();
}

export function getWorkbookMatrix(): Matrix {
  return buildMatrix(data);
}

export function getComparisonMatrix() {
  const columns = tierIds.map((id) =>
    priceViews.map(
      (view) =>
        new Map(
          getTierRanking(id, view).map((row) => [row.quote.countryCode, row]),
        ),
    ),
  );
  return data.countries.map((country) => ({
    country,
    cells: columns.map((column) =>
      column.map((ranking) => ranking.get(country.code) ?? null),
    ),
  }));
}

export function getCountryAdvantages(countryCode: string) {
  return tierIds.flatMap((id) => {
    const match = getTierRanking(id, "year")
      .slice(0, 3)
      .find(({ quote }) => quote.countryCode === countryCode);
    return match ? [{ id, ...match }] : [];
  });
}

export function isGlobalTierLowest(
  quote: Quote,
  view: PriceView,
  price: number,
) {
  const id = quoteTier(quote);
  return id !== undefined && price === getTierRanking(id, view)[0]?.price;
}

export function getTierDetails(id: TierId) {
  const quotes = tierQuotes(data.quotes, id);
  return {
    skuIds: tiers[id].skus,
    introPeriods: tierOfferTerms(quotes),
  };
}

export function getChanges(): readonly Change[] {
  return data.changes;
}

export function getExchangeRates(): readonly ExchangeRate[] {
  return requiredCurrencies.map((currency) => ({
    currency,
    nameZh: currencyNames[currency],
    ...fx.rates[currency],
  }));
}

export { fxProviderUrl } from "./fx.ts";

export function getQuoteCount(): number {
  return data.quotes.length;
}
