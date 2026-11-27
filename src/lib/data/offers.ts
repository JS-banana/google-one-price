import { Decimal } from "decimal.js";
import { billingMonths } from "./money.ts";
import type { Country, Quote, Sku } from "./schema.ts";
import type { PriceView } from "./views.ts";

export function resolveIntroPeriods(description: string, sku: Sku) {
  const terms = /[×x]\s*([1-9]\d*)\s*期|首\s*([1-9]\d*)\s*期/u.exec(
    description,
  );
  const duration = /^P(\d+)(M|Y)$/.exec(sku.offer?.encodedDuration ?? "");
  const stated = terms ? Number(terms[1] ?? terms[2]) : null;
  const encoded = duration
    ? (Number(duration[1]) * (duration[2] === "Y" ? 12 : 1)) /
      billingMonths(sku.billingPeriod, description)
    : null;
  return {
    periods:
      stated ??
      (encoded !== null && Number.isInteger(encoded) ? encoded : null),
    conflict: stated !== null && encoded !== null && stated !== encoded,
  };
}

type OfferPrices = Pick<Quote, "intro" | "renewal">;

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
