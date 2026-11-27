import type { PriceTerms } from "./data/money";
import { renewalTrap } from "./data/offers";
import type { PriceView } from "./data/views";
import {
  formatCny,
  formatLocal,
  formatLocalNumber,
  formatMultiplier,
  formatRate,
} from "./format";

export const viewLabels = {
  intro: "首期月价",
  year: "首年月均",
  renew: "续费月价",
} as const satisfies Record<PriceView, string>;

type Amounts = { currency: string; intro: number | null; renewal: number };

function offerBadge(amounts: Amounts, terms: PriceTerms) {
  const { intro, renewal } = amounts;
  const trap = renewalTrap({
    intro: intro === null ? null : { local: intro },
    renewal: { local: renewal },
  });
  return trap
    ? {
        level: trap.level,
        label:
          trap.kind === "trial"
            ? `试用后 ${formatCny(terms.prices.renew)}/月`
            : `续费 ${formatMultiplier(trap.multiplier)}`,
      }
    : null;
}

function offerDuration(intro: number | null, terms: PriceTerms) {
  if (intro === null) return null;
  if (intro === 0) return `免费 ${terms.introMonths} 个月`;
  return `×${terms.introMonths / (terms.annual ? 12 : 1)} 期`;
}

export function formatPriceLines(
  amounts: Amounts,
  terms: PriceTerms,
  showCurrency = true,
) {
  const { currency, intro, renewal } = amounts;
  const rawRenewal = showCurrency
    ? formatLocal(renewal, currency)
    : formatLocalNumber(renewal);
  const trial = intro === 0;
  return {
    trial,
    offer: intro !== null,
    raw:
      intro === null
        ? rawRenewal
        : `${formatLocalNumber(intro)} → ${rawRenewal}`,
    introCny: formatCny(terms.prices.intro, "intro", trial),
    renewCny: formatCny(terms.prices.renew),
    duration: offerDuration(intro, terms),
    badge: offerBadge(amounts, terms),
  };
}

export function formatPriceDetail(amounts: Amounts, terms: PriceTerms) {
  const { currency, intro, renewal } = amounts;
  const duration = offerDuration(intro, terms);
  const badge = offerBadge(amounts, terms);
  const year = `首年 ${formatCny(terms.yearTotal)}，月均 ${formatCny(terms.prices.year)}`;
  const breakdown =
    intro === null || (terms.annual && intro > 0)
      ? year
      : terms.annual
        ? `试用结束后一次支付年费 ${formatCny(terms.renewTotal)}，${year}`
        : `前 ${Math.min(12, terms.introMonths)} 个月 ${formatCny(terms.introTotal)} + 后 ${terms.renewMonths} 个月 ${formatCny(terms.renewTotal)} = ${year}`;
  return [
    intro === 0
      ? duration
      : intro !== null && `首期 ${formatLocal(intro, currency)} ${duration}`,
    `续费 ${formatLocal(renewal, currency)}/${terms.annual ? "年" : "月"}${badge && intro !== 0 ? ` · ${badge.label}` : ""}`,
    breakdown,
    `汇率 1 ${currency} = ${formatRate(terms.cnyPerLocal)} CNY`,
  ]
    .filter(Boolean)
    .join("\n");
}
