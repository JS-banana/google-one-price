import { z } from "zod";
import {
  activeQuoteIndex,
  buildMatrix,
  matrixColumns,
} from "../src/lib/data/matrix.ts";
import { introPrice } from "../src/lib/data/money.ts";
import {
  amountSchema,
  countryCodeSchema,
  currencySchema,
  type Quote,
  type Snapshot,
  skuIdSchema,
  textSchema,
} from "../src/lib/data/schema.ts";
import { rankTier, type TierId } from "../src/lib/data/tiers.ts";
import { dataRows, type readWorkbook, validate } from "./workbook.ts";

const topGroups = {
  "storage-30tb-monthly": "20x / 30 TB 纯存储月付",
  "ultra-50-monthly": "20x Google AI Ultra 5 折 3 个月",
  "ultra-monthly": "20x Google AI Ultra 原价月付",
  "storage-20tb-monthly": "5x / 20 TB 月付",
  "ai-pro-99-monthly": "Google AI Pro (5 TB) 99% off 3 个月",
  "ai-pro-67-75-monthly": "Google AI Pro (5 TB) 67% off 3 个月",
  "ai-pro-monthly": "Google AI Pro (5 TB) 原价月付",
  "ai-pro-yearly": "Google AI Pro (5 TB) 原价年付",
  "storage-10tb-monthly": "10 TB 月付",
  "storage-5tb-monthly": "5 TB 月付",
  "ai-plus-promo-monthly": "Google AI Plus (400 GB) 首期特价",
  "ai-plus-monthly": "Google AI Plus (400 GB) 原价月付",
  workbookOffers: "0 元试用与自动发现新优惠 SKU 实时榜",
} satisfies Partial<Record<TierId, string>> & { workbookOffers: string };

const topRow = z.tuple([
  textSchema.nullable(),
  z.int().min(1).max(5),
  countryCodeSchema,
  textSchema,
  currencySchema,
  textSchema,
  amountSchema,
  z.unknown(),
  amountSchema,
  z.unknown(),
  skuIdSchema,
]);
const matrixRow = z.tuple(
  [countryCodeSchema, textSchema, currencySchema],
  z.unknown(),
);

export function readReferenceViews(
  workbook: Awaited<ReturnType<typeof readWorkbook>>,
) {
  const groupIds = Object.keys(topGroups) as (keyof typeof topGroups)[];
  const top = dataRows(workbook, "overview", (row, location) => {
    const [
      label,
      rank,
      countryCode,
      nameZh,
      currency,
      ,
      first,
      ,
      renewal,
      ,
      skuId,
    ] = validate(topRow, row, location);
    return {
      location,
      label,
      rank,
      countryCode,
      nameZh,
      currency,
      first,
      renewal,
      skuId,
    };
  });
  if (top.length !== groupIds.length * 5) {
    throw new Error(
      `总览与Top5低价榜: expected ${groupIds.length} groups of five, found ${top.length} rows`,
    );
  }
  const groups = groupIds.map((id, index) => {
    const rows = top.slice(index * 5, (index + 1) * 5);
    for (const [position, row] of rows.entries()) {
      if (
        row.rank !== position + 1 ||
        (position === 0
          ? !row.label?.startsWith(topGroups[id])
          : row.label !== null)
      ) {
        throw new Error(
          `${row.location}: unexpected group or rank for "${topGroups[id]}"`,
        );
      }
    }
    return { id, rows };
  });

  const matrix = dataRows(workbook, "matrix", (row, location) => {
    const [countryCode, nameZh, currency, ...values] = validate(
      matrixRow,
      row,
      location,
    );
    if (values.length !== matrixColumns.length * 2) {
      throw new Error(
        `${location}: expected ${matrixColumns.length} pairs of local and CNY prices`,
      );
    }
    const prices = matrixColumns.map(({ label }, index) =>
      validate(
        amountSchema.nullable(),
        values[index * 2],
        `${location} ${label}(原币)`,
      ),
    );
    return { location, countryCode, nameZh, currency, prices };
  });
  if (
    matrix.length !== 60 ||
    new Set(matrix.map(({ countryCode }) => countryCode)).size !== 60
  ) {
    throw new Error(
      "全球60国最新矩阵: expected one row per country, 60 in total",
    );
  }
  return { groups, matrix };
}

function amounts(quote: Quote) {
  return `${quote.countryCode}/${quote.skuId} ${quote.currency} ${introPrice(quote).local} → ${quote.renewal.local}`;
}

export function reconcile(
  data: Snapshot,
  reference: ReturnType<typeof readReferenceViews>,
) {
  const mismatches: string[] = [];
  const rankDifferences: string[] = [];
  const active = activeQuoteIndex(data);
  const { rows, columns } = buildMatrix(data);
  const matrix = new Map(rows.map((row) => [row.country.code, row]));
  let matrixCells = 0;
  for (const expected of reference.matrix) {
    const row = matrix.get(expected.countryCode);
    if (
      !row ||
      row.country.nameZh !== expected.nameZh ||
      row.country.currency !== expected.currency
    ) {
      mismatches.push(
        `${expected.location}: country/name/currency mismatch for ${expected.countryCode}`,
      );
    }
    for (const [index, { skuId, label }] of columns.entries()) {
      matrixCells += 1;
      const quote = row?.quotes.get(skuId);
      const actual = quote ? introPrice(quote).local : null;
      if (actual !== expected.prices[index]) {
        mismatches.push(
          `${expected.location} ${label}: Excel ${expected.prices[index]}, derived ${actual}`,
        );
      }
    }
  }

  let topRows = 0;
  for (const { id, rows: expectedRows } of reference.groups) {
    const top =
      id === "workbookOffers"
        ? null
        : rankTier(
            data,
            id,
            expectedRows[0].first !== expectedRows[0].renewal
              ? "intro"
              : "renew",
          ).slice(0, 5);
    for (const expected of expectedRows) {
      topRows += 1;
      const quote = active.get(`${expected.countryCode}/${expected.skuId}`);
      const country = matrix.get(expected.countryCode)?.country;
      const source = `${expected.countryCode}/${expected.skuId} ${expected.currency} ${expected.first} → ${expected.renewal}`;
      if (
        !quote ||
        country?.nameZh !== expected.nameZh ||
        quote.currency !== expected.currency ||
        introPrice(quote).local !== expected.first ||
        quote.renewal.local !== expected.renewal
      ) {
        mismatches.push(
          `${expected.location}: Excel ${source}; raw ${quote ? amounts(quote) : "missing"}`,
        );
      }
      if (!top) continue;
      const derived = top[expected.rank - 1]?.quote;
      if (
        !derived ||
        derived.countryCode !== expected.countryCode ||
        derived.skuId !== expected.skuId ||
        derived.currency !== expected.currency ||
        introPrice(derived).local !== expected.first ||
        derived.renewal.local !== expected.renewal
      ) {
        rankDifferences.push(
          `${id} #${expected.rank}: Excel ${source}; derived ${derived ? amounts(derived) : "missing"}`,
        );
      }
    }
  }
  return { topRows, matrixCells, mismatches, rankDifferences };
}
