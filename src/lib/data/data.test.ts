import { describe, expect, it } from "vitest";
import { decodeSku } from "../../../scripts/sku.ts";
import rawFx from "../../data/fx.json" with { type: "json" };
import rawSnapshot from "../../data/snapshot.json" with { type: "json" };
import { fxSchema } from "./fx.ts";
import {
  cnyPerLocal,
  describePrice,
  getChanges,
  getComparisonMatrix,
  getCountries,
  getCountryQuotes,
  getFreeTrials,
  getMetadata,
  getSkus,
  getTierDetails,
  getTierRanking,
  getWorkbookMatrix,
  groupChanges,
  groupCountryQuotes,
  hasHistoricalPriceAnomaly,
  isGlobalTierLowest,
  isUsdMarket,
  priceFor,
  priceViews,
  quoteLine,
  relativeToLowest,
  summarizeRanking,
  tierGroups,
  tierIds,
  withoutUsdMarkets,
} from "./index.ts";
import { createPricing, introPrice, toPrice } from "./money.ts";
import { resolveIntroPeriods } from "./offers.ts";
import { renewalTrap } from "./renewal.ts";
import { type Quote, quoteSchema, snapshotSchema } from "./schema.ts";
import { rankTier } from "./tiers.ts";

const snapshot = snapshotSchema.parse(rawSnapshot);
const pricing = createPricing(snapshot.skus, fxSchema.parse(rawFx));

describe("snapshot access", () => {
  it("preserves active and historical quotes with their own currencies", () => {
    expect(getCountries()).toHaveLength(60);
    const active = getCountryQuotes("ARG", "active");
    const historical = getCountryQuotes("ARG", "historical");
    expect(active.length + historical.length).toBe(
      getCountryQuotes("ARG").length,
    );
    expect(
      active.every(
        (quote) =>
          quote.currency ===
          getCountries().find((country) => country.code === "ARG")?.currency,
      ),
    ).toBe(true);
    expect(
      historical.some((quote) => quote.currency !== active[0]?.currency),
    ).toBe(true);
    expect(getCountryQuotes("XXX")).toEqual([]);
  });

  it("indexes the exact active SKU and preserves missing matrix cells", () => {
    const matrix = getWorkbookMatrix();
    const skuIds = new Set(getSkus().map(({ id }) => id));
    expect(snapshot.quotes.every((quote) => skuIds.has(quote.skuId))).toBe(
      true,
    );
    expect(matrix.columns).toHaveLength(15);
    expect(matrix.rows).toHaveLength(60);
    for (const { country, quotes } of matrix.rows) {
      const active = getCountryQuotes(country.code, "active");
      for (const { skuId } of matrix.columns) {
        expect(quotes.get(skuId)).toEqual(
          active.find((quote) => quote.skuId === skuId) ?? null,
        );
      }
    }
  });
});

describe("prices and rankings", () => {
  it("rounds exact decimal halves upwards and preserves free trials", () => {
    expect(toPrice(1.005, 1, 1)).toEqual({ local: 1.005, cny: 1.01 });
    expect(toPrice(1, 8, 6.68)).toEqual({ local: 1, cny: 0.84 });
    const trial = getCountryQuotes("ARG", "active").find(
      (quote) => quote.intro?.local === 0,
    );
    const base = getCountryQuotes("ARG", "active").find(
      (quote) => quote.intro === null,
    );
    expect(trial && introPrice(trial).cny).toBe(0);
    expect(base && introPrice(base)).toEqual(base?.renewal);
  });

  it("switches ranking basis, collapses aliases by market and excludes historical quotes", () => {
    const row = (
      countryCode: string,
      skuId: string,
      intro: number,
      renewal: number,
      status: Quote["status"] = "active",
    ): Quote => ({
      countryCode,
      skuId,
      currency: "USD",
      description: "Test offer",
      source: status === "active" ? "applecommerce_v26" : "legacy_20261125",
      status,
      intro: toPrice(intro, 1, 1),
      introPeriods: 3,
      renewal: toPrice(renewal, 1, 1),
    });
    const gemini = "com.google.gemini.2tb.ai.m.3month_ip_99p";
    const alias = "g1.ios.2tb.ai.m.3month_ip_99p";
    const a = row("ARG", gemini, 1.003, 10);
    const b = row("BRA", gemini, 1.002, 20);
    const quotes = [
      a,
      b,
      row("BRA", alias, 1.002, 20),
      row("USA", gemini, 0, 1, "historical"),
    ];
    expect(a.intro?.cny).toBe(b.intro?.cny);
    expect(
      rankTier(quotes, pricing, "ai-pro-99-monthly", "intro").map(
        ({ quote }) => quote,
      ),
    ).toEqual([b, a]);
    expect(
      rankTier(quotes, pricing, "ai-pro-99-monthly", "renew").map(
        ({ quote }) => quote,
      ),
    ).toEqual([a, b]);
    expect(
      getTierRanking("ai-pro-99-monthly").every(
        ({ quote }) => quote.status === "active",
      ),
    ).toBe(true);
  });
});

describe("price views and offers", () => {
  it("puts stated paid periods ahead of encoded periods and tracks source conflicts", () => {
    const monthly = decodeSku("com.google.one.2tb.ai.m.2months_eft");
    const annual = decodeSku("com.google.one.100gb.a.1month_eft");
    expect(resolveIntroPeriods("首1期 $0 免费试用", monthly)).toEqual({
      periods: 1,
      conflict: true,
    });
    expect(resolveIntroPeriods("没有期数", monthly)).toEqual({
      periods: 2,
      conflict: false,
    });
    const paid = decodeSku("g1.ios.2tb.ai.m.3month_ip_99p");
    expect(resolveIntroPeriods("首1期 ¥5 ×6期", paid)).toEqual({
      periods: 6,
      conflict: true,
    });
    expect(resolveIntroPeriods("没有期数", paid).periods).toBe(3);
    expect(resolveIntroPeriods("年付 · 首1期 $0", annual)).toEqual({
      periods: 1,
      conflict: true,
    });
    expect(resolveIntroPeriods("没有期数", annual)).toEqual({
      periods: null,
      conflict: false,
    });
    expect(
      snapshot.quotes.filter(
        (q) =>
          q.intro &&
          resolveIntroPeriods(q.description, decodeSku(q.skuId)).conflict,
      ),
    ).toHaveLength(219);
  });

  it("weights the whole first year, folds annual SKUs and does not round before computing", () => {
    const monthly = snapshot.quotes.find(
      (q) =>
        q.currency === "USD" &&
        q.introPeriods === 3 &&
        (q.intro?.local ?? 0) > 0 &&
        decodeSku(q.skuId).billingPeriod === "P1M",
    );
    if (!monthly?.intro) throw new Error("Missing monthly promotion fixture");
    const fx = getMetadata().usdToCny;
    expect(priceFor(monthly, "intro")).toBeCloseTo(
      monthly.intro.local * fx,
      10,
    );
    expect(priceFor(monthly, "renew")).toBeCloseTo(
      monthly.renewal.local * fx,
      10,
    );
    expect(priceFor(monthly, "year")).toBeCloseTo(
      ((monthly.intro.local * 3 + monthly.renewal.local * 9) * fx) / 12,
      10,
    );
    expect(priceFor({ ...monthly, introPeriods: 12 }, "year")).toBe(
      priceFor(monthly, "intro"),
    );
    const terms = describePrice(monthly);
    expect(terms.introMonths).toBe(3);
    expect(terms.renewMonths).toBe(9);
    expect(terms.introTotal + terms.renewTotal).toBeCloseTo(terms.yearTotal);
  });

  it("uses the SKU duration for trials and charges the full annual renewal in year one", () => {
    const annual = getCountryQuotes("IND", "active").find(
      (q) => q.skuId === "com.google.one.100gb.a.1month_eft",
    );
    if (!annual) throw new Error("Missing annual trial fixture");
    expect(describePrice(annual)).toMatchObject({
      annual: true,
      introMonths: 1,
      renewMonths: 11,
      introTotal: 0,
    });
    expect(priceFor(annual, "renew")).toBeCloseTo(annual.renewal.cny / 12, 2);
    expect(priceFor(annual, "intro")).toBe(0);
    expect(priceFor(annual, "year")).toBe(priceFor(annual, "renew"));
    const withoutSourcePeriods = quoteSchema.parse({
      ...annual,
      introPeriods: null,
    });
    expect(describePrice(withoutSourcePeriods)).toEqual(describePrice(annual));
    for (const [suffix, months] of [
      ["2months_eft", 2],
      ["1month_eft", 1],
    ] as const) {
      const monthly = getCountryQuotes("IND", "active").find(
        (q) => q.skuId.includes("2tb.ai.m.") && q.skuId.endsWith(suffix),
      );
      if (!monthly) throw new Error(`Missing ${suffix} fixture`);
      expect(describePrice(monthly).introMonths).toBe(months);
      expect(priceFor(monthly, "intro")).toBe(0);
      expect(priceFor(monthly, "year")).toBeCloseTo(
        (priceFor(monthly, "renew") * (12 - months)) / 12,
        10,
      );
    }
  });

  it("uses first-year discounted annual prices and counts the qualifying markets", () => {
    for (const [id, count] of [
      ["ai-pro-promo-yearly", 60],
      ["ai-plus-promo-yearly", 20],
    ] as const) {
      const rows = getTierRanking(id);
      expect(rows).toHaveLength(count);
      const turkey = rows.find(({ quote }) => quote.countryCode === "TUR");
      if (!turkey?.quote.intro)
        throw new Error(`Missing Turkish intro quote for ${id}`);
      expect(turkey.price).toBeCloseTo(
        (turkey.quote.intro.local * cnyPerLocal("TRY")) / 12,
        10,
      );
      expect(turkey.price).toBe(priceFor(turkey.quote, "intro"));
      expect(describePrice(turkey.quote)).toMatchObject({
        annual: true,
        introMonths: 12,
        renewMonths: 0,
      });
    }
  });

  it("groups active free trials by product and deduplicates trial aliases and markets", () => {
    const rows = getFreeTrials();
    expect(rows).toHaveLength(6);
    const pro = rows.find(
      ({ product }) => product === "Google AI Pro (5 TB) · 月付",
    );
    expect(pro?.months).toEqual([1, 2]);
    expect(pro?.countries).toHaveLength(60);
    expect(new Set(pro?.countries.map(({ code }) => code)).size).toBe(60);
    const eligible = snapshot.quotes.filter(
      (q) =>
        q.status === "active" &&
        q.intro?.local === 0 &&
        q.description.startsWith("Google AI Pro"),
    );
    expect(pro?.lowest.price).toBe(
      Math.min(...eligible.map((q) => priceFor(q, "renew"))),
    );
    expect(
      rows.find(({ product }) => product === "100 GB 存储 · 年付")?.countries,
    ).toHaveLength(32);
    expect(rows.flatMap(({ months }) => months)).not.toContain(12);
  });

  it("flags only historical quotes whose intro exceeds their renewal", () => {
    const anomaly = getCountryQuotes("UZB", "historical").find(
      (q) => q.skuId === "g1.ai.pro.6months_ip_50p",
    );
    if (!anomaly) throw new Error("Missing historical anomaly fixture");
    expect(hasHistoricalPriceAnomaly(anomaly)).toBe(true);
    expect(hasHistoricalPriceAnomaly({ ...anomaly, status: "active" })).toBe(
      false,
    );
    expect(
      hasHistoricalPriceAnomaly({ ...anomaly, intro: anomaly.renewal }),
    ).toBe(false);
  });

  it("recognizes all active aliases tied at the global minimum", () => {
    const aliases = getCountryQuotes("TUR").filter(
      (q) => q.skuId.includes(".20tb.m") && q.status === "active",
    );
    const lowest = getTierRanking("storage-20tb-monthly")[0].price;
    const tied = aliases.filter((q) => priceFor(q, "year") === lowest);
    expect(tied).toHaveLength(3);
    const grouped = groupCountryQuotes(getCountryQuotes("TUR"), getSkus());
    expect(grouped.find((group) => group.includes(tied[0]))).toEqual(
      expect.arrayContaining(tied),
    );
    for (const q of tied) {
      expect(isGlobalTierLowest(q, "year", priceFor(q, "year"))).toBe(true);
      expect(
        isGlobalTierLowest(
          { ...q, status: "historical" },
          "year",
          priceFor(q, "year"),
        ),
      ).toBe(false);
    }
  });

  it("classifies price jumps using the original decimal amounts", () => {
    expect(renewalTrap(null, 195)).toBeNull();
    expect(renewalTrap(0, 0)).toBeNull();
    expect(renewalTrap(2, 1)).toBeNull();
    expect(renewalTrap(1, 1.19)).toBeNull();
    expect(renewalTrap(0.1, 0.12)).toEqual({
      kind: "multiplier",
      multiplier: 1.2,
      level: "caution",
    });
    expect(renewalTrap(0.0000001, 0.00000012)?.level).toBe("caution");
    expect(renewalTrap(1, 9.99)?.level).toBe("caution");
    expect(renewalTrap(1, 10)).toEqual({
      kind: "multiplier",
      multiplier: 10,
      level: "warn",
    });
    expect(renewalTrap(0, 195)).toEqual({
      kind: "trial",
      level: "warn",
    });
  });

  it("groups only country aliases with matching products, terms and raw prices", () => {
    const tur = getCountryQuotes("TUR", "active");
    const promo = tur.find(
      ({ skuId }) => skuId === "com.google.one.100gb.m.3month_ip.0.49",
    );
    if (!promo?.intro) throw new Error("Missing paid offer fixture");
    const alias = {
      ...promo,
      skuId: `${promo.skuId}.iog`,
      source: "apple_catalog",
    } as const;
    const [, billing, terms] = promo.description.split(" · ");
    const distinct: Quote[] = [
      { ...promo, description: `200 GB 存储 · ${billing} · ${terms}` },
      { ...promo, skuId: "com.google.one.100gb.a" },
      { ...promo, introPeriods: 1 },
      {
        ...promo,
        description: `100 GB 存储 · ${billing} · 首期5折(50% off)×3期`,
      },
      { ...promo, intro: { ...promo.intro, local: promo.intro.local + 0.01 } },
      {
        ...promo,
        renewal: { ...promo.renewal, local: promo.renewal.local + 0.01 },
      },
      { ...promo, currency: "USD" },
      { ...promo, countryCode: "USA" },
      { ...promo, status: "historical" },
    ];
    expect(groupCountryQuotes([alias, promo, ...distinct], getSkus())).toEqual([
      [promo, alias],
      ...distinct.map((quote) => [quote]),
    ]);
  });

  it("keeps identically labeled trials with different SKU durations separate", () => {
    const trials = getCountryQuotes("TUR", "active").filter(
      ({ skuId }) =>
        skuId === "com.google.gemini.2tb.ai.m.1month_eft" ||
        skuId === "com.google.one.2tb.ai.m.2months_eft",
    );
    expect(trials).toHaveLength(2);
    expect(trials[0].description).toBe(trials[1].description);
    expect(groupCountryQuotes(trials, getSkus())).toEqual(
      trials.map((quote) => [quote]),
    );
  });

  it("uses the same ordered tiers and exact ranking in the comparison matrix", () => {
    expect(tierGroups.map(({ line }) => line)).toEqual([
      "ultra",
      "pro",
      "plus",
      "storage",
    ]);
    expect(tierGroups.flatMap(({ ids }) => ids)).toEqual(tierIds);
    const matrix = getComparisonMatrix();
    expect(matrix).toHaveLength(60);
    for (const [col, id] of tierIds.entries()) {
      for (const [index, view] of priceViews.entries()) {
        const ranking = matrix
          .flatMap(({ cells }) => cells[col][index] ?? [])
          .sort((a, b) => a.rank - b.rank);
        expect(ranking).toEqual(getTierRanking(id, view));
      }
    }
    expect(getTierDetails("ai-plus-promo-monthly").introPeriods).toEqual([
      2, 3, 6,
    ]);
  });

  it("excludes only non-US dollar markets and calculates the filtered summary", () => {
    expect(snapshot.countries.filter(isUsdMarket)).toHaveLength(20);
    expect(isUsdMarket({ code: "USA", currency: "USD" })).toBe(false);
    expect(snapshot.countries.find(({ code }) => code === "TUR")?.iso2).toBe(
      "TR",
    );
    const all = getTierRanking("ai-pro-monthly", "year");
    const filtered = withoutUsdMarkets(all, snapshot.countries);
    expect(filtered).toHaveLength(40);
    expect(filtered.map(({ rank }) => rank)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
    expect(summarizeRanking(filtered)).toMatchObject({
      count: 40,
      lowest: filtered[0].price,
      highest: filtered[39].price,
    });
    expect(relativeToLowest(15, 10)).toBe(0.5);
    expect(relativeToLowest(10, 0)).toBeNull();
  });

  it("classifies country SKU groups and aggregates time-tied change rows", () => {
    expect(
      quoteLine({ description: "20 TB 存储 (5x)", skuId: "g1.ios.20tb.m" }),
    ).toBe("storage");
    expect(
      quoteLine({
        description: "Google AI Pro (5 TB)",
        skuId: "com.google.one.2tb.ai.m.2months_eft",
      }),
    ).toBe("pro");
    expect(
      quoteLine({ description: "5 TB", skuId: "com.google.gemini.5tb.m" }),
    ).toBe("pro");
    const groups = groupChanges(getChanges());
    expect(groups).toHaveLength(14);
    expect(groups.reduce((sum, group) => sum + group.summary.count, 0)).toBe(
      100,
    );
    expect(
      groups.every(
        (group, i) => i === 0 || group.rows.length <= groups[i - 1].rows.length,
      ),
    ).toBe(true);
  });
});
