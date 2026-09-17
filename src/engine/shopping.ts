/**
 * Seed shopping list for a layout (PLAN.md section 6, "Seed shopping list").
 */
import type { Crop, CropId, Placement, ShoppingLine, ShoppingList } from './types';

export function shoppingList(placements: readonly Placement[], cropsById: ReadonlyMap<CropId, Crop>): ShoppingList {
  const counts = new Map<CropId, number>();
  for (const p of placements) {
    counts.set(p.cropId, (counts.get(p.cropId) ?? 0) + 1);
  }

  const lines: ShoppingLine[] = [];
  for (const [cropId, count] of counts) {
    const crop = cropsById.get(cropId);
    if (!crop) throw new Error(`Unknown crop in placement: ${cropId}.`);
    const { price, currency, source } = crop.seed;
    lines.push({
      cropId,
      name: crop.name,
      count,
      unitPrice: price,
      currency,
      total: price === null ? null : count * price,
      source,
    });
  }

  lines.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  let totalGold = 0;
  let totalMedals = 0;
  for (const line of lines) {
    if (line.total === null) continue;
    if (line.currency === 'gold') totalGold += line.total;
    else if (line.currency === 'medals') totalMedals += line.total;
  }

  return { lines, totalGold, totalMedals };
}
