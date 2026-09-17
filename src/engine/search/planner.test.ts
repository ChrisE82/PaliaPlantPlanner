import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../../data/crops';
import { buildGarden } from '../garden';
import { validatePlacements } from '../layout';
import { compareScores } from '../score';
import type { Goal, PlanProgress, PlanRequest, PlotPos } from '../types';
import { plan, runTasksSync } from './planner';

function twoPlots(): PlotPos[] {
  return [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
  ];
}

describe('planner.plan with runTasksSync', () => {
  it('custom arrangement returns valid solutions, sorted best first, labeled "Your arrangement"', async () => {
    const goals: Goal[] = [{ id: 'g1', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' }];
    const request: PlanRequest = {
      settings: {
        plotCount: 2,
        arrangement: { mode: 'custom', plots: twoPlots() },
        gardeningLevel: null,
        goals,
        helpers: ['wheat', 'carrot'],
      },
      seed: 42,
      timeBudgetMs: 500,
    };
    const progresses: PlanProgress[] = [];
    const result = await plan(request, runTasksSync, (p) => progresses.push(p));

    expect(result.solutions.length).toBeGreaterThan(0);
    expect(result.solutions.length).toBeLessThanOrEqual(3);
    expect(result.arrangementsTried).toBe(1);
    expect(progresses.length).toBeGreaterThan(0);

    for (const sol of result.solutions) {
      expect(sol.label).toBe('Your arrangement');
      const garden = buildGarden(sol.plots);
      expect(validatePlacements(garden, sol.placements, CROP_BY_ID)).toEqual([]);
    }
    for (let i = 1; i < result.solutions.length; i++) {
      expect(compareScores(result.solutions[i - 1].score, result.solutions[i].score)).toBeGreaterThanOrEqual(0);
    }
  }, 15000);

  it('suggest mode on 4 plots returns up to 3 solutions on different arrangements, sorted best first', async () => {
    const goals: Goal[] = [{ id: 'g1', crop: 'blueberry', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' }];
    const request: PlanRequest = {
      settings: {
        plotCount: 4,
        arrangement: { mode: 'suggest', maxWidth: null, maxHeight: null },
        gardeningLevel: null,
        goals,
        helpers: [],
      },
      seed: 7,
      timeBudgetMs: 2000,
    };
    const progresses: PlanProgress[] = [];
    const result = await plan(request, runTasksSync, (p) => progresses.push(p));

    expect(result.solutions.length).toBeGreaterThan(0);
    expect(result.solutions.length).toBeLessThanOrEqual(3);
    expect(result.arrangementsTried).toBeGreaterThan(0);

    const distinctArrangements = new Set(result.solutions.map((s) => JSON.stringify(s.plots)));
    expect(distinctArrangements.size).toBe(result.solutions.length);

    for (const sol of result.solutions) {
      const garden = buildGarden(sol.plots);
      expect(validatePlacements(garden, sol.placements, CROP_BY_ID)).toEqual([]);
    }
    for (let i = 1; i < result.solutions.length; i++) {
      expect(compareScores(result.solutions[i - 1].score, result.solutions[i].score)).toBeGreaterThanOrEqual(0);
    }
    expect(progresses.some((p) => p.stage === 'screening')).toBe(true);
    expect(progresses.some((p) => p.stage === 'finishing')).toBe(true);
  }, 20000);

  it('fixed mode keeps locked placements (even a crop outside the allowed set), labeled "Current arrangement"', async () => {
    const plots = twoPlots();
    const goals: Goal[] = [{ id: 'g1', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' }];
    const request: PlanRequest = {
      settings: {
        plotCount: 2,
        arrangement: { mode: 'custom', plots },
        gardeningLevel: null,
        goals,
        helpers: ['wheat'],
      },
      seed: 1,
      timeBudgetMs: 500,
      fixed: {
        plots,
        placements: [{ cropId: 'carrot', x: 0, y: 0 }],
        lockedTiles: [{ x: 0, y: 0 }],
      },
    };
    const result = await plan(request, runTasksSync, () => {});

    expect(result.solutions.length).toBeGreaterThan(0);
    for (const sol of result.solutions) {
      expect(sol.label).toBe('Current arrangement');
      expect(sol.placements).toContainEqual({ cropId: 'carrot', x: 0, y: 0 });
      const garden = buildGarden(sol.plots);
      expect(validatePlacements(garden, sol.placements, CROP_BY_ID)).toEqual([]);
    }
  }, 15000);

  it('rejects with an AbortError DOMException when the signal is already aborted', async () => {
    const goals: Goal[] = [{ id: 'g1', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' }];
    const request: PlanRequest = {
      settings: {
        plotCount: 4,
        arrangement: { mode: 'suggest', maxWidth: null, maxHeight: null },
        gardeningLevel: null,
        goals,
        helpers: [],
      },
      seed: 1,
      timeBudgetMs: 5000,
    };
    const controller = new AbortController();
    controller.abort();

    await expect(plan(request, runTasksSync, () => {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects when the signal aborts partway through a suggest-mode run', async () => {
    const goals: Goal[] = [{ id: 'g1', crop: 'blueberry', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' }];
    const request: PlanRequest = {
      settings: {
        plotCount: 6,
        arrangement: { mode: 'suggest', maxWidth: null, maxHeight: null },
        gardeningLevel: null,
        goals,
        helpers: [],
      },
      seed: 1,
      timeBudgetMs: 8000,
    };
    const controller = new AbortController();
    let seenProgress = false;
    const promise = plan(
      request,
      runTasksSync,
      () => {
        if (!seenProgress) {
          seenProgress = true;
          controller.abort();
        }
      },
      controller.signal,
    );
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(seenProgress).toBe(true);
  }, 15000);
});
