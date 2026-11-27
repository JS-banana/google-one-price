import { Decimal } from "decimal.js";
import type { Change, Price, Quote, Sku, Snapshot } from "./schema.ts";

const MoneyDecimal = Decimal.clone({ precision: 40 });

export const priceViews = ["intro", "year", "renew"] as const;
export type PriceView = (typeof priceViews)[number];
export type PricedQuote = Pick<
  Quote | Change,
  "skuId" | "currency" | "description" | "intro" | "introPeriods" | "renewal"
>;

export function toPrice(
  local: number,
  unitsPerUsd: number,
  usdToCny: number,
): Price {
  return {
    local,
    cny: new MoneyDecimal(local)
      .times(usdToCny)
      .dividedBy(unitsPerUsd)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber(),
  };
}

export function billingMonths(
  period: Sku["billingPeriod"] | undefined,
  description = "",
): 1 | 12 {
  return period === "P1Y" || (!period && description.includes("年付")) ? 12 : 1;
}

export function introPrice(quote: Pick<Quote, "intro" | "renewal">): Price {
  return quote.intro ?? quote.renewal;
}

export function createPricing(
  data: Pick<Snapshot, "skus" | "exchangeRates" | "metadata">,
) {
  const periods = new Map(data.skus.map((sku) => [sku.id, sku.billingPeriod]));
  const rates = new Map(
    data.exchangeRates.map(({ currency, unitsPerUsd }) => [
      currency,
      unitsPerUsd,
    ]),
  );
  const usdToCny = data.metadata.usdToCny;
  const priceInputs = (quote: PricedQuote) => {
    const unitsPerUsd = rates.get(quote.currency);
    if (unitsPerUsd === undefined)
      throw new Error(`Missing exchange rate for ${quote.currency}`);
    const months = billingMonths(periods.get(quote.skuId), quote.description);
    const introMonths = Math.min(12, (quote.introPeriods ?? 0) * months);
    // Every monthly price shares a denominator of 12, including annual SKUs.
    const intro = new MoneyDecimal(introPrice(quote).local).times(12 / months);
    const renew = new MoneyDecimal(quote.renewal.local).times(12 / months);
    const introTotal = intro.times(introMonths).div(12);
    const renewTotal = renew.times(12 - introMonths).div(12);
    return {
      local: { intro, year: introTotal.plus(renewTotal), renew },
      unitsPerUsd,
      months,
      introMonths,
      introTotal,
      renewTotal,
    };
  };
  const converted = (amount: Decimal, unitsPerUsd: number) =>
    amount.times(usdToCny).div(unitsPerUsd).toNumber();
  const monthlyCny = (amount: Decimal, unitsPerUsd: number) =>
    converted(amount.div(12), unitsPerUsd);
  return {
    priceInputs,
    monthlyCny,
    priceFor(quote: PricedQuote, view: PriceView): number {
      const { local, unitsPerUsd } = priceInputs(quote);
      return monthlyCny(local[view], unitsPerUsd);
    },
    describePrice(quote: PricedQuote) {
      const {
        local,
        unitsPerUsd,
        months,
        introMonths,
        introTotal,
        renewTotal,
      } = priceInputs(quote);
      return {
        prices: {
          intro: monthlyCny(local.intro, unitsPerUsd),
          year: monthlyCny(local.year, unitsPerUsd),
          renew: monthlyCny(local.renew, unitsPerUsd),
        },
        annual: months === 12,
        introMonths,
        renewMonths: 12 - introMonths,
        introTotal: converted(introTotal, unitsPerUsd),
        renewTotal: converted(renewTotal, unitsPerUsd),
        yearTotal: converted(introTotal.plus(renewTotal), unitsPerUsd),
        cnyPerLocal: converted(new MoneyDecimal(1), unitsPerUsd),
      };
    },
  };
}

export function relativeToLowest(price: number, lowest: number): number | null {
  return lowest > 0 ? (price - lowest) / lowest : null;
}
