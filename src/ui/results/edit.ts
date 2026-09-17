/**
 * Pure edit-mode logic for the results grid (project task spec, Task B):
 * placing and erasing crops, and toggling locks on plants, plots and empty
 * tiles. No React or store dependency, so this is unit-tested directly.
 */
import { footprintOnSoil } from '../../engine/garden';
import { RULES } from '../../engine/rules';
import type { Crop, CropId, Garden, Placement, TilePos } from '../../engine/types';

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function tileIndex(garden: Pick<Garden, 'width'>, x: number, y: number): number {
  return y * garden.width + x;
}

export function tileSet(tiles: readonly TilePos[]): Set<string> {
  return new Set(tiles.map((t) => tileKey(t.x, t.y)));
}

function footprintTiles(p: { x: number; y: number }, size: number): TilePos[] {
  const tiles: TilePos[] = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) tiles.push({ x: p.x + dx, y: p.y + dy });
  }
  return tiles;
}

function placementTiles(p: Placement, cropsById: ReadonlyMap<CropId, Crop>): TilePos[] {
  const crop = cropsById.get(p.cropId);
  if (!crop) return [];
  return footprintTiles(p, crop.size);
}

/** Placement whose footprint covers (x, y), or undefined. */
function placementCovering(
  placements: readonly Placement[],
  cropsById: ReadonlyMap<CropId, Crop>,
  x: number,
  y: number,
): Placement | undefined {
  return placements.find((p) => {
    const crop = cropsById.get(p.cropId);
    if (!crop) return false;
    return x >= p.x && x < p.x + crop.size && y >= p.y && y < p.y + crop.size;
  });
}

/**
 * Every top-left for a `size` footprint that still covers (tapX, tapY),
 * nearest to (tapX, tapY) first (ties broken by row then column).
 */
function candidateTopLefts(size: number, tapX: number, tapY: number): TilePos[] {
  const candidates: TilePos[] = [];
  for (let ty = tapY - size + 1; ty <= tapY; ty++) {
    for (let tx = tapX - size + 1; tx <= tapX; tx++) {
      candidates.push({ x: tx, y: ty });
    }
  }
  return candidates.sort((a, b) => {
    const da = (a.x - tapX) ** 2 + (a.y - tapY) ** 2;
    const db = (b.x - tapX) ** 2 + (b.y - tapY) ** 2;
    return da !== db ? da - db : a.y - b.y || a.x - b.x;
  });
}

/** The valid top-left closest to (tapX, tapY) whose footprint still covers it, or null. */
export function resolveTopLeft(garden: Garden, size: number, tapX: number, tapY: number): TilePos | null {
  for (const c of candidateTopLefts(size, tapX, tapY)) {
    if (footprintOnSoil(garden, c.x, c.y, size)) return c;
  }
  return null;
}

export interface PlacementPreview {
  /** The footprint's top-left: the resolved valid spot, or the tapped tile when none fits. */
  topLeft: TilePos;
  valid: boolean;
}

/** Hover/tap preview for the Plant tool: where the crop would land, and whether that's allowed. */
export function previewPlacement(
  garden: Garden,
  cropsById: ReadonlyMap<CropId, Crop>,
  lockedTiles: readonly TilePos[],
  cropId: CropId,
  tapX: number,
  tapY: number,
): PlacementPreview | null {
  const crop = cropsById.get(cropId);
  if (!crop) return null;
  const resolved = resolveTopLeft(garden, crop.size, tapX, tapY);
  if (!resolved) return { topLeft: { x: tapX, y: tapY }, valid: false };
  const locked = tileSet(lockedTiles);
  const blocked = footprintTiles(resolved, crop.size).some((t) => locked.has(tileKey(t.x, t.y)));
  return { topLeft: resolved, valid: !blocked };
}

export interface EditOutcome {
  placements: Placement[];
  changed: boolean;
  message: string | null;
}

/**
 * Places `cropId` with its top-left at the tapped tile, or the nearest valid
 * top-left that still covers it. Removes crops it overlaps; refuses (no
 * change) when the footprint doesn't fit on soil anywhere reachable, or when
 * it covers a locked tile.
 */
export function placeCropAt(
  garden: Garden,
  cropsById: ReadonlyMap<CropId, Crop>,
  placements: readonly Placement[],
  lockedTiles: readonly TilePos[],
  cropId: CropId,
  tapX: number,
  tapY: number,
): EditOutcome {
  const crop = cropsById.get(cropId);
  if (!crop) return { placements: [...placements], changed: false, message: 'Unknown crop.' };

  const topLeft = resolveTopLeft(garden, crop.size, tapX, tapY);
  if (!topLeft) {
    return { placements: [...placements], changed: false, message: `${crop.name} doesn’t fit there.` };
  }

  const footprint = footprintTiles(topLeft, crop.size);
  const footprintIdx = new Set(footprint.map((t) => tileIndex(garden, t.x, t.y)));
  const locked = tileSet(lockedTiles);

  const lockedTile = footprint.find((t) => locked.has(tileKey(t.x, t.y)));
  if (lockedTile) {
    const blocker = placementCovering(placements, cropsById, lockedTile.x, lockedTile.y);
    const message = blocker
      ? `${cropsById.get(blocker.cropId)?.name ?? blocker.cropId} is locked. Unlock it first.`
      : 'That tile is locked. Unlock it first.';
    return { placements: [...placements], changed: false, message };
  }

  const remaining = placements.filter((p) => {
    const c = cropsById.get(p.cropId);
    if (!c) return true;
    return !footprintTiles(p, c.size).some((t) => footprintIdx.has(tileIndex(garden, t.x, t.y)));
  });

  return { placements: [...remaining, { cropId, x: topLeft.x, y: topLeft.y }], changed: true, message: null };
}

/** Removes the plant covering (x, y), when there is one and it isn't locked. */
export function eraseAt(
  _garden: Garden,
  cropsById: ReadonlyMap<CropId, Crop>,
  placements: readonly Placement[],
  lockedTiles: readonly TilePos[],
  x: number,
  y: number,
): EditOutcome {
  const target = placementCovering(placements, cropsById, x, y);
  if (!target) return { placements: [...placements], changed: false, message: null };

  const crop = cropsById.get(target.cropId);
  const locked = tileSet(lockedTiles);
  const isLocked = placementTiles(target, cropsById).some((t) => locked.has(tileKey(t.x, t.y)));
  if (isLocked) {
    return {
      placements: [...placements],
      changed: false,
      message: `${crop?.name ?? target.cropId} is locked. Unlock it first.`,
    };
  }

  return { placements: placements.filter((p) => p !== target), changed: true, message: null };
}

/** Adds or removes every tile in `targetTiles`, as one unit: locks all unless every one is already locked. */
function toggleTileGroup(lockedTiles: readonly TilePos[], targetTiles: readonly TilePos[]): TilePos[] {
  if (targetTiles.length === 0) return [...lockedTiles];
  const locked = tileSet(lockedTiles);
  const allLocked = targetTiles.every((t) => locked.has(tileKey(t.x, t.y)));

  if (allLocked) {
    const targets = tileSet(targetTiles);
    return lockedTiles.filter((t) => !targets.has(tileKey(t.x, t.y)));
  }

  const result = [...lockedTiles];
  for (const t of targetTiles) {
    if (!locked.has(tileKey(t.x, t.y))) {
      result.push(t);
      locked.add(tileKey(t.x, t.y));
    }
  }
  return result;
}

/**
 * Lock plant tool: tapping a plant toggles the lock on all of its tiles;
 * tapping an empty tile toggles just that tile.
 */
export function toggleLockAtTile(
  _garden: Garden,
  cropsById: ReadonlyMap<CropId, Crop>,
  placements: readonly Placement[],
  lockedTiles: readonly TilePos[],
  x: number,
  y: number,
): TilePos[] {
  const target = placementCovering(placements, cropsById, x, y);
  const targetTiles = target ? placementTiles(target, cropsById) : [{ x, y }];
  return toggleTileGroup(lockedTiles, targetTiles);
}

/** Lock plot tool: tapping toggles the lock on all 9 tiles of the plot under the tap. */
export function toggleLockPlotAt(garden: Garden, lockedTiles: readonly TilePos[], x: number, y: number): TilePos[] {
  if (x < 0 || y < 0 || x >= garden.width || y >= garden.height) return [...lockedTiles];
  const plotIndex = garden.plotOf[tileIndex(garden, x, y)];
  if (plotIndex < 0) return [...lockedTiles];
  const plot = garden.plots[plotIndex];
  const targetTiles = footprintTiles(plot, RULES.plotSize);
  return toggleTileGroup(lockedTiles, targetTiles);
}
