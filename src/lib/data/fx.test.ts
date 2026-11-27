import { describe, expect, it } from "vitest";
import {
  findFxAnomalies,
  fxSchema,
  parseFrankfurterRates,
  requiredCurrencies,
  selectFx,
} from "./fx.ts";

const rows = requiredCurrencies
  .filter((currency) => currency !== "USD")
  .map((quote) => ({
    date: quote === "PEN" ? "2026-11-26" : "2026-11-27",
    base: "USD",
    quote,
    rate: 0.1,
  }));
const baseline = parseFrankfurterRates(rows);

describe("Frankfurter rates", () => {
  it("validates the currency set and preserves the provider's per-currency dates", () => {
    expect(Object.keys(baseline.rates)).toHaveLength(55);
    expect(baseline).toMatchObject({
      base: "USD",
      date: "2026-11-27",
      provider: "Frankfurter",
      rates: {
        PEN: { date: "2026-11-26", unitsPerUsd: 0.1 },
        USD: { date: "2026-11-27", unitsPerUsd: 1 },
      },
    });
  });

  it("rejects incomplete, duplicate, nonpositive, and malformed rates", () => {
    expect(() => parseFrankfurterRates(rows.slice(1))).toThrow();
    expect(() => parseFrankfurterRates([...rows, rows[0]])).toThrow(
      /Duplicate rate/,
    );
    for (const invalid of [
      { rate: 0 },
      { rate: -1 },
      { rate: Infinity },
      { date: "2026-02-29" },
      { base: "EUR" },
    ]) {
      expect(() =>
        parseFrankfurterRates([{ ...rows[0], ...invalid }, ...rows.slice(1)]),
      ).toThrow();
    }
    expect(() => fxSchema.parse({ ...baseline, date: "2026-11-26" })).toThrow();
  });

  it("prefers a valid live file and falls back when it is missing or invalid", () => {
    const live = parseFrankfurterRates(
      rows.map((row) => ({ ...row, date: "2026-11-28" })),
    );
    expect(selectFx(baseline, live)).toEqual(live);
    expect(selectFx(baseline)).toBe(baseline);
    expect(selectFx(baseline, { ...live, rates: {} })).toBe(baseline);
  });

  it("reports both directions above 20% and accepts exactly ±20%", () => {
    const next = structuredClone(baseline);
    next.rates.AUD.unitsPerUsd = 0.12;
    next.rates.CNY.unitsPerUsd = 0.08;
    next.rates.EUR.unitsPerUsd = 0.1201;
    next.rates.GBP.unitsPerUsd = 0.0799;
    expect(findFxAnomalies(baseline, next)).toEqual([
      { currency: "EUR", before: 0.1, after: 0.1201, percent: 20.1 },
      { currency: "GBP", before: 0.1, after: 0.0799, percent: -20.1 },
    ]);
  });
});
