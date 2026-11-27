import { describePrice, renewalTrap } from "./data";
import type { PricedQuote } from "./data/money";
import {
  formatCny,
  formatLocal,
  formatLocalNumber,
  formatMultiplier,
  formatRate,
} from "./format";

export function priceDisplay(quote: PricedQuote) {
  const terms = describePrice(quote);
  const { currency, intro, introPeriods, renewal } = quote;
  const rawRenewal = formatLocal(renewal.local, currency);
  const rawIntro = intro ? formatLocalNumber(intro.local) : null;
  const trial = intro?.local === 0;
  const trap = renewalTrap(quote);
  const badge = trap
    ? {
        level: trap.level,
        label:
          trap.kind === "trial"
            ? `试用后 ${formatCny(terms.prices.renew)}/月`
            : `续费 ${formatMultiplier(trap.multiplier)}`,
      }
    : null;
  const introCny = formatCny(terms.prices.intro, "intro", trial);
  const renewCny = formatCny(terms.prices.renew);
  const detail = [
    intro && `首期 ${formatLocal(intro.local, currency)} × ${introPeriods} 期`,
    `续费 ${rawRenewal}/${terms.annual ? "年" : "月"}${badge ? ` · ${badge.label}` : ""}`,
    intro
      ? `前 ${terms.introMonths} 个月 ${formatCny(terms.introTotal)} + 后 ${terms.renewMonths} 个月 ${formatCny(terms.renewTotal)} = 首年 ${formatCny(terms.yearTotal)}，月均 ${formatCny(terms.prices.year)}`
      : `首年 ${formatCny(terms.yearTotal)}，月均 ${formatCny(terms.prices.year)}`,
    `汇率 1 ${currency} = ${formatRate(terms.cnyPerLocal)} CNY`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    annual: terms.annual,
    trial,
    offer: intro !== null,
    raw: rawIntro === null ? rawRenewal : `${rawIntro} → ${rawRenewal}`,
    introCny,
    renewCny,
    prices: [terms.prices.intro, terms.prices.year, terms.prices.renew],
    badge,
    detail,
  };
}

export type PriceDisplay = ReturnType<typeof priceDisplay>;
