import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../../data/crops';
import { buildGarden } from '../../engine/garden';
import type { Placement, PlotPos, TilePos } from '../../engine/types';
import type { DragItem, DropTarget } from '../dnd/types';
import { decideGardenDrop, dragGhostFor } from './dragDrop';

const TWO_PLOTS: PlotPos[] = [{ x: 0, y: 0 }, { x: 3, y: 0 }]; // 6 wide x 3 tall, no gap
const GAP_PLOTS: PlotPos[] = [{ x: 0, y: 0 }, { x: 6, y: 0 }]; // gap at x = 3..5

describe('decideGardenDrop: a palette crop dropped on a tile', () => {
  it('always plans a place at the target tile', () => {
    const garden = buildGarden(TWO_PLOTS);
    const item: DragItem = { kind: 'palette-crop', cropId: 'wheat' };
    const target: DropTarget = { kind: 'tile', x: 3, y: 0 };
    expect(decideGardenDrop(garden, CROP_BY_ID, [], [], item, target)).toEqual({
      action: 'place',
      cropId: 'wheat',
      x: 3,
      y: 0,
    });
  });
});

describe('decideGardenDrop: a plant dropped on a tile', () => {
  it('plans a move to the resolved top-left for a valid target', () => {
    const garden = buildGarden(TWO_PLOTS);
    const placements: Placement[] = [{ cropId: 'apple', x: 0, y: 0 }];
    const item: DragItem = { kind: 'plant', index: 0, cropId: 'apple', x: 0, y: 0 };
    // Tapping (4, 2) resolves to top-left (3, 0), the only 3x3 spot covering it.
    const target: DropTarget = { kind: 'tile', x: 4, y: 2 };
    expect(decideGardenDrop(garden, CROP_BY_ID, placements, [], item, target)).toEqual({
      action: 'move',
      from: { x: 0, y: 0 },
      to: { x: 3, y: 0 },
    });
  });

  it('is a no-op when dropped back at its own resolved position', () => {
    const garden = buildGarden(TWO_PLOTS);
    const placements: Placement[] = [{ cropId: 'apple', x: 0, y: 0 }];
    const item: DragItem = { kind: 'plant', index: 0, cropId: 'apple', x: 0, y: 0 };
    // Tapping the crop's own top-left is unambiguously the nearest candidate to itself.
    const target: DropTarget = { kind: 'tile', x: 0, y: 0 };
    expect(decideGardenDrop(garden, CROP_BY_ID, placements, [], item, target)).toEqual({ action: 'noop' });
  });

  it('refuses, naming the crop, when the dragged plant itself is locked', () => {
    const garden = buildGarden(TWO_PLOTS);
    const placements: Placement[] = [{ cropId: 'wheat', x: 3, y: 0 }];
    const locked: TilePos[] = [{ x: 3, y: 0 }];
    const item: DragItem = { kind: 'plant', index: 0, cropId: 'wheat', x: 3, y: 0 };
    const target: DropTarget = { kind: 'tile', x: 4, y: 0 };
    expect(decideGardenDrop(garden, CROP_BY_ID, placements, locked, item, target)).toEqual({
      action: 'refused',
      message: 'Wheat is locked. Unlock it first.',
    });
  });

  it('refuses when the new footprint does not fit anywhere reachable', () => {
    const garden = buildGarden(GAP_PLOTS);
    const placements: Placement[] = [{ cropId: 'wheat', x: 0, y: 0 }];
    const item: DragItem = { kind: 'plant', index: 0, cropId: 'wheat', x: 0, y: 0 };
    const target: DropTarget = { kind: 'tile', x: 4, y: 1 };
    expect(decideGardenDrop(garden, CROP_BY_ID, placements, [], item, target)).toEqual({
      action: 'refused',
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
    const item: DragItem = { kind: 'plant', index: 0, cropId: 'wheat', x: 0, y: 0 };
    const target: DropTarget = { kind: 'tile', x: 5, y: 2 };
    expect(decideGardenDrop(garden, CROP_BY_ID, placements, locked, item, target)).toEqual({
      action: 'refused',
      message: 'Corn is locked. Unlock it first.',
    });
  });

  it('lets a multi-tile crop slide by one tile, freeing its old tiles', () => {
    const garden = buildGarden(TWO_PLOTS);
    const placements: Placement[] = [{ cropId: 'blueberry', x: 0, y: 0 }];
    const item: DragItem = { kind: 'plant', index: 0, cropId: 'blueberry', x: 0, y: 0 };
    const target: DropTarget = { kind: 'tile', x: 1, y: 1 };
    expect(decideGardenDrop(garden, CROP_BY_ID, placements, [], item, target)).toEqual({
      action: 'move',
      from: { x: 0, y: 0 },
      to: { x: 1, y: 1 },
    });
  });
});

describe('decideGardenDrop: a plant dropped on the trash', () => {
  it('erases the plant at its own tile', () => {
    const garden = buildGarden(TWO_PLOTS);
    const placements: Placement[] = [{ cropId: 'wheat', x: 3, y: 0 }];
    const item: DragItem = { kind: 'plant', index: 0, cropId: 'wheat', x: 3, y: 0 };
    const target: DropTarget = { kind: 'trash' };
    expect(decideGardenDrop(garden, CROP_BY_ID, placements, [], item, target)).toEqual({
      action: 'erase',
      x: 3,
      y: 0,
    });
  });
});

describe('decideGardenDrop: not the garden’s concern', () => {
  it('is not-garden for a goal, regardless of target', () => {
    const garden = buildGarden(TWO_PLOTS);
    const item: DragItem = { kind: 'goal', goalId: 'g1' };
    expect(decideGardenDrop(garden, CROP_BY_ID, [], [], item, { kind: 'tile', x: 0, y: 0 })).toEqual({
      action: 'not-garden',
    });
    expect(decideGardenDrop(garden, CROP_BY_ID, [], [], item, { kind: 'trash' })).toEqual({ action: 'not-garden' });
  });

  it('is not-garden for a palette crop dropped somewhere other than a tile', () => {
    const garden = buildGarden(TWO_PLOTS);
    const item: DragItem = { kind: 'palette-crop', cropId: 'wheat' };
    expect(decideGardenDrop(garden, CROP_BY_ID, [], [], item, { kind: 'helpers' })).toEqual({ action: 'not-garden' });
    expect(decideGardenDrop(garden, CROP_BY_ID, [], [], item, null)).toEqual({ action: 'not-garden' });
  });

  it('is not-garden for a plant dropped outside any drop area', () => {
    const garden = buildGarden(TWO_PLOTS);
    const item: DragItem = { kind: 'plant', index: 0, cropId: 'wheat', x: 0, y: 0 };
    expect(decideGardenDrop(garden, CROP_BY_ID, [], [], item, null)).toEqual({ action: 'not-garden' });
  });
});

describe('dragGhostFor', () => {
  it('previews a palette crop at the resolved top-left', () => {
    const garden = buildGarden(TWO_PLOTS);
    const item: DragItem = { kind: 'palette-crop', cropId: 'apple' };
    const target: DropTarget = { kind: 'tile', x: 0, y: 2 };
    expect(dragGhostFor(garden, CROP_BY_ID, [], [], item, target)).toEqual({
      cropId: 'apple',
      size: 3,
      topLeft: { x: 0, y: 0 },
      valid: true,
    });
  });

  it('marks a palette preview invalid over a locked tile without throwing', () => {
    const garden = buildGarden(TWO_PLOTS);
    const item: DragItem = { kind: 'palette-crop', cropId: 'wheat' };
    const target: DropTarget = { kind: 'tile', x: 3, y: 0 };
    const ghost = dragGhostFor(garden, CROP_BY_ID, [], [{ x: 3, y: 0 }], item, target);
    expect(ghost).toEqual({ cropId: 'wheat', size: 1, topLeft: { x: 3, y: 0 }, valid: false });
  });

  it('previews a plant move using the same resolution as decideGardenDrop', () => {
    const garden = buildGarden(TWO_PLOTS);
    const placements: Placement[] = [{ cropId: 'apple', x: 0, y: 0 }];
    const item: DragItem = { kind: 'plant', index: 0, cropId: 'apple', x: 0, y: 0 };
    const target: DropTarget = { kind: 'tile', x: 4, y: 2 };
    expect(dragGhostFor(garden, CROP_BY_ID, placements, [], item, target)).toEqual({
      cropId: 'apple',
      size: 3,
      topLeft: { x: 3, y: 0 },
      valid: true,
    });
  });

  it('returns null for an unknown crop id instead of throwing', () => {
    const garden = buildGarden(TWO_PLOTS);
    const item: DragItem = { kind: 'palette-crop', cropId: 'not-a-crop' };
    const target: DropTarget = { kind: 'tile', x: 0, y: 0 };
    expect(dragGhostFor(garden, CROP_BY_ID, [], [], item, target)).toBeNull();
  });

  it('returns null when the target is not a tile', () => {
    const garden = buildGarden(TWO_PLOTS);
    const item: DragItem = { kind: 'palette-crop', cropId: 'apple' };
    expect(dragGhostFor(garden, CROP_BY_ID, [], [], item, { kind: 'trash' })).toBeNull();
    expect(dragGhostFor(garden, CROP_BY_ID, [], [], item, null)).toBeNull();
  });

  it('returns null for an item kind the garden does not preview, such as a goal', () => {
    const garden = buildGarden(TWO_PLOTS);
    const item: DragItem = { kind: 'goal', goalId: 'g1' };
    expect(dragGhostFor(garden, CROP_BY_ID, [], [], item, { kind: 'tile', x: 0, y: 0 })).toBeNull();
  });
});
