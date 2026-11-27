import { describe, expect, it } from "vitest";
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
    expect(formatRelative(null)).toBe("·");
    expect(formatFixedRate(6.674963)).toBe("6.675");
    expect(formatRate(0.0000037899129)).toBe("0.000003789913");
  });

  it("leaves currency amounts to the actual quote columns", () => {
    expect(formatSkuDescription("100 GB 存储 · 月付 · 首期$0.49特价×1期")).toBe(
      "100 GB 存储 · 月付 · 首期特价 × 1 期",
    );
    expect(formatSkuDescription("首1期 $0 免费试用")).toBe("首 1 期免费试用");
    expect(formatSkuDescription("首期0.1折(99% off)×3期")).toBe(
      "首期0.1折 × 3 期",
    );
  });

  it("treats workbook time as Shanghai wall time and converts upstream UTC", () => {
    expect(formatShanghaiTime("2026-11-27T14:12:20", true)).toBe("11-27 14:12");
    expect(formatShanghaiTime("2026-11-27T00:02:31.000Z")).toBe(
      "2026-11-27 08:02",
    );
  });
});
