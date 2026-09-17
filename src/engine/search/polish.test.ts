import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../../data/crops';
import { buildGarden } from '../garden';
import { compareScores } from '../score';
import type { Goal } from '../types';
import { createScoreVector, Evaluator } from './evaluate';
import { greedyFill } from './greedy';
import { polish } from './polish';
import { compileProblem } from './problem';
import { Rng } from './rng';
import { LayoutState } from './state';

function setup(goals: Goal[], helpers: string[], lockedTiles = [] as { x: number; y: number }[]) {
  const garden = buildGarden([
    { x: 0, y: 0 },
    { x: 3, y: 0 },
  ]);
  const problem = compileProblem({ garden, goals, helpers, cropsById: CROP_BY_ID, fixed: { placements: [], lockedTiles } });
  return { problem, evaluator: new Evaluator(problem), state: new LayoutState(problem) };
}

describe('polish', () => {
  it('turns helper tiles into the Maximize crop when nothing else needs them', () => {
    const goals: Goal[] = [{ id: 'g', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' }];
    const { problem, evaluator, state } = setup(goals, ['carrot', 'potato']);
    const carrot = problem.allowedBySize[0].find((c) => problem.cropIds[c] === 'carrot')!;
    for (const tile of problem.soilTiles) state.place(carrot, tile);

    polish(problem, state, evaluator, new Rng(1), Number.POSITIVE_INFINITY);

    expect(state.toPlacements().every((p) => p.cropId === 'wheat')).toBe(true);
  });

  it('never returns a worse score than it started with, and reports the real score', () => {
    const goals: Goal[] = [
      { id: 'g1', crop: 'tomato', measure: 'quantity', amount: { kind: 'max' }, importance: 'medium' },
      { id: 'g2', crop: 'tomato', measure: 'waterRetain', amount: { kind: 'all' }, importance: 'high' },
    ];
    for (let seed = 1; seed <= 20; seed++) {
      const { problem, evaluator, state } = setup(goals, ['potato', 'carrot', 'wheat']);
      const rng = new Rng(seed);
      greedyFill(problem, state, rng);
      const before = createScoreVector();
      evaluator.evaluate(state, before);

      const reported = polish(problem, state, evaluator, rng, Number.POSITIVE_INFINITY);
      const after = createScoreVector();
      evaluator.evaluate(state, after);

      expect(compareScores(after, before)).toBeGreaterThanOrEqual(0);
      expect(compareScores(reported, after)).toBe(0);
    }
  });

  it('leaves locked tiles alone', () => {
    const goals: Goal[] = [{ id: 'g', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' }];
    const { problem, evaluator, state } = setup(goals, ['carrot'], [{ x: 0, y: 0 }]);
    const carrot = problem.allowedBySize[0].find((c) => problem.cropIds[c] === 'carrot')!;
    for (const tile of problem.soilTiles) state.place(carrot, tile);

    polish(problem, state, evaluator, new Rng(2), Number.POSITIVE_INFINITY);

    const atLock = state.toPlacements().find((p) => p.x === 0 && p.y === 0);
    expect(atLock?.cropId).toBe('carrot');
  });
});
