import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  findFxAnomalies,
  frankfurterRatesUrl,
  fxSchema,
  loadFx,
  maxFxChangePercent,
  parseFrankfurterRates,
} from "../src/lib/data/fx.ts";

const baselinePath = new URL("../src/data/fx.json", import.meta.url);
const livePath = new URL("fx.live.json", baselinePath);

export async function updateFx(
  baselinePath: URL,
  {
    livePath,
    previousPath,
    force = false,
  }: {
    livePath?: URL;
    previousPath?: string | URL;
    force?: boolean;
  } = {},
) {
  const output = livePath ?? baselinePath;
  if (livePath) await rm(livePath, { force: true });

  const baseline = fxSchema.parse(
    JSON.parse(await readFile(baselinePath, "utf8")),
  );
  const previous = loadFx(baseline, previousPath);
  const response = await fetch(frankfurterRatesUrl(), {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Frankfurter returned HTTP ${response.status}`);
  const candidate = parseFrankfurterRates(await response.json());
  if (candidate.date < previous.date) {
    throw new Error(
      `Frankfurter date ${candidate.date} is older than the ${previous.date} baseline`,
    );
  }
  const anomalies = force ? [] : findFxAnomalies(previous, candidate);
  if (anomalies.length > 0) {
    const details = anomalies.map(
      ({ currency, before, after, percent }) =>
        `${currency}: ${before} → ${after} (${percent.toFixed(2)}%)`,
    );
    throw new Error(
      `Rate changes exceed ${maxFxChangePercent}% vs. the ${previous.date} baseline:\n${details.join("\n")}`,
    );
  }

  const temporary = new URL(`${output.href}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(candidate, null, 2)}\n`, {
      flag: "wx",
    });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  return candidate;
}

async function main() {
  const [mode, ...extra] = process.argv.slice(2);
  if (
    (mode !== undefined && mode !== "--live" && mode !== "--force") ||
    extra.length > 0
  ) {
    throw new Error("Usage: pnpm fx:update [--live | --force]");
  }
  const live = mode === "--live";
  const output = live ? livePath : baselinePath;
  const { date } = await updateFx(baselinePath, {
    livePath: live ? livePath : undefined,
    previousPath: live ? process.env.FX_PREVIOUS_PATH : undefined,
    force: mode === "--force",
  });
  console.log(
    `Updated ${output.pathname.split("/").pop()} with Frankfurter rates for ${date}`,
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const detail =
      error instanceof z.ZodError ? z.prettifyError(error) : String(error);
    console.error(`FX update failed: ${detail}`);
    process.exitCode = 1;
  }
}
