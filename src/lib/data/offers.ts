import { Decimal } from "decimal.js";
import {
  billingMonths,
  encodedOfferMonths,
  type PricedQuote,
  type PriceTerms,
} from "./money.ts";
import type { Country, Quote, Sku, Snapshot } from "./schema.ts";
import type { PriceView } from "./views.ts";

export function resolveIntroPeriods(description: string, sku: Sku) {
  const terms =
    /[×x]\s*([1-9]\d*)\s*期/u.exec(description) ??
    /首\s*([1-9]\d*)\s*期/u.exec(description);
  const duration = encodedOfferMonths(sku);
  const stated = terms ? Number(terms[1]) : null;
  const encoded =
    duration === null
      ? null
      : duration / billingMonths(sku.billingPeriod, description);
  return {
    periods:
      stated ??
      (encoded !== null && Number.isInteger(encoded) ? encoded : null),
    conflict: stated !== null && encoded !== null && stated !== encoded,
  };
}

type OfferPrices = {
  intro: Pick<NonNullable<Quote["intro"]>, "local"> | null;
  renewal: Pick<Quote["renewal"], "local">;
};

export function hasHistoricalPriceAnomaly(
  quote: OfferPrices & Pick<Quote, "status">,
) {
  return (
    quote.status === "historical" &&
    quote.intro !== null &&
    quote.intro.local > quote.renewal.local
  );
}

export function summarizeFreeTrials(
  data: Pick<Snapshot, "countries" | "quotes">,
  describePrice: (quote: PricedQuote) => PriceTerms,
) {
  const countries = new Map(
    data.countries.map((country) => [country.code, country]),
  );
  type Trial = {
    product: string;
    months: Set<number>;
    countries: Map<string, Country>;
    lowest: { country: Country; price: number };
  };
  const products = new Map<string, Trial>();
  for (const quote of data.quotes) {
    if (quote.status !== "active" || quote.intro?.local !== 0) continue;
    const country = countries.get(quote.countryCode);
    if (!country) throw new Error(`Unknown country: ${quote.countryCode}`);
    const product = quote.description.split(/\s*·\s*首/u, 1)[0];
    const { introMonths, prices } = describePrice(quote);
    const current = products.get(product) ?? {
      product,
      months: new Set<number>(),
      countries: new Map<string, Country>(),
      lowest: { country, price: prices.renew },
    };
    current.months.add(introMonths);
    current.countries.set(country.code, country);
    if (
      prices.renew < current.lowest.price ||
      (prices.renew === current.lowest.price &&
        country.code < current.lowest.country.code)
    ) {
      current.lowest = { country, price: prices.renew };
    }
    products.set(product, current);
  }
  return [...products.values()]
    .sort((a, b) =>
      a.product.localeCompare(b.product, "zh-CN", { numeric: true }),
    )
    .map(({ months, countries, ...trial }) => ({
      ...trial,
      months: [...months].sort((a, b) => a - b),
      countries: [...countries.values()].sort((a, b) =>
        a.nameZh.localeCompare(b.nameZh, "zh-CN"),
      ),
    }));
}

export function renewalMultiplier(quote: OfferPrices): number | null {
  if (!quote.intro || quote.renewal.local <= quote.intro.local) return null;
  return quote.intro.local === 0
    ? Infinity
    : new Decimal(quote.renewal.local).div(quote.intro.local).toNumber();
}

export function renewalTrap(quote: OfferPrices) {
  const multiplier = renewalMultiplier(quote);
  if (multiplier === Infinity) return { level: "warn", kind: "trial" } as const;
  if (multiplier !== null && multiplier >= 1.2) {
    return {
      level: multiplier >= 10 ? "warn" : "caution",
      kind: "multiplier",
      multiplier,
    } as const;
  }
  return null;
}

export function homeCardNotice(
  leader: OfferPrices,
  view: PriceView,
  renewMonthly: number,
): number | null {
  const multiplier = renewalMultiplier(leader);
  return view === "intro" && multiplier !== null && multiplier >= 10
    ? renewMonthly
    : null;
}

export function isUsdMarket(
  country: Pick<Country, "currency" | "code">,
): boolean {
  return country.currency === "USD" && country.code !== "USA";
}
