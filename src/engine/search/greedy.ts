/**
 * Randomized greedy starting layout (PLAN.md 5.2): locked/fixed placements
 * are assumed already loaded into `state`; this fills the rest. Goals run in
 * importance order: large-crop quantity goals place up to n crops (as many
 * as fit for 'max') at shuffled valid anchors, 1x1 quantity-count goals
 * place n plants, then every remaining empty tile gets an allowed 1x1 crop,
 * preferring crops that give a buff named in a goal and that differ from
 * their neighbors.
 */
import { bestDensePacking } from './packing';
import type { CompiledProblem } from './problem';
import type { LayoutState } from './state';
import type { Rng } from './rng';

/** Default budget for the exact packing sub-search (packing.ts), when the caller doesn't pass a deadline. */
const DEFAULT_PACKING_BUDGET_MS = 2500;

/**
 * Per-problem cache of bestDensePacking results, keyed by "size:threshold",
 * so the exact (potentially ~1s) search runs at most once per
 * optimizeArrangement call and every restart's greedyFill reuses it.
 */
const packingCache = new WeakMap<CompiledProblem, Map<string, number[]>>();

function cachedDensePacking(problem: CompiledProblem, size: number, threshold: number | null, deadline: number): number[] {
  let cache = packingCache.get(problem);
  if (!cache) {
    cache = new Map();
    packingCache.set(problem, cache);
  }
  const key = `${size}:${threshold ?? 'none'}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const result = bestDensePacking(problem, size, threshold, deadline);
  cache.set(key, result);
  return result;
}

const ORTHOGONAL: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Anchor orderings placeUpToLarge can use instead of a pure random shuffle.
 * Packing many identical large crops densely (a goal-crop 'max'/large count)
 * is much easier from a scanline order than from a random one, and callers
 * (planner.ts) cycle the strategy across restarts for diversity. 'spacedRowMajor'
 * additionally favors anchors on a size+1 grid, leaving a 1-tile gap on all
 * sides for a buff-giving helper -- useful when the same crop also has a buff
 * goal, since a tight packing otherwise leaves no room for a giver between
 * same-type neighbors (which never buff each other).
 */
export type GreedyStrategy = 'random' | 'rowMajor' | 'rowMajorReverse' | 'columnMajor' | 'columnMajorReverse' | 'spacedRowMajor';

const LARGE_CROP_STRATEGIES: readonly GreedyStrategy[] = [
  'random',
  'rowMajor',
  'columnMajor',
  'rowMajorReverse',
  'columnMajorReverse',
  'spacedRowMajor',
  'spacedRowMajor',
];

/** Picks a deterministic strategy from restartIndex, cycling so restarts see every strategy. */
export function strategyForRestart(restartIndex: number): GreedyStrategy {
  return LARGE_CROP_STRATEGIES[restartIndex % LARGE_CROP_STRATEGIES.length];
}

export function greedyFill(
  problem: CompiledProblem,
  state: LayoutState,
  rng: Rng,
  strategy: GreedyStrategy = 'random',
  deadline: number = performance.now() + DEFAULT_PACKING_BUDGET_MS,
): void {
  const order = Array.from({ length: problem.goalCount }, (_, i) => i).sort(
    (a, b) => problem.goalImportance[a] - problem.goalImportance[b],
  );

  for (const g of order) {
    if (problem.goalIsBuff[g]) continue; // satisfied indirectly, via the final fill's buff preference
    const cropIndex = problem.goalCropIndex[g];
    if (cropIndex < 0) continue; // quantity goals always name a specific crop
    const size = problem.cropSize[cropIndex];
    const kind = problem.goalAmountKind[g]; // 0 = count, 1 = max
    if (size === 1) {
      if (kind === 0) placeUpTo1x1(problem, state, rng, cropIndex, problem.goalAmountN[g]);
      // 1x1 'max' goals are left for the final fill pass below.
    } else {
      const n = kind === 1 ? Number.POSITIVE_INFINITY : problem.goalAmountN[g];
      placeUpToLarge(problem, state, rng, cropIndex, size, n, strategy, deadline);
    }
  }

  finalFill(problem, state, rng);
}

function placeUpTo1x1(problem: CompiledProblem, state: LayoutState, rng: Rng, cropIndex: number, n: number): void {
  const emptyTiles = collectEmptyMovable(problem, state, 0);
  rng.shuffle(emptyTiles);
  const count = Math.min(n, emptyTiles.length);
  for (let i = 0; i < count; i++) state.place(cropIndex, emptyTiles[i]);
}

function placeUpToLarge(
  problem: CompiledProblem,
  state: LayoutState,
  rng: Rng,
  cropIndex: number,
  size: number,
  n: number,
  strategy: GreedyStrategy,
  deadline: number,
): void {
  // When this crop also has a buff goal on itself (directly, or via '*'),
  // packing it edge-to-edge everywhere leaves no room for a buff-giving
  // helper between same-type neighbors (which never buff each other, PLAN.md
  // rule 4). Guard placements so no placement -- new or already there --
  // is left without enough free (non-same-crop) ring tiles for that buff.
  const guardBuff = findSelfBuffGoal(problem, cropIndex);
  const threshold = problem.receiveThreshold[size - 1];

  let placed = 0;

  // Try the exact packing (packing.ts) first: it's the true maximum count
  // that can all keep the buff threshold, cached so it only runs once per
  // optimizeArrangement call. A subset of a valid packing stays valid (
  // removing a placement can only free up its neighbors' ring tiles), so
  // taking up to n of its anchors is always safe.
  if (guardBuff !== null) {
    const exact = cachedDensePacking(problem, size, threshold, deadline);
    const orderedExact = rng.shuffle(exact.slice());
    placed += packAnchors(problem, state, cropIndex, size, n - placed, orderedExact, threshold);
  } else {
    // No buff constraint on this crop: the unconstrained exact packing is
    // the true densest packing and is typically sub-millisecond, so try it
    // before falling back to the scanline/random heuristics.
    const exact = cachedDensePacking(problem, size, null, deadline);
    const orderedExact = rng.shuffle(exact.slice());
    placed += packAnchors(problem, state, cropIndex, size, n - placed, orderedExact, null);
  }

  const primary = orderAnchorsForPacking(problem, size, rng, strategy);
  placed += packAnchors(problem, state, cropIndex, size, n - placed, primary, guardBuff !== null ? threshold : null);

  if (placed < n) {
    const guardedRandom = orderAnchorsForPacking(problem, size, rng, 'random');
    placed += packAnchors(problem, state, cropIndex, size, n - placed, guardedRandom, guardBuff !== null ? threshold : null);
  }

  // An unguarded top-up so a 'max'/'count' goal still densely fills the
  // garden when there is no buff to protect. Skipped when guardBuff is set:
  // the exact packing above already found the true maximum count that can
  // all keep the buff, and an extra unguarded placement could only push that
  // fraction below 100% (for 'all') -- strictly worse for that goal, with no
  // corresponding gain since the density goal already got the true optimum too.
  if (placed < n && guardBuff === null) {
    const rest = orderAnchorsForPacking(problem, size, rng, 'random');
    packAnchors(problem, state, cropIndex, size, n - placed, rest, null);
  }
}

/** Places up to n crops from the given anchor order; returns how many it placed. */
function packAnchors(
  problem: CompiledProblem,
  state: LayoutState,
  cropIndex: number,
  size: number,
  n: number,
  anchors: readonly number[],
  guardThreshold: number | null,
): number {
  let placed = 0;
  for (const anchor of anchors) {
    if (placed >= n) break;
    if (!state.isFootprintFree(size, anchor)) continue;
    if (guardThreshold === null) {
      state.place(cropIndex, anchor);
      placed++;
      continue;
    }
    const slot = state.place(cropIndex, anchor);
    if (keepsBuffRoom(problem, state, cropIndex, size, anchor, guardThreshold)) {
      placed++;
    } else {
      state.remove(slot);
    }
  }
  return placed;
}

/** A goal's buff index when it targets cropIndex (directly or via '*') and some allowed 1x1 crop gives it; else null. */
function findSelfBuffGoal(problem: CompiledProblem, cropIndex: number): number | null {
  if (!problem.isGoalCrop[cropIndex]) return null;
  for (let g = 0; g < problem.goalCount; g++) {
    if (!problem.goalIsBuff[g]) continue;
    const gc = problem.goalCropIndex[g];
    if (gc !== cropIndex && gc !== -1) continue;
    const buffIdx = problem.goalBuffIndex[g];
    const fillers = problem.allowedBySize[0];
    for (let i = 0; i < fillers.length; i++) {
      if (problem.cropBuffIndex[fillers[i]] === buffIdx) return buffIdx;
    }
  }
  return null;
}

/** Ring tiles of anchorTile (size x size) not covered by another placement of the same crop. */
function freeRingCount(problem: CompiledProblem, state: LayoutState, cropIndex: number, size: number, anchorTile: number): number {
  const sIdx = size - 1;
  const slotIdx = problem.anchorSlotBySize[sIdx][anchorTile];
  const ring = problem.ringBySize[sIdx][slotIdx];
  let blocked = 0;
  for (let i = 0; i < ring.length; i++) {
    const s = state.tileSlot[ring[i]];
    if (s !== -1 && state.slotCrop[s] === cropIndex) blocked++;
  }
  return ring.length - blocked;
}

/**
 * True when, with the crop just placed at anchorTile, it and every
 * already-placed same-crop neighbor it now borders still have at least
 * `threshold` ring tiles free of same-crop cover.
 */
function keepsBuffRoom(
  problem: CompiledProblem,
  state: LayoutState,
  cropIndex: number,
  size: number,
  anchorTile: number,
  threshold: number,
): boolean {
  if (freeRingCount(problem, state, cropIndex, size, anchorTile) < threshold) return false;

  const sIdx = size - 1;
  const slotIdx = problem.anchorSlotBySize[sIdx][anchorTile];
  const footprint = problem.footprintBySize[sIdx][slotIdx];
  const footprintSet = new Set(footprint);
  const width = problem.garden.width;
  const height = problem.garden.height;
  const affected = new Set<number>();
  for (let i = 0; i < footprint.length; i++) {
    const t = footprint[i];
    const x = t % width;
    const y = Math.floor(t / width);
    for (const [dx, dy] of ORTHOGONAL) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nt = ny * width + nx;
      if (footprintSet.has(nt)) continue;
      const s = state.tileSlot[nt];
      if (s !== -1 && state.slotCrop[s] === cropIndex) affected.add(s);
    }
  }
  for (const otherSlot of affected) {
    const otherAnchor = state.slotAnchor[otherSlot];
    if (freeRingCount(problem, state, cropIndex, size, otherAnchor) < threshold) return false;
  }
  return true;
}

function orderAnchorsForPacking(problem: CompiledProblem, size: number, rng: Rng, strategy: GreedyStrategy): number[] {
  const width = problem.garden.width;
  const anchors = Array.from(problem.movableAnchorsBySize[size - 1]);
  const x = (t: number) => t % width;
  const y = (t: number) => Math.floor(t / width);

  switch (strategy) {
    case 'rowMajor':
      anchors.sort((a, b) => a - b);
      return anchors;
    case 'rowMajorReverse':
      anchors.sort((a, b) => (y(a) - y(b)) || (x(b) - x(a)));
      return anchors;
    case 'columnMajor':
      anchors.sort((a, b) => (x(a) - x(b)) || (y(a) - y(b)));
      return anchors;
    case 'columnMajorReverse':
      anchors.sort((a, b) => (x(a) - x(b)) || (y(b) - y(a)));
      return anchors;
    case 'spacedRowMajor': {
      const period = size + 1;
      const spaced = anchors.filter((t) => x(t) % period === 0 && y(t) % period === 0);
      spaced.sort((a, b) => a - b);
      return spaced;
    }
    case 'random':
    default:
      rng.shuffle(anchors);
      return anchors;
  }
}

function collectEmptyMovable(problem: CompiledProblem, state: LayoutState, sizeIdx: number): number[] {
  const movable = problem.movableAnchorsBySize[sizeIdx];
  const result: number[] = [];
  for (let i = 0; i < movable.length; i++) {
    if (state.tileSlot[movable[i]] === -1) result.push(movable[i]);
  }
  return result;
}

/** Fills every remaining empty, unlocked tile with an allowed 1x1 crop, or leaves it empty when none is allowed. */
function finalFill(problem: CompiledProblem, state: LayoutState, rng: Rng): void {
  const allowed = problem.allowedBySize[0];
  if (allowed.length === 0) return;

  const emptyTiles = collectEmptyMovable(problem, state, 0);
  rng.shuffle(emptyTiles);

  // Per-crop preference: goal-named buff givers and 1x1 quantity-max goal
  // crops score higher, weighted so Must beats High beats Medium beats Low.
  const priority = new Float64Array(problem.cropCount);
  for (let g = 0; g < problem.goalCount; g++) {
    const weight = 4 - problem.goalImportance[g];
    if (problem.goalIsBuff[g]) {
      const buffIdx = problem.goalBuffIndex[g];
      for (let c = 0; c < problem.cropCount; c++) {
        if (problem.cropBuffIndex[c] === buffIdx) priority[c] += weight;
      }
    } else if (problem.goalAmountKind[g] === 1) {
      const cropIdx = problem.goalCropIndex[g];
      if (cropIdx >= 0 && problem.cropSize[cropIdx] === 1) priority[cropIdx] += weight * 2;
    }
  }

  for (const tile of emptyTiles) {
    if (state.tileSlot[tile] !== -1) continue;
    state.place(pickFillCrop(problem, state, rng, allowed, priority, tile), tile);
  }
}

function pickFillCrop(
  problem: CompiledProblem,
  state: LayoutState,
  rng: Rng,
  allowed: Int32Array,
  priority: Float64Array,
  tile: number,
): number {
  const width = problem.garden.width;
  const height = problem.garden.height;
  const x = tile % width;
  const y = Math.floor(tile / width);
  const neighborCrops = new Set<number>();
  for (const [dx, dy] of ORTHOGONAL) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const slot = state.tileSlot[ny * width + nx];
    if (slot !== -1) neighborCrops.add(state.slotCrop[slot]);
  }

  let bestCrop = allowed[0];
  let bestScore = -Infinity;
  for (let i = 0; i < allowed.length; i++) {
    const crop = allowed[i];
    let score = priority[crop] + rng.float() * 0.01;
    if (neighborCrops.has(crop)) score -= 1000;
    if (score > bestScore) {
      bestScore = score;
      bestCrop = crop;
    }
  }
  return bestCrop;
}
