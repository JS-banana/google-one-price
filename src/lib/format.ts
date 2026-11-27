import type { PriceView } from "./data/views";

const fixed = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const rate = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 7 });
const tenths = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatCny(
  amount: number | null,
  view?: PriceView,
  trial = false,
): string {
  if (amount === null) return "·";
  if (view === "intro" && trial && amount === 0) return "免费";
  return `¥${fixed.format(amount)}`;
}

export function formatLocalNumber(amount: number): string {
  return (Number.isInteger(amount) ? integer : fixed).format(amount);
}

export function formatLocal(amount: number, currency: string): string {
  return `${formatLocalNumber(amount)} ${currency}`;
}

export function formatRate(value: number): string {
  return rate.format(value);
}

export function formatMultiplier(value: number): string {
  return `×${(value < 10 ? tenths : integer).format(value)}`;
}

export function formatRelative(value: number | null): string {
  if (value === null) return "·";
  if (value > 0 && value < 0.005) return "<1%";
  return `+${integer.format(value * 100)}%`;
}

export function formatSkuDescription(description: string): string {
  return description
    .replace(/\s*·\s*首\d+期 \$0 免费试用/gu, "")
    .replace(/首期\$\d+(?:\.\d+)?特价/gu, "首期特价")
    .replace(/\(\d+% off\)/gu, "")
    .replace(/首期(\d+(?:\.\d+)?)折/gu, "首期 $1 折")
    .replace(/×(\d+)期/gu, " × $1 期");
}

const timeInShanghai = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatShanghaiTime(iso: string, short = false): string {
  const timestamp = /(?:Z|[-+]\d\d:\d\d)$/.test(iso) ? iso : `${iso}+08:00`;
  const label = timeInShanghai.format(new Date(timestamp));
  return short ? label.slice(5) : label;
}
