import { describeRawPrice } from "./data/money";
import type { Country } from "./data/schema";
import { type PriceView, priceViews, relativeToLowest } from "./data/views";
import { formatCny, formatRelative } from "./format";
import {
  formatPriceDetail,
  formatPriceLines,
  viewLabels,
} from "./price-labels";

type Market = Country & { usd: boolean };
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
type Row = { country: Market; cells: (Cell | null)[] };
type Column = { id: string; name: string; shortName: string; pill: string };
export type MatrixData = {
  rows: Row[];
  groups: { name: string; columns: Column[] }[];
  rates: Record<string, number>;
  usdToCny: number;
};

export function matrixState(
  { rows, groups }: MatrixData,
  view: PriceView,
  usd: boolean,
  params: URLSearchParams,
) {
  const columns = groups.flatMap(({ columns }) => columns);
  const query = (params.get("q") ?? "").trim().toLowerCase();
  const requestedRegion = params.get("region");
  const region = rows.some(({ country }) => country.region === requestedRegion)
    ? requestedRegion
    : null;
  const visible = rows.filter(
    ({ country }) =>
      (!region || country.region === region) &&
      (!usd || !country.usd) &&
      `${country.nameZh} ${country.nameEn} ${country.code} ${country.currency}`
        .toLowerCase()
        .includes(query),
  );
  const viewIndex = priceViews.indexOf(view);
  const sort = columns.findIndex(({ id }) => id === params.get("sort"));
  const descending = params.get("dir") === "desc";
  const tier = Math.max(
    0,
    columns.findIndex(({ id }) => id === params.get("tier")),
  );
  const rankings = columns.map((_, index) =>
    visible
      .flatMap(({ country, cells }) => {
        const cell = cells[index];
        return cell ? [{ country, cell }] : [];
      })
      .sort((a, b) => a.cell[1][viewIndex] - b.cell[1][viewIndex]),
  );
  const sorted =
    sort < 0
      ? visible
      : [...visible].sort((a, b) => {
          const first = a.cells[sort];
          const second = b.cells[sort];
          if (!first || !second) return Number(!first) - Number(!second);
          return (
            (first[1][viewIndex] - second[1][viewIndex]) * (descending ? -1 : 1)
          );
        });
  return { view, viewIndex, columns, sorted, rankings, sort, descending, tier };
}

type State = ReturnType<typeof matrixState>;

export function matrixPrices({ rates, usdToCny }: MatrixData) {
  const cache = new Map<MatrixOffer, ReturnType<typeof makeQuote>>();
  function makeQuote(offer: MatrixOffer, marketCurrency: string) {
    const [
      renewal,
      billing,
      intro = null,
      introMonths = 0,
      currency = marketCurrency,
    ] = offer;
    const raw = { renewal, intro, currency };
    const terms = describeRawPrice(
      renewal,
      intro,
      billing,
      introMonths,
      rates[currency],
      usdToCny,
    );
    return { raw, terms };
  }
  return (cell: Cell, currency: string, viewIndex: number) => {
    const [first, , alternatives, picks] = cell;
    const pick = picks?.[viewIndex] ?? 0;
    const offer = pick ? (alternatives?.[pick - 1] ?? first) : first;
    const quote = cache.get(offer) ?? makeQuote(offer, currency);
    cache.set(offer, quote);
    return quote;
  };
}

type Prices = ReturnType<typeof matrixPrices>;
type Quote = ReturnType<Prices>;

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rankClass(rank: number) {
  return rank === 0 ? "rank-best" : rank >= 1 && rank <= 2 ? "rank-top3" : "";
}

function countryLink(country: Market, eager: boolean, compact: boolean) {
  const { code, currency, usd, nameZh, iso2 } = country;
  const name = escapeHtml(nameZh);
  const unit = `<span class="${usd ? "currency-badge" : "muted"}">${escapeHtml(currency)}</span>`;
  return `<a class="matrix-country" href="/countries/${code.toLowerCase()}">
    <img class="flag" width="18" height="12" alt="" loading="${eager ? "eager" : "lazy"}" src="/flags/${iso2.toLowerCase()}.svg">
    <span class="matrix-country-text">
      <span class="matrix-country-name">${name}</span>
      ${!compact || usd ? `<span class="mono small matrix-country-code">${compact ? "" : `${code} · `}${unit}</span>` : ""}
    </span>
    ${compact ? "" : `<span class="matrix-country-iso mono">${code}${unit}<span class="sr-only"> ${name}</span></span>`}
  </a>`;
}

function cellPrice(
  { raw, terms }: Quote,
  view: PriceView,
  marketCurrency: string,
  compact: boolean,
) {
  const display = formatPriceLines(
    raw,
    terms,
    !compact || raw.currency !== marketCurrency,
  );
  const label = formatCny(terms.prices[view], view, display.trial);
  const duration = display.duration
    ? `<small>${escapeHtml(display.duration)}</small>`
    : "";
  const action = `<button type="button" class="price-action" aria-haspopup="dialog" data-matrix-price>
    <span class="mono amount">${label}</span>${label === "免费" ? "" : '<small class="muted">/月</small>'}${terms.annual ? '<small class="annual">年付</small>' : ""}${compact ? duration : ""}
  </button>`;
  const sub = `<span class="mono original">${escapeHtml(display.raw)}</span>
    ${display.offer ? `<span class="mono cny-offer-when-hidden">${display.introCny} → ${display.renewCny}</span>` : ""}`;
  const badge = display.badge && escapeHtml(display.badge.label);
  if (compact) {
    return `${action}<div class="matrix-sub${display.offer ? "" : " original"}">${sub}${display.badge ? `<i class="trap-dot ${display.badge.level}" title="${badge}"></i>` : ""}</div>`;
  }
  return `<div class="dual-price">${action}<div class="price-sub small${display.offer ? "" : " original"}">
    ${sub}${duration}${display.badge ? `<span class="badge ${display.badge.level}">${badge}</span>` : ""}
  </div></div>`;
}

export function matrixCellDetail(
  state: State,
  price: Prices,
  row: number,
  column: number,
  compact: boolean,
) {
  const entry = compact ? state.sorted[row] : state.rankings[state.tier][row];
  if (!entry) return undefined;
  const cell = "cells" in entry ? entry.cells[column] : entry.cell;
  if (!cell) return undefined;
  const { raw, terms } = price(cell, entry.country.currency, state.viewIndex);
  return formatPriceDetail(raw, terms);
}

export function matrixLeaders(state: State, price: Prices) {
  return state.rankings.map(([leader]) => {
    if (!leader) return "·";
    const { country, cell } = leader;
    const { raw, terms } = price(cell, country.currency, state.viewIndex);
    return `最低 ${formatCny(terms.prices[state.view], state.view, raw.intro === 0)} ${country.code}`;
  });
}

export function renderMatrixRows(state: State, price: Prices) {
  const rankByColumn = state.rankings.map(
    (entries) =>
      new Map(entries.map(({ country }, rank) => [country.code, rank])),
  );
  return state.sorted
    .map(({ country, cells }, index) => {
      const prices = cells
        .map((cell, column) => {
          const rank = rankByColumn[column].get(country.code) ?? -1;
          const contents = cell
            ? cellPrice(
                price(cell, country.currency, state.viewIndex),
                state.view,
                country.currency,
                true,
              )
            : '<span class="muted"><span aria-hidden="true">·</span><span class="sr-only">无报价</span></span>';
          return `<td class="matrix-cell ${rankClass(rank)}">${contents}</td>`;
        })
        .join("");
      return `<tr><th scope="row" class="matrix-frozen">${countryLink(country, index < 14, false)}</th>${prices}</tr>`;
    })
    .join("");
}

export function renderMatrixList(state: State, price: Prices) {
  const ranked = state.rankings[state.tier];
  if (!ranked.length)
    return '<p class="empty-message">所选地区没有此档位报价。</p>';
  const first = ranked[0];
  const lowest = price(first.cell, first.country.currency, state.viewIndex)
    .terms.prices[state.view];
  const rows = ranked
    .map(({ country, cell }, index) => {
      const quote = price(cell, country.currency, state.viewIndex);
      const delta =
        index === 0
          ? '<span class="best-text">最低</span>'
          : formatRelative(
              relativeToLowest(quote.terms.prices[state.view], lowest),
            );
      return `<tr>
      <td class="num muted">#${index + 1}</td>
      <td>${countryLink(country, index < 12, true)}</td>
      <td class="num ${rankClass(index)}">${cellPrice(quote, state.view, country.currency, false)}</td>
      <td class="num secondary">${delta}</td>
    </tr>`;
    })
    .join("");
  const label = viewLabels[state.view];
  return `<table class="data-table matrix-list-table" aria-label="${label}">
    <thead><tr><th class="num" scope="col">排名</th><th scope="col">国家</th>
    <th class="num" scope="col">${label}</th><th class="num" scope="col">较最低</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
