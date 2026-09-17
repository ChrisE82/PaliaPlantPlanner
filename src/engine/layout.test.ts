import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../data/crops';
import { buildGarden } from './garden';
import {
  buildOccupancy,
  lockedPlacementIndexes,
  placementAt,
  placementTileIndexes,
  validatePlacements,
} from './layout';
import type { Placement } from './types';

const onePlot = buildGarden([{ x: 0, y: 0 }]); // 3x3 tiles
const twoByTwoPlots = buildGarden([
  { x: 0, y: 0 },
  { x: 3, y: 0 },
  { x: 0, y: 3 },
  { x: 3, y: 3 },
]); // 6x6 tiles

describe('placementTileIndexes', () => {
  it('lists the footprint tiles in row-major order', () => {
    const idx = placementTileIndexes(onePlot, { cropId: 'apple', x: 0, y: 0 }, 2);
    expect(idx).toEqual([0, 1, onePlot.width, onePlot.width + 1]);
  });
});

describe('validatePlacements', () => {
  it('reports an unknown crop id', () => {
    const problems = validatePlacements(onePlot, [{ cropId: 'lettuce', x: 0, y: 0 }], CROP_BY_ID);
    expect(problems).toEqual(['Unknown crop: lettuce.']);
  });

  it('reports a footprint not entirely on soil', () => {
    const problems = validatePlacements(onePlot, [{ cropId: 'apple', x: 7, y: 0 }], CROP_BY_ID);
    expect(problems).toEqual(['Apple at (7, 0) is not fully on soil.']);
  });

  it('reports two placements overlapping', () => {
    const placements: Placement[] = [
      { cropId: 'apple', x: 0, y: 0 },
      { cropId: 'wheat', x: 1, y: 1 },
    ];
    const problems = validatePlacements(twoByTwoPlots, placements, CROP_BY_ID);
    expect(problems).toEqual(['Wheat at (1, 1) overlaps Apple at (0, 0).']);
  });

  it('collects one problem per bad placement, in order', () => {
    const placements: Placement[] = [
      { cropId: 'lettuce', x: 0, y: 0 },
      { cropId: 'apple', x: 99, y: 0 },
    ];
    expect(validatePlacements(twoByTwoPlots, placements, CROP_BY_ID)).toEqual([
      'Unknown crop: lettuce.',
      'Apple at (99, 0) is not fully on soil.',
    ]);
  });

  it('is empty for a valid layout', () => {
    const placements: Placement[] = [
      { cropId: 'apple', x: 0, y: 0 },
      { cropId: 'wheat', x: 3, y: 0 },
    ];
    expect(validatePlacements(twoByTwoPlots, placements, CROP_BY_ID)).toEqual([]);
  });
});

describe('buildOccupancy', () => {
  it('maps tiles to placement indexes and leaves the rest at -1', () => {
    const placements: Placement[] = [
      { cropId: 'apple', x: 0, y: 0 },
      { cropId: 'wheat', x: 3, y: 0 },
    ];
    const occ = buildOccupancy(twoByTwoPlots, placements, CROP_BY_ID);
    expect(placementAt(twoByTwoPlots, occ, 0, 0)).toBe(0);
    expect(placementAt(twoByTwoPlots, occ, 2, 2)).toBe(0);
    expect(placementAt(twoByTwoPlots, occ, 3, 0)).toBe(1);
    expect(placementAt(twoByTwoPlots, occ, 4, 4)).toBe(-1);
  });

  it('throws with the first problem message', () => {
    const placements: Placement[] = [{ cropId: 'lettuce', x: 0, y: 0 }];
    expect(() => buildOccupancy(twoByTwoPlots, placements, CROP_BY_ID)).toThrow('Unknown crop: lettuce.');
  });
});

describe('lockedPlacementIndexes', () => {
  it('finds placements that cover at least one locked tile', () => {
    const placements: Placement[] = [
      { cropId: 'apple', x: 0, y: 0 },
      { cropId: 'wheat', x: 3, y: 0 },
      { cropId: 'wheat', x: 3, y: 1 },
    ];
    const locked = lockedPlacementIndexes(twoByTwoPlots, placements, CROP_BY_ID, [
      { x: 2, y: 2 },
      { x: 3, y: 1 },
    ]);
    expect(locked).toEqual(new Set([0, 2]));
  });

  it('is empty when there are no locked tiles', () => {
    const placements: Placement[] = [{ cropId: 'wheat', x: 0, y: 0 }];
    expect(lockedPlacementIndexes(twoByTwoPlots, placements, CROP_BY_ID, [])).toEqual(new Set());
  });
});

describe('placementAt', () => {
  it('returns the placement index at an occupied tile', () => {
    const occ = buildOccupancy(onePlot, [{ cropId: 'wheat', x: 1, y: 1 }], CROP_BY_ID);
    expect(placementAt(onePlot, occ, 1, 1)).toBe(0);
  });

  it('returns -1 for an empty tile and for out-of-bounds tiles', () => {
    const occ = buildOccupancy(onePlot, [], CROP_BY_ID);
    expect(placementAt(onePlot, occ, 0, 0)).toBe(-1);
    expect(placementAt(onePlot, occ, -1, 0)).toBe(-1);
    expect(placementAt(onePlot, occ, 0, -1)).toBe(-1);
    expect(placementAt(onePlot, occ, 3, 0)).toBe(-1);
    expect(placementAt(onePlot, occ, 0, 3)).toBe(-1);
  });
});
