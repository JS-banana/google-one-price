import { describePrice } from "./data";
import type { PricedQuote } from "./data/money";
import { formatPriceDetail, formatPriceLines } from "./price-labels";

export function priceDisplay(quote: PricedQuote) {
  const terms = describePrice(quote);
  const amounts = {
    currency: quote.currency,
    intro: quote.intro?.local ?? null,
    renewal: quote.renewal.local,
  };
  return {
    ...formatPriceLines(amounts, terms),
    annual: terms.annual,
    prices: terms.prices,
    detail: formatPriceDetail(amounts, terms),
  };
}

export type PriceDisplay = ReturnType<typeof priceDisplay>;
