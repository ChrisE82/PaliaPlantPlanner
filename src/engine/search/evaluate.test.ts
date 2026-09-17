import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../../data/crops';
import { buildGarden } from '../garden';
import type { Garden, Goal } from '../types';
import { Evaluator, createScoreVector } from './evaluate';
import { compileProblem } from './problem';
import { LayoutState } from './state';

function block3x3(): Garden {
  const plots = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) plots.push({ x: x * 3, y: y * 3 });
  return buildGarden(plots);
}

/** An all-soil w x h grid as one fake plot, for testing buff geometry directly (PLAN.md section 3's own diagrams aren't plot-aligned). */
function openField(width: number, height: number): Garden {
  return {
    plots: [{ x: 0, y: 0 }],
    width,
    height,
    soil: new Uint8Array(width * height).fill(1),
    plotOf: new Int16Array(width * height).fill(0),
    tileCount: width * height,
  };
}

describe('Evaluator: hand-checked scenarios', () => {
  it('scores an empty layout as all zero', () => {
    const garden = block3x3();
    const goals: Goal[] = [{ id: 'g1', crop: 'wheat', measure: 'quantity', amount: { kind: 'count', n: 5 }, importance: 'high' }];
    const problem = compileProblem({ garden, goals, helpers: ['wheat'], cropsById: CROP_BY_ID });
    const state = new LayoutState(problem);
    const evaluator = new Evaluator(problem);
    const score = createScoreVector();
    evaluator.evaluate(state, score);
    expect(score).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('quantity count goal: min(plants, n) / n', () => {
    const garden = block3x3();
    const goals: Goal[] = [{ id: 'g1', crop: 'wheat', measure: 'quantity', amount: { kind: 'count', n: 4 }, importance: 'high' }];
    const problem = compileProblem({ garden, goals, helpers: ['wheat'], cropsById: CROP_BY_ID });
    const state = new LayoutState(problem);
    const wheatIdx = problem.cropIndexOf.get('wheat')!;
    for (let i = 0; i < 3; i++) state.place(wheatIdx, i); // 3 of 4 wanted
    const evaluator = new Evaluator(problem);
    const score = createScoreVector();
    evaluator.evaluate(state, score);
    // High targets index = 2
    expect(score[2]).toBeCloseTo(3 / 4, 9);
    expect(score[8]).toBe(3); // filled tiles
  });

  it('quantity max goal: tiles(c) / garden.tileCount, summed as sqrt', () => {
    const garden = block3x3(); // 81 tiles
    const goals: Goal[] = [{ id: 'g1', crop: 'blueberry', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' }];
    const problem = compileProblem({ garden, goals, helpers: [], cropsById: CROP_BY_ID });
    const state = new LayoutState(problem);
    const blueberryIdx = problem.cropIndexOf.get('blueberry')!;
    state.place(blueberryIdx, 0); // one 2x2 = 4 tiles
    const evaluator = new Evaluator(problem);
    const score = createScoreVector();
    evaluator.evaluate(state, score);
    // High maximize index = 3; goalScore = 4/81, vector holds sqrt of it.
    expect(score[3]).toBeCloseTo(Math.sqrt(4 / 81), 9);
  });

  it('buff all/count goals use the receive threshold, matching the PLAN.md rule-6 diagram', () => {
    // . C C . .
    // . A A A .
    // W A A A .
    // . A A A .
    // . . . . .
    const garden = openField(5, 5);
    const goals: Goal[] = [
      { id: 'g1', crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'high' },
    ];
    const problem = compileProblem({ garden, goals, helpers: ['corn', 'wheat'], cropsById: CROP_BY_ID });
    const state = new LayoutState(problem);
    state.loadPlacements([
      { cropId: 'apple', x: 1, y: 1 },
      { cropId: 'corn', x: 1, y: 0 },
      { cropId: 'corn', x: 2, y: 0 },
      { cropId: 'wheat', x: 0, y: 2 },
    ]);
    const evaluator = new Evaluator(problem);
    const score = createScoreVector();
    evaluator.evaluate(state, score);
    // 3 touching Harvest Boost givers (2 Corn + 1 Wheat) meets the 3x3 threshold of 3.
    expect(score[2]).toBeCloseTo(1, 9); // High targets: B/P = 1/1
    expect(score[9]).toBe(1); // goalCropBuffs: the apple received exactly 1 buff
    expect(score[10]).toBe(9); // goalCropTiles: the apple's 3x3 footprint

    // Remove one Corn: only 2 touching tiles give Harvest Boost, below the threshold of 3.
    const state2 = new LayoutState(problem);
    state2.loadPlacements([
      { cropId: 'apple', x: 1, y: 1 },
      { cropId: 'corn', x: 1, y: 0 },
      { cropId: 'wheat', x: 0, y: 2 },
    ]);
    const score2 = createScoreVector();
    evaluator.evaluate(state2, score2);
    expect(score2[2]).toBeCloseTo(0, 9);
    expect(score2[9]).toBe(0);
  });

  it('a crop is never buffed by another placement of its own type', () => {
    const garden = openField(3, 1);
    const goals: Goal[] = [{ id: 'g1', crop: 'wheat', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'high' }];
    const problem = compileProblem({ garden, goals, helpers: [], cropsById: CROP_BY_ID });
    const state = new LayoutState(problem);
    // Two Wheat next to each other: Wheat gives Harvest Boost, but not to its own type.
    state.loadPlacements([
      { cropId: 'wheat', x: 0, y: 0 },
      { cropId: 'wheat', x: 1, y: 0 },
    ]);
    const evaluator = new Evaluator(problem);
    const score = createScoreVector();
    evaluator.evaluate(state, score);
    expect(score[2]).toBeCloseTo(0, 9); // neither Wheat receives Harvest Boost from the other
  });

  it("buff goal on ALL_GOAL_CROPS ('*') aggregates plants and buffed counts across every goal crop", () => {
    const garden = openField(4, 1);
    const goals: Goal[] = [
      { id: 'g1', crop: 'wheat', measure: 'quantity', amount: { kind: 'count', n: 1 }, importance: 'low' },
      { id: 'g2', crop: 'rice', measure: 'quantity', amount: { kind: 'count', n: 1 }, importance: 'low' },
      { id: 'g3', crop: '*', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'must' },
    ];
    const problem = compileProblem({ garden, goals, helpers: ['corn'], cropsById: CROP_BY_ID });
    const state = new LayoutState(problem);
    // Wheat at 0, Rice at 1: neither touches a Harvest Boost giver other than each other,
    // but Wheat and Rice are different types that both give Harvest Boost, so each buffs the other.
    // Corn at 3 is isolated (not adjacent to tile 2, which stays empty) so it gets nothing itself,
    // and it is not a goal crop so it must not count toward P or B.
    state.loadPlacements([
      { cropId: 'wheat', x: 0, y: 0 },
      { cropId: 'rice', x: 1, y: 0 },
      { cropId: 'corn', x: 3, y: 0 },
    ]);
    const evaluator = new Evaluator(problem);
    const score = createScoreVector();
    evaluator.evaluate(state, score);
    // Must targets index = 0: P = 2 (wheat + rice), B = 2 (both receive Harvest Boost) -> 1.
    expect(score[0]).toBeCloseTo(1, 9);
  });
});
