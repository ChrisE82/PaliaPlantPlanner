/**
 * Which goals "ask" a given crop for a buff or count it, for the grid's
 * hollow-dot rule and the plant details panel (project task spec, Task A
 * step 5: GardenGrid and "Plant details").
 */
import { ALL_GOAL_CROPS, type BuffId, type CropId, type Goal } from '../../engine/types';

/**
 * Buffs some goal asks this crop for: a buff goal naming this crop
 * directly, or naming "All goal crops" when this crop is itself a goal
 * crop.
 */
export function requestedBuffsForCrop(
  goals: readonly Goal[],
  goalCrops: ReadonlySet<CropId>,
  cropId: CropId,
): Set<BuffId> {
  const result = new Set<BuffId>();
  for (const goal of goals) {
    if (goal.measure === 'quantity') continue;
    if (goal.crop === cropId || (goal.crop === ALL_GOAL_CROPS && goalCrops.has(cropId))) {
      result.add(goal.measure);
    }
  }
  return result;
}

/** Goals this crop counts toward: named directly, or "All goal crops" when this crop is a goal crop. */
export function goalsInvolvingCrop(goals: readonly Goal[], goalCrops: ReadonlySet<CropId>, cropId: CropId): Goal[] {
  return goals.filter((goal) => goal.crop === cropId || (goal.crop === ALL_GOAL_CROPS && goalCrops.has(cropId)));
}
