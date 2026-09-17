import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../../data/crops';
import { buildGarden } from '../../engine/garden';
import type { Placement, PlotPos, TilePos } from '../../engine/types';
import { dragGhostFor, planDrop, type DragItemData } from './dragDrop';

const TWO_PLOTS: PlotPos[] = [{ x: 0, y: 0 }, { x: 3, y: 0 }]; // 6 wide x 3 tall, no gap
const GAP_PLOTS: PlotPos[] = [{ x: 0, y: 0 }, { x: 6, y: 0 }]; // gap at x = 3..5

describe('planDrop: dragging a palette chip', () => {
  it('always plans a place at the target tile', () => {
    const garden = buildGarden(TWO_PLOTS);
    const item: DragItemData = { kind: 'palette', cropId: 'wheat' };
    expect(planDrop(garden, CROP_BY_ID, [], [], item, { x: 3, y: 0 })).toEqual({
      action: 'place',
      cropId: 'wheat',
      x: 3,
      y: 0,
    });
  });
});

describe('planDrop: dragging a placed plant', () => {
  it('plans a move to the resolved top-left for a valid target', () => {
    const garden = buildGarden(TWO_PLOTS);
    const placements: Placement[] = [{ cropId: 'apple', x: 0, y: 0 }];
    const item: DragItemData = { kind: 'plant', index: 0, cropId: 'apple', x: 0, y: 0 };
    // Tapping (4, 2) resolves to top-left (3, 0), the only 3x3 spot covering it.
    expect(planDrop(garden, CROP_BY_ID, placements, [], item, { x: 4, y: 2 })).toEqual({
      action: 'move',
      cropId: 'apple',
      from: { x: 0, y: 0 },
      to: { x: 3, y: 0 },
    });
  });

  it('is a no-op, with no message, when dropped back at its own resolved position', () => {
    const garden = buildGarden(TWO_PLOTS);
    const placements: Placement[] = [{ cropId: 'apple', x: 0, y: 0 }];
    const item: DragItemData = { kind: 'plant', index: 0, cropId: 'apple', x: 0, y: 0 };
    // Tapping the crop's own top-left is unambiguously the nearest candidate to itself.
    expect(planDrop(garden, CROP_BY_ID, placements, [], item, { x: 0, y: 0 })).toEqual({
      action: 'none',
      message: null,
    });
  });

  it('refuses, naming the crop, when the dragged plant itself is locked', () => {
    const garden = buildGarden(TWO_PLOTS);
    const placements: Placement[] = [{ cropId: 'wheat', x: 3, y: 0 }];
    const locked: TilePos[] = [{ x: 3, y: 0 }];
    const item: DragItemData = { kind: 'plant', index: 0, cropId: 'wheat', x: 3, y: 0 };
    expect(planDrop(garden, CROP_BY_ID, placements, locked, item, { x: 4, y: 0 })).toEqual({
      action: 'none',
      message: 'Wheat is locked. Unlock it first.',
    });
  });

  it('refuses when the new footprint does not fit anywhere reachable', () => {
    const garden = buildGarden(GAP_PLOTS);
    const placements: Placement[] = [{ cropId: 'wheat', x: 0, y: 0 }];
    const item: DragItemData = { kind: 'plant', index: 0, cropId: 'wheat', x: 0, y: 0 };
    expect(planDrop(garden, CROP_BY_ID, placements, [], item, { x: 4, y: 1 })).toEqual({
      action: 'none',
      message: 'Wheat doesn’t fit there.',
    });
  });

  it('refuses, naming the blocker, when the target covers a different locked plant', () => {
    const garden = buildGarden(TWO_PLOTS);
    const placements: Placement[] = [
      { cropId: 'wheat', x: 0, y: 0 },
      { cropId: 'corn', x: 5, y: 2 },
    ];
    const locked: TilePos[] = [{ x: 5, y: 2 }];
    const item: DragItemData = { kind: 'plant', index: 0, cropId: 'wheat', x: 0, y: 0 };
    expect(planDrop(garden, CROP_BY_ID, placements, locked, item, { x: 5, y: 2 })).toEqual({
      action: 'none',
      message: 'Corn is locked. Unlock it first.',
    });
  });

  it('lets a multi-tile crop slide by one tile, freeing its old tiles', () => {
    const garden = buildGarden(TWO_PLOTS);
    const placements: Placement[] = [{ cropId: 'blueberry', x: 0, y: 0 }];
    const item: DragItemData = { kind: 'plant', index: 0, cropId: 'blueberry', x: 0, y: 0 };
    expect(planDrop(garden, CROP_BY_ID, placements, [], item, { x: 1, y: 1 })).toEqual({
      action: 'move',
      cropId: 'blueberry',
      from: { x: 0, y: 0 },
      to: { x: 1, y: 1 },
    });
  });
});

describe('dragGhostFor', () => {
  it('previews a palette crop at the resolved top-left', () => {
    const garden = buildGarden(TWO_PLOTS);
    const item: DragItemData = { kind: 'palette', cropId: 'apple' };
    expect(dragGhostFor(garden, CROP_BY_ID, [], [], item, { x: 0, y: 2 })).toEqual({
      cropId: 'apple',
      size: 3,
      topLeft: { x: 0, y: 0 },
      valid: true,
    });
  });

  it('marks a palette preview invalid over a locked tile without throwing', () => {
    const garden = buildGarden(TWO_PLOTS);
    const item: DragItemData = { kind: 'palette', cropId: 'wheat' };
    const ghost = dragGhostFor(garden, CROP_BY_ID, [], [{ x: 3, y: 0 }], item, { x: 3, y: 0 });
    expect(ghost).toEqual({ cropId: 'wheat', size: 1, topLeft: { x: 3, y: 0 }, valid: false });
  });

  it('previews a plant move using the same resolution as planDrop', () => {
    const garden = buildGarden(TWO_PLOTS);
    const placements: Placement[] = [{ cropId: 'apple', x: 0, y: 0 }];
    const item: DragItemData = { kind: 'plant', index: 0, cropId: 'apple', x: 0, y: 0 };
    expect(dragGhostFor(garden, CROP_BY_ID, placements, [], item, { x: 4, y: 2 })).toEqual({
      cropId: 'apple',
      size: 3,
      topLeft: { x: 3, y: 0 },
      valid: true,
    });
  });

  it('returns null for an unknown crop id instead of throwing', () => {
    const garden = buildGarden(TWO_PLOTS);
    const item: DragItemData = { kind: 'palette', cropId: 'not-a-crop' };
    expect(dragGhostFor(garden, CROP_BY_ID, [], [], item, { x: 0, y: 0 })).toBeNull();
  });
});
