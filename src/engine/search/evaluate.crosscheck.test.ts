/**
 * Property test: the fast Evaluator must agree with the reference
 * implementation, scoreLayout(makeScoreContext(...), placements,
 * computeBuffs(...)), on every random garden, goal set and layout.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CROP_BY_ID, CROPS } from '../../data/crops';
import { enumerateArrangements } from '../arrangement';
import { computeBuffs } from '../buffs';
import { buildGarden } from '../garden';
import { makeScoreContext, scoreLayout } from '../score';
import type { BuffId, Goal, GoalAmount, Importance } from '../types';
import { Evaluator, createScoreVector } from './evaluate';
import { greedyFill } from './greedy';
import { applyRandomMove, resolveMoveWeights } from './moves';
import { compileProblem } from './problem';
import { Rng } from './rng';
import { LayoutState } from './state';

const CROP_IDS = CROPS.map((c) => c.id);
const BUFF_IDS: BuffId[] = ['waterRetain', 'weedBlock', 'harvestBoost', 'qualityBoost', 'growthBoost'];
const IMPORTANCES: Importance[] = ['must', 'high', 'medium', 'low'];

interface RawGoal {
  cropIsWildcard: boolean;
  crop: string;
  isBuff: boolean;
  buff: BuffId;
  amountKind: 'count' | 'max' | 'all';
  n: number;
  importance: Importance;
}

const rawGoalArb: fc.Arbitrary<RawGoal> = fc.record({
  cropIsWildcard: fc.boolean(),
  crop: fc.constantFrom(...CROP_IDS),
  isBuff: fc.boolean(),
  buff: fc.constantFrom(...BUFF_IDS),
  amountKind: fc.constantFrom<'count' | 'max' | 'all'>('count', 'max', 'all'),
  n: fc.integer({ min: 1, max: 8 }),
  importance: fc.constantFrom(...IMPORTANCES),
});

/** Turns the raw record into a structurally valid Goal (fixing invalid measure/amount combos). */
function fixGoal(raw: RawGoal, index: number): Goal {
  const measure = raw.isBuff ? raw.buff : ('quantity' as const);
  const crop = raw.isBuff && raw.cropIsWildcard ? ('*' as const) : raw.crop;
  let kind = raw.amountKind;
  if (!raw.isBuff && kind === 'all') kind = 'count';
  if (raw.isBuff && kind === 'max') kind = 'count';
  const amount: GoalAmount = kind === 'max' ? { kind: 'max' } : kind === 'all' ? { kind: 'all' } : { kind: 'count', n: raw.n };
  return { id: `g${index}`, crop, measure, amount, importance: raw.importance };
}

const goalsArb = fc.array(rawGoalArb, { maxLength: 6 }).map((raws) => raws.map((r, i) => fixGoal(r, i)));
const helpersArb = fc.uniqueArray(fc.constantFrom(...CROP_IDS), { maxLength: 5 });

const caseArb = fc.record({
  plotCount: fc.integer({ min: 1, max: 4 }),
  arrangementSeed: fc.nat(),
  goals: goalsArb,
  helpers: helpersArb,
  seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  moveCount: fc.integer({ min: 0, max: 25 }),
});

describe('Evaluator matches scoreLayout + computeBuffs (property)', () => {
  it('agrees on random gardens, goals and layouts reached by greedy fill + random moves', () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        const arrangements = enumerateArrangements(c.plotCount);
        const plots = arrangements[c.arrangementSeed % arrangements.length];
        const garden = buildGarden(plots);
        const problem = compileProblem({ garden, goals: c.goals, helpers: c.helpers, cropsById: CROP_BY_ID });

        const rng = new Rng(c.seed);
        const state = new LayoutState(problem);
        greedyFill(problem, state, rng);
        const weights = resolveMoveWeights(problem);
        for (let i = 0; i < c.moveCount; i++) applyRandomMove(problem, state, rng, weights);

        const evaluator = new Evaluator(problem);
        const fastScore = createScoreVector();
        evaluator.evaluate(state, fastScore);

        const placements = state.toPlacements();
        const ctx = makeScoreContext(garden, c.goals, CROP_BY_ID);
        const buffs = computeBuffs(garden, placements, CROP_BY_ID);
        const refScore = scoreLayout(ctx, placements, buffs);

        expect(fastScore.length).toBe(refScore.length);
        for (let i = 0; i < fastScore.length; i++) {
          expect(Math.abs(fastScore[i] - refScore[i])).toBeLessThan(1e-9);
        }
      }),
      { numRuns: 300 },
    );
  });
});
