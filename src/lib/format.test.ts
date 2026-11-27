import { describe, expect, it } from "vitest";
import { describeRawPrice } from "./data/money";
import {
  formatCny,
  formatFixedRate,
  formatLocal,
  formatMultiplier,
  formatRate,
  formatRelative,
  formatShanghaiTime,
  formatSkuDescription,
} from "./format";
import { formatPriceDetail, formatPriceLines } from "./price-labels";

describe("number and time formatting", () => {
  it("shows two CNY decimals and reserves 免费 for the introductory view", () => {
    expect(formatCny(1071.5)).toBe("¥1,071.50");
    expect(formatCny(1.005)).toBe("¥1.01");
    expect(formatCny(0, "intro", true)).toBe("免费");
    expect(formatCny(0, "year", true)).toBe("¥0.00");
    expect(formatCny(null)).toBe("·");
  });

  it("uses fixed-point original prices, ratios and signed comparisons", () => {
    expect(formatLocal(9700, "INR")).toBe("9,700 INR");
    expect(formatLocal(2949.985, "TRY")).toBe("2,949.99 TRY");
    expect(formatLocal(96.90000000000001, "USD")).toBe("96.90 USD");
    expect(formatMultiplier(2)).toBe("×2.0");
    expect(formatMultiplier(194.9)).toBe("×195");
    expect(formatRelative(0.41)).toBe("+41%");
    expect(formatRelative(0.0001)).toBe("<1%");
    expect(formatRelative(0.005)).toBe("+1%");
    expect(formatRelative(null)).toBe("·");
    expect(formatFixedRate(6.674963)).toBe("6.675");
    expect(formatRate(0.0000037899129)).toBe("0.000003789913");
  });

  it("leaves currency amounts to the actual quote columns", () => {
    expect(formatSkuDescription("100 GB 存储 · 月付 · 首期$0.49特价×1期")).toBe(
      "100 GB 存储 · 月付 · 首期特价 × 1 期",
    );
    expect(formatSkuDescription("100 GB 存储 · 年付 · 首1期 $0 免费试用")).toBe(
      "100 GB 存储 · 年付",
    );
    expect(formatSkuDescription("首期0.1折(99% off)×3期")).toBe(
      "首期 0.1 折 × 3 期",
    );
  });

  it("shows free trial length, paid terms and the full annual payment", () => {
    const trial = { currency: "USD", intro: 0, renewal: 120 };
    const trialTerms = describeRawPrice(120, 0, 12, 1, 1, 1);
    expect(formatPriceLines(trial, trialTerms)).toMatchObject({
      introCny: "免费",
      duration: "免费 1 个月",
    });
    expect(formatPriceDetail(trial, trialTerms)).toContain(
      "试用结束后一次支付年费 ¥120.00，首年 ¥120.00，月均 ¥10.00",
    );
    const paid = { currency: "USD", intro: 5, renewal: 10 };
    const paidTerms = describeRawPrice(10, 5, 1, 6, 1, 1);
    expect(formatPriceLines(paid, paidTerms, false)).toMatchObject({
      raw: "5 → 10",
      duration: "×6 期",
    });
  });

  it("treats workbook time as Shanghai wall time and converts upstream UTC", () => {
    expect(formatShanghaiTime("2026-11-27T14:12:20", true)).toBe("11-27 14:12");
    expect(formatShanghaiTime("2026-11-27T00:02:31.000Z")).toBe(
      "2026-11-27 08:02",
    );
  });
});
