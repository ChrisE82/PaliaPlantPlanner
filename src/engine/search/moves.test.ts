import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../../data/crops';
import { enumerateArrangements } from '../arrangement';
import { buildGarden } from '../garden';
import { validatePlacements } from '../layout';
import type { Goal, TilePos } from '../types';
import { greedyFill } from './greedy';
import { applyRandomMove, resolveMoveWeights } from './moves';
import { compileProblem } from './problem';
import { Rng } from './rng';
import { LayoutState } from './state';

const GOALS: Goal[] = [
  { id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' },
  { id: 'g2', crop: 'blueberry', measure: 'quantity', amount: { kind: 'count', n: 3 }, importance: 'medium' },
];
const HELPERS = ['wheat', 'carrot', 'cotton'];

describe('moves property test', () => {
  it('hundreds of random moves keep the layout valid, respect locks, and only use allowed crops', () => {
    fc.assert(
      fc.property(
        fc.record({
          plotCount: fc.integer({ min: 1, max: 4 }),
          arrangementSeed: fc.nat(),
          seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
          lockSeed: fc.nat(),
        }),
        (c) => {
          const arrangements = enumerateArrangements(c.plotCount);
          const plots = arrangements[c.arrangementSeed % arrangements.length];
          const garden = buildGarden(plots);

          const rng = new Rng(c.seed);
          // Build an initial (unlocked) greedy layout, then lock a random
          // subset of its placements, the way planner.ts seeds a fixed run.
          const scratchProblem = compileProblem({ garden, goals: GOALS, helpers: HELPERS, cropsById: CROP_BY_ID });
          const scratchState = new LayoutState(scratchProblem);
          greedyFill(scratchProblem, scratchState, rng);
          const initialPlacements = scratchState.toPlacements();

          const lockRng = new Rng(c.lockSeed);
          const lockedTiles: TilePos[] = [];
          for (const p of initialPlacements) {
            if (lockRng.float() < 0.3) lockedTiles.push({ x: p.x, y: p.y });
          }

          const problem = compileProblem({
            garden,
            goals: GOALS,
            helpers: HELPERS,
            cropsById: CROP_BY_ID,
            fixed: { placements: initialPlacements, lockedTiles },
          });
          const state = new LayoutState(problem);
          state.loadPlacements(initialPlacements);

          const snapshotLocked = () => {
            const locked: { cropId: string; anchor: number }[] = [];
            for (let slot = 0; slot < state.slotCount; slot++) {
              if (state.slotCrop[slot] >= 0 && state.slotLocked[slot] === 1) {
                locked.push({ cropId: problem.cropIds[state.slotCrop[slot]], anchor: state.slotAnchor[slot] });
              }
            }
            return locked;
          };
          const lockedBefore = snapshotLocked();
          expect(lockedBefore.length).toBeGreaterThanOrEqual(0); // sanity: doesn't throw

          const weights = resolveMoveWeights(problem);
          for (let i = 0; i < 300; i++) {
            applyRandomMove(problem, state, rng, weights);

            const placements = state.toPlacements();
            expect(validatePlacements(garden, placements, CROP_BY_ID)).toEqual([]);

            for (const p of placements) {
              const idx = problem.cropIndexOf.get(p.cropId);
              expect(idx).toBeDefined();
              // Greedy only ever plants allowed crops, and moves never
              // introduce a crop outside the allowed set, so every crop in
              // play (locked or not) must be allowed.
              expect(problem.isAllowed[idx!]).toBe(1);
            }
          }

          const key = (l: { cropId: string; anchor: number }) => `${l.cropId}:${l.anchor}`;
          expect(new Set(snapshotLocked().map(key))).toEqual(new Set(lockedBefore.map(key)));
        },
      ),
      { numRuns: 30 },
    );
  });
});
