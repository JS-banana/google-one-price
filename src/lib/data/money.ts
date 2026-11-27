import { Decimal } from "decimal.js";
import type { Change, Price, Quote, Sku, Snapshot } from "./schema.ts";
import type { PriceView } from "./views.ts";

const MoneyDecimal = Decimal.clone({ precision: 40 });

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

export function encodedOfferMonths(sku: Sku | undefined): number | null {
  const duration = /^P(\d+)(M|Y)$/.exec(sku?.offer?.encodedDuration ?? "");
  return duration ? Number(duration[1]) * (duration[2] === "Y" ? 12 : 1) : null;
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
    amount.times(usdToCny).div(unitsPerUsd).toNumber();
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

export function createPricing(
  data: Pick<Snapshot, "skus" | "exchangeRates" | "metadata">,
) {
  const skus = new Map(data.skus.map((sku) => [sku.id, sku]));
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
    const sku = skus.get(quote.skuId);
    const months = billingMonths(sku?.billingPeriod, quote.description);
    const trialMonths = quote.intro?.local === 0 ? encodedOfferMonths(sku) : 0;
    if (trialMonths === null)
      throw new Error(`Missing trial duration for ${quote.skuId}`);
    const introMonths = trialMonths || (quote.introPeriods ?? 0) * months;
    return {
      ...priceAmounts(
        quote.renewal.local,
        quote.intro?.local ?? null,
        months,
        introMonths,
      ),
      unitsPerUsd,
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
      const amounts = priceInputs(quote);
      return priceTerms(amounts, amounts.unitsPerUsd, usdToCny);
    },
  };
}
