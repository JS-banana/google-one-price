export function priceFreshness(observedAt: string, now = Date.now()) {
  // The workbook records wall time in UTC+8.
  const timestamp = Date.parse(
    /(?:Z|[+-]\d{2}:\d{2})$/.test(observedAt)
      ? observedAt
      : `${observedAt}+08:00`,
  );
  const day = 86_400_000;
  const offset = 8 * 3_600_000;
  const elapsed = Math.max(0, now - timestamp) / day;
  return {
    days: Math.max(
      0,
      Math.floor((now + offset) / day) - Math.floor((timestamp + offset) / day),
    ),
    state: elapsed > 30 ? "stale" : elapsed > 7 ? "aging" : "fresh",
  };
}
