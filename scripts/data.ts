import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readReferenceViews, reconcile } from "./reconcile.ts";
import { normalizeWorkbook, readWorkbook } from "./workbook.ts";

const defaultSource = fileURLToPath(
  new URL(
    "../data/source/GoogleOne_iOS_60_Countries_Matrix.xlsx",
    import.meta.url,
  ),
);
const output = fileURLToPath(
  new URL("../src/data/snapshot.json", import.meta.url),
);
const [command, path = defaultSource, ...extra] = process.argv.slice(2);

async function main() {
  if ((command !== "import" && command !== "check") || extra.length > 0) {
    throw new Error(
      "Usage: pnpm data:import [xlsx-path] or pnpm data:check [xlsx-path]",
    );
  }
  const workbook = await readWorkbook(path);
  const snapshot = normalizeWorkbook(workbook);
  const reference = readReferenceViews(workbook);
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;

  if (command === "import") {
    await mkdir(dirname(output), { recursive: true });
    const temporary = `${output}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, json, { flag: "wx" });
      await rename(temporary, output);
    } finally {
      await rm(temporary, { force: true });
    }
    console.log(
      `Imported ${snapshot.quotes.length} quotes in ${snapshot.countries.length} markets into src/data/snapshot.json`,
    );
    return;
  }

  const result = reconcile(snapshot, reference);
  console.log(
    `Checked ${result.matrixCells} matrix cells and ${result.topRows} Top 5 rows against raw local prices`,
  );
  if (result.rankDifferences.length > 0) {
    console.log(
      `Derived Top 5 differs at ${result.rankDifferences.length} positions:\n${result.rankDifferences.join("\n")}`,
    );
  }
  if (result.mismatches.length > 0) {
    throw new Error(
      `${result.mismatches.length} reference mismatches:\n${result.mismatches.join("\n")}`,
    );
  }
  if ((await readFile(output, "utf8")) !== json) {
    throw new Error(
      "src/data/snapshot.json does not match this workbook. Run pnpm data:import with the same path.",
    );
  }
}

try {
  await main();
} catch (error) {
  console.error(
    `Data ${command} failed (${path}): ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
