import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findFxAnomalies,
  fxSchema,
  loadFx,
  parseFrankfurterRates,
  requiredCurrencies,
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

describe("loadFx", () => {
  let directory: string;
  let livePath: URL;
  const live = parseFrankfurterRates(
    rows.map((row) => ({ ...row, date: "2026-11-28" })),
  );

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "gop-fx-load-"));
    livePath = pathToFileURL(join(directory, "fx.live.json"));
  });

  afterEach(() => {
    rmSync(directory, { force: true, recursive: true });
    vi.restoreAllMocks();
  });

  it("reads a valid live file when enabled and uses the baseline otherwise", () => {
    expect(loadFx(baseline, livePath)).toBe(baseline);
    writeFileSync(livePath, JSON.stringify(live));
    expect(loadFx(baseline, livePath)).toEqual(live);
    expect(loadFx(baseline)).toBe(baseline);
  });

  it.each([
    ["malformed JSON", "{"],
    ["invalid rates", JSON.stringify({ ...live, rates: {} })],
    [
      "an older snapshot",
      JSON.stringify(
        parseFrankfurterRates(
          rows.map((row) => ({ ...row, date: "2026-11-26" })),
        ),
      ),
    ],
  ])("warns and uses the baseline for %s", (_reason, contents) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeFileSync(livePath, contents);
    expect(loadFx(baseline, livePath)).toBe(baseline);
    expect(warn).toHaveBeenCalledOnce();
  });
});
