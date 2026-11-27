import type { PriceView } from "./data/money";

const fixed = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fixedRate = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
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

export function formatFixedRate(value: number): string {
  return fixedRate.format(value);
}

export function formatRate(value: number): string {
  return rate.format(value);
}

export function formatMultiplier(value: number): string {
  return `×${(value < 10 ? tenths : integer).format(value)}`;
}

export function formatRelative(value: number | null): string {
  return value === null ? "·" : `+${integer.format(value * 100)}%`;
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
