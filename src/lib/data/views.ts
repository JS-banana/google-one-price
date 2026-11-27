export const priceViews = ["intro", "year", "renew"] as const;
export type PriceView = (typeof priceViews)[number];
export function relativeToLowest(price: number, lowest: number): number | null {
  return lowest > 0 ? (price - lowest) / lowest : null;
}
