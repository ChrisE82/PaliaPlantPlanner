import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGarden } from '../engine/garden';
import { validatePlacements } from '../engine/layout';
import { optimizeArrangement, type OptimizeTask } from '../engine/search/planner';
import type { Goal, PlanRequest } from '../engine/types';
import { CROP_BY_ID } from '../data/crops';
import { createWorkerPlannerClient } from './workerClient';

/** Stands in for a module Web Worker: runs each task on a timer on the main thread. */
class FakeWorker {
  static started = 0;
  static finished = 0;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  postMessage(task: OptimizeTask): void {
    FakeWorker.started++;
    this.timer = setTimeout(() => {
      this.timer = null;
      const result = optimizeArrangement(task);
      FakeWorker.finished++;
      this.onmessage?.({ data: { type: 'result', result } } as MessageEvent);
    }, 0);
  }

  terminate(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

const wheatGoals: Goal[] = [{ id: 'g1', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' }];

function suggestRequest(plotCount: number, timeBudgetMs: number): PlanRequest {
  return {
    settings: {
      plotCount,
      arrangement: { mode: 'suggest', maxWidth: null, maxHeight: null },
      gardeningLevel: null,
      goals: wheatGoals,
      helpers: ['carrot'],
    },
    seed: 3,
    timeBudgetMs,
  };
}

describe('createWorkerPlannerClient with a worker pool', () => {
  beforeEach(() => {
    FakeWorker.started = 0;
    FakeWorker.finished = 0;
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plans through the pool and returns valid layouts', async () => {
    const client = createWorkerPlannerClient();
    const result = await client.run(suggestRequest(3, 300), () => {});
    expect(result.solutions.length).toBeGreaterThan(0);
    for (const solution of result.solutions) {
      expect(validatePlacements(buildGarden(solution.plots), solution.placements, CROP_BY_ID)).toEqual([]);
    }
  }, 20000);

  it('does not start queued tasks after an abort', async () => {
    const client = createWorkerPlannerClient();
    const controller = new AbortController();
    const promise = client.run(
      suggestRequest(9, 2000),
      () => controller.abort(),
      controller.signal,
    );
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    const startedAtAbort = FakeWorker.started;
    await new Promise((resolve) => setTimeout(resolve, 200));
    // 1,285 screening tasks were queued; only the ones already running when
    // the first result arrived may have started.
    expect(startedAtAbort).toBeLessThan(40);
    expect(FakeWorker.started).toBe(startedAtAbort);
  }, 20000);
});
