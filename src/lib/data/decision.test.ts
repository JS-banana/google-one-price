import { describe, expect, it } from "vitest";
import {
  acquisition,
  alias,
  calculateCost,
  compareFirst,
  comparePlans,
  type DecisionData,
  type DecisionOffer,
  type DecisionPlan,
  decide,
  decisionDefaults,
  decisionGroup,
  lowDifference,
  offerFlags,
  readDecisionParams,
} from "./decision.ts";
import { priceFreshness } from "./freshness.ts";
import { getDecisionData } from "./index.ts";

const unitRate = ["CNY", 1, "2026-11-27"] as const;
const rate = [...unitRate] satisfies DecisionData["rates"][number];
const offer = (
  months: 1 | 12,
  intro: number | null,
  periods: number,
  trial: number,
  renewal: number,
): DecisionOffer => [
  0,
  0,
  0,
  months,
  intro,
  periods,
  trial,
  renewal,
  offerFlags("", intro),
];

describe("cash paid within the selected term", () => {
  it.each([
    ["monthly", offer(1, null, 0, 0, 10), [30, 120, 240]],
    ["monthly intro", offer(1, 2, 6, 0, 10), [6, 72, 192]],
    ["monthly trial", offer(1, 0, 0, 3, 10), [0, 90, 210]],
    ["annual", offer(12, null, 0, 0, 100), [100, 100, 200]],
    ["annual intro", offer(12, 75, 1, 0, 100), [75, 75, 175]],
    ["annual trial", offer(12, 0, 0, 3, 100), [0, 100, 200]],
    ["annual two-year intro", offer(12, 75, 2, 0, 100), [75, 75, 150]],
  ] as const)("%s over 3, 12, and 24 months", (_, quote, expected) => {
    expect(
      [3, 12, 24].map((m) => calculateCost(quote, m, 1, rate, 1).total),
    ).toEqual(expected);
  });

  it("keeps billing dates, charge periods, and full offer duration", () => {
    const trial = calculateCost(offer(12, 0, 0, 3, 120), 24, 3, rate, 1);
    expect(
      trial.bills.map(({ start, count, span }) => [start, count, span]),
    ).toEqual([
      [1, 1, 3],
      [4, 2, 12],
    ]);
    expect(trial.first).toBe(0);
    expect(trial.multiplier).toBe(Infinity);
    expect(trial.perPerson).toBe(80);
    expect(trial.perPersonMonthly).toBeCloseTo(80 / 24);
    const intro = calculateCost(offer(12, 80, 1, 0, 120), 3, 1, rate, 1);
    expect(intro.bills).toHaveLength(1);
    expect(intro.introMonths).toBe(12);
    expect(intro.shortAnnual).toBe(true);
    expect(intro.multiplier).toBe(1.5);
    expect(
      calculateCost(offer(1, 0.01, 3, 0, 0.02), 12, 1, ["X", 3, ""], 2).total,
    ).toBe(0.14);
  });

  // Local arithmetic is derived from App Store charges before conversion.
  it.each([
    [
      "TUR",
      [3 * 10, 12 * 539.99, 24 * 539.99],
      50.687,
      ["3.94", "851.40", "1702.79"],
    ],
    [
      "IND",
      [3 * 10, 14600, 14600 + 19500],
      92.43,
      ["2.16", "1051.96", "2456.99"],
    ],
    [
      "USA",
      [3 * 0.29, 149.99, 149.99 + 199.99],
      1,
      ["5.79", "998.90", "2330.80"],
    ],
  ] as const)(
    "%s real AI Pro plans match hand calculations",
    (country, amounts, unitsPerUsd, cny) => {
      for (const [i, m] of ([3, 12, 24] as const).entries()) {
        const plan = decide(getDecisionData(), {
          ...decisionDefaults,
          m,
        }).ranked.find(({ market }) => market.code === country);
        expect(plan?.local).toBeCloseTo(amounts[i]);
        expect(plan?.total).toBeCloseTo(
          (amounts[i] * 6.6598) / unitsPerUsd,
          10,
        );
        expect(plan?.total.toFixed(2)).toBe(cny[i]);
      }
    },
  );

  it("uses SKU trial months when the price description disagrees", () => {
    const data = getDecisionData();
    const trial = data.offers.pro?.find(
      ([market, sku]) =>
        data.markets[market].code === "TUR" &&
        data.skus[sku] === "com.google.one.2tb.ai.m.2months_eft",
    );
    expect(trial?.[6]).toBe(2);
  });
});

describe("candidate policy and ranking", () => {
  it.each([
    ["g1.ios.helium.a.ip_1yr_25p.acq", "plus"],
    ["g1.ios.helium.2tb.m", undefined],
    ["com.google.gemini.2tb.ai.m.iog", "pro"],
    ["g1.ios.ai.2tb.m.ip_3mo_75p.acq", "pro"],
    ["com.google.gemini.5tb.m.iog", "pro"],
    ["com.google.one.30tb.m", "ultra"],
    ["com.google.gemini.30tb.ai.pro.m", "ultra"],
    ["g1.ios.20tb.m.v2", "20tb"],
    ["com.google.gemini.10tb.m", "10tb"],
    ["com.google.one.2tb.m.1month_eft.v2", "2tb"],
    ["com.google.gemini.100gb.m.iog", "100gb"],
    ["com.google.gemini.30gb.m.3month_ip_70p", "30gb"],
    ["com.google.gemini.200gb.m.iog", "200gb"],
    ["g1.ios.unclassified.m", undefined],
  ] as const)("maps %s to %s", (sku, group) => {
    expect(decisionGroup(sku)).toBe(group);
  });

  it.each([
    ["g1.ios.example", 0, acquisition],
    ["g1.ios.example", 1, acquisition],
    ["g1.ios.example.acq", null, acquisition],
    ["g1.ios.example.1month_ip.0.49", null, acquisition],
    ["g1.ios.example.3month_ip_99p", null, acquisition],
    ["g1.ios.example.ip.0.49", null, acquisition],
    ["g1.ios.example.ip_3mo", null, acquisition],
    ["g1.ios.example.1month_eft.v2", null, acquisition],
    ["com.google.gemini.5tb.m.iog", null, alias],
    ["g1.ios.30tb.m", 0, acquisition | alias],
    ["com.google.gemini.2tb.ai.m_v2", null, 0],
  ] as const)("flags %s", (sku, intro, expected) => {
    expect(offerFlags(sku, intro)).toBe(expected);
  });

  const data = getDecisionData();
  const defaults = decide(data, decisionDefaults);
  const plan = defaults.ranked[0];

  it("breaks total ties by intro, acquisition, billing interval, and ASCII SKU order", () => {
    const regular: DecisionPlan = {
      ...plan,
      offer: offer(1, null, 0, 0, 10),
      months: 1,
      sku: "com.google.m",
    };
    const annual: DecisionPlan = {
      ...regular,
      offer: offer(12, null, 0, 0, 120),
      months: 12,
    };
    const promo = { ...regular, offer: offer(1, 2, 6, 0, 10), sku: "aaa" };
    const acquisitionOnly: DecisionOffer = [...regular.offer];
    acquisitionOnly[8] = acquisition;
    expect(comparePlans(regular, promo)).toBeLessThan(0);
    expect(
      comparePlans(annual, { ...regular, offer: acquisitionOnly }),
    ).toBeLessThan(0);
    expect(comparePlans(regular, annual)).toBeLessThan(0);
    expect(comparePlans(regular, { ...regular, sku: "g1.ios.m" })).toBeLessThan(
      0,
    );
    expect(
      comparePlans({ ...promo, total: regular.total - 0.001 }, regular),
    ).toBeLessThan(0);
  });

  it("breaks zero-first-payment ties by trial, total, renewal, then market", () => {
    const trial = { ...plan, offer: offer(1, 0, 0, 2, 10), first: 0 };
    expect(compareFirst(trial, { ...trial, first: 1, total: 0 })).toBeLessThan(
      0,
    );
    expect(
      compareFirst(trial, { ...trial, offer: offer(1, 0, 0, 1, 10), total: 0 }),
    ).toBeLessThan(0);
    expect(
      compareFirst(trial, { ...trial, total: trial.total + 1, renewalCny: 0 }),
    ).toBeLessThan(0);
    expect(
      compareFirst(trial, { ...trial, renewalCny: trial.renewalCny + 1 }),
    ).toBeLessThan(0);
    expect(
      compareFirst(trial, {
        ...trial,
        market: { ...trial.market, code: "ZZZ" },
      }),
    ).toBeLessThan(0);
  });

  it("excludes AI bundles from pure storage even when the SKU ID is shared", () => {
    expect(
      decisionGroup("com.google.one.2tb.m", "Google AI Plus (2 TB) · 月付"),
    ).toBeUndefined();
    expect(decisionGroup("com.google.one.2tb.m", "2 TB · 月付")).toBe("2tb");
    expect(
      decisionGroup("com.google.one.20tb.m", "20 TB 存储 (含 5x Ultra) · 月付"),
    ).toBeUndefined();
    expect(data.offers["2tb"]).toHaveLength(119);
    expect(data.capacities).not.toContain("20tb");
  });

  it("keeps only regular plans for previous subscribers", () => {
    const seeded = structuredClone(data);
    seeded.skus.push("g1.ios.2tb.ai.m.acq");
    seeded.offers.pro?.push([
      0,
      seeded.skus.length - 1,
      0,
      1,
      null,
      0,
      0,
      0.001,
      acquisition,
    ]);
    const existing = decide(seeded, { ...decisionDefaults, elig: "existing" });
    expect(
      existing.ranked.every(({ offer }) => offer[4] === null && offer[8] === 0),
    ).toBe(true);
    expect(
      existing.ranked.find(({ market }) => market.code === "TUR")?.sku,
    ).toBe("com.google.gemini.2tb.ai.a");
    expect(existing.first).toBeUndefined();
  });

  it("uses an undiscounted mainline baseline even with an access filter", () => {
    const result = decide(data, { ...decisionDefaults, base: "TUR", easy: 1 });
    expect(result.baseline?.sku).toBe("com.google.gemini.2tb.ai.a");
    expect(result.baseline?.local).toBe(8699.99);
    expect(defaults.baseline?.local).toBe(199.99);
    expect(defaults.regular.get("IND")?.offer[8]).toBe(0);
    expect(
      decide(data, { ...decisionDefaults, base: "ZZZ" }).baseline,
    ).toBeUndefined();
  });

  it("selects three distinct default offers and applies the gift-card and duplicate rules", () => {
    expect(defaults.cheapest?.market.code).toBe("IDN");
    expect(defaults.steady?.market.code).toBe("BRA");
    expect(defaults.first?.first).toBe(0);
    expect(defaults.first?.market.code).toBe("BRA");
    expect(defaults.first?.sku).not.toBe(defaults.steady?.sku);
    const easy = decide(data, { ...decisionDefaults, easy: 1 });
    expect(easy.cheapestIsEasy).toBe(true);
    expect(easy.steady).toBe(easy.ranked[1]);
    expect(easy.ranked.every(({ market }) => market.access === "easy")).toBe(
      true,
    );
    const onlyOne = { ...data, offers: { pro: [easy.cheapest.offer] } };
    expect(decide(onlyOne, decisionDefaults)).toMatchObject({
      cheapestIsEasy: true,
      steady: undefined,
      first: undefined,
    });
    const unknown = structuredClone(onlyOne);
    unknown.markets[easy.cheapest.offer[0]].access = "unknown";
    expect(decide(unknown, decisionDefaults).ranked).toHaveLength(1);
    expect(
      decide(unknown, { ...decisionDefaults, easy: 1 }).ranked,
    ).toHaveLength(0);
  });

  it("isolates capacity, suppresses unsupported sharing and validates parameters", () => {
    const params = readDecisionParams(
      new URLSearchParams(
        "need=storage&cap=10tb&m=3&elig=existing&n=6&easy=1&base=tur",
      ),
      data,
    );
    expect(params).toEqual({
      need: "storage",
      cap: "10tb",
      m: 3,
      elig: "existing",
      n: 6,
      easy: 1,
      base: "TUR",
    });
    const result = decide(data, params);
    expect(result.ranked.length).toBeGreaterThan(0);
    expect(
      result.ranked.every(
        ({ sku, perPerson }) =>
          decisionGroup(sku) === "10tb" && perPerson !== null,
      ),
    ).toBe(true);
    const excluded = decide(data, {
      ...params,
      cap: "30gb",
      easy: 0,
      elig: "new",
    });
    expect(excluded.people).toBe(1);
    expect(excluded.ranked[0]?.perPerson).toBeNull();
    expect(
      readDecisionParams(
        new URLSearchParams("need=bad&cap=99tb&m=24.0&n=06&base=bad"),
        data,
      ),
    ).toEqual(decisionDefaults);
  });

  it("uses strict annual and per-person monthly thresholds", () => {
    expect(lowDifference(-24.99, 3, 1)).toBe(true);
    expect(lowDifference(25, 3, 1)).toBe(false);
    expect(lowDifference(47.99, 12, 2)).toBe(true);
    expect(lowDifference(48, 12, 2)).toBe(false);
  });
});

describe("price observation freshness", () => {
  it.each([
    [0, "fresh", 0],
    [7, "fresh", 7],
    [7.5, "aging", 7],
    [30, "aging", 30],
    [31, "stale", 31],
    [-1, "fresh", 0],
  ])(
    "classifies %s day(s) after the UTC+8 observation",
    (elapsed, state, days) => {
      const now = Date.parse("2026-11-27T06:12:20Z") + elapsed * 86_400_000;
      expect(priceFreshness("2026-11-27T14:12:20", now)).toEqual({
        state,
        days,
      });
    },
  );
});
