import type { PaymentAccess } from "./country-meta.ts";
import { decimalParts } from "./decimal.ts";

export const decisionNeeds = {
  plus: "AI Plus",
  pro: "AI Pro",
  ultra: "AI Ultra",
  storage: "纯存储",
} as const;
export type Need = keyof typeof decisionNeeds;
export type Capacity = "30gb" | "100gb" | "200gb" | "2tb" | "10tb" | "20tb";
type OfferGroup = Need | Capacity;

export function decisionGroup(
  sku: string,
  description = "",
): OfferGroup | undefined {
  const id = sku.replace(/^(?:com\.google\.(?:gemini|one)|g1\.ios)\./, "");
  if (/^helium\.[am](?:[._]|$)/.test(id))
    return /Google AI Plus.*\b2\s*TB\b/i.test(description) ? undefined : "plus";
  if (/^(?:(?:2tb\.ai|ai\.2tb)\.[am]|5tb\.m)(?:[._]|$)/.test(id)) return "pro";
  if (/^(?:30tb\.ai\.pro|30tb)\.m(?:[._]|$)/.test(id)) return "ultra";
  const storage = /^(30gb|100gb|200gb|2tb|10tb|20tb)\.[am](?:[._]|$)/.exec(id);
  // Some markets use the same 2 TB SKU ID for a different product.
  if (/(?:Google AI|含\s*\d+x\s*Ultra)/i.test(description)) return undefined;
  return storage?.[1] as Capacity | undefined;
}

// Flags distinguish purchase restrictions from aliases for the eligibility and tie rules.
export const acquisition = 1;
export const alias = 2;
export function offerFlags(sku: string, intro: number | null) {
  const promo =
    intro !== null ||
    /(?:\.acq(?:[._]|$)|_ip(?:[_.]|$)|\.ip[_.]|_eft(?:[_.]|$))/.test(sku);
  const alternate = /\.(?:5|30)tb\.m(?:[._]|$)/.test(sku);
  return (promo ? acquisition : 0) | (alternate ? alias : 0);
}

export type DecisionParams = {
  need: Need;
  cap: Capacity;
  m: 3 | 12 | 24;
  elig: "new" | "existing";
  n: number;
  easy: 0 | 1;
  base: string;
};

export const decisionDefaults: DecisionParams = {
  need: "pro",
  cap: "2tb",
  m: 12,
  elig: "new",
  n: 1,
  easy: 0,
  base: "USA",
};

export const decisionKeys = Object.keys(
  decisionDefaults,
) as (keyof DecisionParams)[];

export type DecisionMarket = {
  code: string;
  name: string;
  flag: string;
  access: PaymentAccess;
  usd: boolean;
};

export type DecisionRate = [
  currency: string,
  unitsPerUsd: number,
  date: string,
];
export type DecisionOffer = [
  market: number,
  sku: number,
  rate: number,
  months: 1 | 12,
  intro: number | null,
  introPeriods: number,
  trialMonths: number,
  renewal: number,
  flags: number,
];

export type DecisionData = {
  offers: Partial<Record<OfferGroup, DecisionOffer[]>>;
  markets: DecisionMarket[];
  skus: string[];
  discounts: Partial<Record<number, number>>;
  rates: DecisionRate[];
  usdToCny: number;
  capacities: Capacity[];
  family: Record<Need, [supported: boolean | null, excludedGb: number[]]>;
};

export function readDecisionParams(
  query: URLSearchParams,
  data: DecisionData,
): DecisionParams {
  const need = query.get("need");
  const cap = query.get("cap") as Capacity | null;
  const m = query.get("m");
  const n = query.get("n");
  const base = query.get("base")?.toUpperCase();
  return {
    need:
      need && Object.hasOwn(decisionNeeds, need)
        ? (need as Need)
        : decisionDefaults.need,
    cap: cap && data.capacities.includes(cap) ? cap : decisionDefaults.cap,
    m: m === "3" ? 3 : m === "24" ? 24 : 12,
    elig: query.get("elig") === "existing" ? "existing" : "new",
    n: n && /^[1-6]$/.test(n) ? Number(n) : 1,
    easy: query.get("easy") === "1" ? 1 : 0,
    base:
      data.markets.some(({ code }) => code === base) && base
        ? base
        : decisionDefaults.base,
  };
}

function sharingStatus(data: DecisionData, { need, cap }: DecisionParams) {
  const [supported, excluded] = data.family[need];
  const capacityGb = Number.parseInt(cap, 10) * (cap.endsWith("tb") ? 1000 : 1);
  return need === "storage" && excluded.includes(capacityGb)
    ? false
    : supported;
}

export function calculateCost(
  offer: DecisionOffer,
  duration: number,
  people: number,
  rate: DecisionRate,
  usdToCny: number,
) {
  const [, , , months, intro, periods, trialMonths, renewal] = offer;
  const paidPeriods = Math.ceil(Math.max(0, duration - trialMonths) / months);
  const introCount =
    intro !== null && !trialMonths ? Math.min(paidPeriods, periods) : 0;
  const initial = decimalParts(intro ?? 0);
  const recurring = decimalParts(renewal);
  const power = Math.min(initial[1], recurring[1]);
  const localUnits =
    initial[0] * 10n ** BigInt(initial[1] - power) * BigInt(introCount) +
    recurring[0] *
      10n ** BigInt(recurring[1] - power) *
      BigInt(paidPeriods - introCount);
  const [targetUnits, targetPower] = decimalParts(usdToCny);
  const [marketUnits, marketPower] = decimalParts(rate[1]);
  // Preserve more significant digits than a JavaScript number can hold.
  const conversionPower = targetPower - marketPower - 40;
  const convert = (units: bigint, exponent: number) => {
    const scaled = (units * targetUnits * 10n ** 40n) / marketUnits;
    return Number(`${scaled}e${exponent + conversionPower}`);
  };
  const cny = (local: number) => convert(...decimalParts(local));
  const total = convert(localUnits, power);
  const firstLocal = intro ?? renewal;
  const renewalCny = cny(renewal);
  const bills = [
    {
      start: 1,
      count: trialMonths ? 1 : introCount,
      span: trialMonths || months,
      local: intro ?? 0,
    },
    {
      start: 1 + (trialMonths || introCount * months),
      count: paidPeriods - introCount,
      span: months,
      local: renewal,
    },
  ]
    .filter(({ count }) => count > 0)
    .map((bill) => ({ ...bill, cny: cny(bill.local) }));
  return {
    local: Number(`${localUnits}e${power}`),
    total,
    monthly: total / duration,
    perPerson: people > 1 ? total / people : null,
    perPersonMonthly: people > 1 ? total / people / duration : null,
    firstLocal,
    first: cny(firstLocal),
    renewalCny,
    renewal,
    months,
    bills,
    shortAnnual: months === 12 && duration === 3,
    introMonths: trialMonths || (intro === null ? 0 : periods * months),
  };
}

export type DecisionPlan = ReturnType<typeof calculateCost> & {
  market: DecisionMarket;
  sku: string;
  discount?: number;
  rate: DecisionRate;
  offer: DecisionOffer;
};

export const comparePlans = (a: DecisionPlan, b: DecisionPlan) =>
  a.total - b.total ||
  Number(a.offer[4] !== null) - Number(b.offer[4] !== null) ||
  (a.offer[8] & acquisition) - (b.offer[8] & acquisition) ||
  a.months - b.months ||
  (a.sku < b.sku ? -1 : Number(a.sku > b.sku));

const compareRegions = (a: DecisionPlan, b: DecisionPlan) =>
  a.market.code.localeCompare(b.market.code);

export const compareFirst = (a: DecisionPlan, b: DecisionPlan) =>
  a.first - b.first ||
  b.offer[6] - a.offer[6] ||
  a.total - b.total ||
  a.renewalCny / a.months - b.renewalCny / b.months ||
  compareRegions(a, b) ||
  comparePlans(a, b);

export function lowDifference(
  savings: number,
  duration: number,
  people: number,
) {
  return people > 1
    ? Math.abs(savings) / duration / people < 2
    : (Math.abs(savings) / duration) * 12 < 100;
}

export function decide(data: DecisionData, params: DecisionParams) {
  const { need, cap, m, n, base, easy, elig } = params;
  const sharing = sharingStatus(data, params);
  const people = sharing ? n : 1;
  const candidates = data.offers[need === "storage" ? cap : need] ?? [];
  const regular = new Map<string, DecisionPlan>();
  const bestByMarket = new Map<string, DecisionPlan>();
  let first: DecisionPlan | undefined;
  for (const offer of candidates) {
    const [marketId, skuId, rateId, , , , , , flags] = offer;
    const market = data.markets[marketId];
    const rate = data.rates[rateId];
    const plan: DecisionPlan = {
      ...calculateCost(offer, m, people, rate, data.usdToCny),
      market,
      sku: data.skus[skuId],
      discount: data.discounts[skuId],
      rate,
      offer,
    };
    const currentRegular = regular.get(market.code);
    if (
      !flags &&
      offer[4] === null &&
      (!currentRegular || comparePlans(plan, currentRegular) < 0)
    )
      regular.set(market.code, plan);
    if (
      (easy && market.access !== "easy") ||
      (elig === "existing" && (offer[4] !== null || flags !== 0))
    )
      continue;
    const current = bestByMarket.get(market.code);
    if (!current || comparePlans(plan, current) < 0)
      bestByMarket.set(market.code, plan);
    if (elig === "new" && (!first || compareFirst(plan, first) < 0))
      first = plan;
  }
  const ranked = [...bestByMarket.values()].sort(
    (a, b) => a.total - b.total || compareRegions(a, b),
  );
  const cheapest = ranked[0];
  const giftCardPlans = ranked.filter(({ market }) => market.access === "easy");
  const cheapestIsEasy = cheapest?.market.access === "easy";
  const steady = giftCardPlans[cheapestIsEasy ? 1 : 0];
  if (first === cheapest || first === steady) first = undefined;
  const baseline = regular.get(base);
  return {
    ranked,
    cheapest,
    steady,
    first,
    baseline,
    regular,
    people,
    sharing,
    cheapestIsEasy,
    smallGap: Boolean(
      cheapest &&
        baseline &&
        lowDifference(baseline.total - cheapest.total, m, people),
    ),
  };
}
