/**
 * Checks that run instantly while the user edits goals (PLAN.md section 4.4):
 * capacity, missing buff providers, and contradictions.
 */
import { allowedCropIds, goalCropIds, goalProblems } from './goals';
import { RULES, type Rules } from './rules';
import {
  ALL_GOAL_CROPS,
  BUFF_NAMES,
  type Crop,
  type CropId,
  type Goal,
  type PlanSettings,
  type PrecheckIssue,
} from './types';

function plotWord(count: number): string {
  return count === 1 ? 'plot' : 'plots';
}

function article(name: string): string {
  return /^[aeiou]/i.test(name) ? 'an' : 'a';
}

/** "A", "A or B", "A, B or C" — always in the order given. */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** "Apple · Quantity" — crop and measure only, for the "repeats" warning. */
function cropMeasureLabel(goal: Goal, cropsById: ReadonlyMap<CropId, Crop>): string {
  const crop = goal.crop === ALL_GOAL_CROPS ? 'All goal crops' : (cropsById.get(goal.crop)?.name ?? goal.crop);
  const measure = goal.measure === 'quantity' ? 'Quantity' : BUFF_NAMES[goal.measure];
  return `${crop} · ${measure}`;
}

/**
 * For a buff goal, the first goal crop (goal.crop itself, or each specific
 * goal crop when ALL_GOAL_CROPS, in goal order) that has no allowed provider
 * other than itself. Returns null when every goal crop is covered.
 */
function buffProviderWarning(
  goal: Goal,
  allGoals: readonly Goal[],
  crops: readonly Crop[],
  cropsById: ReadonlyMap<CropId, Crop>,
  allowedIds: readonly CropId[],
): string | null {
  if (goal.measure === 'quantity') return null;
  const buff = goal.measure;
  // For ALL_GOAL_CROPS, check every specific crop named across all goals
  // (goal order), reporting only the first one that has no provider.
  const goalCrops = goal.crop === ALL_GOAL_CROPS ? [...goalCropIds(allGoals)] : [goal.crop];

  for (const c of goalCrops) {
    const crop = cropsById.get(c);
    if (!crop) continue; // unknown crop: goalProblems already reports this

    const hasAllowedGiver = allowedIds.some((id) => id !== c && cropsById.get(id)?.buff === buff);
    if (hasAllowedGiver) continue;

    const anyGivers = crops.filter((cr) => cr.buff === buff && cr.id !== c);
    if (anyGivers.length > 0) {
      const names = anyGivers.map((cr) => cr.name);
      return `No allowed crop gives ${BUFF_NAMES[buff]} to ${crop.name}. Add ${joinNames(names)} as a helper.`;
    }
    return `No crop gives ${BUFF_NAMES[buff]}.`;
  }
  return null;
}

export function precheck(settings: PlanSettings, crops: readonly Crop[], rules: Rules = RULES): PrecheckIssue[] {
  const cropsById = new Map(crops.map((c) => [c.id, c]));
  const issues: PrecheckIssue[] = [];

  if (settings.goals.length === 0) {
    issues.push({ goalId: null, severity: 'error', message: 'Add at least one goal.' });
  }

  const plots = settings.arrangement.mode === 'custom' ? settings.arrangement.plots.length : settings.plotCount;

  if (settings.arrangement.mode === 'custom') {
    if (settings.arrangement.plots.length === 0) {
      issues.push({ goalId: null, severity: 'error', message: 'Place at least one plot.' });
    } else if (settings.arrangement.plots.length > rules.maxPlots) {
      issues.push({ goalId: null, severity: 'error', message: `You can place at most ${rules.maxPlots} plots.` });
    }
  } else if (settings.plotCount < 1 || settings.plotCount > rules.maxPlots) {
    issues.push({ goalId: null, severity: 'error', message: `Choose between 1 and ${rules.maxPlots} plots.` });
  }

  const allowedIds = allowedCropIds(settings, cropsById);
  const seenCropMeasure = new Set<string>();
  const tileCapacity = plots * rules.plotSize * rules.plotSize;
  let mustHighTiles = 0;

  for (const goal of settings.goals) {
    for (const problem of goalProblems(goal, cropsById)) {
      issues.push({ goalId: goal.id, severity: 'error', message: problem });
    }

    const cropMeasureKey = `${goal.crop}::${goal.measure}`;
    if (seenCropMeasure.has(cropMeasureKey)) {
      issues.push({
        goalId: goal.id,
        severity: 'warning',
        message: `This repeats another goal: ${cropMeasureLabel(goal, cropsById)}.`,
      });
    } else {
      seenCropMeasure.add(cropMeasureKey);
    }

    const goalCrop = cropsById.get(goal.crop);

    if (goalCrop && settings.gardeningLevel !== null) {
      const needed = goalCrop.unlock.gardeningLevel;
      if (needed !== null && needed > settings.gardeningLevel) {
        issues.push({
          goalId: goal.id,
          severity: 'warning',
          message: `${goalCrop.name} needs Gardening level ${needed}.`,
        });
      }
    }

    const providerWarning = buffProviderWarning(goal, settings.goals, crops, cropsById, allowedIds);
    if (providerWarning) {
      issues.push({ goalId: goal.id, severity: 'warning', message: providerWarning });
    }

    if (goal.measure === 'quantity' && goal.amount.kind === 'count' && goalCrop) {
      const maxFit = Math.floor((plots * rules.plotSize * rules.plotSize) / (goalCrop.size * goalCrop.size));
      if (goal.amount.n > maxFit) {
        issues.push({
          goalId: goal.id,
          severity: 'warning',
          message: `At most ${maxFit} ${goalCrop.name} plants fit in ${plots} ${plotWord(plots)}.`,
        });
      }
      if (goal.importance === 'must' || goal.importance === 'high') {
        mustHighTiles += goal.amount.n * goalCrop.size * goalCrop.size;
      }
    }

    if (goal.measure !== 'quantity' && goalCrop && goalCrop.size === 3 && plots === 1) {
      issues.push({
        goalId: goal.id,
        severity: 'warning',
        message: `With 1 plot, ${article(goalCrop.name)} ${goalCrop.name} fills the whole garden and has no neighbors to get buffs from.`,
      });
    }
  }

  if (mustHighTiles > tileCapacity) {
    issues.push({
      goalId: null,
      severity: 'warning',
      message: `Your Must and High quantity goals need ${mustHighTiles} tiles, but ${plots} ${plotWord(plots)} have ${tileCapacity}.`,
    });
  }

  return issues;
}
