/**
 * Starts and stops planner runs (project task spec, Task A step 3 and Task B
 * step 6): wires the PlannerClient to the store's run state via an
 * AbortController. One instance is created in App.tsx and its `stop` /
 * `reoptimize` handed down, so Stop always aborts the run this same
 * instance started.
 */
import { useCallback, useRef } from 'react';
import type { FixedLayout, PlanRequest } from '../../engine/types';
import { usePlannerClient } from '../state/plannerClient';
import { useStore } from '../state/store';
import { basePlanTimeMs, REOPTIMIZE_BASE_TIME_MS, scaledTimeBudgetMs } from './planTiming';

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function errorMessageFor(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong while planning.';
}

export interface RunPlanner {
  /** Starts a fresh plan from the current settings. */
  run: () => Promise<void>;
  /** Aborts the run in progress, if any. */
  stop: () => void;
  /** Re-optimizes only the unlocked tiles of the selected solution. */
  reoptimize: () => Promise<void>;
}

export function useRunPlanner(): RunPlanner {
  const client = usePlannerClient();
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    const settings = useStore.getState().settings;
    const searchTime = useStore.getState().searchTime;
    const timeBudgetMs = scaledTimeBudgetMs(basePlanTimeMs(settings), searchTime);
    const request: PlanRequest = { settings, seed: Date.now(), timeBudgetMs };

    const controller = new AbortController();
    controllerRef.current = controller;
    useStore.getState().planStarted(settings);

    try {
      const result = await client.run(
        request,
        (progress) => useStore.getState().planProgress(progress),
        controller.signal,
      );
      if (controllerRef.current === controller) useStore.getState().planSucceeded(result);
    } catch (err) {
      if (controllerRef.current !== controller) return; // superseded by a newer run
      if (isAbortError(err)) {
        const bestSoFar = useStore.getState().progress?.best ?? null;
        useStore.getState().planStopped(bestSoFar);
      } else {
        useStore.getState().planFailed(errorMessageFor(err));
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [client]);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reoptimize = useCallback(async () => {
    const state = useStore.getState();
    if (!state.result) return;
    const index = state.selectedIndex;
    const solution = state.result.solutions[index];
    const editState = state.solutionStates[index];
    if (!solution || !editState) return;

    const fixed: FixedLayout = {
      plots: solution.plots,
      placements: editState.placements,
      lockedTiles: editState.lockedTiles,
    };
    const timeBudgetMs = scaledTimeBudgetMs(REOPTIMIZE_BASE_TIME_MS, state.searchTime);
    const request: PlanRequest = { settings: state.settings, seed: Date.now(), timeBudgetMs, fixed };

    const controller = new AbortController();
    controllerRef.current = controller;
    useStore.getState().reoptimizeStarted();

    try {
      const result = await client.run(request, () => {}, controller.signal);
      if (controllerRef.current !== controller) return; // superseded
      const best = result.solutions[0];
      if (best) {
        useStore.getState().reoptimizeSucceeded(index, best.placements);
      } else {
        useStore.getState().reoptimizeFailed('The planner could not find a layout for the unlocked tiles.');
      }
    } catch (err) {
      if (controllerRef.current !== controller) return;
      if (!isAbortError(err)) useStore.getState().reoptimizeFailed(errorMessageFor(err));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [client]);

  return { run, stop, reoptimize };
}
