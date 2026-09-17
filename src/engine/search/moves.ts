/**
 * Random moves used by LAHC (lahc.ts). Every move either leaves the layout
 * unchanged (returns changed: false) or leaves it valid: locked placements
 * and locked empty tiles are never touched, and only allowed crops are
 * planted. Each successful move returns an `undo` that restores the exact
 * previous layout, so lahc.ts can try a move, score it, and cheaply revert
 * a rejected candidate instead of cloning the whole state every iteration.
 */
import type { Rng } from './rng';
import type { CompiledProblem } from './problem';
import type { LayoutState } from './state';

export interface MoveWeights {
  change1x1: number;
  clear1x1: number;
  swapSameSize: number;
  changeLarge: number;
  placeLarge: number;
  removeLarge: number;
  slideLarge: number;
}

export const DEFAULT_MOVE_WEIGHTS: Readonly<MoveWeights> = {
  change1x1: 35,
  clear1x1: 3,
  swapSameSize: 12,
  changeLarge: 10,
  placeLarge: 20,
  removeLarge: 5,
  slideLarge: 15,
};

/**
 * Zeroes out moves that can never succeed for this problem (e.g. no large
 * crop is allowed at all), so the weighted pick never wastes attempts on a
 * structurally impossible move. Call once per problem and reuse.
 */
export function resolveMoveWeights(problem: CompiledProblem, base: Readonly<MoveWeights> = DEFAULT_MOVE_WEIGHTS): MoveWeights {
  const hasAllowed1x1 = problem.allowedBySize[0].length > 0;
  const hasAllowedLarge = problem.allowedBySize[1].length > 0 || problem.allowedBySize[2].length > 0;
  const hasMovableLargeAnchor = problem.movableAnchorsBySize[1].length > 0 || problem.movableAnchorsBySize[2].length > 0;
  return {
    change1x1: hasAllowed1x1 ? base.change1x1 : 0,
    clear1x1: base.clear1x1,
    swapSameSize: base.swapSameSize,
    changeLarge: hasAllowedLarge ? base.changeLarge : 0,
    placeLarge: hasAllowedLarge && hasMovableLargeAnchor ? base.placeLarge : 0,
    removeLarge: base.removeLarge,
    slideLarge: hasMovableLargeAnchor ? base.slideLarge : 0,
  };
}

export interface MoveOutcome {
  changed: boolean;
  /** Restores the layout to exactly what it was before the move. No-op when changed is false. */
  undo: () => void;
}

const NOOP: MoveOutcome = { changed: false, undo: () => {} };

/** Picks one random move (weighted), applies it to `state` in place, and returns how to undo it. */
export function applyRandomMove(
  problem: CompiledProblem,
  state: LayoutState,
  rng: Rng,
  weights: Readonly<MoveWeights> = DEFAULT_MOVE_WEIGHTS,
): MoveOutcome {
  const kind = pickWeighted(rng, weights);
  if (kind === null) return NOOP;
  const journal: Op[] = [];
  const ok = MOVE_IMPLS[kind](problem, state, rng, journal);
  if (!ok || journal.length === 0) return NOOP;
  return { changed: true, undo: () => undoJournal(state, journal) };
}

// ---------------------------------------------------------------------------
// Journal: a minimal record of primitive state changes, enough to reverse a
// compound move exactly. Undoing 'remove' by re-placing may land the crop on
// a different internal slot index than before; that's fine, slot indices are
// not observable (toPlacements() only reports crop id + position).
// ---------------------------------------------------------------------------

type Op =
  | { kind: 'place'; slot: number }
  | { kind: 'remove'; cropIndex: number; anchorTile: number }
  | { kind: 'setCrop'; slot: number; from: number };

function undoJournal(state: LayoutState, journal: readonly Op[]): void {
  for (let i = journal.length - 1; i >= 0; i--) {
    const op = journal[i];
    if (op.kind === 'place') state.remove(op.slot);
    else if (op.kind === 'remove') state.place(op.cropIndex, op.anchorTile);
    else state.setCrop(op.slot, op.from);
  }
}

// ---------------------------------------------------------------------------

const MOVE_KINDS = [
  'change1x1',
  'clear1x1',
  'swapSameSize',
  'changeLarge',
  'placeLarge',
  'removeLarge',
  'slideLarge',
] as const;
type MoveKind = (typeof MOVE_KINDS)[number];

function pickWeighted(rng: Rng, weights: Readonly<MoveWeights>): MoveKind | null {
  let total = 0;
  for (const k of MOVE_KINDS) total += weights[k];
  if (total <= 0) return null;
  let r = rng.float() * total;
  for (const k of MOVE_KINDS) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return MOVE_KINDS[MOVE_KINDS.length - 1];
}

const MAX_ATTEMPTS = 25;

function pickFromTyped(rng: Rng, arr: Int32Array): number {
  return arr[rng.int(arr.length)];
}

function footprintTouchesLock(problem: CompiledProblem, size: number, anchorTile: number): boolean {
  const slotIdx = problem.anchorSlotBySize[size - 1][anchorTile];
  const footprint = problem.footprintBySize[size - 1][slotIdx];
  for (let i = 0; i < footprint.length; i++) {
    if (problem.lockedTileMask[footprint[i]]) return true;
  }
  return false;
}

/**
 * Places cropIndex at anchorTile, removing any unlocked placements it
 * overlaps and refilling the tiles that removal frees (outside the new
 * footprint) with random allowed 1x1 crops, or leaving them empty when none
 * are allowed. preFreedTiles seeds extra tiles to refill (used by slide,
 * whose vacated origin tiles must also be refilled). Returns false without
 * mutating state when the footprint overlaps a locked placement.
 */
function placeLargeHandlingOverlap(
  problem: CompiledProblem,
  state: LayoutState,
  rng: Rng,
  size: number,
  cropIndex: number,
  anchorTile: number,
  journal: Op[],
  preFreedTiles?: readonly number[],
): boolean {
  const overlapping = state.overlappingSlots(size, anchorTile);
  for (const slot of overlapping) {
    if (state.slotLocked[slot]) return false;
  }

  const freed = new Set<number>(preFreedTiles ?? []);
  for (const slot of overlapping) {
    const oldCrop = state.slotCrop[slot];
    const oldAnchor = state.slotAnchor[slot];
    const oldSize = problem.cropSize[oldCrop];
    const fp = problem.footprintBySize[oldSize - 1][problem.anchorSlotBySize[oldSize - 1][oldAnchor]];
    for (let i = 0; i < fp.length; i++) freed.add(fp[i]);
    journal.push({ kind: 'remove', cropIndex: oldCrop, anchorTile: oldAnchor });
    state.remove(slot);
  }

  const newSlot = state.place(cropIndex, anchorTile);
  journal.push({ kind: 'place', slot: newSlot });
  const newFootprint = problem.footprintBySize[size - 1][problem.anchorSlotBySize[size - 1][anchorTile]];
  for (let i = 0; i < newFootprint.length; i++) freed.delete(newFootprint[i]);

  const fillers = problem.allowedBySize[0];
  if (fillers.length > 0) {
    for (const tile of freed) {
      const fillerCrop = pickFromTyped(rng, fillers);
      const fillerSlot = state.place(fillerCrop, tile);
      journal.push({ kind: 'place', slot: fillerSlot });
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Individual moves. Each returns true (journal populated, state mutated) or
// false (infeasible right now; journal left untouched).
// ---------------------------------------------------------------------------

function moveChange1x1(problem: CompiledProblem, state: LayoutState, rng: Rng, journal: Op[]): boolean {
  const movable = problem.movableAnchorsBySize[0];
  const allowed = problem.allowedBySize[0];
  if (movable.length === 0 || allowed.length === 0) return false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const tile = pickFromTyped(rng, movable);
    const slot = state.tileSlot[tile];
    if (slot === -1) {
      const cropIndex = pickFromTyped(rng, allowed);
      const newSlot = state.place(cropIndex, tile);
      journal.push({ kind: 'place', slot: newSlot });
      return true;
    }
    const currentCrop = state.slotCrop[slot];
    if (problem.cropSize[currentCrop] !== 1 || state.slotLocked[slot]) continue;
    let cropIndex = pickFromTyped(rng, allowed);
    if (allowed.length > 1) {
      let guard = 0;
      while (cropIndex === currentCrop && guard++ < 10) cropIndex = pickFromTyped(rng, allowed);
    }
    journal.push({ kind: 'setCrop', slot, from: currentCrop });
    state.setCrop(slot, cropIndex);
    return true;
  }
  return false;
}

function moveClear1x1(problem: CompiledProblem, state: LayoutState, rng: Rng, journal: Op[]): boolean {
  const movable = problem.movableAnchorsBySize[0];
  if (movable.length === 0) return false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const tile = pickFromTyped(rng, movable);
    const slot = state.tileSlot[tile];
    if (slot === -1) continue;
    const cropIndex = state.slotCrop[slot];
    if (problem.cropSize[cropIndex] !== 1 || state.slotLocked[slot]) continue;
    const anchorTile = state.slotAnchor[slot];
    journal.push({ kind: 'remove', cropIndex, anchorTile });
    state.remove(slot);
    return true;
  }
  return false;
}

function moveSwapSameSize(problem: CompiledProblem, state: LayoutState, rng: Rng, journal: Op[]): boolean {
  if (state.slotCount === 0) return false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slotA = rng.int(state.slotCount);
    const cropA = state.slotCrop[slotA];
    if (cropA < 0 || state.slotLocked[slotA]) continue;
    const sizeA = problem.cropSize[cropA];
    const slotB = rng.int(state.slotCount);
    if (slotB === slotA) continue;
    const cropB = state.slotCrop[slotB];
    if (cropB < 0 || state.slotLocked[slotB] || cropB === cropA) continue;
    if (problem.cropSize[cropB] !== sizeA) continue;
    journal.push({ kind: 'setCrop', slot: slotA, from: cropA });
    journal.push({ kind: 'setCrop', slot: slotB, from: cropB });
    state.setCrop(slotA, cropB);
    state.setCrop(slotB, cropA);
    return true;
  }
  return false;
}

function moveChangeLarge(problem: CompiledProblem, state: LayoutState, rng: Rng, journal: Op[]): boolean {
  if (state.slotCount === 0) return false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slot = rng.int(state.slotCount);
    const cropIndex = state.slotCrop[slot];
    if (cropIndex < 0 || state.slotLocked[slot]) continue;
    const size = problem.cropSize[cropIndex];
    if (size === 1) continue;
    const allowed = problem.allowedBySize[size - 1];
    if (allowed.length === 0) continue;
    let next = pickFromTyped(rng, allowed);
    if (allowed.length > 1) {
      let guard = 0;
      while (next === cropIndex && guard++ < 10) next = pickFromTyped(rng, allowed);
    }
    journal.push({ kind: 'setCrop', slot, from: cropIndex });
    state.setCrop(slot, next);
    return true;
  }
  return false;
}

function movePlaceLarge(problem: CompiledProblem, state: LayoutState, rng: Rng, journal: Op[]): boolean {
  const sizeOptions = [2, 3].filter(
    (s) => problem.allowedBySize[s - 1].length > 0 && problem.movableAnchorsBySize[s - 1].length > 0,
  );
  if (sizeOptions.length === 0) return false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const size = rng.pick(sizeOptions);
    const anchorTile = pickFromTyped(rng, problem.movableAnchorsBySize[size - 1]);
    const cropIndex = pickFromTyped(rng, problem.allowedBySize[size - 1]);
    if (placeLargeHandlingOverlap(problem, state, rng, size, cropIndex, anchorTile, journal)) return true;
  }
  return false;
}

function moveRemoveLarge(problem: CompiledProblem, state: LayoutState, rng: Rng, journal: Op[]): boolean {
  if (state.slotCount === 0) return false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slot = rng.int(state.slotCount);
    const cropIndex = state.slotCrop[slot];
    if (cropIndex < 0 || state.slotLocked[slot]) continue;
    const size = problem.cropSize[cropIndex];
    if (size === 1) continue;
    const anchorTile = state.slotAnchor[slot];
    const footprint = problem.footprintBySize[size - 1][problem.anchorSlotBySize[size - 1][anchorTile]];
    journal.push({ kind: 'remove', cropIndex, anchorTile });
    state.remove(slot);
    const fillers = problem.allowedBySize[0];
    if (fillers.length > 0) {
      for (let i = 0; i < footprint.length; i++) {
        const fillerCrop = pickFromTyped(rng, fillers);
        const fillerSlot = state.place(fillerCrop, footprint[i]);
        journal.push({ kind: 'place', slot: fillerSlot });
      }
    }
    return true;
  }
  return false;
}

const ORTHOGONAL: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function moveSlideLarge(problem: CompiledProblem, state: LayoutState, rng: Rng, journal: Op[]): boolean {
  if (state.slotCount === 0) return false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slot = rng.int(state.slotCount);
    const cropIndex = state.slotCrop[slot];
    if (cropIndex < 0 || state.slotLocked[slot]) continue;
    const size = problem.cropSize[cropIndex];
    if (size === 1) continue;
    const anchorTile = state.slotAnchor[slot];
    const width = problem.garden.width;
    const x = anchorTile % width;
    const y = Math.floor(anchorTile / width);

    const candidates: number[] = [];
    for (const [dx, dy] of ORTHOGONAL) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= problem.garden.height) continue;
      const newAnchor = ny * width + nx;
      if (problem.anchorSlotBySize[size - 1][newAnchor] < 0) continue;
      if (footprintTouchesLock(problem, size, newAnchor)) continue;
      candidates.push(newAnchor);
    }
    if (candidates.length === 0) continue;
    const newAnchor = rng.pick(candidates);

    const oldFootprint = problem.footprintBySize[size - 1][problem.anchorSlotBySize[size - 1][anchorTile]];
    const preFreed = Array.from(oldFootprint);
    journal.push({ kind: 'remove', cropIndex, anchorTile });
    state.remove(slot);

    if (placeLargeHandlingOverlap(problem, state, rng, size, cropIndex, newAnchor, journal, preFreed)) {
      return true;
    }
    // The pre-filtered candidate should never overlap a locked slot, but
    // undo defensively and try another attempt if it somehow did.
    undoJournal(state, journal);
    journal.length = 0;
  }
  return false;
}

const MOVE_IMPLS: Record<MoveKind, (problem: CompiledProblem, state: LayoutState, rng: Rng, journal: Op[]) => boolean> = {
  change1x1: moveChange1x1,
  clear1x1: moveClear1x1,
  swapSameSize: moveSwapSameSize,
  changeLarge: moveChangeLarge,
  placeLarge: movePlaceLarge,
  removeLarge: moveRemoveLarge,
  slideLarge: moveSlideLarge,
};
