import { useMemo, useState, useSyncExternalStore } from "react";
import type { PriceView } from "../lib/data/money";
import type { Country } from "../lib/data/schema";
import { formatCny, formatRelative } from "../lib/format";
import type { PriceDisplay } from "../lib/price-display";
import { viewLabels } from "../lib/price-labels";

const views = [
  "intro",
  "year",
  "renew",
] as const satisfies readonly PriceView[];
type MatrixCountry = Country & { usd: boolean };
type Cell = { offers: PriceDisplay[]; picks: number[]; ranks: number[] };
type CountryRow = { country: MatrixCountry; cells: (Cell | null)[] };
type Column = { id: string; name: string; shortName: string; pill: string };
type Group = { name: string; columns: Column[] };

interface Props {
  rows: CountryRow[];
  groups: Group[];
}

const readState = () =>
  `${document.documentElement.dataset.view}|${location.search}`;
const initialState = () => "year|";
function subscribe(listener: () => void) {
  document.addEventListener("g1:preferences", listener);
  document.addEventListener("g1:matrix", listener);
  window.addEventListener("popstate", listener);
  return () => {
    document.removeEventListener("g1:preferences", listener);
    document.removeEventListener("g1:matrix", listener);
    window.removeEventListener("popstate", listener);
  };
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
      aria-label={country.nameZh}
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
        <span className="matrix-country-iso mono">{country.code}</span>
      )}
    </a>
  );
}

function CellPrice({
  offer,
  byViews,
  compact,
}: {
  offer: PriceDisplay;
  byViews: number[];
  compact?: boolean;
}) {
  const labels = byViews.map((index) =>
    formatCny(offer.prices[index], views[index], offer.trial),
  );
  const sameLabel = labels.every((label) => label === labels[0]);
  const price = (label: string) => (
    <>
      <span className="mono amount">{label}</span>
      {label !== "免费" && (
        <span className="muted small matrix-per-month">/月</span>
      )}
    </>
  );
  return (
    <div className={compact ? "dual-price compact-price" : "dual-price"}>
      <button
        type="button"
        className="price-action"
        title={offer.detail}
        data-price-detail
      >
        {sameLabel
          ? price(labels[0])
          : byViews.map((index, position) => (
              <span
                className="view-content"
                data-price-view={views[index]}
                key={index}
              >
                {price(labels[position])}
              </span>
            ))}
        {offer.annual && <span className="annual small">年付</span>}
        <span className="sr-only">查看价格明细</span>
      </button>
      <div
        className={offer.offer ? "price-sub small" : "price-sub small original"}
      >
        <span className="mono original">{offer.raw}</span>
        {offer.offer && (
          <span className="mono cny-offer-when-hidden">
            {offer.introCny} → {offer.renewCny}
          </span>
        )}
        {offer.badge &&
          (compact ? (
            <span
              className={`trap-dot ${offer.badge.level}`}
              title={offer.badge.label}
            >
              <span className="sr-only">{offer.badge.label}</span>
            </span>
          ) : (
            <span className={`badge ${offer.badge.level}`}>
              {offer.badge.label}
            </span>
          ))}
      </div>
    </div>
  );
}

export default function Matrix({ rows, groups }: Props) {
  const snapshot = useSyncExternalStore(subscribe, readState, initialState);
  const separator = snapshot.indexOf("|");
  const viewIndex = Math.max(
    0,
    views.indexOf(snapshot.slice(0, separator) as PriceView),
  );
  const params = new URLSearchParams(snapshot.slice(separator + 1));
  const columns = useMemo(
    () => groups.flatMap(({ columns }) => columns),
    [groups],
  );
  const search = (params.get("q") ?? "").trim().toLowerCase();
  const queryRegion = params.get("region");
  const region = rows.some(({ country }) => country.region === queryRegion)
    ? queryRegion
    : null;
  const hideUsd = params.get("usd") === "hide";
  const sortIndex = columns.findIndex(({ id }) => id === params.get("sort"));
  const descending = params.get("dir") === "desc";
  const tierIndex = Math.max(
    0,
    columns.findIndex(({ id }) => id === params.get("tier")),
  );
  const tableMode = params.get("mode") === "matrix";
  const [activeColumn, setActiveColumn] = useState<number | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);

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

  const rankings = useMemo(
    () =>
      views.map((_, index) =>
        columns.map((_, col) => {
          const ranked = visible
            .filter(({ cells }) => cells[col] !== null)
            .sort(
              (a, b) =>
                (a.cells[col]?.ranks[index] ?? Infinity) -
                (b.cells[col]?.ranks[index] ?? Infinity),
            );
          return {
            rows: ranked,
            ranks: new Map(
              ranked.map(({ country }, rank) => [country.code, rank + 1]),
            ),
          };
        }),
      ),
    [columns, visible],
  );

  const sorted = useMemo(() => {
    if (sortIndex < 0) return visible;
    return [...visible].sort((a, b) => {
      const first = a.cells[sortIndex];
      const second = b.cells[sortIndex];
      if (!first || !second)
        return Number(first === null) - Number(second === null);
      const diff = first.ranks[viewIndex] - second.ranks[viewIndex];
      return descending ? -diff : diff;
    });
  }, [visible, sortIndex, viewIndex, descending]);

  const sortBy = (index: number) => {
    const id = columns[index].id;
    if (sortIndex !== index) updateQuery({ sort: id, dir: "asc" });
    else if (!descending) updateQuery({ sort: id, dir: "desc" });
    else updateQuery({ sort: "", dir: "" });
  };
  const rankClass = (rank?: number) =>
    rank === 1 ? "rank-best" : rank === 2 || rank === 3 ? "rank-top3" : "";

  return (
    <div
      className="matrix-shell"
      data-matrix-mode={tableMode ? "matrix" : "list"}
    >
      <div className="matrix-status">
        <span className="mono small muted" aria-live="polite">
          {visible.length} / {rows.length}
        </span>
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
      <section
        className={`matrix-scroller panel${hasScrolled ? " scrolled" : ""}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The scroll region must be keyboard-scrollable.
        tabIndex={0}
        aria-label="可横向和纵向滚动的价格矩阵"
        hidden={visible.length === 0}
        onMouseLeave={() => setActiveColumn(null)}
        onScroll={(event) => setHasScrolled(event.currentTarget.scrollLeft > 0)}
      >
        <table
          className="data-table full-matrix"
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
                return (
                  <th
                    key={id}
                    scope="col"
                    className={
                      activeColumn === index ? "matrix-column-hover" : undefined
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
                        aria-label={`查看${name}档位详情`}
                        title={name}
                      >
                        ↗
                      </a>
                    </div>
                    {views.map((view, byView) => {
                      const leader = rankings[byView][index].rows[0];
                      const cell = leader?.cells[index];
                      const offer = cell?.offers[cell.picks[byView]];
                      return (
                        <span
                          key={view}
                          className="view-content matrix-min mono small muted"
                          data-price-view={view}
                        >
                          {offer
                            ? `最低 ${formatCny(offer.prices[byView], view, offer.trial)} ${leader.country.code}`
                            : "·"}
                        </span>
                      );
                    })}
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
                    className="matrix-cell num"
                    onMouseEnter={() => setActiveColumn(col)}
                  >
                    {cell ? (
                      cell.offers.map((offer, idx) => {
                        const byViews = cell.picks.flatMap((pick, index) =>
                          pick === idx ? [index] : [],
                        );
                        const best = byViews
                          .filter(
                            (index) =>
                              rankings[index][col].ranks.get(country.code) ===
                              1,
                          )
                          .map((index) => views[index]);
                        const top = byViews
                          .filter((index) => {
                            const rank = rankings[index][col].ranks.get(
                              country.code,
                            );
                            return rank === 2 || rank === 3;
                          })
                          .map((index) => views[index]);
                        return (
                          <div
                            className="matrix-cell-view"
                            data-cell-views={byViews
                              .map((index) => views[index])
                              .join(" ")}
                            data-cell-best={
                              best.length ? best.join(" ") : undefined
                            }
                            data-cell-top={
                              top.length ? top.join(" ") : undefined
                            }
                            key={byViews[0]}
                          >
                            {best.map((view) => (
                              <span
                                className="sr-only view-content"
                                data-price-view={view}
                                key={view}
                              >
                                第 1 名
                              </span>
                            ))}
                            <CellPrice
                              offer={offer}
                              byViews={byViews}
                              compact
                            />
                          </div>
                        );
                      })
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
        {views.map((view, byView) => {
          const { rows: ranked } = rankings[byView][tierIndex];
          const topCell = ranked[0]?.cells[tierIndex];
          const lowest =
            topCell?.offers[topCell.picks[byView]].prices[byView] ?? 0;
          return (
            <div
              key={view}
              className="view-content panel matrix-list-view"
              data-price-view={view}
            >
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
                    {ranked.map(({ country, cells }, index) => {
                      const cell = cells[tierIndex];
                      if (!cell) return null;
                      const offer = cell.offers[cell.picks[byView]];
                      const price = offer.prices[byView];
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
                          <td className={`num ${rankClass(index + 1)}`}>
                            <CellPrice offer={offer} byViews={[byView]} />
                          </td>
                          <td className="num secondary">
                            {index === 0 ? (
                              <span className="best-text">最低</span>
                            ) : (
                              formatRelative(
                                lowest > 0 ? (price - lowest) / lowest : null,
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
          );
        })}
      </div>
    </div>
  );
}
