import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../data/crops';
import { shoppingList } from './shopping';
import type { CropId, Placement } from './types';

function place(cropId: CropId, x = 0, y = 0): Placement {
  return { cropId, x, y };
}

describe('shoppingList', () => {
  it('counts plants per crop and totals count * unitPrice', () => {
    const placements = [place('apple'), place('apple'), place('tomato')];
    const list = shoppingList(placements, CROP_BY_ID);

    const apple = list.lines.find((l) => l.cropId === 'apple')!;
    expect(apple.count).toBe(2);
    expect(apple.unitPrice).toBe(280);
    expect(apple.currency).toBe('medals');
    expect(apple.total).toBe(560);
    expect(apple.source).toMatch(/Guild Store/);

    const tomato = list.lines.find((l) => l.cropId === 'tomato')!;
    expect(tomato.count).toBe(1);
    expect(tomato.total).toBe(80);
  });

  it('gives a null total when the crop has no gold price', () => {
    const list = shoppingList([place('blueberry'), place('blueberry')], CROP_BY_ID);
    const blueberry = list.lines[0];
    expect(blueberry.count).toBe(2);
    expect(blueberry.unitPrice).toBeNull();
    expect(blueberry.currency).toBeNull();
    expect(blueberry.total).toBeNull();
    expect(blueberry.source).toMatch(/Seed Collector/);
  });

  it('sorts by count descending, then name ascending', () => {
    const placements = [
      place('carrot'), // 1
      place('apple'),
      place('apple'), // 2
      place('wheat'),
      place('wheat'),
      place('wheat'), // 3
      place('blueberry'),
      place('blueberry'),
      place('blueberry'), // 3, ties with wheat: "Blueberry" < "Wheat"
    ];
    const list = shoppingList(placements, CROP_BY_ID);
    expect(list.lines.map((l) => l.cropId)).toEqual(['blueberry', 'wheat', 'apple', 'carrot']);
  });

  it('sums totals per currency across lines, skipping null totals', () => {
    const placements = [place('apple'), place('tomato'), place('tomato'), place('blueberry')];
    const list = shoppingList(placements, CROP_BY_ID);
    expect(list.totalMedals).toBe(280); // 1 apple * 280 medals
    expect(list.totalGold).toBe(160); // 2 tomato * 80 gold
  });

  it('returns an empty list for no placements', () => {
    expect(shoppingList([], CROP_BY_ID)).toEqual({ lines: [], totalGold: 0, totalMedals: 0 });
  });

  it('throws for a placement with an unknown crop id', () => {
    expect(() => shoppingList([place('not-a-crop')], CROP_BY_ID)).toThrow();
  });
});
