import { describe, expect, it } from "vitest";
import { decodeSku } from "./sku.ts";

describe("SKU decoding", () => {
  it("keeps capacity tokens separate from the market's product label", () => {
    expect(decodeSku("com.google.gemini.2tb.ai.m")).toMatchObject({
      family: "gemini",
      storageCodeGb: 2000,
      billingPeriod: "P1M",
      offer: null,
    });
    expect(decodeSku("com.google.gemini.helium.m").storageCodeGb).toBeNull();
  });

  it("decodes independent billing and promotion periods", () => {
    expect(decodeSku("g1.ios.ai.2tb.a.ip_1yr_25p.acq")).toMatchObject({
      billingPeriod: "P1Y",
      offer: { kind: "discount", encodedDuration: "P1Y", discountPercent: 25 },
    });
    expect(decodeSku("com.google.one.2tb.ai.m.2months_eft").offer).toEqual({
      kind: "trial",
      encodedDuration: "P2M",
      discountPercent: null,
    });
    expect(decodeSku("com.google.one.100gb.m.1month_ip.0.49").offer).toEqual({
      kind: "fixed",
      encodedDuration: "P1M",
      discountPercent: null,
    });
  });
});
