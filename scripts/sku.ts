import type { Sku } from "../src/lib/data/schema.ts";

export function decodeSku(id: string): Sku {
  const family = id.startsWith("com.google.one.")
    ? "google-one"
    : id.startsWith("com.google.gemini.")
      ? "gemini"
      : id.startsWith("g1.ios.")
        ? "g1-ios"
        : id.startsWith("g1.")
          ? "legacy-g1"
          : "other";
  const storage = /\.(\d+)(gb|tb)(?=\.|$)/.exec(id);
  const storageCodeGb = storage
    ? Number(storage[1]) * (storage[2] === "tb" ? 1000 : 1)
    : null;
  const billingPeriod = /\.(?:a|annual)(?=\.|$)/.test(id)
    ? "P1Y"
    : /\.m(?:_v\d+)?(?=\.|$)/.test(id) || family === "legacy-g1"
      ? "P1M"
      : null;
  const promo =
    /(?:^|\.)(\d+)(months?|mo|years?|yr)_(eft|ip_(\d+)p|ip(?=\.))/.exec(id);
  const alternate = /\.ip_(\d+)(mo|yr)_(\d+)p(?:\.|$)/.exec(id);
  let offer: Sku["offer"] = null;
  if (promo) {
    const [, count, unit, token, discount] = promo;
    offer = {
      kind: token === "eft" ? "trial" : discount ? "discount" : "fixed",
      encodedDuration: `P${count}${unit.startsWith("m") ? "M" : "Y"}`,
      discountPercent: discount ? Number(discount) : null,
    };
  } else if (alternate) {
    const [, count, unit, discount] = alternate;
    offer = {
      kind: "discount",
      encodedDuration: `P${count}${unit === "mo" ? "M" : "Y"}`,
      discountPercent: Number(discount),
    };
  }
  return { id, family, storageCodeGb, billingPeriod, offer };
}
