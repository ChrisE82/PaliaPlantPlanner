/**
 * Small text-formatting helpers shared across the setup and results panels.
 */

/**
 * Joins a list of strings with commas and "or" before the last item, e.g.
 * ["a"] -> "a", ["a", "b"] -> "a or b", ["a", "b", "c"] -> "a, b or c".
 */
export function joinWithOr(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** Formats an integer with thousands separators, e.g. 1285 -> "1,285". Locale-independent. */
export function formatInt(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = Math.round(Math.abs(n)).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
