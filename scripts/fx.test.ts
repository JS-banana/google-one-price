import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rawFx from "../src/data/fx.json" with { type: "json" };
import { fxSchema, requiredCurrencies } from "../src/lib/data/fx.ts";
import { updateFx } from "./fx.ts";

const baseline = fxSchema.parse(rawFx);
const baselineJson = JSON.stringify(baseline);
const nextDate = new Date(Date.parse(baseline.date) + 86_400_000)
  .toISOString()
  .slice(0, 10);

function frankfurterRows(date: string, arsRate: number) {
  return requiredCurrencies
    .filter((currency) => currency !== "USD")
    .map((quote) => ({
      date,
      base: "USD",
      quote,
      rate: quote === "ARS" ? arsRate : baseline.rates[quote].unitsPerUsd,
    }));
}

describe("updateFx", () => {
  let directory: string;
  let baselinePath: URL;
  let livePath: URL;
  let previousPath: URL;
  const fetch = vi.fn<typeof globalThis.fetch>();

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "gop-fx-update-"));
    baselinePath = pathToFileURL(join(directory, "fx.json"));
    livePath = pathToFileURL(join(directory, "fx.live.json"));
    previousPath = pathToFileURL(join(directory, "previous.json"));
    await writeFile(baselinePath, baselineJson);
    vi.stubGlobal("fetch", fetch);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    fetch.mockReset();
    await rm(directory, { force: true, recursive: true });
  });

  it("compares with the last validated rates when cached and falls back to the baseline on a miss", async () => {
    const previous = structuredClone(baseline);
    previous.date = previous.rates.CNY.date = nextDate;
    previous.rates.ARS.unitsPerUsd *= 1.15;
    const candidateRate = previous.rates.ARS.unitsPerUsd * 1.15;
    const rows = frankfurterRows(nextDate, candidateRate);
    fetch.mockImplementation(async () => Response.json(rows));

    await expect(
      updateFx(baselinePath, { livePath, previousPath }),
    ).rejects.toThrow(/Rate changes exceed 20%/);

    const previousJson = JSON.stringify(previous);
    await writeFile(previousPath, previousJson);
    await updateFx(baselinePath, { livePath, previousPath });
    const saved = fxSchema.parse(JSON.parse(await readFile(livePath, "utf8")));
    expect(saved.date).toBe(nextDate);
    expect(saved.rates.ARS.unitsPerUsd).toBe(candidateRate);
    expect(await readFile(previousPath, "utf8")).toBe(previousJson);
    expect(await readFile(baselinePath, "utf8")).toBe(baselineJson);
  });

  it("removes old live output on a failed fetch without deleting the cache", async () => {
    await writeFile(livePath, baselineJson);
    await writeFile(previousPath, baselineJson);
    fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      updateFx(baselinePath, { livePath, previousPath }),
    ).rejects.toThrow(/HTTP 503/);
    await expect(readFile(livePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(previousPath, "utf8")).toBe(baselineJson);
  });

  it("rejects a date older than the cached reference and clears the live file", async () => {
    const previous = structuredClone(baseline);
    previous.date = previous.rates.CNY.date = nextDate;
    await writeFile(previousPath, JSON.stringify(previous));
    await writeFile(livePath, baselineJson);
    fetch.mockResolvedValueOnce(
      Response.json(
        frankfurterRows(baseline.date, baseline.rates.ARS.unitsPerUsd),
      ),
    );

    await expect(
      updateFx(baselinePath, { livePath, previousPath }),
    ).rejects.toThrow(`older than the ${nextDate} baseline`);
    await expect(readFile(livePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("can force a reviewed baseline update while still rejecting older and malformed data", async () => {
    const candidateRate = baseline.rates.ARS.unitsPerUsd * 1.25;
    const rows = frankfurterRows(nextDate, candidateRate);
    fetch
      .mockResolvedValueOnce(Response.json(rows))
      .mockResolvedValueOnce(Response.json(rows))
      .mockResolvedValueOnce(
        Response.json(frankfurterRows(baseline.date, candidateRate)),
      )
      .mockResolvedValueOnce(Response.json(rows.slice(1)));

    await expect(updateFx(baselinePath)).rejects.toThrow(
      /Rate changes exceed 20%/,
    );
    expect(await readFile(baselinePath, "utf8")).toBe(baselineJson);
    await updateFx(baselinePath, { force: true });

    const updatedJson = await readFile(baselinePath, "utf8");
    const saved = fxSchema.parse(JSON.parse(updatedJson));
    expect(saved.rates.ARS.unitsPerUsd).toBe(candidateRate);
    await expect(updateFx(baselinePath, { force: true })).rejects.toThrow(
      /older than/,
    );
    await expect(updateFx(baselinePath, { force: true })).rejects.toThrow();
    expect(await readFile(baselinePath, "utf8")).toBe(updatedJson);
  });
});
