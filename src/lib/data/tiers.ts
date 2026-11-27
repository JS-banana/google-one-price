import { createPricing } from "./money.ts";
import { isUsdMarket } from "./offers.ts";
import type { Country, Quote, Snapshot } from "./schema.ts";
import type { PriceView } from "./views.ts";

export const productLines = {
  ultra: { name: "Ultra 与 20x/5x 大容量", shortName: "Ultra / 30TB" },
  pro: { name: "Google AI Pro", shortName: "AI Pro" },
  plus: { name: "Google AI Plus", shortName: "AI Plus" },
  storage: { name: "纯存储", shortName: "纯存储" },
  offers: { name: "免费试用与优惠", shortName: "免费试用" },
} as const;
export type ProductLine = keyof typeof productLines;

type TierDefinition = {
  name: string;
  shortName: string;
  line: ProductLine;
  requiresIntro?: boolean;
  // Earlier SKU IDs win when the same market has identical prices.
  skus: readonly string[] | null;
};

export const tiers = {
  "storage-30tb-monthly": {
    name: "30 TB 存储月付（20x）",
    line: "ultra",
    shortName: "30 TB 月付",
    skus: [
      "com.google.one.30tb.m",
      "g1.ios.30tb.m",
      "com.google.gemini.30tb.m",
      "com.google.one.30tb.m.iog",
      "com.google.gemini.30tb.m.iog",
    ],
  },
  "ultra-50-monthly": {
    name: "Google AI Ultra 5 折 3 个月",
    line: "ultra",
    shortName: "Ultra 5 折 ×3",
    requiresIntro: true,
    skus: [
      "com.google.gemini.30tb.ai.pro.m.3months_ip_50p",
      "g1.ios.30tb.ai.pro.m.3month_ip_50p",
    ],
  },
  "ultra-monthly": {
    name: "Google AI Ultra 原价月付",
    line: "ultra",
    shortName: "Ultra 原价月付",
    skus: [
      "com.google.gemini.30tb.ai.pro.m",
      "g1.ios.30tb.ai.pro.m",
      "com.google.one.30tb.ai.pro.m",
      "com.google.gemini.30tb.ai.pro.m.iog",
      "com.google.one.30tb.ai.pro.m.iog",
    ],
  },
  "storage-20tb-monthly": {
    name: "20 TB 存储月付（5x）",
    line: "ultra",
    shortName: "20 TB 月付",
    skus: [
      "com.google.one.20tb.m",
      "com.google.gemini.20tb.m",
      "g1.ios.20tb.m",
      "g1.ios.20tb.m.v2",
    ],
  },
  "ai-pro-99-monthly": {
    name: "Google AI Pro（5 TB）99% 优惠 · 3 个月",
    line: "pro",
    shortName: "0.1 折 ×3",
    requiresIntro: true,
    skus: [
      "com.google.gemini.2tb.ai.m.3month_ip_99p",
      "g1.ios.2tb.ai.m.3month_ip_99p",
    ],
  },
  "ai-pro-67-75-monthly": {
    name: "Google AI Pro（5 TB）2.5–3.3 折 · 3 个月",
    line: "pro",
    shortName: "2.5–3.3 折 ×3",
    requiresIntro: true,
    skus: [
      "g1.ios.ai.2tb.m.ip_3mo_67p",
      "com.google.gemini.ai.2tb.m.ip_3mo_67p",
      "g1.ios.ai.2tb.m.ip_3mo_75p.acq",
    ],
  },
  "ai-pro-monthly": {
    name: "Google AI Pro（5 TB）原价月付",
    line: "pro",
    shortName: "原价月付",
    skus: [
      "com.google.gemini.2tb.ai.m",
      "com.google.one.2tb.ai.m",
      "com.google.one.2tb.ai.m_v2",
      "g1.ios.2tb.ai.m",
      "com.google.gemini.2tb.ai.m.iog",
    ],
  },
  "ai-pro-yearly": {
    name: "Google AI Pro（5 TB）原价年付",
    line: "pro",
    shortName: "原价年付",
    skus: ["com.google.gemini.2tb.ai.a", "g1.ios.2tb.ai.a"],
  },
  "ai-plus-promo-monthly": {
    name: "Google AI Plus（400 GB）首期特价",
    line: "plus",
    shortName: "首期特价",
    requiresIntro: true,
    skus: [
      "com.google.gemini.helium.m.3month_ip_97p",
      "g1.ios.helium.m.3month_ip_97p",
      "com.google.gemini.helium.m.2months_ip_50p",
      "com.google.gemini.helium.m.6months_ip_50p",
      "com.google.gemini.helium.m.ip_3mo_67p",
      "g1.ios.helium.m.ip_3mo_67p",
    ],
  },
  "ai-plus-monthly": {
    name: "Google AI Plus（400 GB）原价月付",
    line: "plus",
    shortName: "原价月付",
    skus: [
      "com.google.gemini.helium.m",
      "com.google.one.helium.m",
      "g1.ios.helium.m",
      "com.google.gemini.helium.m.iog",
      "com.google.one.helium.m.iog",
    ],
  },
  "storage-10tb-monthly": {
    name: "10 TB 月付",
    line: "storage",
    shortName: "10 TB 月付",
    skus: ["com.google.gemini.10tb.m", "g1.ios.10tb.m"],
  },
  "storage-5tb-monthly": {
    name: "5 TB 月付（独立 SKU）",
    line: "storage",
    shortName: "5 TB 月付",
    skus: ["com.google.gemini.5tb.m", "com.google.gemini.5tb.m.iog"],
  },
  offers: {
    name: "免费试用与各档优惠",
    shortName: "综合优惠榜",
    line: "offers",
    skus: null,
  },
} as const satisfies Record<string, TierDefinition>;

export type TierId = keyof typeof tiers;
export type RankedQuote = { rank: number; quote: Quote; price: number };
export const tierIds = Object.keys(tiers) as TierId[];
export const tierGroups = (Object.keys(productLines) as ProductLine[]).map(
  (line) => ({
    line,
    ...productLines[line],
    ids: tierIds.filter((id) => tiers[id].line === line),
  }),
);

export function tierQuotes(data: Snapshot, tierId: TierId): Quote[] {
  const { skus, requiresIntro = false }: TierDefinition = tiers[tierId];
  const skuIds = skus ? new Set(skus) : null;
  return data.quotes.filter(
    (quote) =>
      quote.status === "active" &&
      (skuIds
        ? skuIds.has(quote.skuId) && requiresIntro === (quote.intro !== null)
        : quote.intro !== null),
  );
}

export function rankTier(
  data: Snapshot,
  tierId: TierId,
  view: PriceView = "year",
): RankedQuote[] {
  const priority = new Map<string, number>(
    tiers[tierId].skus?.map((id, index) => [id, index]),
  );
  const { priceInputs, monthlyCny } = createPricing(data);
  const best = new Map<string, Entry>();
  type Entry = ReturnType<typeof priceInputs> & { quote: Quote };
  const compare = (a: Entry, b: Entry) => {
    const byPrice = (priceView: PriceView) =>
      a.local[priceView]
        .times(b.unitsPerUsd)
        .comparedTo(b.local[priceView].times(a.unitsPerUsd));
    return (
      byPrice(view) ||
      byPrice("renew") ||
      byPrice("intro") ||
      a.quote.countryCode.localeCompare(b.quote.countryCode, "en") ||
      (priority.get(a.quote.skuId) ?? 0) - (priority.get(b.quote.skuId) ?? 0) ||
      a.quote.skuId.localeCompare(b.quote.skuId, "en") ||
      a.quote.source.localeCompare(b.quote.source, "en")
    );
  };

  for (const quote of tierQuotes(data, tierId)) {
    const entry = { quote, ...priceInputs(quote) };
    const current = best.get(quote.countryCode);
    if (!current || compare(entry, current) < 0)
      best.set(quote.countryCode, entry);
  }

  return [...best.values()]
    .sort(compare)
    .map(({ quote, local, unitsPerUsd }, index) => ({
      rank: index + 1,
      quote,
      price: monthlyCny(local[view], unitsPerUsd),
    }));
}

export function summarizeRanking(rows: readonly RankedQuote[]) {
  const count = rows.length;
  const lowest = rows[0]?.price ?? null;
  const highest = rows.at(-1)?.price ?? null;
  const middle = Math.floor(count / 2);
  const median = !count
    ? null
    : count % 2
      ? rows[middle].price
      : (rows[middle - 1].price + rows[middle].price) / 2;
  return {
    count,
    lowest,
    highest,
    median,
    spread: lowest && highest !== null ? highest / lowest : null,
  };
}

export function withoutUsdMarkets(
  rows: readonly RankedQuote[],
  countries: readonly Country[],
): RankedQuote[] {
  const hidden = new Set(countries.filter(isUsdMarket).map(({ code }) => code));
  return rows
    .filter(({ quote }) => !hidden.has(quote.countryCode))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function tierOfferTerms(quotes: readonly Pick<Quote, "introPeriods">[]) {
  const periods = new Set(
    quotes.flatMap(({ introPeriods }) =>
      introPeriods === null ? [] : [introPeriods],
    ),
  );
  return [...periods].sort((a, b) => a - b);
}

export function quoteLine(
  quote: Pick<Quote, "description" | "intro">,
): ProductLine {
  if (quote.intro?.local === 0) return "offers";
  if (/Google AI Ultra|^(?:20|30) TB/u.test(quote.description)) return "ultra";
  if (quote.description.startsWith("Google AI Pro")) return "pro";
  if (quote.description.startsWith("Google AI Plus")) return "plus";
  return "storage";
}
