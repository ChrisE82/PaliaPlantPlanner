import { describe, expect, it } from 'vitest';
import { ALL_GOAL_CROPS, type Goal } from '../../engine/types';
import { goalsInvolvingCrop, requestedBuffsForCrop } from './buffRequests';

function buffGoal(crop: string, measure: 'waterRetain' | 'harvestBoost'): Goal {
  return { id: `${crop}-${measure}`, crop, measure, amount: { kind: 'all' }, importance: 'medium' };
}

describe('requestedBuffsForCrop', () => {
  it('includes a buff goal that names the crop directly', () => {
    const goals = [buffGoal('apple', 'harvestBoost')];
    expect(requestedBuffsForCrop(goals, new Set(['apple']), 'apple')).toEqual(new Set(['harvestBoost']));
  });

  it('ignores quantity goals', () => {
    const goals: Goal[] = [{ id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 }, importance: 'must' }];
    expect(requestedBuffsForCrop(goals, new Set(['apple']), 'apple').size).toBe(0);
  });

  it('does not attribute a buff goal to an unrelated crop', () => {
    const goals = [buffGoal('apple', 'harvestBoost')];
    expect(requestedBuffsForCrop(goals, new Set(['apple']), 'wheat').size).toBe(0);
  });

  it('an "All goal crops" goal applies only to crops that are themselves goal crops', () => {
    const goals = [buffGoal(ALL_GOAL_CROPS, 'waterRetain')];
    const goalCrops = new Set(['apple']); // apple is named in some other goal; wheat is only a helper
    expect(requestedBuffsForCrop(goals, goalCrops, 'apple')).toEqual(new Set(['waterRetain']));
    expect(requestedBuffsForCrop(goals, goalCrops, 'wheat').size).toBe(0);
  });

  it('collects buffs from multiple goals on the same crop', () => {
    const goals = [buffGoal('apple', 'harvestBoost'), buffGoal('apple', 'waterRetain')];
    expect(requestedBuffsForCrop(goals, new Set(['apple']), 'apple')).toEqual(new Set(['harvestBoost', 'waterRetain']));
  });
});

describe('goalsInvolvingCrop', () => {
  it('finds goals naming the crop directly and via "All goal crops"', () => {
    const direct = buffGoal('apple', 'harvestBoost');
    const all = buffGoal(ALL_GOAL_CROPS, 'waterRetain');
    const unrelated = buffGoal('wheat', 'harvestBoost');
    const goals = [direct, all, unrelated];
    const result = goalsInvolvingCrop(goals, new Set(['apple', 'wheat']), 'apple');
    expect(result).toEqual([direct, all]);
  });
});
