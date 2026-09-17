/**
 * Small text-formatting helpers shared across the setup and results panels.
 */

/**
 * Picks black or white text for readable contrast on a background color,
 * using the WCAG relative luminance formula.
 */
export function readableTextColor(hex: string): '#000000' | '#ffffff' {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const clean = match ? match[1] : '000000';
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const linear = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  // Threshold near the WCAG AA cutoff between black-on-color and white-on-color.
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

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
