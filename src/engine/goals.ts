/**
 * Goal validity, labels and allowed-crop lists (PLAN.md section 4.1).
 */
import type { BuffId, Crop, CropId, Goal, PlanSettings } from './types';
import { ALL_GOAL_CROPS, BUFF_IDS, BUFF_NAMES } from './types';

/** Specific crop ids named in any goal. Never includes ALL_GOAL_CROPS itself. */
export function goalCropIds(goals: readonly Goal[]): Set<CropId> {
  const ids = new Set<CropId>();
  for (const goal of goals) {
    if (goal.crop !== ALL_GOAL_CROPS) ids.add(goal.crop);
  }
  return ids;
}

/**
 * Crops the planner may use: goal crops plus helpers, restricted to ids that
 * exist in cropsById, without duplicates, in cropsById iteration order.
 */
export function allowedCropIds(
  settings: Pick<PlanSettings, 'goals' | 'helpers'>,
  cropsById: ReadonlyMap<CropId, Crop>,
): CropId[] {
  const wanted = new Set<CropId>([...goalCropIds(settings.goals), ...settings.helpers]);
  const result: CropId[] = [];
  for (const id of cropsById.keys()) {
    if (wanted.has(id)) result.push(id);
  }
  return result;
}

function cropLabel(crop: CropId | typeof ALL_GOAL_CROPS, cropsById: ReadonlyMap<CropId, Crop>): string {
  if (crop === ALL_GOAL_CROPS) return 'All goal crops';
  return cropsById.get(crop)?.name ?? crop;
}

function measureLabel(measure: Goal['measure']): string {
  return measure === 'quantity' ? 'Quantity' : BUFF_NAMES[measure];
}

/**
 * Plain-language problems with one goal, empty when the goal is valid.
 * Valid shapes: quantity with 'count' or 'max' and a specific known crop;
 * a buff measure with 'all' or 'count' and a specific known crop or
 * ALL_GOAL_CROPS; a 'count' amount must be an integer of at least 1.
 */
export function goalProblems(goal: Goal, cropsById: ReadonlyMap<CropId, Crop>): string[] {
  const problems: string[] = [];
  const isAllGoalCrops = goal.crop === ALL_GOAL_CROPS;
  const knownCrop = isAllGoalCrops || cropsById.has(goal.crop);

  if (goal.measure === 'quantity') {
    if (isAllGoalCrops) {
      problems.push('Quantity goals need one specific crop, not all goal crops.');
    } else if (!knownCrop) {
      problems.push(`Unknown crop "${goal.crop}".`);
    }
    if (goal.amount.kind === 'all') {
      problems.push('Quantity goals use at least N plants or Maximize, not All.');
    }
  } else {
    if (!knownCrop) {
      problems.push(`Unknown crop "${goal.crop}".`);
    }
    if (goal.amount.kind === 'max') {
      problems.push('Buff goals use All or at least N plants, not Maximize.');
    }
  }

  if (goal.amount.kind === 'count' && !(Number.isInteger(goal.amount.n) && goal.amount.n >= 1)) {
    problems.push('The plant count must be a whole number of at least 1.');
  }

  return problems;
}

/**
 * Short label such as "Apple · Quantity · At least 4" or
 * "All goal crops · Water Retain · At least 10 plants". Unknown crop ids
 * show the id.
 */
export function goalLabel(goal: Goal, cropsById: ReadonlyMap<CropId, Crop>): string {
  const amount =
    goal.amount.kind === 'max'
      ? 'Maximize'
      : goal.amount.kind === 'all'
        ? 'All plants'
        : goal.measure === 'quantity'
          ? `At least ${goal.amount.n}`
          : `At least ${goal.amount.n} plants`;
  return `${cropLabel(goal.crop, cropsById)} · ${measureLabel(goal.measure)} · ${amount}`;
}

/** Buffs at least one of the given crops gives, in BUFF_IDS order. */
export function buffsGivenByCrops(crops: readonly Crop[]): BuffId[] {
  const given = new Set<BuffId>();
  for (const crop of crops) {
    if (crop.buff) given.add(crop.buff);
  }
  return BUFF_IDS.filter((buff) => given.has(buff));
}
