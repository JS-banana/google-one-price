import { existsSync, readFileSync } from "node:fs";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { rateSchema } from "./schema.ts";

export const fxProvider = "Frankfurter";
export const fxProviderUrl = "https://frankfurter.dev/";

export const currencyNames = {
  AED: "阿联酋迪拉姆",
  ARS: "阿根廷比索",
  AUD: "澳元",
  BDT: "孟加拉塔卡",
  BRL: "巴西雷亚尔",
  CAD: "加元",
  CHF: "瑞士法郎",
  CLP: "智利比索",
  CNY: "人民币",
  COP: "哥伦比亚比索",
  DKK: "丹麦克朗",
  DZD: "阿尔及利亚第纳尔",
  EGP: "埃及镑",
  EUR: "欧元",
  GBP: "英镑",
  GEL: "格鲁吉亚拉里",
  GHS: "加纳塞地",
  HKD: "港元",
  HUF: "匈牙利福林",
  IDR: "印尼盾",
  ILS: "以色列新谢克尔",
  INR: "印度卢比",
  JOD: "约旦第纳尔",
  JPY: "日元",
  KES: "肯尼亚先令",
  KRW: "韩元",
  KZT: "哈萨克斯坦坚戈",
  LKR: "斯里兰卡卢比",
  MAD: "摩洛哥迪拉姆",
  MMK: "缅甸元",
  MXN: "墨西哥比索",
  MYR: "马来西亚林吉特",
  NGN: "尼日利亚奈拉",
  NOK: "挪威克朗",
  NZD: "新西兰元",
  PEN: "秘鲁索尔",
  PHP: "菲律宾比索",
  PKR: "巴基斯坦卢比",
  PLN: "波兰兹罗提",
  QAR: "卡塔尔里亚尔",
  RON: "罗马尼亚列伊",
  SAR: "沙特里亚尔",
  SEK: "瑞典克朗",
  SGD: "新加坡元",
  THB: "泰铢",
  TRY: "土耳其里拉",
  TWD: "新台币",
  TZS: "坦桑尼亚先令",
  UAH: "乌克兰格里夫纳",
  USD: "美元",
  UZS: "乌兹别克斯坦索姆",
  VND: "越南盾",
  XAF: "中非法郎",
  XOF: "西非法郎",
  ZAR: "南非兰特",
} as const;

type Currency = keyof typeof currencyNames;
export const requiredCurrencies = Object.keys(currencyNames) as Currency[];
export const fxCurrencySchema = z.enum(requiredCurrencies);

const fxRateSchema = z.object({
  date: z.iso.date(),
  unitsPerUsd: rateSchema,
});

export const fxSchema = z
  .object({
    date: z.iso.date(),
    provider: z.literal(fxProvider),
    base: z.literal("USD"),
    rates: z.record(fxCurrencySchema, fxRateSchema),
  })
  .refine(({ date, rates }) => date === rates.CNY.date, {
    path: ["date"],
    message: "FX date must match the CNY rate date",
  })
  .refine(({ rates }) => rates.USD.unitsPerUsd === 1, {
    path: ["rates", "USD"],
    message: "USD base rate must be 1",
  });

export type Fx = z.infer<typeof fxSchema>;
export type ExchangeRate = Fx["rates"][Currency] & {
  currency: Currency;
  nameZh: string;
};

const frankfurterRows = z.array(
  z.object({
    date: z.iso.date(),
    base: z.literal("USD"),
    quote: fxCurrencySchema.exclude(["USD"]),
    rate: rateSchema,
  }),
);
export function frankfurterRatesUrl() {
  const url = new URL("https://api.frankfurter.dev/v2/rates");
  url.searchParams.set("base", "USD");
  url.searchParams.set(
    "quotes",
    requiredCurrencies.filter((currency) => currency !== "USD").join(","),
  );
  return url;
}

export function parseFrankfurterRates(input: unknown): Fx {
  const rates: Partial<Fx["rates"]> = {};
  for (const { date, quote, rate } of frankfurterRows.parse(input)) {
    if (rates[quote]) throw new Error(`Duplicate rate for ${quote}`);
    rates[quote] = { date, unitsPerUsd: rate };
  }
  const date = rates.CNY?.date;
  if (date) rates.USD = { date, unitsPerUsd: 1 };
  return fxSchema.parse({ date, provider: fxProvider, base: "USD", rates });
}

export const maxFxChangePercent = 20;

export function findFxAnomalies(previous: Fx, candidate: Fx) {
  return requiredCurrencies.flatMap((currency) => {
    const before = previous.rates[currency].unitsPerUsd;
    const after = candidate.rates[currency].unitsPerUsd;
    const delta = new Decimal(after).minus(before);
    if (
      delta.abs().times(100).lte(new Decimal(before).times(maxFxChangePercent))
    ) {
      return [];
    }
    return [
      {
        currency,
        before,
        after,
        percent: delta.div(before).times(100).toNumber(),
      },
    ];
  });
}

export function loadFx(baseline: Fx, livePath?: string | URL): Fx {
  if (!livePath || !existsSync(livePath)) return baseline;
  try {
    const live = fxSchema.parse(JSON.parse(readFileSync(livePath, "utf8")));
    if (live.date >= baseline.date) return live;
    console.warn(
      `Ignoring ${livePath}: ${live.date} is older than ${baseline.date}.`,
    );
  } catch (error) {
    console.warn(`Could not load ${livePath}. Using src/data/fx.json.`, error);
  }
  return baseline;
}
