import type { PriceView } from "./data/money";

export const viewLabels = {
  intro: "首期月价",
  year: "首年月均",
  renew: "续费月价",
} as const satisfies Record<PriceView, string>;
