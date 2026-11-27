export function priceFreshness(observedAt: string, now = Date.now()) {
  // The workbook records wall time in UTC+8.
  const timestamp = Date.parse(
    /(?:Z|[+-]\d{2}:\d{2})$/.test(observedAt)
      ? observedAt
      : `${observedAt}+08:00`,
  );
  const elapsed = Math.max(0, now - timestamp) / 86_400_000;
  return {
    days: Math.floor(elapsed),
    state: elapsed > 30 ? "stale" : elapsed > 7 ? "aging" : "fresh",
  };
}
