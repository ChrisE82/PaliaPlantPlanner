/**
 * Placement checks: turning a list of placed crops into an occupancy grid,
 * finding problems in plain language, and looking up locks.
 */
import { footprintOnSoil } from './garden';
import { RULES, type Rules } from './rules';
import type { Crop, CropId, CropSize, Garden, Placement, TilePos } from './types';

/** Tile indexes (y * width + x) covered by a placement of the given size. */
export function placementTileIndexes(garden: Garden, p: Placement, size: CropSize): number[] {
  const indexes: number[] = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      indexes.push((p.y + dy) * garden.width + (p.x + dx));
    }
  }
  return indexes;
}

/**
 * Plain-language problems with a list of placements: unknown crop ids,
 * footprints not entirely on soil, and placements overlapping each other.
 * Empty when every placement is valid. Order follows the placements array;
 * each placement reports at most one problem (checks stop at the first hit
 * for that placement, since a bad footprint makes overlap detection moot).
 */
export function validatePlacements(
  garden: Garden,
  placements: readonly Placement[],
  cropsById: ReadonlyMap<CropId, Crop>,
  rules: Rules = RULES,
): string[] {
  const problems: string[] = [];
  // Tracks which earlier, valid placement first claimed each tile so later
  // placements can be checked against it; -1 = unclaimed.
  const claimedBy = new Int16Array(garden.width * garden.height).fill(-1);

  placements.forEach((p, i) => {
    const crop = cropsById.get(p.cropId);
    if (!crop) {
      problems.push(`Unknown crop: ${p.cropId}.`);
      return;
    }
    if (!footprintOnSoil(garden, p.x, p.y, crop.size, rules)) {
      problems.push(`${crop.name} at (${p.x}, ${p.y}) is not fully on soil.`);
      return;
    }
    const tiles = placementTileIndexes(garden, p, crop.size);
    const reportedAgainst = new Set<number>();
    for (const idx of tiles) {
      const other = claimedBy[idx];
      if (other !== -1 && other !== i && !reportedAgainst.has(other)) {
        reportedAgainst.add(other);
        const otherPlacement = placements[other];
        const otherCrop = cropsById.get(otherPlacement.cropId);
        // otherCrop is defined: `other` only claims tiles once it passed both checks.
        problems.push(
          `${crop.name} at (${p.x}, ${p.y}) overlaps ${otherCrop!.name} at (${otherPlacement.x}, ${otherPlacement.y}).`,
        );
      }
    }
    for (const idx of tiles) {
      if (claimedBy[idx] === -1) claimedBy[idx] = i;
    }
  });

  return problems;
}

/**
 * occ[tileIndex] = index of the placement covering that tile, or -1 for
 * empty or non-soil tiles. Throws with the first problem when invalid.
 */
export function buildOccupancy(
  garden: Garden,
  placements: readonly Placement[],
  cropsById: ReadonlyMap<CropId, Crop>,
  rules: Rules = RULES,
): Int16Array {
  const problems = validatePlacements(garden, placements, cropsById, rules);
  if (problems.length > 0) {
    throw new Error(problems[0]);
  }
  const occ = new Int16Array(garden.width * garden.height).fill(-1);
  placements.forEach((p, i) => {
    const crop = cropsById.get(p.cropId)!; // valid: checked by validatePlacements above
    for (const idx of placementTileIndexes(garden, p, crop.size)) {
      occ[idx] = i;
    }
  });
  return occ;
}

/** Indexes of placements that cover at least one of the given locked tiles. */
export function lockedPlacementIndexes(
  garden: Garden,
  placements: readonly Placement[],
  cropsById: ReadonlyMap<CropId, Crop>,
  lockedTiles: readonly TilePos[],
): Set<number> {
  const locked = new Set<number>();
  if (lockedTiles.length === 0) return locked;
  const lockedIndexes = new Set<number>(lockedTiles.map((t) => t.y * garden.width + t.x));
  placements.forEach((p, i) => {
    const crop = cropsById.get(p.cropId);
    if (!crop) return;
    for (const idx of placementTileIndexes(garden, p, crop.size)) {
      if (lockedIndexes.has(idx)) {
        locked.add(i);
        break;
      }
    }
  });
  return locked;
}

/** Placement index at a tile, or -1 when there is none or it is out of bounds. */
export function placementAt(garden: Garden, occ: Int16Array, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= garden.width || y >= garden.height) return -1;
  return occ[y * garden.width + x];
}
