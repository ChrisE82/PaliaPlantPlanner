import { describe, expect, it } from 'vitest';
import { ALL_GOAL_CROPS, type BuffId, type Goal } from '../../engine/types';
import type { DragItem, DropTarget } from '../dnd/types';
import { applyDrop, reorderGoals, type GoalsAndHelpers } from './goalDrops';

function quantityGoal(id: string, crop: string, n: number, importance: Goal['importance']): Goal {
  return { id, crop, measure: 'quantity', amount: { kind: 'count', n }, importance };
}

function maxGoal(id: string, crop: string, importance: Goal['importance']): Goal {
  return { id, crop, measure: 'quantity', amount: { kind: 'max' }, importance };
}

function buffGoal(id: string, crop: string, measure: Goal['measure'], importance: Goal['importance']): Goal {
  return { id, crop, measure, amount: { kind: 'all' }, importance };
}

function countBuffGoal(id: string, crop: string, measure: Goal['measure'], n: number, importance: Goal['importance']): Goal {
  return { id, crop, measure, amount: { kind: 'count', n }, importance };
}

function state(goals: Goal[], helpers: string[] = []): GoalsAndHelpers {
  return { goals, helpers };
}

const laneTarget = (importance: Goal['importance']): DropTarget => ({ kind: 'lane', importance });
const goalTarget = (goalId: string, importance: Goal['importance']): DropTarget => ({ kind: 'goal', goalId, importance });
const cropItem = (cropId: string): DragItem => ({ kind: 'palette-crop', cropId });
const buffItem = (buff: BuffId): DragItem => ({ kind: 'palette-buff', buff });
const goalItem = (goalId: string): DragItem => ({ kind: 'goal', goalId });
const helperItem = (cropId: string): DragItem => ({ kind: 'helper', cropId });

describe('reorderGoals', () => {
  it('moves a goal to another lane at the given position', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'must'), quantityGoal('b', 'apple', 1, 'high'), quantityGoal('c', 'wheat', 1, 'low')];
    const next = reorderGoals(goals, 'c', 'high', 0);
    expect(next.find((g) => g.id === 'c')?.importance).toBe('high');
    expect(next.filter((g) => g.importance === 'high').map((g) => g.id)).toEqual(['c', 'b']);
    expect(next.filter((g) => g.importance === 'low')).toEqual([]);
  });

  it('appends past the end of a lane', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'must'), quantityGoal('b', 'wheat', 1, 'medium')];
    const next = reorderGoals(goals, 'a', 'medium', 5);
    expect(next.filter((g) => g.importance === 'medium').map((g) => g.id)).toEqual(['b', 'a']);
  });

  it('reorders within the same lane', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'high'), quantityGoal('b', 'wheat', 1, 'high')];
    const next = reorderGoals(goals, 'b', 'high', 0);
    expect(next.map((g) => g.id)).toEqual(['b', 'a']);
  });

  it('is a no-op for an unknown id', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'must')];
    expect(reorderGoals(goals, 'missing', 'high', 0)).toEqual(goals);
  });

  it('clamps a negative index to the start of the lane', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'must'), quantityGoal('b', 'wheat', 1, 'must')];
    const next = reorderGoals(goals, 'b', 'must', -5);
    expect(next.map((g) => g.id)).toEqual(['b', 'a']);
  });
});

describe('applyDrop: palette-crop', () => {
  it('creates a new count-1 quantity goal at the end of the lane when the crop has none', () => {
    const goals = [quantityGoal('a', 'wheat', 2, 'must')];
    const result = applyDrop(state(goals), cropItem('apple'), laneTarget('high'));
    expect(result?.goals).toEqual([quantityGoal('a', 'wheat', 2, 'must'), quantityGoal(result!.goals[1].id, 'apple', 1, 'high')]);
  });

  it('increments the count by 1 when the crop already has a quantity goal in that lane', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'must')];
    const result = applyDrop(state(goals), cropItem('apple'), laneTarget('must'));
    expect(result?.goals).toEqual([quantityGoal('a', 'apple', 5, 'must')]);
  });

  it('dropping onto a token in the same lane also increments by 1', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'must'), quantityGoal('b', 'wheat', 1, 'must')];
    const result = applyDrop(state(goals), cropItem('apple'), goalTarget('b', 'must'));
    expect(result?.goals.find((g) => g.id === 'a')).toEqual(quantityGoal('a', 'apple', 5, 'must'));
  });

  it('does not increment a Max quantity goal, just leaves it as Max', () => {
    const goals = [maxGoal('a', 'wheat', 'low')];
    const result = applyDrop(state(goals), cropItem('wheat'), laneTarget('low'));
    expect(result?.goals).toEqual(goals);
  });

  it('moves the existing quantity goal to the new lane without incrementing when it is elsewhere', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'must'), quantityGoal('b', 'wheat', 1, 'low')];
    const result = applyDrop(state(goals), cropItem('apple'), laneTarget('high'));
    expect(result?.goals.find((g) => g.id === 'a')).toEqual(quantityGoal('a', 'apple', 4, 'high'));
    // Moved to the end of its new lane.
    expect(result?.goals.map((g) => g.id)).toEqual(['b', 'a']);
  });

  it('adds the crop as a helper when dropped on the helpers tray', () => {
    const result = applyDrop(state([], []), cropItem('onion'), { kind: 'helpers' });
    expect(result).toEqual({ goals: [], helpers: ['onion'] });
  });

  it('does not duplicate a crop already in helpers', () => {
    const result = applyDrop(state([], ['onion']), cropItem('onion'), { kind: 'helpers' });
    expect(result?.helpers).toEqual(['onion']);
  });

  it('is not handled by trash or a garden tile', () => {
    expect(applyDrop(state([]), cropItem('apple'), { kind: 'trash' })).toBeNull();
    expect(applyDrop(state([]), cropItem('apple'), { kind: 'tile', x: 0, y: 0 })).toBeNull();
  });
});

describe('applyDrop: palette-buff', () => {
  it('adds a new All-plants buff goal right after the crop token it was dropped on', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'must'), quantityGoal('b', 'wheat', 1, 'must')];
    const result = applyDrop(state(goals), buffItem('harvestBoost'), goalTarget('a', 'must'));
    expect(result?.goals.map((g) => g.id)).toEqual(['a', result?.goals[1].id, 'b']);
    expect(result?.goals[1]).toMatchObject({ crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'must' });
  });

  it('moves an existing buff goal for that crop to right after the token, keeping its amount and updating its lane', () => {
    const goals = [
      quantityGoal('a', 'apple', 4, 'must'),
      countBuffGoal('c', 'apple', 'harvestBoost', 2, 'low'),
      quantityGoal('b', 'wheat', 1, 'must'),
    ];
    const result = applyDrop(state(goals), buffItem('harvestBoost'), goalTarget('a', 'must'));
    expect(result?.goals.map((g) => g.id)).toEqual(['a', 'c', 'b']);
    expect(result?.goals.find((g) => g.id === 'c')).toEqual(countBuffGoal('c', 'apple', 'harvestBoost', 2, 'must'));
  });

  it('works on the All-crops token too, keyed by ALL_GOAL_CROPS', () => {
    const goals = [buffGoal('a', ALL_GOAL_CROPS, 'waterRetain', 'medium')];
    const result = applyDrop(state(goals), buffItem('qualityBoost'), goalTarget('a', 'medium'));
    expect(result?.goals[1]).toMatchObject({ crop: ALL_GOAL_CROPS, measure: 'qualityBoost', importance: 'medium' });
  });

  it('is not handled when the target token no longer exists', () => {
    const result = applyDrop(state([quantityGoal('a', 'apple', 4, 'must')]), buffItem('harvestBoost'), goalTarget('missing', 'must'));
    expect(result).toBeNull();
  });

  it('adds an All-goal-crops buff goal at the end of the lane when dropped on empty lane space', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'must')];
    const result = applyDrop(state(goals), buffItem('waterRetain'), laneTarget('must'));
    expect(result?.goals[1]).toMatchObject({ crop: ALL_GOAL_CROPS, measure: 'waterRetain', amount: { kind: 'all' }, importance: 'must' });
  });

  it('moves the existing All-goal-crops buff goal into the dropped lane instead of duplicating it', () => {
    const goals = [buffGoal('a', ALL_GOAL_CROPS, 'waterRetain', 'medium')];
    const result = applyDrop(state(goals), buffItem('waterRetain'), laneTarget('low'));
    expect(result?.goals).toEqual([{ ...goals[0], importance: 'low' }]);
  });

  it('is not handled by helpers, trash or a garden tile', () => {
    expect(applyDrop(state([]), buffItem('waterRetain'), { kind: 'helpers' })).toBeNull();
    expect(applyDrop(state([]), buffItem('waterRetain'), { kind: 'trash' })).toBeNull();
    expect(applyDrop(state([]), buffItem('waterRetain'), { kind: 'tile', x: 0, y: 0 })).toBeNull();
  });
});

describe('applyDrop: goal token', () => {
  it('moves/reorders via a lane or token target, matching reorderGoals', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'must'), quantityGoal('b', 'wheat', 1, 'low')];
    const result = applyDrop(state(goals), goalItem('b'), laneTarget('must'));
    expect(result?.goals).toEqual(reorderGoals(goals, 'b', 'must', Number.MAX_SAFE_INTEGER));
  });

  it('reorders before the target token', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'high'), quantityGoal('b', 'wheat', 1, 'high'), quantityGoal('c', 'corn', 1, 'low')];
    const result = applyDrop(state(goals), goalItem('c'), goalTarget('a', 'high'));
    expect(result?.goals.map((g) => g.id)).toEqual(['c', 'a', 'b']);
  });

  it('removes the goal when dropped on trash, leaving helpers untouched', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'must'), quantityGoal('b', 'wheat', 1, 'low')];
    const result = applyDrop(state(goals, ['onion']), goalItem('a'), { kind: 'trash' });
    expect(result).toEqual({ goals: [quantityGoal('b', 'wheat', 1, 'low')], helpers: ['onion'] });
  });

  it('is not handled by the helpers tray or a garden tile', () => {
    const goals = [quantityGoal('a', 'apple', 4, 'must')];
    expect(applyDrop(state(goals), goalItem('a'), { kind: 'helpers' })).toBeNull();
    expect(applyDrop(state(goals), goalItem('a'), { kind: 'tile', x: 0, y: 0 })).toBeNull();
  });
});

describe('applyDrop: helper', () => {
  it('becomes a quantity goal in the dropped lane and stops being a helper', () => {
    const result = applyDrop(state([], ['onion', 'corn']), helperItem('onion'), laneTarget('medium'));
    expect(result?.goals).toEqual([quantityGoal(result!.goals[0].id, 'onion', 1, 'medium')]);
    expect(result?.helpers).toEqual(['corn']);
  });

  it('applies the same crop-on-lane rule when dropped on a token', () => {
    const goals = [quantityGoal('a', 'onion', 2, 'medium')];
    const result = applyDrop(state(goals, ['onion']), helperItem('onion'), goalTarget('a', 'medium'));
    expect(result?.goals).toEqual([quantityGoal('a', 'onion', 3, 'medium')]);
    expect(result?.helpers).toEqual([]);
  });

  it('is a harmless no-op when dropped back on the helpers tray', () => {
    const result = applyDrop(state([], ['onion']), helperItem('onion'), { kind: 'helpers' });
    expect(result).toEqual({ goals: [], helpers: ['onion'] });
  });

  it('is removed from helpers when dropped on trash', () => {
    const result = applyDrop(state([], ['onion', 'corn']), helperItem('onion'), { kind: 'trash' });
    expect(result).toEqual({ goals: [], helpers: ['corn'] });
  });

  it('is not handled by a garden tile', () => {
    expect(applyDrop(state([], ['onion']), helperItem('onion'), { kind: 'tile', x: 0, y: 0 })).toBeNull();
  });
});

describe('applyDrop: everything else', () => {
  it('a plant item is never handled', () => {
    const plantItem: DragItem = { kind: 'plant', index: 0, cropId: 'apple', x: 0, y: 0 };
    expect(applyDrop(state([]), plantItem, laneTarget('must'))).toBeNull();
    expect(applyDrop(state([]), plantItem, { kind: 'trash' })).toBeNull();
    expect(applyDrop(state([]), plantItem, { kind: 'tile', x: 0, y: 0 })).toBeNull();
  });

  it('a null target is never handled', () => {
    expect(applyDrop(state([]), cropItem('apple'), null)).toBeNull();
  });
});
