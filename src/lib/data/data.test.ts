import { describe, expect, it } from "vitest";
import rawSnapshot from "../../data/snapshot.json" with { type: "json" };
import {
  firstPrice,
  getCountries,
  getCountryQuotes,
  getMatrix,
  getSkus,
  getTierRanking,
} from "./index.ts";
import { toPrice } from "./money.ts";
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
    const matrix = getMatrix();
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
    expect(trial && firstPrice(trial).cny).toBe(0);
    expect(base && firstPrice(base)).toEqual(base?.renewal);
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
      rankTier(data, "ai-pro-99-monthly").map(({ quote }) => quote),
    ).toEqual([b, a]);
    expect(
      rankTier(data, "ai-pro-99-monthly", "renewal").map(({ quote }) => quote),
    ).toEqual([a, b]);
    expect(
      getTierRanking("ai-pro-99-monthly").every(
        ({ quote }) => quote.status === "active",
      ),
    ).toBe(true);
  });
});
