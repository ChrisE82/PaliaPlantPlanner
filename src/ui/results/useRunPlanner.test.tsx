// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LayoutSolution, PlanResult, PlotPos } from '../../engine/types';
import { PlannerClientProvider } from '../state/plannerClient';
import { useStore } from '../state/store';
import { createFakePlannerClient, type FakePlannerClient } from '../testHelpers';
import { useRunPlanner } from './useRunPlanner';

let client: FakePlannerClient;

beforeEach(() => {
  useStore.getState().resetToExample();
  client = createFakePlannerClient();
});

afterEach(() => {
  useStore.getState().resetToExample();
});

function wrapper({ children }: { children: ReactNode }) {
  return <PlannerClientProvider client={client}>{children}</PlannerClientProvider>;
}

const PLOTS: PlotPos[] = [{ x: 0, y: 0 }];

function solution(placements: LayoutSolution['placements'] = []): LayoutSolution {
  return { plots: PLOTS, placements, score: [], label: '1 plot' };
}

function planResult(solutions: LayoutSolution[]): PlanResult {
  return { solutions, arrangementsTried: 1, elapsedMs: 5 };
}

describe('useRunPlanner.run', () => {
  it('sends the current settings, a scaled time budget, and marks the store running', async () => {
    const { result } = renderHook(() => useRunPlanner(), { wrapper });
    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.run();
    });

    expect(useStore.getState().status).toBe('running');
    expect(client.callCount).toBe(1);
    expect(client.lastRequest?.settings).toEqual(useStore.getState().settings);
    expect(client.lastRequest?.fixed).toBeUndefined();
    expect(client.lastRequest?.timeBudgetMs).toBe(12000); // 9 plots, suggest mode, normal search time

    await act(async () => {
      client.resolveRun(planResult([solution([{ cropId: 'apple', x: 0, y: 0 }])]));
      await runPromise;
    });

    expect(useStore.getState().status).toBe('done');
    expect(useStore.getState().result?.solutions[0].placements).toEqual([{ cropId: 'apple', x: 0, y: 0 }]);
  });

  it('reports progress into the store as it arrives', () => {
    const { result } = renderHook(() => useRunPlanner(), { wrapper });
    act(() => {
      void result.current.run();
    });

    act(() => {
      client.emitProgress({ stage: 'screening', done: 4, total: 10, best: null });
    });
    expect(useStore.getState().progress).toEqual({ stage: 'screening', done: 4, total: 10, best: null });
  });

  it('stop() aborts the run and keeps the last progress "best" as the stopped result', async () => {
    const { result } = renderHook(() => useRunPlanner(), { wrapper });
    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.run();
    });

    const best = solution([{ cropId: 'apple', x: 0, y: 0 }]);
    act(() => {
      client.emitProgress({ stage: 'screening', done: 1, total: 5, best });
    });

    await act(async () => {
      result.current.stop();
      await runPromise;
    });

    expect(useStore.getState().status).toBe('stopped');
    expect(useStore.getState().result?.solutions[0]).toEqual(best);
  });

  it('a run failure records a plain error message', async () => {
    const { result } = renderHook(() => useRunPlanner(), { wrapper });
    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.run();
    });

    await act(async () => {
      client.rejectRun(new Error('Worker crashed'));
      await runPromise;
    });

    expect(useStore.getState().status).toBe('error');
    expect(useStore.getState().errorMessage).toBe('Worker crashed');
  });
});

describe('useRunPlanner.reoptimize', () => {
  it('sends request.fixed built from the displayed placements and locked tiles, and keeps locks on success', async () => {
    useStore.getState().planSucceeded(planResult([solution([{ cropId: 'apple', x: 0, y: 0 }])]));
    useStore.getState().toggleLockPlantAt(0, 0);

    const { result } = renderHook(() => useRunPlanner(), { wrapper });
    let reoptPromise!: Promise<void>;
    act(() => {
      reoptPromise = result.current.reoptimize();
    });

    expect(useStore.getState().reoptimizing).toBe(true);
    expect(client.lastRequest?.fixed?.plots).toEqual(PLOTS);
    expect(client.lastRequest?.fixed?.placements).toEqual([{ cropId: 'apple', x: 0, y: 0 }]);
    expect(client.lastRequest?.fixed?.lockedTiles.length).toBe(9);
    expect(client.lastRequest?.timeBudgetMs).toBe(5000); // re-optimize base, normal search time

    await act(async () => {
      client.resolveRun(planResult([solution([{ cropId: 'wheat', x: 0, y: 0 }])]));
      await reoptPromise;
    });

    expect(useStore.getState().reoptimizing).toBe(false);
    expect(useStore.getState().solutionStates[0].placements).toEqual([{ cropId: 'wheat', x: 0, y: 0 }]);
    expect(useStore.getState().solutionStates[0].lockedTiles.length).toBe(9); // locks kept
  });

  it('does nothing when there is no result yet', async () => {
    const { result } = renderHook(() => useRunPlanner(), { wrapper });
    await act(async () => {
      await result.current.reoptimize();
    });
    expect(client.callCount).toBe(0);
  });
});
