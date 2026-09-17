import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../data/crops';
import { computeBuffs } from './buffs';
import { buildGarden } from './garden';
import { compareScores, goalScore, layoutStats, makeScoreContext, scoreLayout, SCORE_EPSILON, SCORE_LABELS } from './score';
import { ALL_GOAL_CROPS, buffBit, type CropId, type Goal, type Placement, type PlacementBuffs } from './types';

function goal(partial: Partial<Goal> & Pick<Goal, 'crop' | 'measure' | 'amount'>): Goal {
  return { id: `goal-${Math.random()}`, importance: 'medium', ...partial };
}

function place(cropId: CropId, x = 0, y = 0): Placement {
  return { cropId, x, y };
}

/** Hand-built PlacementBuffs: no dependency on buffs.ts (computeBuffs). */
function receiving(mask = 0): PlacementBuffs {
  return { contacts: [0, 0, 0, 0, 0], receivedMask: mask };
}

const onePlot = [{ x: 0, y: 0 }];
const twoPlots = [{ x: 0, y: 0 }, { x: 3, y: 0 }];

function makeCtx(goals: Goal[], plots = onePlot) {
  return makeScoreContext(buildGarden(plots), goals, CROP_BY_ID);
}

describe('goalScore', () => {
  it('quantity count: min(plants, n) / n, partial', () => {
    const g = goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 } });
    const ctx = makeCtx([g]);
    const stats = layoutStats(ctx, [place('apple'), place('apple')], [receiving(), receiving()]);
    expect(goalScore(ctx, g, stats)).toBeCloseTo(0.5);
  });

  it('quantity count: caps at 1 when plants exceed n', () => {
    const g = goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 } });
    const ctx = makeCtx([g]);
    const placements = Array.from({ length: 5 }, () => place('apple'));
    const stats = layoutStats(ctx, placements, placements.map(() => receiving()));
    expect(goalScore(ctx, g, stats)).toBe(1);
  });

  it('quantity count: 0 with no plants', () => {
    const g = goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 } });
    const ctx = makeCtx([g]);
    const stats = layoutStats(ctx, [], []);
    expect(goalScore(ctx, g, stats)).toBe(0);
  });

  it('quantity max: tiles(c) / garden.tileCount, partial', () => {
    const g = goal({ crop: 'wheat', measure: 'quantity', amount: { kind: 'max' } });
    const ctx = makeCtx([g]); // 1 plot = 9 tiles
    const placements = Array.from({ length: 3 }, () => place('wheat'));
    const stats = layoutStats(ctx, placements, placements.map(() => receiving()));
    expect(goalScore(ctx, g, stats)).toBeCloseTo(3 / 9);
  });

  it('quantity max: 1 when the crop fills the garden', () => {
    const g = goal({ crop: 'wheat', measure: 'quantity', amount: { kind: 'max' } });
    const ctx = makeCtx([g]);
    const placements = Array.from({ length: 9 }, () => place('wheat'));
    const stats = layoutStats(ctx, placements, placements.map(() => receiving()));
    expect(goalScore(ctx, g, stats)).toBe(1);
  });

  it('quantity max: 0 with no plants', () => {
    const g = goal({ crop: 'wheat', measure: 'quantity', amount: { kind: 'max' } });
    const ctx = makeCtx([g]);
    const stats = layoutStats(ctx, [], []);
    expect(goalScore(ctx, g, stats)).toBe(0);
  });

  it('buff all: buffed / plants, partial', () => {
    const g = goal({ crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' } });
    const ctx = makeCtx([g]);
    const mask = buffBit('harvestBoost');
    const placements = [place('apple'), place('apple'), place('apple'), place('apple')];
    const buffs = [receiving(mask), receiving(mask), receiving(mask), receiving(0)];
    const stats = layoutStats(ctx, placements, buffs);
    expect(goalScore(ctx, g, stats)).toBeCloseTo(0.75);
  });

  it('buff all: 0 (not NaN) with no plants of that crop', () => {
    const g = goal({ crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' } });
    const ctx = makeCtx([g]);
    const stats = layoutStats(ctx, [], []);
    expect(goalScore(ctx, g, stats)).toBe(0);
  });

  it('buff all on ALL_GOAL_CROPS: sums buffed and plants across every goal crop', () => {
    const goals = [
      goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 } }),
      goal({ crop: 'wheat', measure: 'quantity', amount: { kind: 'count', n: 1 } }),
    ];
    const g = goal({ crop: ALL_GOAL_CROPS, measure: 'waterRetain', amount: { kind: 'all' } });
    const ctx = makeCtx([...goals, g]); // goalCrops = {apple, wheat}
    const mask = buffBit('waterRetain');
    const placements = [place('apple'), place('apple'), place('wheat'), place('wheat'), place('wheat')];
    const buffs = [receiving(mask), receiving(0), receiving(mask), receiving(mask), receiving(0)];
    const stats = layoutStats(ctx, placements, buffs);
    // P = 2 apples + 3 wheat = 5; B = 1 buffed apple + 2 buffed wheat = 3.
    expect(goalScore(ctx, g, stats)).toBeCloseTo(0.6);
  });

  it('buff count: min(buffed, n) / n, partial', () => {
    const g = goal({ crop: 'apple', measure: 'harvestBoost', amount: { kind: 'count', n: 3 } });
    const ctx = makeCtx([g]);
    const mask = buffBit('harvestBoost');
    const placements = [place('apple'), place('apple'), place('apple')];
    const buffs = [receiving(mask), receiving(0), receiving(0)];
    const stats = layoutStats(ctx, placements, buffs);
    expect(goalScore(ctx, g, stats)).toBeCloseTo(1 / 3);
  });

  it('buff count: caps at 1 when buffed exceeds n', () => {
    const g = goal({ crop: 'apple', measure: 'harvestBoost', amount: { kind: 'count', n: 3 } });
    const ctx = makeCtx([g]);
    const mask = buffBit('harvestBoost');
    const placements = Array.from({ length: 5 }, () => place('apple'));
    const buffs = placements.map(() => receiving(mask));
    const stats = layoutStats(ctx, placements, buffs);
    expect(goalScore(ctx, g, stats)).toBe(1);
  });

  it('buff count: 0 with no plants buffed', () => {
    const g = goal({ crop: 'apple', measure: 'harvestBoost', amount: { kind: 'count', n: 3 } });
    const ctx = makeCtx([g]);
    const placements = [place('apple')];
    const stats = layoutStats(ctx, placements, [receiving(0)]);
    expect(goalScore(ctx, g, stats)).toBe(0);
  });

  it('buff count on ALL_GOAL_CROPS: sums buffed across every goal crop, capped at n', () => {
    const goals = [
      goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 } }),
      goal({ crop: 'wheat', measure: 'quantity', amount: { kind: 'count', n: 1 } }),
    ];
    const g = goal({ crop: ALL_GOAL_CROPS, measure: 'waterRetain', amount: { kind: 'count', n: 2 } });
    const ctx = makeCtx([...goals, g]);
    const mask = buffBit('waterRetain');
    const placements = [place('apple'), place('wheat'), place('wheat')];
    const buffs = [receiving(mask), receiving(mask), receiving(mask)];
    const stats = layoutStats(ctx, placements, buffs);
    // B = 1 (apple) + 2 (wheat) = 3, capped at n = 2.
    expect(goalScore(ctx, g, stats)).toBe(1);
  });
});

describe('layoutStats', () => {
  it('computes filledTiles, goalCropBuffs and goalCropTiles', () => {
    const goals = [goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 } })];
    const ctx = makeCtx(goals, twoPlots); // goalCrops = {apple}; wheat is a helper, not a goal crop
    const placements = [place('apple'), place('wheat', 3, 0)];
    const buffs = [receiving(buffBit('harvestBoost') | buffBit('waterRetain')), receiving(buffBit('harvestBoost'))];
    const stats = layoutStats(ctx, placements, buffs);

    expect(stats.filledTiles).toBe(9 + 1); // apple (3x3) + wheat (1x1)
    expect(stats.goalCropTiles).toBe(9); // apple only; wheat is a helper
    expect(stats.goalCropBuffs).toBe(2); // apple's 2 set bits; wheat's buff doesn't count
    expect(stats.plants.get('apple')).toBe(1);
    expect(stats.tiles.get('apple')).toBe(9);
    expect(stats.buffed.get('wheat')).toEqual([0, 0, 1, 0, 0]); // harvestBoost is index 2
  });

  it('returns empty stats for no placements', () => {
    const ctx = makeCtx([]);
    const stats = layoutStats(ctx, [], []);
    expect(stats).toEqual({ plants: new Map(), tiles: new Map(), buffed: new Map(), filledTiles: 0, goalCropBuffs: 0, goalCropTiles: 0 });
  });
});

describe('scoreLayout', () => {
  it('returns an 11-number vector, matching SCORE_LABELS length', () => {
    const goals = [
      goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 }, importance: 'must' }),
      goal({ crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' }),
    ];
    const ctx = makeCtx(goals);
    const vector = scoreLayout(ctx, [place('apple')], [receiving()]);
    expect(vector).toHaveLength(11);
    expect(SCORE_LABELS).toHaveLength(11);
  });

  it('sums targets goals and sums sqrt(score) of maximize goals within one level', () => {
    const goals = [
      goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 2 }, importance: 'must' }),
      goal({ crop: 'apple', measure: 'harvestBoost', amount: { kind: 'count', n: 2 }, importance: 'must' }),
      goal({ crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'must' }),
    ];
    const ctx = makeCtx(goals);
    const placements = [place('apple'), place('wheat')];
    const buffs = [receiving(buffBit('harvestBoost')), receiving()];
    const vector = scoreLayout(ctx, placements, buffs);
    // targets = 1/2 (quantity count) + 1/2 (buff count) = 1; maximize = sqrt(1/9).
    expect(vector[0]).toBeCloseTo(1);
    expect(vector[1]).toBeCloseTo(Math.sqrt(1 / 9));
  });

  it('two maximize goals at one level: an even split of tiles scores higher than giving all tiles to one', () => {
    const goals = [
      goal({ crop: 'tomato', measure: 'quantity', amount: { kind: 'max' }, importance: 'medium' }),
      goal({ crop: 'potato', measure: 'quantity', amount: { kind: 'max' }, importance: 'medium' }),
    ];
    const ctx = makeCtx(goals, twoPlots); // 18 tiles
    const evenPlacements = [...Array(9).fill('tomato'), ...Array(9).fill('potato')].map((id) => place(id));
    const allToOnePlacements = Array.from({ length: 18 }, () => place('tomato'));

    const evenVector = scoreLayout(ctx, evenPlacements, evenPlacements.map(() => receiving()));
    const allToOneVector = scoreLayout(ctx, allToOnePlacements, allToOnePlacements.map(() => receiving()));

    // Medium maximize is index 5.
    expect(evenVector[5]).toBeCloseTo(2 * Math.sqrt(0.5));
    expect(allToOneVector[5]).toBeCloseTo(1);
    expect(evenVector[5]).toBeGreaterThan(allToOneVector[5]);
  });

  it('a higher importance level beats any amount of lower-level score', () => {
    const lowCrops = ['tomato', 'potato', 'napa-cabbage', 'rice', 'carrot'];
    const goals = [
      goal({ crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 1 }, importance: 'must' }),
      ...lowCrops.map((crop) => goal({ crop, measure: 'quantity', amount: { kind: 'count', n: 1 }, importance: 'low' })),
    ];
    const ctx = makeCtx(goals);

    // Layout A: the must goal is met; none of the low goals are.
    const vectorA = scoreLayout(ctx, [place('apple')], [receiving()]);
    // Layout B: the must goal is unmet; every low goal is met.
    const placementsB = lowCrops.map((crop) => place(crop));
    const vectorB = scoreLayout(ctx, placementsB, placementsB.map(() => receiving()));

    expect(vectorA[0]).toBe(1); // must targets
    expect(vectorB[6]).toBe(5); // low targets: 5 goals fully met
    expect(compareScores(vectorA, vectorB)).toBeGreaterThan(0);
  });
});

describe('compareScores', () => {
  it('returns 0 for identical vectors', () => {
    expect(compareScores([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('is positive when a is better and negative when b is better', () => {
    expect(compareScores([1], [0])).toBeGreaterThan(0);
    expect(compareScores([0], [1])).toBeLessThan(0);
  });

  it('compares a level\'s targets entry (earlier index) before its maximize entry', () => {
    // Index 0 = Must targets, index 1 = Must maximize.
    const higherTargets = [0.9, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const higherMaximize = [0.5, 0.9, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(compareScores(higherTargets, higherMaximize)).toBeGreaterThan(0);
  });

  it('treats differences within SCORE_EPSILON as tied', () => {
    const a = [1, 0.5];
    const b = [1, 0.5 + SCORE_EPSILON / 2];
    expect(compareScores(a, b)).toBe(0);
  });

  it('decides on differences larger than SCORE_EPSILON', () => {
    const a = [1, 0.5 + SCORE_EPSILON * 10];
    const b = [1, 0.5];
    expect(compareScores(a, b)).toBeGreaterThan(0);
  });

  it('falls back to the tie-breakers in order: filled tiles, goal crop buffs, goal crop tiles', () => {
    const level = [0, 0, 0, 0, 0, 0, 0, 0];
    expect(compareScores([...level, 5, 0, 0], [...level, 3, 0, 0])).toBeGreaterThan(0);
    expect(compareScores([...level, 5, 1, 0], [...level, 5, 0, 0])).toBeGreaterThan(0);
    expect(compareScores([...level, 5, 1, 9], [...level, 5, 1, 3])).toBeGreaterThan(0);
  });
});

describe('integration with buffs.ts (computeBuffs)', () => {
  // PLAN.md section 3, rule 6's worked example: an apple with 3 touching
  // tiles giving Harvest Boost receives it (the size-3 threshold is 3).
  it('scores a goal using real PlacementBuffs from computeBuffs', () => {
    const garden = buildGarden([{ x: 0, y: 0 }, { x: 3, y: 0 }]); // two plots, apple fills the first
    const placements: Placement[] = [
      { cropId: 'apple', x: 0, y: 0 },
      { cropId: 'wheat', x: 3, y: 0 },
      { cropId: 'wheat', x: 3, y: 1 },
      { cropId: 'wheat', x: 3, y: 2 },
    ];
    const buffs = computeBuffs(garden, placements, CROP_BY_ID);
    expect(buffs).toHaveLength(4);
    expect(buffs[0].receivedMask & buffBit('harvestBoost')).not.toBe(0); // apple: 3 wheat contacts

    const g = goal({ crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' } });
    const ctx = makeScoreContext(garden, [g], CROP_BY_ID);
    const stats = layoutStats(ctx, placements, buffs);
    expect(goalScore(ctx, g, stats)).toBe(1); // the one apple plant, and it received the buff
  });
});
