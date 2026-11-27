import { Decimal } from "decimal.js";
import type { Price, Quote } from "./schema.ts";

const MoneyDecimal = Decimal.clone({ precision: 40 });

export function toPrice(
  local: number,
  unitsPerUsd: number,
  usdToCny: number,
): Price {
  const cny = new MoneyDecimal(local)
    .times(usdToCny)
    .dividedBy(unitsPerUsd)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
  return { local, cny };
}

export function firstPrice(quote: Quote): Price {
  return quote.intro ?? quote.renewal;
}

export function compareConverted(
  a: number,
  unitsPerUsdA: number,
  b: number,
  unitsPerUsdB: number,
): number {
  return new MoneyDecimal(a)
    .times(unitsPerUsdB)
    .comparedTo(new MoneyDecimal(b).times(unitsPerUsdA));
}
