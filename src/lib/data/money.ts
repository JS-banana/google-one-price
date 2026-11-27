import { Decimal } from "decimal.js";
import type { Fx } from "./fx.ts";
import type { LocalChange, LocalQuote, Price, Sku, WithCny } from "./schema.ts";
import type { PriceView } from "./views.ts";

const MoneyDecimal = Decimal.clone({ precision: 40 });

export type PricedQuote = Pick<
  LocalQuote | LocalChange,
  "skuId" | "currency" | "description" | "intro" | "introPeriods" | "renewal"
>;

function convertToCny(
  amount: Decimal.Value,
  unitsPerUsd: number,
  usdToCny: number,
) {
  return new MoneyDecimal(amount).times(usdToCny).div(unitsPerUsd);
}

export function toPrice(
  local: number,
  unitsPerUsd: number,
  usdToCny: number,
): Price {
  return {
    local,
    cny: convertToCny(local, unitsPerUsd, usdToCny)
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

export function introPrice<T>(quote: { intro: T | null; renewal: T }): T {
  return quote.intro ?? quote.renewal;
}

export function encodedOfferMonths(sku: Sku | undefined): number | null {
  const duration = /^P(\d+)(M|Y)$/.exec(sku?.offer?.encodedDuration ?? "");
  return duration ? Number(duration[1]) * (duration[2] === "Y" ? 12 : 1) : null;
}

export function billingTerms(quote: PricedQuote, sku: Sku | undefined) {
  const months = billingMonths(sku?.billingPeriod, quote.description);
  const trialMonths = quote.intro?.local === 0 ? encodedOfferMonths(sku) : 0;
  if (trialMonths === null)
    throw new Error(`Missing trial duration for ${quote.skuId}`);
  return { months, trialMonths, introPeriods: quote.introPeriods ?? 0 };
}

function priceAmounts(
  renewal: number,
  initial: number | null,
  months: 1 | 12,
  introMonths: number,
) {
  const firstYearIntroMonths = Math.min(12, introMonths);
  const renewMonths = 12 - firstYearIntroMonths;
  // Every monthly price shares a denominator of 12, including annual SKUs.
  const intro = new MoneyDecimal(initial ?? renewal).times(12 / months);
  const renew = new MoneyDecimal(renewal).times(12 / months);
  const introTotal = intro.times(firstYearIntroMonths).div(12);
  // An annual renewal is paid in full when a trial ends.
  const billingUnits =
    months === 12 && (initial === 0 || renewMonths > 0) ? 12 : renewMonths;
  const renewTotal = renew.times(billingUnits).div(12);
  return {
    local: { intro, year: introTotal.plus(renewTotal), renew },
    months,
    introMonths,
    renewMonths,
    introTotal,
    renewTotal,
  };
}

function priceTerms(
  amounts: ReturnType<typeof priceAmounts>,
  unitsPerUsd: number,
  usdToCny: number,
) {
  const { local, months, introMonths, renewMonths, introTotal, renewTotal } =
    amounts;
  const converted = (amount: Decimal) =>
    convertToCny(amount, unitsPerUsd, usdToCny).toNumber();
  return {
    prices: {
      intro: converted(local.intro.div(12)),
      year: converted(local.year.div(12)),
      renew: converted(local.renew.div(12)),
    },
    annual: months === 12,
    introMonths,
    renewMonths,
    introTotal: converted(introTotal),
    renewTotal: converted(renewTotal),
    yearTotal: converted(local.year),
    cnyPerLocal: converted(new MoneyDecimal(1)),
  };
}

export function describeRawPrice(
  renewal: number,
  intro: number | null,
  months: 1 | 12,
  introMonths: number,
  unitsPerUsd: number,
  usdToCny: number,
) {
  return priceTerms(
    priceAmounts(renewal, intro, months, introMonths),
    unitsPerUsd,
    usdToCny,
  );
}

export type PriceTerms = ReturnType<typeof priceTerms>;

export function createPricing(skuList: readonly Sku[], fx: Fx) {
  const skus = new Map(skuList.map((sku) => [sku.id, sku]));
  const rates = new Map(Object.entries(fx.rates));
  const usdToCny = fx.rates.CNY.unitsPerUsd;
  const rateFor = (currency: string) => {
    const rate = rates.get(currency);
    if (rate === undefined)
      throw new Error(`Missing exchange rate for ${currency}`);
    return rate.unitsPerUsd;
  };
  const priceInputs = (quote: PricedQuote) => {
    const { months, trialMonths, introPeriods } = billingTerms(
      quote,
      skus.get(quote.skuId),
    );
    return {
      ...priceAmounts(
        quote.renewal.local,
        quote.intro?.local ?? null,
        months,
        trialMonths || introPeriods * months,
      ),
      unitsPerUsd: rateFor(quote.currency),
    };
  };
  const monthlyCny = (amount: Decimal, unitsPerUsd: number) =>
    convertToCny(amount.div(12), unitsPerUsd, usdToCny).toNumber();
  return {
    priceInputs,
    monthlyCny,
    cnyPerLocal(currency: string) {
      return convertToCny(1, rateFor(currency), usdToCny).toNumber();
    },
    withCny<T extends PricedQuote>(quote: T): WithCny<T> {
      const { intro, renewal, ...rest } = quote;
      const rate = rateFor(quote.currency);
      return {
        ...rest,
        intro: intro && toPrice(intro.local, rate, usdToCny),
        renewal: toPrice(renewal.local, rate, usdToCny),
      };
    },
    priceFor(quote: PricedQuote, view: PriceView): number {
      const { local, unitsPerUsd } = priceInputs(quote);
      return monthlyCny(local[view], unitsPerUsd);
    },
    describePrice(quote: PricedQuote) {
      const amounts = priceInputs(quote);
      return priceTerms(amounts, amounts.unitsPerUsd, usdToCny);
    },
  };
}
