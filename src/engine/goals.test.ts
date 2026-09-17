import { describe, expect, it } from 'vitest';
import { CROPS, CROP_BY_ID } from '../data/crops';
import { allowedCropIds, buffsGivenByCrops, goalCropIds, goalLabel, goalProblems } from './goals';
import { ALL_GOAL_CROPS, type Goal } from './types';

function goal(partial: Partial<Goal> & Pick<Goal, 'crop' | 'measure' | 'amount'>): Goal {
  return { id: 'g1', importance: 'medium', ...partial };
}

describe('goalCropIds', () => {
  it('collects specific crop ids named in goals', () => {
    const ids = goalCropIds([
      goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 } }),
      goal({ crop: 'wheat', measure: 'quantity', amount: { kind: 'max' } }),
    ]);
    expect(ids).toEqual(new Set(['apple', 'wheat']));
  });

  it('never includes ALL_GOAL_CROPS itself', () => {
    const ids = goalCropIds([goal({ crop: ALL_GOAL_CROPS, measure: 'waterRetain', amount: { kind: 'all' } })]);
    expect(ids.size).toBe(0);
  });

  it('dedups repeated crops and returns an empty set for no goals', () => {
    const ids = goalCropIds([
      goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 } }),
      goal({ crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' } }),
    ]);
    expect(ids).toEqual(new Set(['apple']));
    expect(goalCropIds([])).toEqual(new Set());
  });
});

describe('allowedCropIds', () => {
  it('combines goal crops and helpers, in cropsById order', () => {
    const settings = {
      goals: [goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 } })],
      helpers: ['corn', 'carrot'],
    };
    // cropsById (data) order: ... rice, wheat, corn, carrot ... apple (see crops.json)
    expect(allowedCropIds(settings, CROP_BY_ID)).toEqual(['corn', 'carrot', 'apple']);
  });

  it('drops duplicates and ids missing from cropsById', () => {
    const settings = {
      goals: [goal({ crop: 'corn', measure: 'quantity', amount: { kind: 'count', n: 1 } })],
      helpers: ['corn', 'not-a-real-crop'],
    };
    expect(allowedCropIds(settings, CROP_BY_ID)).toEqual(['corn']);
  });

  it('returns an empty list with no goals and no helpers', () => {
    expect(allowedCropIds({ goals: [], helpers: [] }, CROP_BY_ID)).toEqual([]);
  });
});

describe('goalProblems', () => {
  it('accepts a valid quantity goal with a count', () => {
    expect(goalProblems(goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 } }), CROP_BY_ID)).toEqual([]);
  });

  it('accepts a valid quantity goal with max', () => {
    expect(goalProblems(goal({ crop: 'wheat', measure: 'quantity', amount: { kind: 'max' } }), CROP_BY_ID)).toEqual([]);
  });

  it('accepts a valid buff goal with all, on a specific crop', () => {
    expect(goalProblems(goal({ crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' } }), CROP_BY_ID)).toEqual([]);
  });

  it('accepts a valid buff goal with a count, on a specific crop', () => {
    expect(goalProblems(goal({ crop: 'apple', measure: 'harvestBoost', amount: { kind: 'count', n: 3 } }), CROP_BY_ID)).toEqual([]);
  });

  it('accepts a valid buff goal with all, on ALL_GOAL_CROPS', () => {
    expect(goalProblems(goal({ crop: ALL_GOAL_CROPS, measure: 'waterRetain', amount: { kind: 'all' } }), CROP_BY_ID)).toEqual([]);
  });

  it('accepts a valid buff goal with a count, on ALL_GOAL_CROPS', () => {
    expect(
      goalProblems(goal({ crop: ALL_GOAL_CROPS, measure: 'waterRetain', amount: { kind: 'count', n: 10 } }), CROP_BY_ID),
    ).toEqual([]);
  });

  it('rejects a quantity goal on ALL_GOAL_CROPS', () => {
    const problems = goalProblems(goal({ crop: ALL_GOAL_CROPS, measure: 'quantity', amount: { kind: 'count', n: 1 } }), CROP_BY_ID);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/specific crop/i);
  });

  it('rejects a quantity goal with amount all', () => {
    const problems = goalProblems(goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'all' } }), CROP_BY_ID);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Maximize/);
  });

  it('rejects a buff goal with amount max', () => {
    const problems = goalProblems(goal({ crop: 'apple', measure: 'harvestBoost', amount: { kind: 'max' } }), CROP_BY_ID);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Maximize/);
  });

  it('rejects an unknown crop in a quantity goal', () => {
    const problems = goalProblems(goal({ crop: 'not-a-crop', measure: 'quantity', amount: { kind: 'count', n: 1 } }), CROP_BY_ID);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Unknown crop/);
  });

  it('rejects an unknown crop in a buff goal', () => {
    const problems = goalProblems(goal({ crop: 'not-a-crop', measure: 'harvestBoost', amount: { kind: 'all' } }), CROP_BY_ID);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Unknown crop/);
  });

  it.each([0, -1, 1.5])('rejects a count amount of %s', (n) => {
    const problems = goalProblems(goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n } }), CROP_BY_ID);
    expect(problems.some((p) => /whole number/.test(p))).toBe(true);
  });

  it('accepts a count amount of exactly 1', () => {
    expect(goalProblems(goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 } }), CROP_BY_ID)).toEqual([]);
  });

  it('reports every applicable problem at once', () => {
    const problems = goalProblems(goal({ crop: 'not-a-crop', measure: 'quantity', amount: { kind: 'count', n: 0 } }), CROP_BY_ID);
    expect(problems).toHaveLength(2);
  });
});

describe('goalLabel', () => {
  it('formats a quantity goal with a count', () => {
    expect(goalLabel(goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 } }), CROP_BY_ID)).toBe(
      'Apple · Quantity · At least 4',
    );
  });

  it('formats a quantity goal with max', () => {
    expect(goalLabel(goal({ crop: 'wheat', measure: 'quantity', amount: { kind: 'max' } }), CROP_BY_ID)).toBe(
      'Wheat · Quantity · Maximize',
    );
  });

  it('formats a buff goal with all', () => {
    expect(goalLabel(goal({ crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' } }), CROP_BY_ID)).toBe(
      'Apple · Harvest Boost · All plants',
    );
  });

  it('formats a buff goal on ALL_GOAL_CROPS with a count', () => {
    expect(
      goalLabel(goal({ crop: ALL_GOAL_CROPS, measure: 'waterRetain', amount: { kind: 'count', n: 10 } }), CROP_BY_ID),
    ).toBe('All goal crops · Water Retain · At least 10 plants');
  });

  it('shows the raw id for an unknown crop', () => {
    expect(goalLabel(goal({ crop: 'mystery-crop', measure: 'quantity', amount: { kind: 'count', n: 2 } }), CROP_BY_ID)).toBe(
      'mystery-crop · Quantity · At least 2',
    );
  });
});

describe('buffsGivenByCrops', () => {
  it('lists buffs given by the full crop data, in BUFF_IDS order, without growthBoost', () => {
    expect(buffsGivenByCrops(CROPS)).toEqual(['waterRetain', 'weedBlock', 'harvestBoost', 'qualityBoost']);
  });

  it('lists only the buff a single crop gives', () => {
    expect(buffsGivenByCrops([CROP_BY_ID.get('apple')!])).toEqual(['harvestBoost']);
  });

  it('returns an empty list for no crops', () => {
    expect(buffsGivenByCrops([])).toEqual([]);
  });
});
