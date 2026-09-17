import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../../data/crops';
import { buildGarden } from '../../engine/garden';
import type { Placement, PlotPos, TilePos } from '../../engine/types';
import { eraseAt, placeCropAt, previewPlacement, resolveTopLeft, toggleLockAtTile, toggleLockPlotAt } from './edit';

const TWO_PLOTS: PlotPos[] = [{ x: 0, y: 0 }, { x: 3, y: 0 }]; // 6 wide x 3 tall, no gap
const GAP_PLOTS: PlotPos[] = [{ x: 0, y: 0 }, { x: 6, y: 0 }]; // gap at x = 3..5

function sortTiles(tiles: readonly TilePos[]): TilePos[] {
  return [...tiles].sort((a, b) => a.y - b.y || a.x - b.x);
}

describe('resolveTopLeft', () => {
  it('uses the tapped tile itself when it is already a valid top-left', () => {
    const garden = buildGarden(TWO_PLOTS);
    expect(resolveTopLeft(garden, 2, 2, 1)).toEqual({ x: 2, y: 1 });
  });

  it('falls back to the nearest valid top-left when the tapped tile is not one, e.g. near an edge', () => {
    const garden = buildGarden(TWO_PLOTS);
    // A 2x2 footprint can't start at x=5 (width is 6), so it must shift left.
    expect(resolveTopLeft(garden, 2, 5, 1)).toEqual({ x: 4, y: 1 });
  });

  it('returns null when no footprint covering the tapped tile is fully on soil', () => {
    const garden = buildGarden(GAP_PLOTS);
    expect(resolveTopLeft(garden, 1, 4, 1)).toBeNull(); // (4,1) is in the gap
  });
});

describe('placeCropAt', () => {
  it('places a 1x1 crop at the tapped tile', () => {
    const garden = buildGarden(TWO_PLOTS);
    const outcome = placeCropAt(garden, CROP_BY_ID, [], [], 'wheat', 3, 0);
    expect(outcome.changed).toBe(true);
    expect(outcome.placements).toEqual([{ cropId: 'wheat', x: 3, y: 0 }]);
  });

  it('places a 3x3 crop with its top-left at the tapped tile', () => {
    const garden = buildGarden(TWO_PLOTS);
    const outcome = placeCropAt(garden, CROP_BY_ID, [], [], 'apple', 0, 0);
    expect(outcome.changed).toBe(true);
    expect(outcome.placements).toEqual([{ cropId: 'apple', x: 0, y: 0 }]);
  });

  it('places a 3x3 crop at the nearest valid top-left when tapped off-corner', () => {
    const garden = buildGarden(TWO_PLOTS);
    // The garden is only 3 tiles tall, so a 3x3 footprint must start at
    // row 0; tapping the bottom-left tile still resolves to (0, 0).
    const outcome = placeCropAt(garden, CROP_BY_ID, [], [], 'apple', 0, 2);
    expect(outcome.placements).toEqual([{ cropId: 'apple', x: 0, y: 0 }]);
  });

  it('refuses when the footprint is not on soil anywhere reachable', () => {
    const garden = buildGarden(GAP_PLOTS);
    const outcome = placeCropAt(garden, CROP_BY_ID, [], [], 'wheat', 4, 1);
    expect(outcome.changed).toBe(false);
    expect(outcome.message).toBe('Wheat doesn’t fit there.');
    expect(outcome.placements).toEqual([]);
  });

  it('removes crops it overlaps and keeps the ones it does not', () => {
    const garden = buildGarden(TWO_PLOTS);
    const existing: Placement[] = [
      { cropId: 'wheat', x: 0, y: 0 },
      { cropId: 'wheat', x: 1, y: 0 },
      { cropId: 'wheat', x: 5, y: 2 }, // far corner, untouched
    ];
    const outcome = placeCropAt(garden, CROP_BY_ID, existing, [], 'blueberry', 0, 0);
    expect(outcome.changed).toBe(true);
    expect(outcome.placements).toEqual([
      { cropId: 'wheat', x: 5, y: 2 },
      { cropId: 'blueberry', x: 0, y: 0 },
    ]);
  });

  it('refuses to overwrite a locked plant, naming it', () => {
    const garden = buildGarden(TWO_PLOTS);
    const existing: Placement[] = [{ cropId: 'apple', x: 0, y: 0 }];
    const locked: TilePos[] = [{ x: 1, y: 1 }]; // one of apple's tiles
    const outcome = placeCropAt(garden, CROP_BY_ID, existing, locked, 'wheat', 1, 1);
    expect(outcome.changed).toBe(false);
    expect(outcome.message).toBe('Apple is locked. Unlock it first.');
    expect(outcome.placements).toEqual(existing);
  });

  it('refuses to plant over a locked empty tile', () => {
    const garden = buildGarden(TWO_PLOTS);
    const outcome = placeCropAt(garden, CROP_BY_ID, [], [{ x: 3, y: 0 }], 'wheat', 3, 0);
    expect(outcome.changed).toBe(false);
    expect(outcome.message).toBe('That tile is locked. Unlock it first.');
  });
});

describe('previewPlacement', () => {
  it('is valid at the resolved top-left when nothing blocks it', () => {
    const garden = buildGarden(TWO_PLOTS);
    const preview = previewPlacement(garden, CROP_BY_ID, [], 'apple', 0, 2);
    expect(preview).toEqual({ topLeft: { x: 0, y: 0 }, valid: true });
  });

  it('is invalid when the resolved footprint covers a locked tile', () => {
    const garden = buildGarden(TWO_PLOTS);
    const preview = previewPlacement(garden, CROP_BY_ID, [{ x: 0, y: 0 }], 'apple', 0, 2);
    expect(preview?.valid).toBe(false);
    expect(preview?.topLeft).toEqual({ x: 0, y: 0 });
  });

  it('is invalid, at the tapped tile, when nothing fits there at all', () => {
    const garden = buildGarden(GAP_PLOTS);
    const preview = previewPlacement(garden, CROP_BY_ID, [], 'wheat', 4, 1);
    expect(preview).toEqual({ topLeft: { x: 4, y: 1 }, valid: false });
  });
});

describe('eraseAt', () => {
  it('removes the plant covering the tapped tile', () => {
    const garden = buildGarden(TWO_PLOTS);
    const existing: Placement[] = [{ cropId: 'apple', x: 0, y: 0 }];
    const outcome = eraseAt(garden, CROP_BY_ID, existing, [], 1, 1);
    expect(outcome.changed).toBe(true);
    expect(outcome.placements).toEqual([]);
  });

  it('is a no-op on an empty tile', () => {
    const garden = buildGarden(TWO_PLOTS);
    const outcome = eraseAt(garden, CROP_BY_ID, [], [], 1, 1);
    expect(outcome.changed).toBe(false);
    expect(outcome.message).toBeNull();
  });

  it('refuses to erase a locked plant, naming it', () => {
    const garden = buildGarden(TWO_PLOTS);
    const existing: Placement[] = [{ cropId: 'wheat', x: 3, y: 0 }];
    const outcome = eraseAt(garden, CROP_BY_ID, existing, [{ x: 3, y: 0 }], 3, 0);
    expect(outcome.changed).toBe(false);
    expect(outcome.message).toBe('Wheat is locked. Unlock it first.');
    expect(outcome.placements).toEqual(existing);
  });
});

describe('toggleLockAtTile (Lock plant tool)', () => {
  it('locks every tile of the plant under the tap', () => {
    const garden = buildGarden(TWO_PLOTS);
    const existing: Placement[] = [{ cropId: 'apple', x: 0, y: 0 }];
    const locked = toggleLockAtTile(garden, CROP_BY_ID, existing, [], 1, 1);
    expect(sortTiles(locked)).toEqual(
      sortTiles([
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
        { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
        { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
      ]),
    );
  });

  it('unlocks every tile of the plant when all are already locked', () => {
    const garden = buildGarden(TWO_PLOTS);
    const existing: Placement[] = [{ cropId: 'wheat', x: 3, y: 0 }];
    const afterLock = toggleLockAtTile(garden, CROP_BY_ID, existing, [], 3, 0);
    const afterUnlock = toggleLockAtTile(garden, CROP_BY_ID, existing, afterLock, 3, 0);
    expect(afterUnlock).toEqual([]);
  });

  it('toggles a single empty tile', () => {
    const garden = buildGarden(TWO_PLOTS);
    const locked = toggleLockAtTile(garden, CROP_BY_ID, [], [], 4, 2);
    expect(locked).toEqual([{ x: 4, y: 2 }]);
    expect(toggleLockAtTile(garden, CROP_BY_ID, [], locked, 4, 2)).toEqual([]);
  });
});

describe('toggleLockPlotAt (Lock plot tool)', () => {
  it('locks all 9 tiles of the plot under the tap', () => {
    const garden = buildGarden(TWO_PLOTS);
    const locked = toggleLockPlotAt(garden, [], 4, 1);
    expect(locked.length).toBe(9);
    expect(sortTiles(locked)).toEqual(
      sortTiles([
        { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 },
        { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 },
        { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 },
      ]),
    );
  });

  it('unlocks the plot when every one of its tiles is already locked, and leaves other locks alone', () => {
    const garden = buildGarden(TWO_PLOTS);
    const otherLock: TilePos = { x: 0, y: 0 };
    const afterLock = toggleLockPlotAt(garden, [otherLock], 4, 1);
    const afterUnlock = toggleLockPlotAt(garden, afterLock, 4, 1);
    expect(afterUnlock).toEqual([otherLock]);
  });
});
