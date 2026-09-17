import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../data/crops';
import { explainGoals } from './explain';
import { buildGarden } from './garden';
import { makeScoreContext } from './score';
import { ALL_GOAL_CROPS, buffBit, type CropId, type Goal, type Placement, type PlacementBuffs, type PrecheckIssue } from './types';

function goal(partial: Partial<Goal> & Pick<Goal, 'crop' | 'measure' | 'amount'>): Goal {
  return { id: 'g1', importance: 'medium', ...partial };
}

function place(cropId: CropId, x = 0, y = 0): Placement {
  return { cropId, x, y };
}

function receiving(mask = 0): PlacementBuffs {
  return { contacts: [0, 0, 0, 0, 0], receivedMask: mask };
}

const onePlot = [{ x: 0, y: 0 }];

function makeCtx(goals: Goal[]) {
  return makeScoreContext(buildGarden(onePlot), goals, CROP_BY_ID);
}

describe('explainGoals: status', () => {
  it('is met when the score reaches 1', () => {
    const g = goal({ id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 2 } });
    const ctx = makeCtx([g]);
    const placements = [place('apple'), place('apple')];
    const [report] = explainGoals(ctx, placements, placements.map(() => receiving()));
    expect(report.status).toBe('met');
  });

  it('is partial when the score is between 0 and 1', () => {
    const g = goal({ id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 2 } });
    const ctx = makeCtx([g]);
    const [report] = explainGoals(ctx, [place('apple')], [receiving()]);
    expect(report.status).toBe('partial');
  });

  it('is unmet when the score is 0', () => {
    const g = goal({ id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 2 } });
    const ctx = makeCtx([g]);
    const [report] = explainGoals(ctx, [], []);
    expect(report.status).toBe('unmet');
  });

  it('is info for a quantity Maximize goal, regardless of score', () => {
    const g = goal({ id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'max' } });
    const ctx = makeCtx([g]);
    const [report] = explainGoals(ctx, [], []);
    expect(report.status).toBe('info');
  });
});

describe('explainGoals: value', () => {
  it('formats quantity count as "X of N plants"', () => {
    const g = goal({ id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 } });
    const ctx = makeCtx([g]);
    const placements = [place('apple'), place('apple'), place('apple')];
    const [report] = explainGoals(ctx, placements, placements.map(() => receiving()));
    expect(report.value).toBe('3 of 4 plants');
  });

  it('formats quantity Maximize as a plant count, pluralized', () => {
    const g = goal({ id: 'g1', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' } });
    const ctx = makeCtx([g]);
    const twelve = Array.from({ length: 12 }, () => place('wheat'));
    expect(explainGoals(ctx, twelve, twelve.map(() => receiving()))[0].value).toBe('12 plants');
    expect(explainGoals(ctx, [place('wheat')], [receiving()])[0].value).toBe('1 plant');
  });

  it('formats buff all with plants as "X of Y Crop plants have Buff"', () => {
    const g = goal({ id: 'g1', crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' } });
    const ctx = makeCtx([g]);
    const mask = buffBit('harvestBoost');
    const placements = [place('apple'), place('apple'), place('apple'), place('apple')];
    const buffs = [receiving(mask), receiving(mask), receiving(mask), receiving(0)];
    const [report] = explainGoals(ctx, placements, buffs);
    expect(report.value).toBe('3 of 4 Apple plants have Harvest Boost');
  });

  it('formats buff all with no plants as "No Crop plants"', () => {
    const g = goal({ id: 'g1', crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' } });
    const ctx = makeCtx([g]);
    const [report] = explainGoals(ctx, [], []);
    expect(report.value).toBe('No Apple plants');
  });

  it('formats buff all on ALL_GOAL_CROPS as "X of Y goal crop plants have Buff"', () => {
    const apple = goal({ id: 'apple-qty', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 } });
    const wheat = goal({ id: 'wheat-qty', crop: 'wheat', measure: 'quantity', amount: { kind: 'count', n: 1 } });
    const g = goal({ id: 'g1', crop: ALL_GOAL_CROPS, measure: 'waterRetain', amount: { kind: 'all' } });
    const ctx = makeCtx([apple, wheat, g]);
    const mask = buffBit('waterRetain');
    const apples = Array.from({ length: 10 }, (_, i) => place('apple', i));
    const appleBuffs = apples.map((_, i) => receiving(i < 8 ? mask : 0)); // 8 of 10 buffed
    const wheats = Array.from({ length: 15 }, (_, i) => place('wheat', i));
    const wheatBuffs = wheats.map((_, i) => receiving(i < 12 ? mask : 0)); // 12 of 15 buffed
    const reports = explainGoals(ctx, [...apples, ...wheats], [...appleBuffs, ...wheatBuffs]);
    const report = reports.find((r) => r.goalId === 'g1')!;
    expect(report.value).toBe('20 of 25 goal crop plants have Water Retain');
  });

  it('formats buff count as "X of N Crop plants with Buff"', () => {
    const g = goal({ id: 'g1', crop: 'apple', measure: 'harvestBoost', amount: { kind: 'count', n: 6 } });
    const ctx = makeCtx([g]);
    const mask = buffBit('harvestBoost');
    const placements = Array.from({ length: 5 }, () => place('apple'));
    const buffs = placements.map(() => receiving(mask));
    const [report] = explainGoals(ctx, placements, buffs);
    expect(report.value).toBe('5 of 6 Apple plants with Harvest Boost');
  });
});

describe('explainGoals: reason', () => {
  it('is null when the goal is met', () => {
    const g = goal({ id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 } });
    const ctx = makeCtx([g]);
    expect(explainGoals(ctx, [place('apple')], [receiving()])[0].reason).toBeNull();
  });

  it('is null when the goal is info (Maximize)', () => {
    const g = goal({ id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'max' } });
    const ctx = makeCtx([g]);
    expect(explainGoals(ctx, [], [])[0].reason).toBeNull();
  });

  it('uses a matching precheck issue message first', () => {
    const g = goal({ id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 } });
    const ctx = makeCtx([g]);
    const issues: PrecheckIssue[] = [{ goalId: 'g1', severity: 'warning', message: 'At most 9 Apple plants fit in 9 plots.' }];
    const [report] = explainGoals(ctx, [place('apple')], [receiving()], issues);
    expect(report.reason).toBe('At most 9 Apple plants fit in 9 plots.');
  });

  it('reports no plants in the layout for an unmet buff goal with no matching plants', () => {
    const g = goal({ id: 'g1', crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' } });
    const ctx = makeCtx([g]);
    const [report] = explainGoals(ctx, [], []);
    expect(report.reason).toBe('There are no Apple plants in the layout.');
  });

  it('points to higher-importance goals when they exist', () => {
    const mustGoal = goal({ id: 'must1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 }, importance: 'must' });
    const lowGoal = goal({ id: 'low1', crop: 'wheat', measure: 'quantity', amount: { kind: 'count', n: 10 }, importance: 'low' });
    const ctx = makeCtx([mustGoal, lowGoal]);
    const placements = [place('apple'), place('wheat'), place('wheat'), place('wheat')];
    const reports = explainGoals(ctx, placements, placements.map(() => receiving()));
    const lowReport = reports.find((r) => r.goalId === 'low1')!;
    expect(lowReport.reason).toBe('Space went to higher-importance goals: Apple · Quantity · At least 1 (Must).');
  });

  it('lists up to 2 higher-importance goals, then "and N more"', () => {
    const must1 = goal({ id: 'm1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 }, importance: 'must' });
    const must2 = goal({ id: 'm2', crop: 'wheat', measure: 'quantity', amount: { kind: 'count', n: 1 }, importance: 'must' });
    const must3 = goal({ id: 'm3', crop: 'corn', measure: 'quantity', amount: { kind: 'count', n: 1 }, importance: 'must' });
    const low = goal({ id: 'low1', crop: 'carrot', measure: 'quantity', amount: { kind: 'count', n: 10 }, importance: 'low' });
    const ctx = makeCtx([must1, must2, must3, low]);
    const reports = explainGoals(ctx, [], []);
    const lowReport = reports.find((r) => r.goalId === 'low1')!;
    expect(lowReport.reason).toBe(
      'Space went to higher-importance goals: Apple · Quantity · At least 1 (Must), Wheat · Quantity · At least 1 (Must) and 1 more.',
    );
  });

  it('reports sharing space with same-importance goals when no higher level exists', () => {
    const g1 = goal({ id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 10 }, importance: 'medium' });
    const g2 = goal({ id: 'g2', crop: 'wheat', measure: 'quantity', amount: { kind: 'count', n: 10 }, importance: 'medium' });
    const ctx = makeCtx([g1, g2]);
    const placements = [place('apple'), place('wheat')];
    const reports = explainGoals(ctx, placements, placements.map(() => receiving()));
    expect(reports[0].reason).toBe('Shares space with other goals of the same importance.');
  });

  it('falls back to a generic reason when alone at its importance with no higher level', () => {
    const g = goal({ id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 10 } });
    const ctx = makeCtx([g]);
    const [report] = explainGoals(ctx, [place('apple')], [receiving()]);
    expect(report.reason).toBe('The planner could not fit more with the allowed crops and this arrangement.');
  });
});

describe('explainGoals', () => {
  it('returns one report per goal, in goal order, and defaults issues to empty', () => {
    const g1 = goal({ id: 'a', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 } });
    const g2 = goal({ id: 'b', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' } });
    const ctx = makeCtx([g1, g2]);
    const reports = explainGoals(ctx, [], []);
    expect(reports.map((r) => r.goalId)).toEqual(['a', 'b']);
    expect(reports.map((r) => r.label)).toEqual(['Apple · Quantity · At least 1', 'Wheat · Quantity · Maximize']);
  });
});
