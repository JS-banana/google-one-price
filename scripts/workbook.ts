import readExcelFile, { type Row, type SheetData } from "read-excel-file/node";
import { z } from "zod";
import { matrixColumns } from "../src/lib/data/matrix.ts";
import { encodedOfferMonths, toPrice } from "../src/lib/data/money.ts";
import { resolveIntroPeriods } from "../src/lib/data/offers.ts";
import {
  amountSchema,
  type Country,
  countryCodeSchema,
  currencySchema,
  dateTimeSchema,
  type ExchangeRate,
  rateSchema,
  type Snapshot,
  skuIdSchema,
  snapshotSchema,
  sourceSchema,
  textSchema,
} from "../src/lib/data/schema.ts";
import { getCountryLabels } from "./countries.ts";
import { decodeSku } from "./sku.ts";

const layout = {
  overview: {
    name: "总览与Top5低价榜",
    headerRow: 5,
    headers: [
      "档位与筛选口径",
      "排名",
      "国家代码",
      "国家/地区",
      "币种",
      "优惠期数",
      "首期/当前价(原币)",
      "首期折合(CNY)",
      "续费原价(原币)",
      "续费折合(CNY)",
      "对应 SKU",
    ],
  },
  matrix: {
    name: "全球60国最新矩阵",
    headerRow: 4,
    headers: [
      "国家代码",
      "国家/地区",
      "币种",
      ...matrixColumns.flatMap(({ label }) => [
        `${label}(原币)`,
        `${label}(CNY)`,
      ]),
    ],
  },
  quotes: {
    name: "60国原始明细",
    headerRow: 4,
    headers: [
      "国家代码",
      "国家名称",
      "SKU",
      "中文档位说明",
      "币种",
      "首期优惠(原币)",
      "首期折合(CNY)",
      "续费/原价(原币)",
      "续费折合(CNY)",
      "来源",
    ],
  },
  changes: {
    name: "变动与避坑记录",
    headerRow: 4,
    headers: [
      "变动类型",
      "国家",
      "套餐中文说明",
      "SKU",
      "首期优惠(原币)",
      "首期折合(CNY)",
      "续费/原价(原币)",
      "续费折合(CNY)",
    ],
  },
  rates: {
    name: "实时汇率",
    headerRow: 5,
    headers: [
      "币种代码",
      "币种中文名",
      "1 USD 兑该币种",
      "1 单位折合 CNY",
      "1 CNY 兑该币种",
    ],
  },
} satisfies Record<
  string,
  { name: string; headerRow: number; headers: string[] }
>;

type SheetKey = keyof typeof layout;
type Workbook = Record<SheetKey, SheetData>;

export function validate<T>(
  schema: z.ZodType<T>,
  input: unknown,
  location: string,
): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(`${location}\n${z.prettifyError(result.error)}`);
  return result.data;
}

export function canonicalNumber(value: string | number): number {
  return Number(Number(value).toPrecision(15));
}

export async function readWorkbook(path: string): Promise<Workbook> {
  const sheets = await readExcelFile(path, { parseNumber: canonicalNumber });
  const find = (key: SheetKey) => {
    const { name, headerRow, headers } = layout[key];
    const sheet = sheets.find(({ sheet }) => sheet === name);
    if (!sheet) throw new Error(`Missing worksheet "${name}"`);
    const actual = sheet.data[headerRow - 1] ?? [];
    if (actual.length !== headers.length) {
      throw new Error(
        `${name}!row ${headerRow}: expected ${headers.length} columns, found ${actual.length}`,
      );
    }
    for (const [index, header] of headers.entries()) {
      validate(
        z.literal(header),
        actual[index],
        `${name}!row ${headerRow}, column ${index + 1}`,
      );
    }
    return sheet.data;
  };
  if (sheets.length !== Object.keys(layout).length) {
    throw new Error(
      `Expected five worksheets, found ${sheets.length}: ${sheets.map(({ sheet }) => sheet).join(", ")}`,
    );
  }
  const overview = find("overview");
  validate(
    textSchema.regex(/^一、\s*各档位当前全球最低 Top 5/),
    overview[3][0],
    `${layout.overview.name}!A4`,
  );
  return {
    overview,
    matrix: find("matrix"),
    quotes: find("quotes"),
    changes: find("changes"),
    rates: find("rates"),
  };
}

export function dataRows<T>(
  workbook: Workbook,
  key: SheetKey,
  parse: (row: Row, location: string) => T,
): T[] {
  const { name, headerRow } = layout[key];
  return workbook[key]
    .slice(headerRow)
    .map((row, index) => parse(row, `${name}!row ${headerRow + index + 1}`));
}

const sourceLabel = /^(\w+) \((活跃|历史2026-11-25)\)$/;
const quoteRow = z.tuple([
  countryCodeSchema,
  textSchema,
  skuIdSchema,
  textSchema,
  currencySchema,
  amountSchema.nullable(),
  z.unknown(),
  amountSchema,
  z.unknown(),
  textSchema.regex(sourceLabel),
]);
const rateRow = z.tuple([
  currencySchema,
  textSchema,
  rateSchema,
  z.unknown(),
  z.unknown(),
]);
const changeRow = z.tuple([
  textSchema,
  textSchema.regex(/^.+ \([A-Z]{3}\)$/),
  textSchema,
  skuIdSchema,
  textSchema,
  amountSchema.nullable(),
  textSchema,
  amountSchema,
]);

const localTimestamp = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;

function readTimestamp(
  value: unknown,
  prefix: string,
  location: string,
): string {
  const text = validate(textSchema, value, location);
  const match = new RegExp(`^${prefix}: (${localTimestamp.source}) \\|`).exec(
    text,
  );
  if (!match) throw new Error(`${location}: missing ${prefix} timestamp`);
  return validate(dateTimeSchema, match[1].replace(" ", "T"), location);
}

export function normalizeWorkbook(workbook: Workbook): Snapshot {
  const fxLocation = `${layout.rates.name}!A2`;
  const fxHeader = validate(textSchema, workbook.rates[1][0], fxLocation);
  const fx = /\| 汇率源: ([^ ]+) \((.+ (?:[+-]\d{4}|GMT|UTC))\)$/.exec(
    fxHeader,
  );
  const fxTime = fx ? new Date(fx[2]) : null;
  if (!fx || !fxTime || Number.isNaN(fxTime.getTime())) {
    throw new Error(
      `${fxLocation}: missing exchange-rate provider or publication timestamp`,
    );
  }
  const [, , usdToCny] = validate(
    z.tuple([
      z.literal("USD 对人民币 (USD/CNY)"),
      z.literal("CNY"),
      rateSchema,
      z.unknown(),
      z.unknown(),
    ]),
    workbook.rates[2],
    `${layout.rates.name}!row 3`,
  );
  const metadata = {
    refreshedAt: readTimestamp(fxHeader, "更新时间", fxLocation),
    changesCheckedAt: readTimestamp(
      workbook.changes[1][0],
      "最近一次检查",
      `${layout.changes.name}!A2`,
    ),
    usdToCny,
    fxProvider: fx[1],
    fxPublishedAt: fxTime.toISOString(),
  };
  const rates = new Map<string, ExchangeRate>();
  dataRows(workbook, "rates", (row, location) => {
    const [currency, nameZh, unitsPerUsd] = validate(rateRow, row, location);
    if (rates.has(currency))
      throw new Error(`${location}: duplicate exchange rate for ${currency}`);
    rates.set(currency, { currency, nameZh, unitsPerUsd });
  });
  if (
    rates.get("USD")?.unitsPerUsd !== 1 ||
    rates.get("CNY")?.unitsPerUsd !== usdToCny
  ) {
    throw new Error(
      `${layout.rates.name}: USD must be 1 and the CNY row must match C3`,
    );
  }

  const price = (value: number, currency: string, location: string) => {
    const rate = rates.get(currency);
    if (!rate)
      throw new Error(`${location}: missing exchange rate for ${currency}`);
    return toPrice(value, rate.unitsPerUsd, usdToCny);
  };
  const names = new Map<string, string>();
  const countries = new Map<string, Country>();
  const skuIds = new Set<string>();
  const quoteKeys = new Set<string>();
  const activeKeys = new Set<string>();
  const quotes = dataRows(workbook, "quotes", (row, location) => {
    const [
      countryCode,
      nameZh,
      skuId,
      description,
      currency,
      intro,
      ,
      renewal,
      ,
      label,
    ] = validate(quoteRow, row, location);
    const [, sourceLabelId, statusLabel] = sourceLabel.exec(label) ?? [];
    const source = validate(sourceSchema, sourceLabelId, location);
    const status = source.startsWith("legacy_") ? "historical" : "active";
    if ((status === "active") !== (statusLabel === "活跃")) {
      throw new Error(`${location}: source and status disagree: ${label}`);
    }
    const marketSku = `${countryCode}/${skuId}`;
    const key = `${marketSku}/${source}`;
    if (
      quoteKeys.has(key) ||
      (status === "active" && activeKeys.has(marketSku))
    ) {
      throw new Error(`${location}: duplicate quote: ${key}`);
    }
    quoteKeys.add(key);
    skuIds.add(skuId);
    if (names.has(countryCode) && names.get(countryCode) !== nameZh) {
      throw new Error(
        `${location}: inconsistent country name for ${countryCode}`,
      );
    }
    names.set(countryCode, nameZh);
    if (status === "active") {
      activeKeys.add(marketSku);
      const country = countries.get(countryCode);
      if (country && country.currency !== currency) {
        throw new Error(
          `${location}: multiple active currencies for ${countryCode}`,
        );
      }
      if (!country) {
        countries.set(countryCode, {
          code: countryCode,
          nameZh,
          ...getCountryLabels(countryCode),
          currency,
        });
      }
    }
    const sku = decodeSku(skuId);
    const introPeriods =
      intro === null ? null : resolveIntroPeriods(description, sku).periods;
    if (intro === 0 && encodedOfferMonths(sku) === null) {
      throw new Error(`${location}: missing trial duration for ${skuId}`);
    }
    if (intro !== null && intro > 0 && introPeriods === null) {
      throw new Error(`${location}: missing intro periods for ${skuId}`);
    }
    return {
      countryCode,
      skuId,
      description,
      currency,
      source,
      status,
      intro: intro === null ? null : price(intro, currency, location),
      introPeriods,
      renewal: price(renewal, currency, location),
    };
  });
  const summary = validate(
    textSchema.regex(/^共 \d+ 条记录 \|/),
    workbook.quotes[1][0],
    `${layout.quotes.name}!A2`,
  );
  if (Number(summary.split(" ")[1]) !== quotes.length) {
    throw new Error(
      `${layout.quotes.name}!A2: declared record count differs from the ${quotes.length} parsed rows`,
    );
  }
  for (const code of names.keys()) {
    if (!countries.has(code))
      throw new Error(`${layout.quotes.name}: ${code} has no active quotes`);
  }

  const changes = dataRows(workbook, "changes", (row, location) => {
    const [
      kind,
      market,
      description,
      skuId,
      introText,
      reportedIntroCny,
      renewalText,
      reportedRenewalCny,
    ] = validate(changeRow, row, location);
    const countryCode = market.slice(-4, -1);
    const country = countries.get(countryCode);
    if (!country || market.slice(0, -6) !== country.nameZh) {
      throw new Error(
        `${location}: unknown country or name mismatch: ${market}`,
      );
    }
    const [, localRenewal, currency] =
      /^(\d+(?:\.\d+)?) ([A-Z]{3})$/.exec(renewalText) ?? [];
    const [, localIntro, introCurrency, periods] =
      /^(\d+(?:\.\d+)?) ([A-Z]{3}) ×(\d+)期$/.exec(introText) ?? [];
    if (
      !currency ||
      (introText !== "-" && (introCurrency !== currency || !periods)) ||
      (localIntro === undefined) !== (reportedIntroCny === null)
    ) {
      throw new Error(
        `${location}: invalid or conflicting change prices: ${introText} / ${renewalText}`,
      );
    }
    const intro = localIntro === undefined ? null : canonicalNumber(localIntro);
    if (intro === 0 && encodedOfferMonths(decodeSku(skuId)) === null) {
      throw new Error(`${location}: missing trial duration for ${skuId}`);
    }
    skuIds.add(skuId);
    return {
      kind,
      countryCode,
      skuId,
      description,
      currency,
      intro: intro === null ? null : price(intro, currency, location),
      renewal: price(canonicalNumber(localRenewal), currency, location),
      introPeriods: periods === undefined ? null : Number(periods),
      reportedIntroCny,
      reportedRenewalCny,
    };
  });
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return validate(
    snapshotSchema,
    {
      metadata,
      countries: [...countries.values()].sort((a, b) =>
        compare(a.code, b.code),
      ),
      skus: [...skuIds].sort(compare).map(decodeSku),
      quotes: quotes.sort(
        (a, b) =>
          compare(a.countryCode, b.countryCode) ||
          compare(a.skuId, b.skuId) ||
          compare(a.source, b.source),
      ),
      changes: changes.sort(
        (a, b) =>
          compare(a.countryCode, b.countryCode) ||
          compare(a.skuId, b.skuId) ||
          compare(JSON.stringify(a), JSON.stringify(b)),
      ),
      exchangeRates: [...rates.values()].sort((a, b) =>
        compare(a.currency, b.currency),
      ),
    },
    "Normalized snapshot",
  );
}
