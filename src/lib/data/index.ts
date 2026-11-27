import snapshot from "../../data/snapshot.json" with { type: "json" };
import { buildMatrix, type Matrix } from "./matrix.ts";
import { createPricing } from "./money.ts";
import type {
  Change,
  Country,
  ExchangeRate,
  Metadata,
  Quote,
  Sku,
  Snapshot,
} from "./schema.ts";
import {
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
  homeCardNotice,
  isUsdMarket,
  renewalMultiplier,
  renewalTrap,
} from "./offers.ts";
export type {
  Change,
  Country,
  ExchangeRate,
  Metadata,
  Price,
  Quote,
  Sku,
} from "./schema.ts";
export { regions } from "./schema.ts";
export {
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

const data = snapshot as Snapshot;
export const { priceFor, describePrice } = createPricing(data);

export function getMetadata(): Metadata {
  return data.metadata;
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
  const ranking = rankTier(data, tierId, view);
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

export function getTierDetails(id: TierId) {
  const quotes = tierQuotes(data, id);
  return {
    skuIds:
      tiers[id].skus ?? [...new Set(quotes.map(({ skuId }) => skuId))].sort(),
    introPeriods: tierOfferTerms(quotes),
  };
}

export function getChanges(): readonly Change[] {
  return data.changes;
}

export function getExchangeRates(): readonly ExchangeRate[] {
  return data.exchangeRates;
}

export function getQuoteCount(): number {
  return data.quotes.length;
}
