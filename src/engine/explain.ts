/**
 * Turns a scored layout into one plain-language report per goal (PLAN.md
 * section 4.3's "Consequences the UI must explain" and section 6's goal
 * summary).
 */
import { goalLabel } from './goals';
import { goalScore, layoutStats, SCORE_EPSILON, type LayoutStats, type ScoreContext } from './score';
import {
  ALL_GOAL_CROPS,
  BUFF_INDEX,
  BUFF_NAMES,
  IMPORTANCE_NAMES,
  IMPORTANCE_ORDER,
  type CropId,
  type Goal,
  type GoalReport,
  type Placement,
  type PlacementBuffs,
  type PrecheckIssue,
} from './types';

/** Total plants of a goal crop reference: one crop, or all goal crops summed. */
function plantsFor(ctx: ScoreContext, stats: LayoutStats, crop: CropId | typeof ALL_GOAL_CROPS): number {
  if (crop === ALL_GOAL_CROPS) {
    let sum = 0;
    for (const c of ctx.goalCrops) sum += stats.plants.get(c) ?? 0;
    return sum;
  }
  return stats.plants.get(crop) ?? 0;
}

/** Plants with a buff of a goal crop reference: one crop, or all goal crops summed. */
function buffedFor(ctx: ScoreContext, stats: LayoutStats, crop: CropId | typeof ALL_GOAL_CROPS, buffIndex: number): number {
  if (crop === ALL_GOAL_CROPS) {
    let sum = 0;
    for (const c of ctx.goalCrops) sum += stats.buffed.get(c)?.[buffIndex] ?? 0;
    return sum;
  }
  return stats.buffed.get(crop)?.[buffIndex] ?? 0;
}

/** "Apple" for a specific crop, "goal crop" for ALL_GOAL_CROPS. */
function cropWord(ctx: ScoreContext, crop: CropId | typeof ALL_GOAL_CROPS): string {
  if (crop === ALL_GOAL_CROPS) return 'goal crop';
  return ctx.cropsById.get(crop)?.name ?? crop;
}

function goalStatus(goal: Goal, score: number): GoalReport['status'] {
  if (goal.measure === 'quantity' && goal.amount.kind === 'max') return 'info';
  if (score >= 1 - SCORE_EPSILON) return 'met';
  if (score <= SCORE_EPSILON) return 'unmet';
  return 'partial';
}

function goalValue(ctx: ScoreContext, goal: Goal, stats: LayoutStats): string {
  if (goal.measure === 'quantity') {
    const plants = stats.plants.get(goal.crop) ?? 0;
    if (goal.amount.kind === 'max') {
      return `${plants} plant${plants === 1 ? '' : 's'}`;
    }
    const n = goal.amount.kind === 'count' ? goal.amount.n : 0;
    return `${Math.min(plants, n)} of ${n} plants`;
  }

  const buff = goal.measure;
  const word = cropWord(ctx, goal.crop);
  const buffedCount = buffedFor(ctx, stats, goal.crop, BUFF_INDEX[buff]);

  if (goal.amount.kind === 'all') {
    const total = plantsFor(ctx, stats, goal.crop);
    if (total === 0) return `No ${word} plants`;
    return `${buffedCount} of ${total} ${word} plants have ${BUFF_NAMES[buff]}`;
  }

  const n = goal.amount.kind === 'count' ? goal.amount.n : 0;
  return `${Math.min(buffedCount, n)} of ${n} ${word} plants with ${BUFF_NAMES[buff]}`;
}

/** Other goals at a strictly higher importance, formatted for the "Space went to" reason. */
function higherImportanceReason(ctx: ScoreContext, goal: Goal): string | null {
  const level = IMPORTANCE_ORDER.indexOf(goal.importance);
  // Name the goals that take the most space first: Maximize, then quantity
  // targets, then buff goals; more important first within each kind.
  const spaceRank = (g: Goal) => (g.measure !== 'quantity' ? 2 : g.amount.kind === 'max' ? 0 : 1);
  const higher = ctx.goals
    .filter((g) => IMPORTANCE_ORDER.indexOf(g.importance) < level)
    .sort(
      (a, b) =>
        spaceRank(a) - spaceRank(b) || IMPORTANCE_ORDER.indexOf(a.importance) - IMPORTANCE_ORDER.indexOf(b.importance),
    );
  if (higher.length === 0) return null;

  const labels = higher.slice(0, 2).map((g) => `${goalLabel(g, ctx.cropsById)} (${IMPORTANCE_NAMES[g.importance]})`);
  const text = higher.length > 2 ? `${labels.join(', ')} and ${higher.length - 2} more` : labels.join(', ');
  return `Space went to higher-importance goals: ${text}.`;
}

function goalReason(
  ctx: ScoreContext,
  goal: Goal,
  stats: LayoutStats,
  status: GoalReport['status'],
  issues: readonly PrecheckIssue[],
): string | null {
  if (status === 'met' || status === 'info') return null;

  const issueMessage = issues.find((issue) => issue.goalId === goal.id)?.message;
  if (issueMessage) return issueMessage;

  if (goal.measure !== 'quantity' && plantsFor(ctx, stats, goal.crop) === 0) {
    return `There are no ${cropWord(ctx, goal.crop)} plants in the layout.`;
  }

  const higher = higherImportanceReason(ctx, goal);
  if (higher) return higher;

  if (ctx.goals.some((g) => g.id !== goal.id && g.importance === goal.importance)) {
    return 'Shares space with other goals of the same importance.';
  }

  return 'The planner could not fit more with the allowed crops and this arrangement.';
}

export function explainGoals(
  ctx: ScoreContext,
  placements: readonly Placement[],
  buffs: readonly PlacementBuffs[],
  issues: readonly PrecheckIssue[] = [],
): GoalReport[] {
  const stats = layoutStats(ctx, placements, buffs);

  return ctx.goals.map((goal) => {
    const score = goalScore(ctx, goal, stats);
    const status = goalStatus(goal, score);
    return {
      goalId: goal.id,
      label: goalLabel(goal, ctx.cropsById),
      score,
      status,
      value: goalValue(ctx, goal, stats),
      reason: goalReason(ctx, goal, stats, status, issues),
    };
  });
}
