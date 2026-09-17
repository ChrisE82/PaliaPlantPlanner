/**
 * Web Worker entry point: receives one OptimizeTask per message, runs it
 * synchronously, and posts back an OptimizeResult (or an error message).
 *
 * `self` is retyped locally to the small message-passing surface this file
 * needs, instead of pulling in the "webworker" lib (which conflicts with the
 * project-wide "DOM" lib already set in tsconfig.json).
 */
import { optimizeArrangement } from '../engine/search/planner';
import type { OptimizeResult, OptimizeTask } from '../engine/search/planner';

export type WorkerResponse = { type: 'result'; result: OptimizeResult } | { type: 'error'; taskId: number; message: string };

declare const self: {
  onmessage: ((event: MessageEvent<OptimizeTask>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

self.onmessage = (event) => {
  const task = event.data;
  try {
    const result = optimizeArrangement(task);
    self.postMessage({ type: 'result', result });
  } catch (err) {
    self.postMessage({
      type: 'error',
      taskId: task.taskId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
