import { compareConverted, firstPrice } from "./money.ts";
import type { Quote, Snapshot } from "./schema.ts";

export type RankingBasis = "first" | "renewal";

type TierDefinition = {
  name: string;
  defaultBasis: RankingBasis;
  requiresIntro?: boolean;
  // Earlier SKU IDs win when the same market has identical prices.
  skus: readonly string[] | null;
};

export const tiers = {
  "storage-30tb-monthly": {
    name: "30 TB 存储月付（20x）",
    defaultBasis: "renewal",
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
    defaultBasis: "first",
    requiresIntro: true,
    skus: [
      "com.google.gemini.30tb.ai.pro.m.3months_ip_50p",
      "g1.ios.30tb.ai.pro.m.3month_ip_50p",
    ],
  },
  "ultra-monthly": {
    name: "Google AI Ultra 原价月付",
    defaultBasis: "renewal",
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
    defaultBasis: "renewal",
    skus: [
      "com.google.one.20tb.m",
      "com.google.gemini.20tb.m",
      "g1.ios.20tb.m",
      "g1.ios.20tb.m.v2",
    ],
  },
  "ai-pro-99-monthly": {
    name: "Google AI Pro（5 TB）99% 优惠 · 3 个月",
    defaultBasis: "first",
    requiresIntro: true,
    skus: [
      "com.google.gemini.2tb.ai.m.3month_ip_99p",
      "g1.ios.2tb.ai.m.3month_ip_99p",
    ],
  },
  "ai-pro-67-75-monthly": {
    name: "Google AI Pro（5 TB）2.5–3.3 折 · 3 个月",
    defaultBasis: "first",
    requiresIntro: true,
    skus: [
      "g1.ios.ai.2tb.m.ip_3mo_67p",
      "com.google.gemini.ai.2tb.m.ip_3mo_67p",
      "g1.ios.ai.2tb.m.ip_3mo_75p.acq",
    ],
  },
  "ai-pro-monthly": {
    name: "Google AI Pro（5 TB）原价月付",
    defaultBasis: "renewal",
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
    defaultBasis: "renewal",
    skus: ["com.google.gemini.2tb.ai.a", "g1.ios.2tb.ai.a"],
  },
  "storage-10tb-monthly": {
    name: "10 TB 月付",
    defaultBasis: "renewal",
    skus: ["com.google.gemini.10tb.m", "g1.ios.10tb.m"],
  },
  "storage-5tb-monthly": {
    name: "5 TB 月付（独立 SKU）",
    defaultBasis: "renewal",
    skus: ["com.google.gemini.5tb.m", "com.google.gemini.5tb.m.iog"],
  },
  "ai-plus-promo-monthly": {
    name: "Google AI Plus（400 GB）首期特价",
    defaultBasis: "first",
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
    defaultBasis: "renewal",
    skus: [
      "com.google.gemini.helium.m",
      "com.google.one.helium.m",
      "g1.ios.helium.m",
      "com.google.gemini.helium.m.iog",
      "com.google.one.helium.m.iog",
    ],
  },
  offers: { name: "免费试用与各档优惠", defaultBasis: "first", skus: null },
} as const satisfies Record<string, TierDefinition>;

export type TierId = keyof typeof tiers;
export type RankedQuote = { rank: number; quote: Quote };
export const tierIds = Object.keys(tiers) as TierId[];

export function rankTier(
  data: Snapshot,
  tierId: TierId,
  basis: RankingBasis = tiers[tierId].defaultBasis,
): RankedQuote[] {
  const { skus, requiresIntro = false }: TierDefinition = tiers[tierId];
  const priority = new Map<string, number>(
    skus?.map((id, index) => [id, index]),
  );
  const rates = new Map(
    data.exchangeRates.map(({ currency, unitsPerUsd }) => [
      currency,
      unitsPerUsd,
    ]),
  );
  const rate = (q: Quote) => {
    const value = rates.get(q.currency);
    if (value === undefined)
      throw new Error(`Missing exchange rate for ${q.currency}`);
    return value;
  };
  const best = new Map<string, Quote>();
  const compare = (a: Quote, b: Quote) => {
    const rateA = rate(a);
    const rateB = rate(b);
    const first = () =>
      compareConverted(firstPrice(a).local, rateA, firstPrice(b).local, rateB);
    const renewal = () =>
      compareConverted(a.renewal.local, rateA, b.renewal.local, rateB);
    return (
      (basis === "first" ? first() || renewal() : renewal() || first()) ||
      a.countryCode.localeCompare(b.countryCode, "en") ||
      (priority.get(a.skuId) ?? 0) - (priority.get(b.skuId) ?? 0) ||
      a.skuId.localeCompare(b.skuId, "en") ||
      a.source.localeCompare(b.source, "en")
    );
  };

  for (const quote of data.quotes) {
    if (quote.status !== "active") continue;
    const matches = skus
      ? priority.has(quote.skuId) && requiresIntro === (quote.intro !== null)
      : quote.intro !== null;
    if (!matches) continue;
    const current = best.get(quote.countryCode);
    if (!current || compare(quote, current) < 0)
      best.set(quote.countryCode, quote);
  }

  return [...best.values()]
    .sort(compare)
    .map((quote, index) => ({ rank: index + 1, quote }));
}
