import type { CountryMeta, PaymentAccess } from "./data/country-meta";
import type { Capacity, DecisionPlan, Need } from "./data/decision";
import { formatLocal, formatRate } from "./format";

export const accessLabels: Record<PaymentAccess, string> = {
  easy: "礼品卡可用",
  "local-only": "需当地支付",
  unknown: "未确认",
};

export const giftCardLabels: Record<CountryMeta["giftCard"], string> = {
  "apple-gift-card": "可兑换 Apple Gift Card",
  "app-store-card": "可兑换 App Store 礼品卡",
  none: "Apple 付款清单未列出可兑换的礼品卡",
  unknown: "官方礼品卡可用性未确认",
};

const paymentMethodLabels: Record<
  CountryMeta["paymentMethods"][number],
  string
> = {
  card: "银行卡",
  paypal: "PayPal",
  "apple-pay": "Apple Pay",
  carrier: "运营商代扣",
  "local-wallet": "本地钱包",
  "bank-payment": "银行支付",
  "bank-top-up": "银行充值",
  "account-balance": "Apple 账户余额",
  "gift-card": "Apple Gift Card",
  "app-store-card": "App Store 礼品卡",
};

export function paymentMethods(meta: CountryMeta) {
  return (
    meta.paymentMethods
      .map((method) => paymentMethodLabels[method])
      .join("、") || "尚无可核实的付款方式"
  );
}

export const capacityLabel = (cap: Capacity) =>
  cap.replace(/([gt])b$/, " $1B").toUpperCase();

export const decisionProduct = (need: Need, cap: Capacity) =>
  ({
    plus: "Google AI Plus（400 GB）",
    pro: "Google AI Pro（5 TB）",
    ultra: "Google AI Ultra（30 TB / 20x）",
    storage: `纯存储 ${capacityLabel(cap)}`,
  })[need];

export function planLabel(plan: DecisionPlan) {
  const [, , , months, intro, , trial] = plan.offer;
  const billing = months === 12 ? "年付" : "月付";
  if (trial) return `${billing} · 免费试用 ${trial} 个月`;
  if (intro === null) return billing;
  const discount =
    plan.discount === undefined ? "" : ` ${(100 - plan.discount) / 10} 折`;
  return `${billing} · ${months === 12 ? "首年" : "首期"}${discount || "特价"}`;
}

export function currencyDetail(
  plan: DecisionPlan,
  local: number,
  usdToCny: number,
  fxDate: string,
) {
  const [currency, unitsPerUsd, date] = plan.rate;
  const reference =
    currency !== "USD" && currency !== "CNY" && date !== fxDate
      ? `；${currency} 参考日期 ${date}`
      : "";
  return `原币 ${formatLocal(local, currency)}\n1 ${currency} = ${formatRate(usdToCny / unitsPerUsd)} CNY（汇率 ${fxDate}${reference}）`;
}
