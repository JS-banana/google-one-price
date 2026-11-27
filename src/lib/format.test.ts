import { describe, expect, it } from "vitest";
import {
  formatCny,
  formatFixedRate,
  formatLocal,
  formatMultiplier,
  formatRate,
  formatRelative,
  formatShanghaiTime,
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

  it("treats workbook time as Shanghai wall time and converts upstream UTC", () => {
    expect(formatShanghaiTime("2026-11-27T14:12:20", true)).toBe("11-27 14:12");
    expect(formatShanghaiTime("2026-11-27T00:02:31.000Z")).toBe(
      "2026-11-27 08:02",
    );
  });
});
