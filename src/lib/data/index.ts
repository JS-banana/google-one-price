import snapshot from "../../data/snapshot.json" with { type: "json" };
import { buildMatrix, type Matrix } from "./matrix.ts";
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
  type RankingBasis,
  rankTier,
  type TierId,
} from "./tiers.ts";

export type { Matrix, MatrixSkuId } from "./matrix.ts";
export { firstPrice } from "./money.ts";
export type {
  Change,
  Country,
  ExchangeRate,
  Metadata,
  Price,
  Quote,
  Sku,
} from "./schema.ts";
export {
  type RankedQuote,
  type RankingBasis,
  type TierId,
  tierIds,
  tiers,
} from "./tiers.ts";

const data = snapshot as Snapshot;

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

export function getTierRanking(
  tierId: TierId,
  basis?: RankingBasis,
): RankedQuote[] {
  return rankTier(data, tierId, basis);
}

export function getMatrix(): Matrix {
  return buildMatrix(data);
}

export function getChanges(): readonly Change[] {
  return data.changes;
}

export function getExchangeRates(): readonly ExchangeRate[] {
  return data.exchangeRates;
}
