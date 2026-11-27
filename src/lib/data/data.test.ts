import { describe, expect, it } from "vitest";
import { decodeSku } from "../../../scripts/sku.ts";
import rawSnapshot from "../../data/snapshot.json" with { type: "json" };
import {
  describePrice,
  getComparisonMatrix,
  getCountries,
  getCountryAdvantages,
  getCountryQuotes,
  getSkus,
  getTierDetails,
  getTierRanking,
  getWorkbookMatrix,
  groupChanges,
  homeCardNotice,
  isUsdMarket,
  priceFor,
  priceViews,
  quoteLine,
  relativeToLowest,
  renewalMultiplier,
  renewalTrap,
  summarizeRanking,
  tierGroups,
  tierIds,
  withoutUsdMarkets,
} from "./index.ts";
import { introPrice, toPrice } from "./money.ts";
import { resolveIntroPeriods } from "./offers.ts";
import { type Quote, snapshotSchema } from "./schema.ts";
import { rankTier } from "./tiers.ts";

const snapshot = snapshotSchema.parse(rawSnapshot);

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
    const data = {
      ...snapshot,
      quotes: [
        a,
        b,
        row("BRA", alias, 1.002, 20),
        row("USA", gemini, 0, 1, "historical"),
      ],
    };
    expect(a.intro?.cny).toBe(b.intro?.cny);
    expect(
      rankTier(data, "ai-pro-99-monthly", "intro").map(({ quote }) => quote),
    ).toEqual([b, a]);
    expect(
      rankTier(data, "ai-pro-99-monthly", "renew").map(({ quote }) => quote),
    ).toEqual([a, b]);
    expect(
      getTierRanking("ai-pro-99-monthly").every(
        ({ quote }) => quote.status === "active",
      ),
    ).toBe(true);
  });
});

describe("stage B price views", () => {
  it("uses stated billing periods before encoded periods and tracks conflicts", () => {
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
    expect(resolveIntroPeriods("首期 ¥5 ×3期", monthly)).toEqual({
      periods: 3,
      conflict: true,
    });
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
    const fx = snapshot.metadata.usdToCny;
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
    const annual = snapshot.quotes.find(
      (q) =>
        q.currency === "USD" &&
        q.intro?.local === 0 &&
        decodeSku(q.skuId).billingPeriod === "P1Y",
    );
    if (!annual) throw new Error("Missing annual trial fixture");
    expect(describePrice(annual).annual).toBe(true);
    expect(priceFor(annual, "renew")).toBeCloseTo(
      (annual.renewal.local * fx) / 12,
      10,
    );
    expect(priceFor(annual, "intro")).toBe(0);
    expect(priceFor(annual, "year")).toBe(0);
  });

  it("classifies price jumps and shows the homepage warning only in intro", () => {
    const offer = (intro: number | null, renew: number) => ({
      intro: intro === null ? null : toPrice(intro, 1, 1),
      renewal: toPrice(renew, 1, 1),
    });
    expect(renewalMultiplier(offer(1, 195))).toBe(195);
    expect(renewalTrap(offer(null, 195))).toBeNull();
    expect(renewalTrap(offer(2, 1))).toBeNull();
    expect(renewalTrap(offer(1, 1.19))).toBeNull();
    expect(renewalTrap(offer(0.1, 0.12))).toEqual({
      kind: "multiplier",
      multiplier: 1.2,
      level: "caution",
    });
    expect(renewalTrap(offer(1, 10))).toEqual({
      kind: "multiplier",
      multiplier: 10,
      level: "warn",
    });
    expect(renewalTrap(offer(0, 195))).toEqual({
      kind: "trial",
      level: "warn",
    });
    expect(homeCardNotice(offer(1, 195), "intro", 140)).toBe(140);
    expect(homeCardNotice(offer(0, 195), "intro", 140)).toBe(140);
    expect(homeCardNotice(offer(1, 195), "year", 140)).toBeNull();
    expect(homeCardNotice(offer(1, 9.99), "intro", 140)).toBeNull();
  });

  it("uses the same ordered tiers and exact ranking in the comparison matrix", () => {
    expect(tierGroups.map(({ line }) => line)).toEqual([
      "ultra",
      "pro",
      "plus",
      "storage",
      "offers",
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
    expect(getCountryAdvantages(all[0].quote.countryCode)).toContainEqual({
      id: "ai-pro-monthly",
      ...all[0],
    });
  });

  it("classifies country SKU groups and aggregates time-tied change rows", () => {
    expect(quoteLine({ description: "20 TB 存储 (5x)", intro: null })).toBe(
      "ultra",
    );
    expect(
      quoteLine({ description: "Google AI Pro (5 TB)", intro: null }),
    ).toBe("pro");
    expect(
      quoteLine({
        description: "Google AI Pro (5 TB)",
        intro: toPrice(0, 1, 1),
      }),
    ).toBe("offers");
    const groups = groupChanges(snapshot.changes);
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
