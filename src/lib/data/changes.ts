import type { Change } from "./schema.ts";

export function summarizeChanges(changes: readonly Change[]) {
  return {
    count: changes.length,
    countries: new Set(changes.map(({ countryCode }) => countryCode)).size,
    trials: changes.filter(({ intro }) => intro?.local === 0).length,
    offers: changes.filter(({ intro }) => intro && intro.local > 0).length,
  };
}

export function groupChanges(changes: readonly Change[]) {
  const groups = new Map<string, Change[]>();
  for (const change of changes) {
    const rows = groups.get(change.countryCode);
    if (rows) rows.push(change);
    else groups.set(change.countryCode, [change]);
  }
  return [...groups]
    .map(([code, rows]) => ({ code, rows, summary: summarizeChanges(rows) }))
    .sort(
      (a, b) =>
        b.rows.length - a.rows.length || a.code.localeCompare(b.code, "en"),
    );
}
