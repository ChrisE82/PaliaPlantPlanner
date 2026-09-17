import { describe, expect, it } from 'vitest';
import { CROPS } from '../data/crops';
import { precheck } from './precheck';
import { RULES } from './rules';
import { ALL_GOAL_CROPS, type Goal, type PlanSettings } from './types';

function settings(partial: Partial<PlanSettings> = {}): PlanSettings {
  return {
    plotCount: 9,
    arrangement: { mode: 'suggest', maxWidth: null, maxHeight: null },
    gardeningLevel: null,
    goals: [],
    helpers: [],
    ...partial,
  };
}

const appleQty1: Goal = { id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 }, importance: 'medium' };

describe('precheck', () => {
  it('errors when there are no goals', () => {
    const issues = precheck(settings({ goals: [] }), CROPS, RULES);
    expect(issues).toContainEqual({ goalId: null, severity: 'error', message: 'Add at least one goal.' });
  });

  it('errors when custom mode has no plots', () => {
    const issues = precheck(settings({ arrangement: { mode: 'custom', plots: [] }, goals: [appleQty1] }), CROPS, RULES);
    expect(issues).toContainEqual({ goalId: null, severity: 'error', message: 'Place at least one plot.' });
  });

  it('errors when custom mode has more than the max plots', () => {
    const plots = Array.from({ length: 10 }, (_, i) => ({ x: i * 3, y: 0 }));
    const issues = precheck(settings({ arrangement: { mode: 'custom', plots }, goals: [appleQty1] }), CROPS, RULES);
    expect(issues).toContainEqual({ goalId: null, severity: 'error', message: 'You can place at most 9 plots.' });
  });

  it('errors when suggest mode plot count is out of range', () => {
    const low = precheck(settings({ plotCount: 0, goals: [appleQty1] }), CROPS, RULES);
    const high = precheck(settings({ plotCount: 10, goals: [appleQty1] }), CROPS, RULES);
    expect(low).toContainEqual({ goalId: null, severity: 'error', message: 'Choose between 1 and 9 plots.' });
    expect(high).toContainEqual({ goalId: null, severity: 'error', message: 'Choose between 1 and 9 plots.' });
  });

  it('reports each goalProblems message as a per-goal error', () => {
    const badGoal: Goal = { id: 'bad', crop: ALL_GOAL_CROPS, measure: 'quantity', amount: { kind: 'count', n: 1 }, importance: 'medium' };
    const issues = precheck(settings({ goals: [badGoal] }), CROPS, RULES);
    expect(issues).toContainEqual(
      expect.objectContaining({ goalId: 'bad', severity: 'error', message: expect.stringMatching(/specific crop/i) }),
    );
  });

  it("warns when a goal repeats an earlier goal's crop and measure", () => {
    const g1: Goal = { id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 }, importance: 'must' };
    const g2: Goal = { id: 'g2', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 6 }, importance: 'low' };
    const issues = precheck(settings({ goals: [g1, g2] }), CROPS, RULES);
    expect(issues).toContainEqual({ goalId: 'g2', severity: 'warning', message: 'This repeats another goal: Apple · Quantity.' });
  });

  it('warns when a goal crop needs a higher gardening level', () => {
    const issues = precheck(settings({ goals: [appleQty1], gardeningLevel: 5 }), CROPS, RULES);
    expect(issues).toContainEqual({ goalId: 'g1', severity: 'warning', message: 'Apple needs Gardening level 10.' });
  });

  it('skips the gardening level check when gardeningLevel is null', () => {
    const issues = precheck(settings({ goals: [appleQty1], gardeningLevel: null }), CROPS, RULES);
    expect(issues.some((i) => /Gardening level/.test(i.message))).toBe(false);
  });

  it('does not warn when the gardening level is high enough', () => {
    const issues = precheck(settings({ goals: [appleQty1], gardeningLevel: 10 }), CROPS, RULES);
    expect(issues.some((i) => /Gardening level/.test(i.message))).toBe(false);
  });

  it('warns when no allowed crop gives the goal buff, naming the crops that do', () => {
    const g: Goal = { id: 'g1', crop: 'apple', measure: 'qualityBoost', amount: { kind: 'all' }, importance: 'low' };
    const issues = precheck(settings({ goals: [g], helpers: ['carrot', 'onion', 'corn'] }), CROPS, RULES);
    expect(issues).toContainEqual({
      goalId: 'g1',
      severity: 'warning',
      message: 'No allowed crop gives Quality Boost to Apple. Add Cotton, Spicy Pepper or Rockhopper Pumpkin as a helper.',
    });
  });

  it('warns generically when no crop at all gives the buff', () => {
    const g: Goal = { id: 'g1', crop: 'apple', measure: 'growthBoost', amount: { kind: 'all' }, importance: 'low' };
    const issues = precheck(settings({ goals: [g] }), CROPS, RULES);
    expect(issues).toContainEqual({ goalId: 'g1', severity: 'warning', message: 'No crop gives Growth Boost.' });
  });

  it('reports at most one provider warning per goal, even when several goal crops lack a provider', () => {
    const g1: Goal = { id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 }, importance: 'medium' };
    const g2: Goal = { id: 'g2', crop: 'wheat', measure: 'quantity', amount: { kind: 'count', n: 1 }, importance: 'medium' };
    const g3: Goal = { id: 'g3', crop: ALL_GOAL_CROPS, measure: 'growthBoost', amount: { kind: 'all' }, importance: 'low' };
    const issues = precheck(settings({ goals: [g1, g2, g3] }), CROPS, RULES);
    expect(issues.filter((i) => i.goalId === 'g3')).toEqual([{ goalId: 'g3', severity: 'warning', message: 'No crop gives Growth Boost.' }]);
  });

  it('warns when a quantity count target cannot fit in the plots', () => {
    const g: Goal = { id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 10 }, importance: 'medium' };
    const issues = precheck(settings({ goals: [g], plotCount: 9 }), CROPS, RULES);
    expect(issues).toContainEqual({ goalId: 'g1', severity: 'warning', message: 'At most 9 Apple plants fit in 9 plots.' });
  });

  it('does not warn when a quantity count target fits', () => {
    const g: Goal = { id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 9 }, importance: 'medium' };
    const issues = precheck(settings({ goals: [g], plotCount: 9 }), CROPS, RULES);
    expect(issues.some((i) => /fit in/.test(i.message))).toBe(false);
  });

  it('warns when Must and High quantity goals need more tiles than the plots provide', () => {
    // 7 apple (3x3=9 tiles each) + 8 blueberry (2x2=4 tiles each) = 95 tiles; 9 plots hold 81.
    const g1: Goal = { id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 7 }, importance: 'must' };
    const g2: Goal = { id: 'g2', crop: 'blueberry', measure: 'quantity', amount: { kind: 'count', n: 8 }, importance: 'high' };
    const issues = precheck(settings({ goals: [g1, g2], plotCount: 9 }), CROPS, RULES);
    expect(issues).toContainEqual({
      goalId: null,
      severity: 'warning',
      message: 'Your Must and High quantity goals need 95 tiles, but 9 plots have 81.',
    });
  });

  it('does not raise the capacity warning for Medium and Low quantity goals', () => {
    const g: Goal = { id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 9 }, importance: 'low' };
    const issues = precheck(settings({ goals: [g], plotCount: 1 }), CROPS, RULES);
    expect(issues.some((i) => /Must and High/.test(i.message))).toBe(false);
  });

  it('warns about a buff goal on a 3x3 crop with only 1 plot', () => {
    const g: Goal = { id: 'g1', crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'medium' };
    const issues = precheck(settings({ goals: [g], plotCount: 1 }), CROPS, RULES);
    expect(issues).toContainEqual({
      goalId: 'g1',
      severity: 'warning',
      message: 'With 1 plot, an Apple fills the whole garden and has no neighbors to get buffs from.',
    });
  });

  it('does not raise the single-plot warning with more than 1 plot', () => {
    const g: Goal = { id: 'g1', crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'medium' };
    const issues = precheck(settings({ goals: [g], plotCount: 2 }), CROPS, RULES);
    expect(issues.some((i) => /no neighbors/.test(i.message))).toBe(false);
  });

  it('the PLAN.md 4.1 example, adjusted, produces no issues', () => {
    const goals: Goal[] = [
      { id: 'must-apple-qty', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 }, importance: 'must' },
      { id: 'high-apple-harvest', crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'high' },
      { id: 'medium-wheat-max', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'medium' },
      { id: 'low-water-retain', crop: ALL_GOAL_CROPS, measure: 'waterRetain', amount: { kind: 'all' }, importance: 'low' },
    ];
    // Helpers swapped from PLAN.md's Carrot/Onion/Corn to Corn/Potato/Carrot:
    // Potato (Water Retain) replaces Onion (Weed Block) so the new Water Retain
    // goal has a provider for both apple and wheat. PLAN.md's original Quality
    // Boost row is left out: it has no provider among these crops (see the
    // "names the crops that do" test above), which would otherwise be a real
    // warning — this scenario is the warning-free configuration the task asks for.
    const s = settings({ goals, helpers: ['corn', 'potato', 'carrot'], plotCount: 9, gardeningLevel: null });
    expect(precheck(s, CROPS, RULES)).toEqual([]);
  });
});
