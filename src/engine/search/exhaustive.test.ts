/**
 * Exhaustive check (PLAN.md 5.4): on a garden small enough to try every
 * possible layout, the true best score (found by brute-force DFS, scored
 * with the same Evaluator the search uses) must equal what optimizeArrangement
 * actually reaches with a fixed seed.
 */
import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../../data/crops';
import { buildGarden } from '../garden';
import { compareScores } from '../score';
import type { Goal, ScoreVector } from '../types';
import { Evaluator, createScoreVector } from './evaluate';
import { optimizeArrangement } from './planner';
import { compileProblem } from './problem';
import { LayoutState } from './state';

describe('exhaustive: 1 plot, 3 allowed crops (one 2x2), a few goals', () => {
  it('optimizeArrangement reaches exactly the DFS-found optimum', () => {
    const garden = buildGarden([{ x: 0, y: 0 }]);
    const goals: Goal[] = [
      { id: 'g1', crop: 'blueberry', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'high' },
      { id: 'g2', crop: 'blueberry', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' },
      { id: 'g3', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'medium' },
    ];
    const helpers = ['wheat', 'carrot'];
    const problem = compileProblem({ garden, goals, helpers, cropsById: CROP_BY_ID });
    const state = new LayoutState(problem);
    const evaluator = new Evaluator(problem);

    const oneByOne = helpers.map((id) => problem.cropIndexOf.get(id)!);
    const blueberryIdx = problem.cropIndexOf.get('blueberry')!;

    let best: ScoreVector | null = null;
    const candidate = createScoreVector();
    let leaves = 0;

    function dfs(tile: number): void {
      if (tile >= problem.tileCount) {
        leaves++;
        evaluator.evaluate(state, candidate);
        if (best === null || compareScores(candidate, best) > 0) best = candidate.slice();
        return;
      }
      if (state.tileSlot[tile] !== -1) {
        dfs(tile + 1); // covered by an earlier 2x2 placement
        return;
      }

      dfs(tile + 1); // leave empty

      for (const cropIdx of oneByOne) {
        const slot = state.place(cropIdx, tile);
        dfs(tile + 1);
        state.remove(slot);
      }

      if (problem.anchorSlotBySize[1][tile] !== -1 && state.isFootprintFree(2, tile)) {
        const slot = state.place(blueberryIdx, tile);
        dfs(tile + 1);
        state.remove(slot);
      }
    }

    dfs(0);
    expect(leaves).toBeGreaterThan(0);
    expect(best).not.toBeNull();
    const trueBest = best as unknown as ScoreVector;

    const result = optimizeArrangement({
      taskId: 0,
      plots: garden.plots,
      goals,
      helpers,
      seed: 20260917,
      restarts: 6,
      iterationsPerRestart: 4000,
      timeLimitMs: 3000,
      keep: 1,
    });

    expect(result.solutions.length).toBeGreaterThan(0);
    const reached = result.solutions[0].score;
    for (let i = 0; i < trueBest.length; i++) {
      expect(reached[i]).toBeCloseTo(trueBest[i], 9);
    }
    expect(compareScores(reached, trueBest)).toBe(0);
  });
});
