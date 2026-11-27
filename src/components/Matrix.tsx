import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { describeRawPrice, type PriceTerms } from "../lib/data/money";
import type { Country } from "../lib/data/schema";
import {
  type PriceView,
  relativeToLowest,
  priceViews as views,
} from "../lib/data/views";
import { formatCny, formatRelative } from "../lib/format";
import {
  formatPriceDetail,
  formatPriceLines,
  viewLabels,
} from "../lib/price-labels";

type MatrixCountry = Country & { usd: boolean };
export type MatrixOffer = [
  renewal: number,
  billing: 1 | 12,
  intro?: number | null,
  introMonths?: number,
  currency?: string,
];
type Cell = readonly [
  offer: MatrixOffer,
  ranks: number[],
  alternatives?: MatrixOffer[],
  picks?: number[],
];
type CountryRow = { country: MatrixCountry; cells: (Cell | null)[] };
type Column = { id: string; name: string; shortName: string; pill: string };
type Group = { name: string; columns: Column[] };

interface Props {
  rows: CountryRow[];
  groups: Group[];
  rates: Record<string, number>;
  usdToCny: number;
}

function updateQuery(values: Record<string, string>) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  history.replaceState(history.state, "", url);
  document.dispatchEvent(new Event("g1:matrix"));
}

const rankClass = (rank?: number) =>
  rank === 1 ? "rank-best" : rank === 2 || rank === 3 ? "rank-top3" : undefined;

function CountryLink({
  country,
  eager,
  compact = false,
}: {
  country: MatrixCountry;
  eager: boolean;
  compact?: boolean;
}) {
  return (
    <a
      className="matrix-country"
      href={`/countries/${country.code.toLowerCase()}`}
    >
      <img
        className="flag"
        width="18"
        height="12"
        alt=""
        loading={eager ? "eager" : "lazy"}
        src={`/flags/${country.iso2.toLowerCase()}.svg`}
      />
      <span className="matrix-country-text">
        <span className="matrix-country-name">{country.nameZh}</span>
        {(!compact || country.usd) && (
          <span className="mono small matrix-country-code">
            {!compact && country.code} {!compact && " · "}
            <span className={country.usd ? "currency-badge" : "muted"}>
              {country.currency}
            </span>
          </span>
        )}
      </span>
      {!compact && (
        <span className="matrix-country-iso mono">
          {country.code}
          <span className={country.usd ? "currency-badge" : "muted"}>
            {country.currency}
          </span>
          <span className="sr-only"> {country.nameZh}</span>
        </span>
      )}
    </a>
  );
}

type QuoteDisplay = {
  raw: { currency: string; intro: number | null; renewal: number };
  terms: PriceTerms;
};

function CellPrice({
  quote,
  view,
  compact = false,
  marketCurrency,
}: {
  quote: QuoteDisplay;
  view: PriceView;
  compact?: boolean;
  marketCurrency: string;
}) {
  const { raw, terms } = quote;
  const display = formatPriceLines(
    raw,
    terms,
    !compact || raw.currency !== marketCurrency,
  );
  const label = formatCny(terms.prices[view], view, display.trial);
  const openDetail = (trigger: HTMLButtonElement) => {
    document.dispatchEvent(
      new CustomEvent("g1:price-detail", {
        detail: { trigger, text: formatPriceDetail(raw, terms) },
      }),
    );
  };
  if (compact) {
    return (
      <>
        <button
          type="button"
          className="price-action"
          aria-haspopup="dialog"
          onClick={(event) => openDetail(event.currentTarget)}
        >
          <b className="amount">{label}</b>
          {label !== "免费" && <small>/月</small>}
          {terms.annual && <small className="annual">年付</small>}
          {display.duration && <small>{display.duration}</small>}
        </button>
        {display.offer ? (
          <div className="matrix-sub">
            <span className="original">{display.raw}</span>
            <span className="cny-offer-when-hidden">
              {display.introCny} → {display.renewCny}
            </span>
            {display.badge && (
              <i
                className={`trap-dot ${display.badge.level}`}
                title={display.badge.label}
              />
            )}
          </div>
        ) : (
          <div className="matrix-sub original">{display.raw}</div>
        )}
      </>
    );
  }
  return (
    <div className="dual-price">
      <button
        type="button"
        className="price-action"
        aria-haspopup="dialog"
        onClick={(event) => openDetail(event.currentTarget)}
      >
        <span className="mono amount">{label}</span>
        {label !== "免费" && <small className="muted">/月</small>}
        {terms.annual && <small className="annual">年付</small>}
      </button>
      <div
        className={
          display.offer ? "price-sub small" : "price-sub small original"
        }
      >
        <span className="mono original">{display.raw}</span>
        {display.offer && (
          <span className="mono cny-offer-when-hidden">
            {display.introCny} → {display.renewCny}
          </span>
        )}
        {display.duration && <span>{display.duration}</span>}
        {display.badge && (
          <span className={`badge ${display.badge.level}`}>
            {display.badge.label}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Matrix({ rows, groups, rates, usdToCny }: Props) {
  const [pageState, setPageState] = useState("year|shown|");
  useLayoutEffect(() => {
    const sync = () => {
      const { view, usd } = document.documentElement.dataset;
      setPageState(`${view}|${usd}|${location.search}`);
    };
    sync();
    document.addEventListener("g1:preferences", sync);
    document.addEventListener("g1:matrix", sync);
    return () => {
      document.removeEventListener("g1:preferences", sync);
      document.removeEventListener("g1:matrix", sync);
    };
  }, []);
  const [currentView, usd, query] = pageState.split("|");
  const viewIndex = Math.max(0, views.indexOf(currentView as PriceView));
  const view = views[viewIndex];
  const params = new URLSearchParams(query);
  const columns = useMemo(
    () => groups.flatMap(({ columns }) => columns),
    [groups],
  );
  const search = (params.get("q") ?? "").trim().toLowerCase();
  const requestedRegion = params.get("region");
  const region = rows.some(({ country }) => country.region === requestedRegion)
    ? requestedRegion
    : null;
  const hideUsd = usd === "hidden";
  const sortIndex = columns.findIndex(({ id }) => id === params.get("sort"));
  const descending = params.get("dir") === "desc";
  const tierIndex = Math.max(
    0,
    columns.findIndex(({ id }) => id === params.get("tier")),
  );
  const tableMode = params.get("mode") === "matrix";
  const [activeColumn, setActiveColumn] = useState<number | null>(null);
  const [horizontal, setHorizontal] = useState({ left: false, right: true });
  const scroller = useRef<HTMLElement>(null);

  function readScroll(element: HTMLElement) {
    const left = element.scrollLeft > 0;
    const right =
      element.scrollWidth - element.clientWidth - element.scrollLeft > 1;
    setHorizontal((old) =>
      old.left === left && old.right === right ? old : { left, right },
    );
  }

  useEffect(() => {
    const target = scroller.current;
    if (!target) return;
    const observer = new ResizeObserver(() => readScroll(target));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const quotes = useMemo(() => {
    const result = new Map<MatrixOffer, QuoteDisplay>();
    for (const { country, cells } of rows) {
      for (const cell of cells) {
        if (!cell) continue;
        const [first, , alternatives = []] = cell;
        for (const offer of [first, ...alternatives]) {
          const [
            renewal,
            billing,
            intro = null,
            introMonths = 0,
            currency = country.currency,
          ] = offer;
          result.set(offer, {
            raw: { currency, intro, renewal },
            terms: describeRawPrice(
              renewal,
              intro,
              billing,
              introMonths,
              rates[currency],
              usdToCny,
            ),
          });
        }
      }
    }
    return result;
  }, [rows, rates, usdToCny]);

  function quoteFor(cell: Cell) {
    const [first, , alternatives, picks] = cell;
    const pick = picks?.[viewIndex] ?? 0;
    const quote = quotes.get(
      pick === 0 ? first : (alternatives?.[pick - 1] ?? first),
    );
    if (!quote) throw new Error("Missing matrix quote");
    return quote;
  }

  const visible = useMemo(
    () =>
      rows.filter(
        ({ country }) =>
          (!region || country.region === region) &&
          (!hideUsd || !country.usd) &&
          `${country.nameZh} ${country.nameEn} ${country.code} ${country.currency}`
            .toLowerCase()
            .includes(search),
      ),
    [rows, search, region, hideUsd],
  );

  useEffect(() => {
    const status = document.getElementById("matrix-visible");
    if (status) status.textContent = `${visible.length} / ${rows.length}`;
  }, [visible.length, rows.length]);

  const rankings = useMemo(
    () =>
      columns.map((_, col) => {
        const ranked = visible
          .flatMap((row) => {
            const cell = row.cells[col];
            return cell ? [{ country: row.country, cell }] : [];
          })
          .sort((a, b) => a.cell[1][viewIndex] - b.cell[1][viewIndex]);
        return {
          rows: ranked,
          ranks: new Map(
            ranked.map(({ country }, rank) => [country.code, rank + 1]),
          ),
        };
      }),
    [columns, visible, viewIndex],
  );

  const sorted = useMemo(() => {
    if (sortIndex < 0) return visible;
    return [...visible].sort((a, b) => {
      const first = a.cells[sortIndex];
      const second = b.cells[sortIndex];
      if (!first || !second)
        return Number(first === null) - Number(second === null);
      const diff = first[1][viewIndex] - second[1][viewIndex];
      return descending ? -diff : diff;
    });
  }, [visible, sortIndex, viewIndex, descending]);

  const sortBy = (index: number) => {
    const id = columns[index].id;
    if (sortIndex !== index) updateQuery({ sort: id, dir: "asc" });
    else if (!descending) updateQuery({ sort: id, dir: "desc" });
    else updateQuery({ sort: "", dir: "" });
  };
  const { rows: ranked } = rankings[tierIndex];
  const lowest = ranked[0] ? quoteFor(ranked[0].cell).terms.prices[view] : 0;

  return (
    <div
      className="matrix-shell"
      data-matrix-mode={tableMode ? "matrix" : "list"}
    >
      <div className="matrix-status">
        <button
          className="control matrix-mode-button"
          type="button"
          onClick={() => updateQuery({ mode: tableMode ? "" : "matrix" })}
        >
          {tableMode ? "榜单视图" : "矩阵视图"}
        </button>
      </div>
      {visible.length === 0 && (
        <p className="empty-message panel" role="status">
          找不到符合筛选条件的地区。
        </p>
      )}
      <div
        className="matrix-scroll-frame"
        data-more-columns={horizontal.right}
        hidden={visible.length === 0}
      >
        <section
          ref={scroller}
          className={`matrix-scroller panel${horizontal.left ? " scrolled" : ""}`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: The scroll region must be keyboard-scrollable.
          tabIndex={0}
          aria-label="可滚动的价格矩阵"
          onMouseLeave={() => setActiveColumn(null)}
          onScroll={(event) => readScroll(event.currentTarget)}
        >
          <table
            className="data-table full-matrix"
            style={`--matrix-columns: ${columns.length}`}
            aria-label="全球 iOS 订阅价格矩阵"
          >
            <colgroup>
              <col className="matrix-country-column" />
            </colgroup>
            {groups.map((group) => (
              <colgroup key={group.name}>
                <col
                  span={group.columns.length}
                  className="matrix-price-column"
                />
              </colgroup>
            ))}
            <thead>
              <tr className="matrix-group-head">
                <th scope="col" rowSpan={2} className="matrix-frozen">
                  国家/地区
                </th>
                {groups.map((group) => (
                  <th
                    key={group.name}
                    scope="colgroup"
                    colSpan={group.columns.length}
                  >
                    {group.name}
                  </th>
                ))}
              </tr>
              <tr className="matrix-tier-head">
                {columns.map(({ id, shortName, name }, index) => {
                  const selected = sortIndex === index;
                  const leader = rankings[index].rows[0];
                  const quote = leader && quoteFor(leader.cell);
                  return (
                    <th
                      key={id}
                      scope="col"
                      className={
                        activeColumn === index
                          ? "matrix-column-hover"
                          : undefined
                      }
                      aria-sort={
                        selected
                          ? descending
                            ? "descending"
                            : "ascending"
                          : undefined
                      }
                    >
                      <div className="matrix-head-title">
                        <button
                          type="button"
                          onClick={() => sortBy(index)}
                          aria-label={`${name}，${selected && !descending ? "降序" : selected ? "恢复默认排序" : "升序"}`}
                        >
                          {shortName}
                          <span className="sort-arrow" aria-hidden="true">
                            {selected ? (descending ? "▼" : "▲") : "↕"}
                          </span>
                        </button>
                        <a
                          href={`/tiers/${id}`}
                          aria-label={`查看 ${name} 档位详情`}
                          title={name}
                        >
                          ↗
                        </a>
                      </div>
                      <span className="matrix-min mono small muted">
                        {quote
                          ? `最低 ${formatCny(quote.terms.prices[view], view, quote.raw.intro === 0)} ${leader.country.code}`
                          : "·"}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ country, cells }, rowIndex) => (
                <tr key={country.code}>
                  <th
                    scope="row"
                    className="matrix-frozen"
                    onMouseEnter={() => setActiveColumn(null)}
                  >
                    <CountryLink country={country} eager={rowIndex < 14} />
                  </th>
                  {cells.map((cell, col) => (
                    <td
                      key={columns[col].id}
                      className={`matrix-cell ${rankClass(rankings[col].ranks.get(country.code)) ?? ""}`}
                      onMouseEnter={() => setActiveColumn(col)}
                    >
                      {cell ? (
                        <CellPrice
                          quote={quoteFor(cell)}
                          view={view}
                          marketCurrency={country.currency}
                          compact
                        />
                      ) : (
                        <span className="muted">
                          <span aria-hidden="true">·</span>
                          <span className="sr-only">无报价</span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <div className="matrix-list" hidden={visible.length === 0}>
        <fieldset className="pills matrix-tier-pills" aria-label="选择档位">
          {columns.map(({ id, pill, name }, index) => (
            <button
              key={id}
              type="button"
              className="control"
              aria-pressed={tierIndex === index}
              onClick={() => updateQuery({ tier: id })}
              title={name}
            >
              {pill}
            </button>
          ))}
        </fieldset>
        <p className="matrix-list-link small">
          <a href={`/tiers/${columns[tierIndex].id}`}>
            {columns[tierIndex].name} →
          </a>
        </p>
        <div className="panel matrix-list-view">
          {ranked.length === 0 ? (
            <p className="empty-message">所选地区没有此档位报价。</p>
          ) : (
            <table
              className="data-table matrix-list-table"
              aria-label={viewLabels[view]}
            >
              <thead>
                <tr>
                  <th className="num" scope="col">
                    排名
                  </th>
                  <th scope="col">国家</th>
                  <th className="num" scope="col">
                    {viewLabels[view]}
                  </th>
                  <th className="num" scope="col">
                    较最低
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ country, cell }, index) => {
                  const quote = quoteFor(cell);
                  return (
                    <tr key={country.code}>
                      <td className="num muted">#{index + 1}</td>
                      <td>
                        <CountryLink
                          country={country}
                          eager={index < 12}
                          compact
                        />
                      </td>
                      <td className={`num ${rankClass(index + 1) ?? ""}`}>
                        <CellPrice
                          quote={quote}
                          view={view}
                          marketCurrency={country.currency}
                        />
                      </td>
                      <td className="num secondary">
                        {index === 0 ? (
                          <span className="best-text">最低</span>
                        ) : (
                          formatRelative(
                            relativeToLowest(quote.terms.prices[view], lowest),
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
