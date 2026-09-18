/**
 * Pure drop rules for the goals board and helpers tray (PLAN.md section 4,
 * task spec's Goals board / Helpers tray). Every drag-and-drop and
 * tap-to-place gesture on this side of the app funnels through applyDrop:
 * current goals and helpers in, next goals and helpers out (or null when the
 * item/target pair isn't ours to handle, so the caller can return false and
 * let another area's drop handler try).
 *
 * Kept free of React and the store so every rule is directly unit-testable.
 */
import { ALL_GOAL_CROPS, type CropId, type Goal, type Importance } from '../../engine/types';
import type { DragItem, DropTarget } from '../dnd/types';

export interface GoalsAndHelpers {
  goals: Goal[];
  helpers: CropId[];
}

/** crypto.randomUUID with a fallback for environments that lack it (mirrors store.ts's makeId). */
function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Moves the goal `id` into `importance`'s lane at position `index` (0-based,
 * counting only that lane's other goals). `goals` is a single array whose
 * order is the display order: a lane is simply the goals with that
 * importance, in array order (see the goals board). Used for drag reordering
 * (goal token -> lane or before another token) and the popover's Importance
 * control alike.
 */
export function reorderGoals(goals: readonly Goal[], id: string, importance: Importance, index: number): Goal[] {
  const current = goals.find((g) => g.id === id);
  if (!current) return goals.slice();

  const moved: Goal = current.importance === importance ? current : { ...current, importance };
  const without = goals.filter((g) => g.id !== id);

  // Positions, within `without`, of the goals already in the target lane.
  const laneIndices: number[] = [];
  without.forEach((g, i) => {
    if (g.importance === importance) laneIndices.push(i);
  });

  const clampedIndex = Math.max(0, Math.min(index, laneIndices.length));
  // Inserting before the goal currently at that lane slot reproduces the
  // requested position; past the last lane slot, append to the whole array.
  const insertAt = clampedIndex < laneIndices.length ? laneIndices[clampedIndex] : without.length;

  const next = without.slice();
  next.splice(insertAt, 0, moved);
  return next;
}

/** Index of `targetGoalId` within `importance`'s lane, excluding `excludeId` (the goal being moved). Past the end when not found. */
function laneIndexOf(goals: readonly Goal[], excludeId: string, importance: Importance, targetGoalId: string): number {
  const laneGoals = goals.filter((g) => g.importance === importance && g.id !== excludeId);
  const i = laneGoals.findIndex((g) => g.id === targetGoalId);
  return i === -1 ? laneGoals.length : i;
}

/** Removes any goal with entry.id, then (re)inserts entry immediately after the goal `afterId`, or at the end when afterId isn't found. */
function insertAfter(goals: readonly Goal[], entry: Goal, afterId: string): Goal[] {
  const without = goals.filter((g) => g.id !== entry.id);
  const index = without.findIndex((g) => g.id === afterId);
  const at = index === -1 ? without.length : index + 1;
  const next = without.slice();
  next.splice(at, 0, entry);
  return next;
}

/**
 * A crop dropped on lane `importance` (or on a token inside it): the crop's
 * quantity goal gets +1 when it's already in that lane (unless it's Max), the
 * goal moves there unchanged otherwise, or a brand new "count 1" goal is
 * appended when the crop has no quantity goal yet. Appending at the very end
 * of the array always sorts last within any one lane's filtered view, so
 * that's how every "end of lane" placement below is done - no separate
 * position bookkeeping needed.
 */
function dropCropOnLane(goals: readonly Goal[], cropId: CropId, importance: Importance): Goal[] {
  const existing = goals.find((g) => g.crop === cropId && g.measure === 'quantity');

  if (!existing) {
    const created: Goal = { id: makeId(), crop: cropId, measure: 'quantity', amount: { kind: 'count', n: 1 }, importance };
    return [...goals, created];
  }

  if (existing.importance === importance) {
    if (existing.amount.kind !== 'count') return goals.slice(); // already Max: absorbed, no change
    const updated: Goal = { ...existing, amount: { kind: 'count', n: existing.amount.n + 1 } };
    return goals.map((g) => (g.id === existing.id ? updated : g));
  }

  const moved: Goal = { ...existing, importance };
  return [...goals.filter((g) => g.id !== existing.id), moved];
}

/** A buff dropped on the goal token `tokenGoalId`: add/move an "All plants" buff goal for that token's crop, right after it. Null when the token no longer exists (stale drop). */
function dropBuffOnToken(goals: readonly Goal[], buff: string, tokenGoalId: string, importance: Importance): Goal[] | null {
  const token = goals.find((g) => g.id === tokenGoalId);
  if (!token) return null;

  const crop = token.crop;
  const existing = goals.find((g) => g.crop === crop && g.measure === buff);
  const entry: Goal = existing
    ? { ...existing, importance }
    : { id: makeId(), crop, measure: buff as Goal['measure'], amount: { kind: 'all' }, importance };
  return insertAfter(goals, entry, tokenGoalId);
}

/** A buff dropped on lane `importance`'s empty space: add/move the "All goal crops" buff goal for that buff into this lane. */
function dropBuffOnLane(goals: readonly Goal[], buff: string, importance: Importance): Goal[] {
  const existing = goals.find((g) => g.crop === ALL_GOAL_CROPS && g.measure === buff);
  const entry: Goal = existing
    ? { ...existing, importance }
    : { id: makeId(), crop: ALL_GOAL_CROPS, measure: buff as Goal['measure'], amount: { kind: 'all' }, importance };
  return [...goals.filter((g) => g.id !== entry.id), entry];
}

/** A goal token dropped on a lane or before another token: reorder/move it (see reorderGoals). Null for any other target. */
function dropGoalOnTarget(goals: readonly Goal[], goalId: string, target: DropTarget): Goal[] | null {
  if (target.kind === 'lane') return reorderGoals(goals, goalId, target.importance, Number.MAX_SAFE_INTEGER);
  if (target.kind === 'goal') return reorderGoals(goals, goalId, target.importance, laneIndexOf(goals, goalId, target.importance, target.goalId));
  return null;
}

/**
 * The one entry point for every drop and tap-to-place gesture on the goals
 * board and helpers tray (task spec's Goals board rules):
 *
 *  - palette-crop -> lane, or a token in it: dropCropOnLane.
 *  - palette-buff -> a crop goal token: add/move an "All plants" buff goal
 *    for that token's crop, right after it.
 *  - palette-buff -> a lane: add/move the "All goal crops" buff goal.
 *  - goal token -> a lane or before another token: move/reorder.
 *  - goal token or helper -> trash: remove it.
 *  - palette-crop or helper -> helpers tray: add as helper.
 *  - helper -> a lane, or a token in it: becomes a goal there and stops
 *    being a helper.
 *  - anything else (tile targets, plant items, unhandled pairs): null, so
 *    the caller can return false and let another area's handler try.
 */
export function applyDrop(state: GoalsAndHelpers, item: DragItem, target: DropTarget | null): GoalsAndHelpers | null {
  const { goals, helpers } = state;
  if (!target) return null;

  switch (item.kind) {
    case 'palette-crop': {
      if (target.kind === 'lane' || target.kind === 'goal') {
        return { goals: dropCropOnLane(goals, item.cropId, target.importance), helpers };
      }
      if (target.kind === 'helpers') {
        return { goals, helpers: helpers.includes(item.cropId) ? helpers : [...helpers, item.cropId] };
      }
      return null;
    }

    case 'palette-buff': {
      if (target.kind === 'goal') {
        const next = dropBuffOnToken(goals, item.buff, target.goalId, target.importance);
        return next ? { goals: next, helpers } : null;
      }
      if (target.kind === 'lane') {
        return { goals: dropBuffOnLane(goals, item.buff, target.importance), helpers };
      }
      return null;
    }

    case 'goal': {
      if (target.kind === 'trash') {
        return { goals: goals.filter((g) => g.id !== item.goalId), helpers };
      }
      if (target.kind === 'lane' || target.kind === 'goal') {
        const next = dropGoalOnTarget(goals, item.goalId, target);
        return next ? { goals: next, helpers } : null;
      }
      return null;
    }

    case 'helper': {
      if (target.kind === 'lane' || target.kind === 'goal') {
        return { goals: dropCropOnLane(goals, item.cropId, target.importance), helpers: helpers.filter((c) => c !== item.cropId) };
      }
      if (target.kind === 'helpers') {
        return { goals, helpers }; // already a helper: no-op, still handled
      }
      if (target.kind === 'trash') {
        return { goals, helpers: helpers.filter((c) => c !== item.cropId) };
      }
      return null;
    }

    case 'plant':
      return null;
  }
}
