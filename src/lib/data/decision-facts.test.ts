import { describe, expect, it } from "vitest";
import countryMeta from "../../data/country-meta.json" with { type: "json" };
import productFacts from "../../data/products.json" with { type: "json" };
import { countryMetaSchema } from "./country-meta.ts";
import { guideFrontmatterSchema } from "./guide.ts";
import {
  derivePaymentAccess,
  getCountries,
  getCountryMeta,
  getGoogleFamilyGroup,
  getProducts,
  productLines,
} from "./index.ts";
import { productsSchema } from "./products.ts";

describe("country payment metadata", () => {
  it("covers every snapshot market exactly once", () => {
    expect(countryMetaSchema.parse(countryMeta)).toHaveLength(60);
    for (const { code } of getCountries()) {
      expect(getCountryMeta(code)?.code).toBe(code);
    }
    expect(getCountryMeta("ZZZ")).toBeUndefined();
  });

  it("derives access from both kinds of redeemable cards and other methods", () => {
    expect(
      derivePaymentAccess("official", ["gift-card", "account-balance"]),
    ).toBe("easy");
    expect(
      derivePaymentAccess("none", ["app-store-card", "account-balance"]),
    ).toBe("easy");
    expect(derivePaymentAccess("none", ["card", "account-balance"])).toBe(
      "local-only",
    );
    expect(derivePaymentAccess("none", ["account-balance"])).toBe("unknown");
    expect(derivePaymentAccess("unknown", ["card"])).toBe("unknown");
    expect(getCountryMeta("BGD")?.access).toBe("unknown");
  });

  it("rejects duplicate, missing and unexpected markets", () => {
    const [first, second, ...remaining] = countryMeta;
    expect(
      countryMetaSchema.safeParse([first, first, ...remaining]).success,
    ).toBe(false);
    expect(countryMetaSchema.safeParse([first, ...remaining]).success).toBe(
      false,
    );
    expect(
      countryMetaSchema.safeParse([
        first,
        { ...second, code: "ZZZ" },
        ...remaining,
      ]).success,
    ).toBe(false);
  });

  it("rejects unsupported categories, inconsistent access and unsourced records", () => {
    const [first, ...remaining] = countryMeta;
    for (const overrides of [
      { paymentMethods: ["unlisted"] },
      { giftCard: "existing" },
      { giftCard: "none" },
      { access: "local-only" },
      { sources: [] },
      { reviewedAt: "2026-02-30" },
    ]) {
      expect(
        countryMetaSchema.safeParse([{ ...first, ...overrides }, ...remaining])
          .success,
      ).toBe(false);
    }
  });
});

describe("product facts and guide metadata", () => {
  it("exposes all four product lines and the Google family group rules", () => {
    const products = getProducts();
    expect(Object.keys(products).sort()).toEqual(
      Object.keys(productLines).sort(),
    );
    expect(products.storage.largeStorageOnlyGb).toBeNull();
    expect(products.storage.familySharing.excludedStorageGb).toContain(30);
    expect(getGoogleFamilyGroup()).toMatchObject({
      sameCountryRequired: true,
      switchCooldownMonths: 12,
      maxMembers: 6,
    });
    expect(
      productsSchema.safeParse({
        ...productFacts,
        products: { plus: productFacts.products.plus },
      }).success,
    ).toBe(false);
  });

  it("requires a guide's title, summary, order, review date and source URLs", () => {
    const guide = {
      title: "续费、调价与取消",
      summary: "在 Apple 订阅设置管理续订。",
      order: 4,
      reviewedAt: "2026-11-27",
      sources: ["https://support.apple.com/en-us/118428"],
    };
    expect(guideFrontmatterSchema.safeParse(guide).success).toBe(true);
    expect(
      guideFrontmatterSchema.safeParse({ ...guide, order: 0 }).success,
    ).toBe(false);
    expect(
      guideFrontmatterSchema.safeParse({ ...guide, sources: ["apple"] })
        .success,
    ).toBe(false);
  });
});
