import { globSync, readFileSync } from "node:fs";
import { parseFrontmatter } from "astro/markdown";
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
      derivePaymentAccess("apple-gift-card", ["gift-card", "account-balance"]),
    ).toBe("easy");
    expect(
      derivePaymentAccess("app-store-card", [
        "app-store-card",
        "account-balance",
      ]),
    ).toBe("easy");
    expect(derivePaymentAccess("none", ["card", "account-balance"])).toBe(
      "local-only",
    );
    expect(derivePaymentAccess("none", ["account-balance"])).toBe("unknown");
    expect(derivePaymentAccess("unknown", ["card"])).toBe("unknown");
    expect(getCountryMeta("BRA")).toMatchObject({
      giftCard: "app-store-card",
      access: "easy",
    });
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
      { giftCard: "none", paymentMethods: [], access: "unknown" },
      { giftCard: "app-store-card" },
      { paymentMethods: ["app-store-card", "account-balance"] },
      { paymentMethods: ["gift-card"] },
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

describe("product facts", () => {
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

  it("rejects duplicate or unlisted storage exclusions", () => {
    const { storage } = productFacts.products;
    for (const excludedStorageGb of [[30, 30], [20000]]) {
      const result = productsSchema.safeParse({
        ...productFacts,
        products: {
          ...productFacts.products,
          storage: {
            ...storage,
            familySharing: { ...storage.familySharing, excludedStorageGb },
          },
        },
      });
      expect(result.success).toBe(false);
    }
  });
});

describe("guide metadata", () => {
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

  it("validates each Markdown guide, requires a body and rejects duplicate orders", () => {
    const directory = new URL("../../content/guide/", import.meta.url);
    const files = globSync("*.md", { cwd: directory });
    expect(files.length).toBeGreaterThan(0);
    const orders = new Set<number>();

    for (const file of files) {
      const { frontmatter, content } = parseFrontmatter(
        readFileSync(new URL(file, directory), "utf8"),
      );
      const { order } = guideFrontmatterSchema.parse(frontmatter);
      expect(content.trim(), file).not.toBe("");
      expect(orders.has(order), `Duplicate order ${order} in ${file}`).toBe(
        false,
      );
      orders.add(order);
    }
  });
});
