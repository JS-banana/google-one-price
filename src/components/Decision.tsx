import { useEffect, useMemo, useState } from "preact/hooks";
import {
  type DecisionData,
  type DecisionParams,
  type DecisionPlan,
  decide,
  decisionDefaults,
  decisionKeys,
  decisionNeeds,
  readDecisionParams,
} from "../lib/data/decision";
import { priceFreshness } from "../lib/data/freshness";
import {
  accessLabels,
  capacityLabel,
  currencyDetail,
  decisionProduct,
  planLabel,
} from "../lib/decision-labels";
import { formatCny, formatLocal, formatMultiplier } from "../lib/format";
import "../styles/decision.css";

type Extras = {
  fxDate: string;
  observedAt: string;
  payment: Record<string, [text: string, source: string]>;
  familyHints: Record<DecisionParams["need"], string>;
  cancel: string;
};

interface Props {
  data: DecisionData;
  extras: Extras;
}

const storageKey = "g1:decision";
const countryPath = (code: string) => `/countries/${code.toLowerCase()}`;
const annualNote = "需一次付 12 个月";
const monthOptions = [3, 12, 24] as const;
const peopleOptions = [1, 2, 3, 4, 5, 6];
const eligibility = { new: "首次订阅", existing: "订阅过" } as const;

function decisionUrl(params: DecisionParams, url = new URL(location.href)) {
  for (const key of decisionKeys)
    url.searchParams.set(key, String(params[key]));
  return url;
}

function Price({
  plan,
  local,
  value,
  data,
  fxDate,
}: {
  plan: DecisionPlan;
  local: number;
  value: number;
  data: DecisionData;
  fxDate: string;
}) {
  return (
    <button
      type="button"
      class="decision-price mono"
      data-price-detail
      aria-haspopup="dialog"
      title={currencyDetail(plan, local, data.usdToCny, fxDate)}
    >
      {formatCny(value)}
    </button>
  );
}

function Market({
  market,
  eager,
}: {
  market: DecisionPlan["market"];
  eager?: boolean;
}) {
  return (
    <span class="decision-market">
      <img
        class="flag"
        src={`/flags/${market.flag}.svg`}
        width="18"
        height="12"
        alt=""
        loading={eager ? "eager" : "lazy"}
      />
      <span>{market.name}</span>
      {market.usd && (
        <span class="currency-badge" title="USD 计价区">
          USD
        </span>
      )}
    </span>
  );
}

function Payment({ market }: { market: DecisionPlan["market"] }) {
  return (
    <span class={`access-label access-${market.access}`}>
      {accessLabels[market.access]}
    </span>
  );
}

function comparisonDetail(
  first: DecisionPlan,
  second: DecisionPlan,
  usdToCny: number,
  fxDate: string,
) {
  return [first, second]
    .map(
      (plan) =>
        `${plan.market.name}\n${currencyDetail(plan, plan.local, usdToCny, fxDate)}`,
    )
    .join("\n");
}

function Delta({
  plan,
  baseline,
  data,
  fxDate,
  named = false,
}: Pick<Props, "data"> & {
  plan: DecisionPlan;
  baseline?: DecisionPlan;
  fxDate: string;
  named?: boolean;
}) {
  if (!baseline) return null;
  const gap = baseline.total - plan.total;
  const percent =
    baseline.total && gap
      ? `（${gap > 0 ? "−" : "+"}${Math.abs((gap / baseline.total) * 100).toFixed(1)}%）`
      : "";
  if (!gap)
    return <span>与{named ? ` ${baseline.market.name} ` : "基准"}同价</span>;
  return (
    <span class={gap > 0 ? "decision-saving" : "secondary"}>
      {named && `比 ${baseline.market.name} `}
      {gap > 0 ? "省 " : "多 "}
      <button
        type="button"
        class="decision-price mono"
        data-price-detail
        aria-haspopup="dialog"
        title={comparisonDetail(plan, baseline, data.usdToCny, fxDate)}
      >
        {formatCny(Math.abs(gap))}
      </button>
      {percent && <span class="decision-percent">{percent}</span>}
    </span>
  );
}

function Renewal({
  plan,
  data,
  extras,
  emphasized = false,
}: Props & { plan: DecisionPlan; emphasized?: boolean }) {
  const label = plan.offer[6]
    ? "试用后"
    : plan.offer[4] !== null
      ? "优惠后"
      : "";
  const multiplier = plan.multiplier;
  return (
    <span
      class={
        emphasized || (multiplier !== null && multiplier > 1)
          ? "decision-warn"
          : "secondary"
      }
    >
      <span class="decision-renewal-prefix">{label}续费 </span>
      <Price
        plan={plan}
        local={plan.renewal}
        value={plan.renewalCny}
        data={data}
        fxDate={extras.fxDate}
      />
      /{plan.months === 12 ? "年" : "月"}
      {multiplier !== null && multiplier > 1 && (
        <span class="decision-jump">
          {multiplier === Infinity
            ? "（从免费恢复原价）"
            : `（${formatMultiplier(multiplier)}）`}
        </span>
      )}
    </span>
  );
}

function Timeline({
  plan,
  params,
  data,
  extras,
}: Props & { plan: DecisionPlan; params: DecisionParams }) {
  return (
    <div class="decision-timeline">
      <h4>账单时间轴</h4>
      <ol>
        {plan.bills.flatMap(({ start, count, span, local, cny }) => {
          const starts =
            span === 12 && local > 0
              ? Array.from({ length: count }, (_, i) => start + i * span)
              : [start];
          const end = Math.min(params.m, start + count * span - 1);
          return starts.map((month) => (
            <li key={month}>
              <span class="decision-month">
                {span === 12 && local > 0
                  ? month === 1
                    ? "今天"
                    : `第 ${month} 月`
                  : month === end
                    ? `第 ${month} 月`
                    : `第 ${month}–${end} 月`}
              </span>
              {local === 0 ? (
                <span>免费试用</span>
              ) : (
                <span>
                  <Price
                    plan={plan}
                    local={local}
                    value={cny}
                    data={data}
                    fxDate={extras.fxDate}
                  />
                  {span === 1 ? "/月" : " 一次付清"}
                  <small class="mono secondary">
                    {formatLocal(local, plan.rate[0])}
                  </small>
                </span>
              )}
            </li>
          ));
        })}
      </ol>
      {plan.introMonths > params.m && (
        <p class="small secondary">
          优惠共 {plan.introMonths} 个月，其后恢复续费价。
        </p>
      )}
    </div>
  );
}

function Card({
  kind,
  title,
  plan,
  result,
  params,
  data,
  extras,
}: Props & {
  kind: "best" | "steady" | "first";
  title: string;
  plan: DecisionPlan;
  result: ReturnType<typeof decide>;
  params: DecisionParams;
}) {
  const [open, setOpen] = useState(false);
  const value = plan.perPersonMonthly ?? plan.monthly;
  const regular = result.regular.get(plan.market.code);
  const gap = plan.total - (result.cheapest?.total ?? plan.total);
  const [payment, source] = extras.payment[plan.market.code];
  const totalLabel = `${params.m} 个月共`;
  return (
    <article
      class={`decision-card panel decision-${kind}${open ? " expanded" : ""}`}
    >
      {kind !== "best" && (
        <button
          type="button"
          class="compact-card"
          aria-expanded={open}
          aria-controls={`decision-card-${kind}`}
          onClick={() => setOpen(!open)}
        >
          <strong>{title}</strong>
          <Market market={plan.market} eager />
          <span class="mono">
            {kind === "first"
              ? `今天 ${formatCny(plan.first)}`
              : `${plan.perPersonMonthly !== null ? "人均 " : ""}${formatCny(value)}/月`}
          </span>
          <span aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
      )}
      <div class="decision-card-body" id={`decision-card-${kind}`}>
        <header>
          <h3>{title}</h3>
          <div class="card-region">
            <a href={countryPath(plan.market.code)}>
              <Market market={plan.market} eager />
            </a>
            <Payment market={plan.market} />
          </div>
        </header>
        <p class="decision-plan secondary">
          {planLabel(plan)}
          {plan.shortAnnual && ` · ${annualNote}`}
        </p>
        <div class="decision-primary">
          <span>
            {kind === "first"
              ? "今天只要"
              : plan.perPersonMonthly !== null
                ? "人均月均"
                : "月均"}
          </span>
          <Price
            plan={plan}
            local={
              kind === "first"
                ? plan.firstLocal
                : plan.local / params.m / result.people
            }
            value={kind === "first" ? plan.first : value}
            data={data}
            fxDate={extras.fxDate}
          />
        </div>
        <p class="decision-total">
          {totalLabel}{" "}
          <Price
            plan={plan}
            local={plan.local}
            value={plan.total}
            data={data}
            fxDate={extras.fxDate}
          />
          {kind === "first" && (
            <>
              {" "}
              · {plan.perPersonMonthly !== null ? "人均月均" : "月均"}{" "}
              <Price
                plan={plan}
                local={plan.local / params.m / result.people}
                value={value}
                data={data}
                fxDate={extras.fxDate}
              />
            </>
          )}
        </p>
        {plan.perPerson !== null && (
          <p class="small secondary">
            {params.m} 个月人均{" "}
            <Price
              plan={plan}
              local={plan.local / result.people}
              value={plan.perPerson}
              data={data}
              fxDate={extras.fxDate}
            />
          </p>
        )}
        {result.baseline && (
          <p class="decision-delta">
            <Delta
              plan={plan}
              baseline={result.baseline}
              data={data}
              fxDate={extras.fxDate}
              named
            />
          </p>
        )}
        {kind === "steady" && result.cheapest && (
          <p class="small secondary">
            较最省方案{result.people > 1 ? "人均每月" : ` ${params.m} 个月`}
            {gap ? (
              <>
                多{" "}
                <button
                  type="button"
                  class="decision-price mono"
                  data-price-detail
                  aria-haspopup="dialog"
                  title={comparisonDetail(
                    plan,
                    result.cheapest,
                    data.usdToCny,
                    extras.fxDate,
                  )}
                >
                  {formatCny(
                    result.people > 1 ? gap / result.people / params.m : gap,
                  )}
                </button>
              </>
            ) : (
              "同价"
            )}
          </p>
        )}
        {kind === "best" && result.cheapestIsEasy && (
          <p class="small secondary">最省方案本身即礼品卡可用地区。</p>
        )}
        {kind === "best" && result.smallGap && (
          <p class="small secondary">
            与 {result.baseline?.market.name} 差价较小，换区前请评估切换成本。
          </p>
        )}
        <p class="card-renewal">
          <Renewal
            plan={plan}
            data={data}
            extras={extras}
            emphasized={kind === "first"}
          />
        </p>
        {kind === "first" && gap > 0 && plan.offer[4] !== null && (
          <p class="decision-warn small">仅适合在优惠期内取消。</p>
        )}
        <Timeline plan={plan} params={params} data={data} extras={extras} />
        {plan.offer[8] !== 0 && (
          <div class="decision-fallback small">
            <p>特定入口/拉新优惠，可能并非人人可见。</p>
            {regular ? (
              <p>
                常规兜底 · {planLabel(regular)} · {params.m} 个月{" "}
                <Price
                  plan={regular}
                  local={regular.local}
                  value={regular.total}
                  data={data}
                  fxDate={extras.fxDate}
                />
              </p>
            ) : (
              <p>该区暂无同类主线常规报价。</p>
            )}
          </div>
        )}
        <details class="decision-check">
          <summary>订前检查</summary>
          <ul>
            <li>
              {payment} <a href={source}>Apple 官方付款方式</a> ·{" "}
              <a href="/guide/payment-methods">付款指南</a>
            </li>
            <li>
              首期优惠限符合条件的首次订阅，确认付款页显示的价格。
              <a href="/guide/intro-offer-eligibility">核对首期资格</a>
            </li>
            <li>
              {result.sharing
                ? extras.familyHints[params.need]
                : "所选套餐无法确认可供家庭分摊。"}{" "}
              <a href="/guide/family-sharing">家庭共享规则</a>
            </li>
            <li>
              {extras.cancel} <a href="/guide/renewal-and-cancel">管理续费</a>
            </li>
          </ul>
        </details>
      </div>
    </article>
  );
}

function Choices<T extends string | number>({
  label,
  name,
  value,
  options,
  select,
}: {
  label: string;
  name: string;
  value: T;
  options: readonly T[];
  select: (value: T) => void;
}) {
  return (
    <fieldset class="decision-field">
      <legend>{label}</legend>
      <div class="decision-segments">
        {options.map((option) => (
          <label class="control" key={option}>
            <input
              class="sr-only"
              type="radio"
              name={name}
              value={option}
              checked={option === value}
              onChange={() => select(option)}
            />
            {name === "need"
              ? decisionNeeds[option as DecisionParams["need"]]
              : name === "elig"
                ? eligibility[option as DecisionParams["elig"]]
                : option}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function Decision({
  packed,
  extras,
}: {
  packed: string;
  extras: Extras;
}) {
  const data = useMemo<DecisionData>(() => JSON.parse(packed), [packed]);
  const [params, setParams] = useState(decisionDefaults);
  const [focus, setFocus] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState("");
  const [freshness, setFreshness] =
    useState<ReturnType<typeof priceFreshness>>();
  const [ready, setReady] = useState(false);
  const result = useMemo(() => decide(data, params), [data, params]);
  const markets = useMemo(
    () =>
      [...data.markets].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    [data],
  );
  const { cheapest, steady, first, baseline, ranked } = result;
  const observedDate = extras.observedAt.slice(0, 10);
  const bestTitle =
    freshness?.state === "stale" ? `按 ${observedDate} 价格最省` : "最省";
  const focusedRank = ranked.findIndex(({ market }) => market.code === focus);

  function save(values: DecisionParams) {
    const url = decisionUrl(values);
    if (url.href !== location.href)
      history.replaceState(history.state, "", url);
    try {
      localStorage.setItem(
        storageKey,
        new URLSearchParams(
          decisionKeys.map((key) => [key, String(values[key])]),
        ).toString(),
      );
    } catch {}
  }

  useEffect(() => {
    function restore() {
      const query = new URLSearchParams(location.search);
      const focusCode = query.get("focus")?.toUpperCase() ?? "";
      const validFocus = data.markets.some(({ code }) => code === focusCode)
        ? focusCode
        : "";
      let saved = new URLSearchParams();
      try {
        saved = new URLSearchParams(localStorage.getItem(storageKey) ?? "");
      } catch {}
      // Profiles link to their default holding conditions while preserving the chosen baseline.
      const source = validFocus ? new URLSearchParams() : saved;
      const savedBase = saved.get("base");
      if (validFocus && savedBase !== null) source.set("base", savedBase);
      for (const key of decisionKeys) {
        const value = query.get(key);
        if (value !== null) source.set(key, value);
      }
      const values = readDecisionParams(source, data);
      setParams(values);
      setFocus(validFocus);
      if (validFocus || source.toString()) save(values);
    }
    restore();
    const refresh = () => setFreshness(priceFreshness(extras.observedAt));
    refresh();
    setReady(true);
    window.addEventListener("popstate", restore);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("pageshow", refresh);
    };
  }, [data, extras.observedAt]);

  useEffect(() => {
    if (!focus || focusedRank < 0) return;
    document
      .getElementById(`rank-${focus}`)
      ?.scrollIntoView({ block: "center" });
  }, [focus, focusedRank]);

  function update<K extends keyof DecisionParams>(
    key: K,
    value: DecisionParams[K],
  ) {
    const values = { ...params, [key]: value };
    setParams(values);
    setStatus("");
    save(values);
  }

  async function share(summary: boolean) {
    const url = decisionUrl(params, new URL("/", location.origin)).href;
    const format = (plan: DecisionPlan) =>
      `${plan.market.name} · ${planLabel(plan)} · ${params.m} 个月共 ${formatCny(plan.total)}`;
    const text = [
      `${decisionProduct(params.need, params.cap)} · ${params.m} 个月 · ${params.n} 人 · ${eligibility[params.elig]}`,
      cheapest && `${bestTitle}：${format(cheapest)}`,
      steady && `稳妥（礼品卡可用）：${format(steady)}`,
      `价格观测：${observedDate}`,
      url,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(summary ? text : url);
      setStatus(summary ? "已复制文字摘要" : "已复制方案链接");
    } catch {
      setStatus("复制失败，可从地址栏复制方案链接。");
    }
  }

  return (
    <div class="decision">
      <form
        class="decision-inputs panel"
        aria-label="方案条件"
        onSubmit={(event) => event.preventDefault()}
      >
        <Choices
          label="我要什么"
          name="need"
          value={params.need}
          options={Object.keys(decisionNeeds) as DecisionParams["need"][]}
          select={(v) => update("need", v)}
        />
        {params.need === "storage" && (
          <label class="decision-select">
            存储容量
            <select
              class="control"
              value={params.cap}
              onChange={(event) =>
                update(
                  "cap",
                  event.currentTarget.value as DecisionParams["cap"],
                )
              }
            >
              {data.capacities.map((cap) => (
                <option key={cap} value={cap}>
                  {capacityLabel(cap)}
                </option>
              ))}
            </select>
          </label>
        )}
        <Choices
          label="用多久（个月）"
          name="m"
          value={params.m}
          options={monthOptions}
          select={(v) => update("m", v)}
        />
        <Choices
          label="订阅身份"
          name="elig"
          value={params.elig}
          options={["new", "existing"] as const}
          select={(v) => update("elig", v)}
        />
        <label class="decision-select">
          人数
          <select
            class="control"
            value={params.n}
            onChange={(event) => update("n", Number(event.currentTarget.value))}
          >
            {peopleOptions.map((n) => (
              <option key={n} value={n}>
                {n} 人
              </option>
            ))}
          </select>
        </label>
        <label class="decision-select">
          对比基准
          <select
            class="control"
            value={params.base}
            onChange={(event) => update("base", event.currentTarget.value)}
          >
            {markets.map(({ code, name }) => (
              <option key={code} value={code}>
                {name} · {code}
              </option>
            ))}
          </select>
        </label>
        <label class="control decision-easy">
          <input
            type="checkbox"
            checked={params.easy === 1}
            onChange={(event) =>
              update("easy", event.currentTarget.checked ? 1 : 0)
            }
          />
          只看礼品卡可用地区
        </label>
      </form>

      <section aria-labelledby="decision-results" class="decision-section">
        <div class="section-heading decision-heading">
          <h2 id="decision-results">方案推荐</h2>
          <p class="small secondary">
            {decisionProduct(params.need, params.cap)} · {params.m} 个月 ·{" "}
            {eligibility[params.elig]} · {params.n} 人
          </p>
        </div>
        {freshness?.state === "aging" && (
          <p class="decision-aging" role="status">
            价格观测于 {freshness.days} 天前，下单前请以 App Store 显示为准。
          </p>
        )}
        {params.n > 1 && !result.sharing && (
          <p class="decision-aging">
            所选套餐
            {params.need === "storage" && params.cap === "30gb"
              ? "不支持家庭共享"
              : "的家庭共享资格未确认"}
            ，按 1 人计算。
          </p>
        )}
        {!cheapest ? (
          <p class="empty-message panel" role="status">
            没有符合条件的活跃报价。可关闭「只看礼品卡可用地区」，或选择其他产品与容量。
          </p>
        ) : (
          <>
            <div class="decision-baseline secondary small">
              {baseline ? (
                <>
                  对比基准 · {baseline.market.name} · {planLabel(baseline)}
                  {baseline.shortAnnual && ` · ${annualNote}`} · {params.m} 个月{" "}
                  <Price
                    plan={baseline}
                    local={baseline.local}
                    value={baseline.total}
                    data={data}
                    fxDate={extras.fxDate}
                  />
                </>
              ) : (
                <>基准地区没有此产品的主线常规报价。</>
              )}
            </div>
            <div class="decision-cards">
              <Card
                kind="best"
                title={bestTitle}
                plan={cheapest}
                result={result}
                params={params}
                data={data}
                extras={extras}
              />
              {steady && (
                <Card
                  kind="steady"
                  title="稳妥"
                  plan={steady}
                  result={result}
                  params={params}
                  data={data}
                  extras={extras}
                />
              )}
              {first && (
                <Card
                  kind="first"
                  title="首付最低"
                  plan={first}
                  result={result}
                  params={params}
                  data={data}
                  extras={extras}
                />
              )}
            </div>
          </>
        )}
      </section>
      {ranked.length > 0 && (
        <section aria-labelledby="decision-rank" class="decision-section">
          <div class="section-heading decision-heading">
            <h2 id="decision-rank">同条件地区排行</h2>
            <p class="small secondary" role="status">
              {ranked.length} 个地区 · {params.m} 个月实际付款
            </p>
          </div>
          {focus && focusedRank < 0 && (
            <p class="small secondary focus-note">
              {data.markets.find(({ code }) => code === focus)?.name}
              没有符合当前条件的报价。
            </p>
          )}
          <div class="panel">
            <table class="data-table decision-rank">
              <thead>
                <tr>
                  <th scope="col" class="num">
                    排名
                  </th>
                  <th scope="col">地区</th>
                  <th scope="col">最优方案</th>
                  <th scope="col" class="num">
                    {params.m} 个月总计（月均）
                  </th>
                  {baseline && (
                    <th scope="col" class="num">
                      较基准
                    </th>
                  )}
                  <th scope="col" class="num">
                    优惠后续费
                  </th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {ranked
                  .slice(0, expanded || focusedRank >= 10 ? ranked.length : 10)
                  .map((plan, index) => (
                    <tr
                      key={plan.market.code}
                      id={`rank-${plan.market.code}`}
                      class={
                        plan.market.code === focus ? "rank-focused" : undefined
                      }
                    >
                      <td class="num decision-rank-index">#{index + 1}</td>
                      <th scope="row" class="decision-rank-market">
                        <Market market={plan.market} />{" "}
                        <Payment market={plan.market} />
                      </th>
                      <td class="decision-rank-plan">
                        {planLabel(plan)}
                        {plan.shortAnnual && (
                          <small class="secondary">{annualNote}</small>
                        )}
                        {plan.offer[8] !== 0 && (
                          <small
                            class="secondary"
                            title="特定入口/拉新优惠，可能并非人人可见"
                          >
                            {" "}
                            · 特定入口
                          </small>
                        )}
                      </td>
                      <td class="num decision-rank-total">
                        <Price
                          plan={plan}
                          local={plan.local}
                          value={plan.total}
                          data={data}
                          fxDate={extras.fxDate}
                        />
                        <small class="secondary">
                          {plan.perPersonMonthly !== null ? "人均" : "月均"}{" "}
                          <Price
                            plan={plan}
                            local={plan.local / params.m / result.people}
                            value={plan.perPersonMonthly ?? plan.monthly}
                            data={data}
                            fxDate={extras.fxDate}
                          />
                          /月
                        </small>
                      </td>
                      {baseline && (
                        <td class="num decision-rank-gap">
                          <Delta
                            plan={plan}
                            baseline={baseline}
                            data={data}
                            fxDate={extras.fxDate}
                          />
                        </td>
                      )}
                      <td class="num decision-rank-renew">
                        <Renewal plan={plan} data={data} extras={extras} />
                      </td>
                      <td class="decision-rank-link">
                        <a
                          href={countryPath(plan.market.code)}
                          aria-label={`查看${plan.market.name}档案`}
                        >
                          档案 →
                        </a>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {ranked.length > 10 && focusedRank < 10 && (
            <button
              class="control decision-more"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "收起排行" : `展开全部 ${ranked.length} 个地区`}
            </button>
          )}
        </section>
      )}
      <section class="decision-section" aria-labelledby="decision-guide">
        <div class="section-heading decision-heading">
          <h2 id="decision-guide">跨区前须知</h2>
          <a href="/guide">查看避坑指南 →</a>
        </div>
        <ul class="decision-notes panel">
          <li>
            可使用独立外区 Apple
            账户。更改现有账户地区前，需处理余额与订阅，并确认新地区的付款方式。
          </li>
          <li>首期优惠限符合条件的首次订阅，下单前核对资格和续费日期。</li>
          <li>Google 家庭组成员须与管理员居住在同一国家。</li>
        </ul>
      </section>
      <div class="decision-share">
        {cheapest && (
          <>
            <button
              type="button"
              class="control"
              disabled={!ready}
              onClick={() => share(false)}
            >
              复制方案链接
            </button>
            <button
              type="button"
              class="control"
              disabled={!ready}
              onClick={() => share(true)}
            >
              复制文字摘要
            </button>
          </>
        )}
        <span role="status" class="small secondary">
          {status}
        </span>
      </div>
    </div>
  );
}
