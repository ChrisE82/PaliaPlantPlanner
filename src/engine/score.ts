/**
 * Goal scoring and layout comparison (PLAN.md sections 4.2 and 4.3).
 *
 * scoreLayout must match the fast evaluator the search agent writes, so the
 * definitions here follow PLAN.md exactly: see goalScore for the per-goal
 * formulas and scoreLayout for how the vector is assembled.
 */
import { goalCropIds } from './goals';
import { RULES, type Rules } from './rules';
import {
  ALL_GOAL_CROPS,
  BUFF_IDS,
  BUFF_INDEX,
  IMPORTANCE_NAMES,
  IMPORTANCE_ORDER,
  type BuffId,
  type Crop,
  type CropId,
  type Garden,
  type Goal,
  type Placement,
  type PlacementBuffs,
  type ScoreVector,
} from './types';

export interface ScoreContext {
  garden: Garden;
  goals: readonly Goal[];
  cropsById: ReadonlyMap<CropId, Crop>;
  rules: Rules;
  /** The specific crop ids named in any goal (see goals.goalCropIds). */
  goalCrops: ReadonlySet<CropId>;
}

export function makeScoreContext(
  garden: Garden,
  goals: readonly Goal[],
  cropsById: ReadonlyMap<CropId, Crop>,
  rules: Rules = RULES,
): ScoreContext {
  return { garden, goals, cropsById, rules, goalCrops: goalCropIds(goals) };
}

export interface LayoutStats {
  /** plants(c) = number of placements of crop c. */
  plants: Map<CropId, number>;
  /** tiles(c) = plants(c) * size(c)^2. */
  tiles: Map<CropId, number>;
  /** buffed(c)[BUFF_INDEX[b]] = placements of c whose receivedMask has bit b. */
  buffed: Map<CropId, number[]>;
  /** Tiles covered by any placement. */
  filledTiles: number;
  /** Sum over placements of goal crops of the number of set bits in receivedMask. */
  goalCropBuffs: number;
  /** Tiles covered by placements of goal crops. */
  goalCropTiles: number;
}

function popcount(mask: number): number {
  let count = 0;
  for (let m = mask; m !== 0; m &= m - 1) count++;
  return count;
}

function requireCrop(cropsById: ReadonlyMap<CropId, Crop>, cropId: CropId): Crop {
  const crop = cropsById.get(cropId);
  if (!crop) throw new Error(`Unknown crop in placement: ${cropId}.`);
  return crop;
}

export function layoutStats(
  ctx: ScoreContext,
  placements: readonly Placement[],
  buffs: readonly PlacementBuffs[],
): LayoutStats {
  const plants = new Map<CropId, number>();
  const tiles = new Map<CropId, number>();
  const buffed = new Map<CropId, number[]>();
  let filledTiles = 0;
  let goalCropBuffs = 0;
  let goalCropTiles = 0;

  placements.forEach((p, i) => {
    const area = requireCrop(ctx.cropsById, p.cropId).size ** 2;
    plants.set(p.cropId, (plants.get(p.cropId) ?? 0) + 1);
    tiles.set(p.cropId, (tiles.get(p.cropId) ?? 0) + area);
    filledTiles += area;

    const mask = buffs[i]?.receivedMask ?? 0;
    let buffedCounts = buffed.get(p.cropId);
    if (!buffedCounts) {
      buffedCounts = new Array<number>(BUFF_IDS.length).fill(0);
      buffed.set(p.cropId, buffedCounts);
    }
    for (let b = 0; b < BUFF_IDS.length; b++) {
      if (mask & (1 << b)) buffedCounts[b] += 1;
    }

    if (ctx.goalCrops.has(p.cropId)) {
      goalCropTiles += area;
      goalCropBuffs += popcount(mask);
    }
  });

  return { plants, tiles, buffed, filledTiles, goalCropBuffs, goalCropTiles };
}

/** Total plants of a goal crop reference: one crop, or all goal crops summed. */
function plantsFor(ctx: ScoreContext, stats: LayoutStats, crop: CropId | typeof ALL_GOAL_CROPS): number {
  if (crop === ALL_GOAL_CROPS) {
    let sum = 0;
    for (const c of ctx.goalCrops) sum += stats.plants.get(c) ?? 0;
    return sum;
  }
  return stats.plants.get(crop) ?? 0;
}

/** Total plants with a buff of a goal crop reference: one crop, or all goal crops summed. */
function buffedFor(ctx: ScoreContext, stats: LayoutStats, crop: CropId | typeof ALL_GOAL_CROPS, buff: BuffId): number {
  const index = BUFF_INDEX[buff];
  if (crop === ALL_GOAL_CROPS) {
    let sum = 0;
    for (const c of ctx.goalCrops) sum += stats.buffed.get(c)?.[index] ?? 0;
    return sum;
  }
  return stats.buffed.get(crop)?.[index] ?? 0;
}

/** One goal's score, always in [0, 1]. See PLAN.md 4.2. */
export function goalScore(ctx: ScoreContext, goal: Goal, stats: LayoutStats): number {
  if (goal.measure === 'quantity') {
    if (goal.amount.kind === 'max') {
      const tiles = stats.tiles.get(goal.crop) ?? 0;
      return ctx.garden.tileCount === 0 ? 0 : tiles / ctx.garden.tileCount;
    }
    if (goal.amount.kind === 'count') {
      const n = goal.amount.n;
      const plants = stats.plants.get(goal.crop) ?? 0;
      // n should always be >= 1 for a valid goal (see goals.goalProblems); a
      // target of "at least 0" is vacuously met.
      return n > 0 ? Math.min(plants, n) / n : 1;
    }
    return 0; // 'all' is not a valid quantity amount
  }

  const buff = goal.measure;
  if (goal.amount.kind === 'all') {
    const total = plantsFor(ctx, stats, goal.crop);
    if (total === 0) return 0;
    return buffedFor(ctx, stats, goal.crop, buff) / total;
  }
  if (goal.amount.kind === 'count') {
    const n = goal.amount.n;
    return n > 0 ? Math.min(buffedFor(ctx, stats, goal.crop, buff), n) / n : 1;
  }
  return 0; // 'max' is not a valid buff amount
}

/**
 * The full comparison vector (PLAN.md 4.3): for each importance level, in
 * IMPORTANCE_ORDER, [targets, maximize], then three tie-breakers.
 */
export function scoreLayout(
  ctx: ScoreContext,
  placements: readonly Placement[],
  buffs: readonly PlacementBuffs[],
): ScoreVector {
  const stats = layoutStats(ctx, placements, buffs);
  const vector: number[] = [];

  for (const level of IMPORTANCE_ORDER) {
    let targets = 0;
    let maximize = 0;
    for (const goal of ctx.goals) {
      if (goal.importance !== level) continue;
      const score = goalScore(ctx, goal, stats);
      if (goal.measure === 'quantity' && goal.amount.kind === 'max') {
        maximize += Math.sqrt(score);
      } else {
        targets += score;
      }
    }
    vector.push(targets, maximize);
  }

  vector.push(stats.filledTiles, stats.goalCropBuffs, stats.goalCropTiles);
  return vector;
}

export const SCORE_EPSILON = 1e-9;

/**
 * Compares left to right; the first pair differing by more than
 * SCORE_EPSILON decides. Positive when a is better, negative when b is
 * better, 0 when tied.
 */
export function compareScores(a: ScoreVector, b: ScoreVector): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (Math.abs(diff) > SCORE_EPSILON) return diff;
  }
  return 0;
}

export const SCORE_LABELS: readonly string[] = [
  ...IMPORTANCE_ORDER.flatMap((level) => [`${IMPORTANCE_NAMES[level]} targets`, `${IMPORTANCE_NAMES[level]} maximize`]),
  'Filled tiles',
  'Goal crop buffs',
  'Goal crop tiles',
];
