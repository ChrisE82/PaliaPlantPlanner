/**
 * Compiles a planning problem (garden, goals, helpers, crop data, rules,
 * optional locks) into flat numeric arrays the rest of the search operates
 * on. Doing this once per arrangement keeps the hot loop (evaluate.ts,
 * moves.ts) free of string comparisons, map lookups and object allocation.
 */
import { footprintOnSoil } from '../garden';
import { allowedCropIds, goalCropIds } from '../goals';
import { RULES, type Rules } from '../rules';
import {
  ALL_GOAL_CROPS,
  BUFF_INDEX,
  IMPORTANCE_ORDER,
  type Crop,
  type CropId,
  type Garden,
  type Goal,
  type Placement,
  type TilePos,
} from '../types';

/** Per size (index 0..2 = size 1..3), one entry per element. */
export type BySize<T> = readonly [T, T, T];

export interface CompiledProblem {
  readonly garden: Garden;
  readonly rules: Rules;
  readonly tileCount: number;
  /** All soil tile indices (y * garden.width + x), for iterating the whole garden. */
  readonly soilTiles: Int32Array;

  // Crop table. Every crop in cropsById gets a slot, not just allowed ones,
  // so fixed/locked placements can always be represented and scored even
  // when they use a crop that is no longer a goal crop or helper.
  readonly cropCount: number;
  readonly cropIds: readonly CropId[];
  readonly cropIndexOf: ReadonlyMap<CropId, number>;
  /** crop index -> footprint size (1, 2 or 3). */
  readonly cropSize: Uint8Array;
  /** crop index -> BUFF_INDEX of the buff it gives, or -1. */
  readonly cropBuffIndex: Int8Array;
  /** crop index -> 1 when a move/greedy fill may plant it (goal crop or helper). */
  readonly isAllowed: Uint8Array;
  /** crop index -> 1 when named specifically (not '*') by at least one goal. */
  readonly isGoalCrop: Uint8Array;
  /** Allowed crop indices grouped by size, e.g. allowedBySize[1] = allowed 2x2 crops. */
  readonly allowedBySize: BySize<Int32Array>;
  /** Every goal-crop index (isGoalCrop = 1), for scoring '*' buff goals. */
  readonly goalCropIndices: Int32Array;

  /** Touching tiles needed to receive a buff, indexed by size - 1: [1, 2, 3] normally. */
  readonly receiveThreshold: Uint8Array;

  // Anchors: a "size s anchor" is a tile index usable as the top-left of an
  // s x s footprint that lies entirely on soil (crossing plot borders when
  // rules allow it).
  /** Valid anchor tile indices per size, most natural (row-major) order. */
  readonly anchorsBySize: BySize<Int32Array>;
  /** tile index -> slot into anchorsBySize[size - 1], or -1 when not a valid anchor. */
  readonly anchorSlotBySize: BySize<Int32Array>;
  /** [size - 1][anchor slot] -> tile indices covered by that footprint. */
  readonly footprintBySize: BySize<readonly Int32Array[]>;
  /** [size - 1][anchor slot] -> soil tile indices orthogonally touching the footprint from outside. */
  readonly ringBySize: BySize<readonly Int32Array[]>;
  /** Anchors per size whose footprint touches no locked tile; safe for moves/greedy to use. */
  readonly movableAnchorsBySize: BySize<Int32Array>;

  /** tile index -> 1 when locked: either named directly, or covered by a placement that is. */
  readonly lockedTileMask: Uint8Array;
  readonly fixedPlacements: readonly Placement[];
  readonly lockedTiles: readonly TilePos[];

  // Goals, as flat arrays indexed by goal index.
  readonly goalCount: number;
  readonly goals: readonly Goal[];
  /** IMPORTANCE_ORDER index: 0 = must, 1 = high, 2 = medium, 3 = low. */
  readonly goalImportance: Uint8Array;
  /** 0 = quantity, 1 = buff. */
  readonly goalIsBuff: Uint8Array;
  /** -1 for quantity goals, else BUFF_INDEX of the goal's buff. */
  readonly goalBuffIndex: Int8Array;
  /** 0 = count, 1 = max (quantity only), 2 = all (buff only). */
  readonly goalAmountKind: Uint8Array;
  /** n for 'count' goals; unused otherwise. */
  readonly goalAmountN: Float64Array;
  /** -1 for ALL_GOAL_CROPS (buff goals only), else a crop index. */
  readonly goalCropIndex: Int32Array;
}

export interface CompileProblemInput {
  garden: Garden;
  goals: readonly Goal[];
  helpers: readonly CropId[];
  cropsById: ReadonlyMap<CropId, Crop>;
  rules?: Rules;
  /** Locked tiles and the placements to seed them with; omit for a fresh plan. */
  fixed?: { placements: readonly Placement[]; lockedTiles: readonly TilePos[] };
}

export function compileProblem(input: CompileProblemInput): CompiledProblem {
  const rules = input.rules ?? RULES;
  const garden = input.garden;
  const cropsById = input.cropsById;
  const width = garden.width;
  const height = garden.height;

  const cropIds = Array.from(cropsById.keys());
  const cropCount = cropIds.length;
  const cropIndexOf = new Map<CropId, number>(cropIds.map((id, i) => [id, i]));
  const cropSize = new Uint8Array(cropCount);
  const cropBuffIndex = new Int8Array(cropCount).fill(-1);
  for (let i = 0; i < cropCount; i++) {
    const crop = cropsById.get(cropIds[i])!;
    cropSize[i] = crop.size;
    cropBuffIndex[i] = crop.buff ? BUFF_INDEX[crop.buff] : -1;
  }

  // goalCropIds/allowedCropIds are engine-score's definitions of "named in a
  // goal" and "plantable by the search" (PLAN.md 4.1); reused here so this
  // compiled problem always agrees with how goals.ts and score.ts see them.
  const goalCropIdSet = goalCropIds(input.goals);
  // allowedCropIds only reads these arrays; the cast just matches its
  // (non-readonly) PlanSettings-shaped parameter type.
  const allowedIdSet = new Set(
    allowedCropIds({ goals: input.goals as Goal[], helpers: input.helpers as CropId[] }, cropsById),
  );

  const isAllowed = new Uint8Array(cropCount);
  const isGoalCrop = new Uint8Array(cropCount);
  for (let i = 0; i < cropCount; i++) {
    const id = cropIds[i];
    if (goalCropIdSet.has(id)) isGoalCrop[i] = 1;
    if (allowedIdSet.has(id)) isAllowed[i] = 1;
  }

  const allowedLists: [number[], number[], number[]] = [[], [], []];
  for (let i = 0; i < cropCount; i++) if (isAllowed[i]) allowedLists[cropSize[i] - 1].push(i);
  const allowedBySize = tuple3(allowedLists.map((a) => Int32Array.from(a)));

  const goalCropIndices = Int32Array.from(
    range(cropCount).filter((i) => isGoalCrop[i] === 1),
  );

  const receiveThreshold = Uint8Array.from([
    rules.receiveThreshold[1],
    rules.receiveThreshold[2],
    rules.receiveThreshold[3],
  ]);

  // Anchors, footprints and rings for each size.
  const anchorLists: [number[], number[], number[]] = [[], [], []];
  const anchorSlotBySize = tuple3([
    new Int32Array(width * height).fill(-1),
    new Int32Array(width * height).fill(-1),
    new Int32Array(width * height).fill(-1),
  ]);
  const footprintLists: [Int32Array[], Int32Array[], Int32Array[]] = [[], [], []];
  const ringLists: [Int32Array[], Int32Array[], Int32Array[]] = [[], [], []];

  for (let size = 1; size <= 3; size++) {
    const sIdx = size - 1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!footprintOnSoil(garden, x, y, size, rules)) continue;
        const tile = y * width + x;
        const slot = anchorLists[sIdx].length;
        anchorLists[sIdx].push(tile);
        anchorSlotBySize[sIdx][tile] = slot;

        const footprint: number[] = [];
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) footprint.push((y + dy) * width + (x + dx));
        }
        footprintLists[sIdx].push(Int32Array.from(footprint));

        const ring = new Set<number>();
        for (let d = 0; d < size; d++) {
          addRingTile(ring, garden, x + d, y - 1);
          addRingTile(ring, garden, x + d, y + size);
          addRingTile(ring, garden, x - 1, y + d);
          addRingTile(ring, garden, x + size, y + d);
        }
        ringLists[sIdx].push(Int32Array.from(ring));
      }
    }
  }
  const anchorsBySize = tuple3(anchorLists.map((a) => Int32Array.from(a)));
  const footprintBySize = tuple3(footprintLists);
  const ringBySize = tuple3(ringLists);

  // Locks: tiles named directly, plus the full footprint of any fixed
  // placement that touches one of those tiles ("placements that cover a
  // locked tile stay fixed").
  const lockedTileMask = new Uint8Array(width * height);
  const fixedPlacements = input.fixed?.placements ?? [];
  const lockedTiles = input.fixed?.lockedTiles ?? [];
  for (const t of lockedTiles) {
    if (t.x < 0 || t.y < 0 || t.x >= width || t.y >= height) continue;
    lockedTileMask[t.y * width + t.x] = 1;
  }
  for (const p of fixedPlacements) {
    const crop = cropsById.get(p.cropId);
    if (!crop) continue;
    const tiles: number[] = [];
    let touchesLock = false;
    for (let dy = 0; dy < crop.size; dy++) {
      for (let dx = 0; dx < crop.size; dx++) {
        const tx = p.x + dx;
        const ty = p.y + dy;
        if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
        const ti = ty * width + tx;
        tiles.push(ti);
        if (lockedTileMask[ti]) touchesLock = true;
      }
    }
    if (touchesLock) for (const ti of tiles) lockedTileMask[ti] = 1;
  }

  const movableAnchorsBySize = tuple3(
    [0, 1, 2].map((sIdx) => {
      const result: number[] = [];
      const anchors = anchorsBySize[sIdx];
      const footprints = footprintBySize[sIdx];
      for (let slot = 0; slot < anchors.length; slot++) {
        const footprint = footprints[slot];
        let ok = true;
        for (let i = 0; i < footprint.length; i++) {
          if (lockedTileMask[footprint[i]]) {
            ok = false;
            break;
          }
        }
        if (ok) result.push(anchors[slot]);
      }
      return Int32Array.from(result);
    }),
  );

  // Goals.
  const goalCount = input.goals.length;
  const goalImportance = new Uint8Array(goalCount);
  const goalIsBuff = new Uint8Array(goalCount);
  const goalBuffIndex = new Int8Array(goalCount).fill(-1);
  const goalAmountKind = new Uint8Array(goalCount);
  const goalAmountN = new Float64Array(goalCount);
  const goalCropIndex = new Int32Array(goalCount).fill(-1);

  input.goals.forEach((g, i) => {
    const importanceIdx = IMPORTANCE_ORDER.indexOf(g.importance);
    goalImportance[i] = importanceIdx < 0 ? IMPORTANCE_ORDER.length - 1 : importanceIdx;
    goalIsBuff[i] = g.measure === 'quantity' ? 0 : 1;
    if (g.measure !== 'quantity') goalBuffIndex[i] = BUFF_INDEX[g.measure];
    if (g.amount.kind === 'count') {
      goalAmountKind[i] = 0;
      goalAmountN[i] = g.amount.n;
    } else if (g.amount.kind === 'max') {
      goalAmountKind[i] = 1;
    } else {
      goalAmountKind[i] = 2;
    }
    if (g.crop !== ALL_GOAL_CROPS) goalCropIndex[i] = cropIndexOf.get(g.crop) ?? -1;
  });

  const soilTiles = Int32Array.from(range(width * height).filter((t) => garden.soil[t] === 1));

  return {
    garden,
    rules,
    tileCount: garden.tileCount,
    soilTiles,
    cropCount,
    cropIds,
    cropIndexOf,
    cropSize,
    cropBuffIndex,
    isAllowed,
    isGoalCrop,
    allowedBySize,
    goalCropIndices,
    receiveThreshold,
    anchorsBySize,
    anchorSlotBySize,
    footprintBySize,
    ringBySize,
    movableAnchorsBySize,
    lockedTileMask,
    fixedPlacements,
    lockedTiles,
    goalCount,
    goals: input.goals,
    goalImportance,
    goalIsBuff,
    goalBuffIndex,
    goalAmountKind,
    goalAmountN,
    goalCropIndex,
  };
}

function addRingTile(ring: Set<number>, garden: Garden, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= garden.width || y >= garden.height) return;
  const t = y * garden.width + x;
  if (garden.soil[t]) ring.add(t);
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function tuple3<T>(arr: T[]): BySize<T> {
  if (arr.length !== 3) throw new Error('tuple3: expected exactly 3 elements');
  return [arr[0], arr[1], arr[2]];
}
