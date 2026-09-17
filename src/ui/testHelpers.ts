/**
 * A controllable fake PlannerClient for UI tests (project task spec: "Tests
 * inject a fake client"). Not a *.test.ts file itself, so vitest doesn't run
 * it directly.
 */
import type { PlanProgress, PlanRequest, PlanResult, PlannerClient } from '../engine/types';

export interface FakePlannerClient extends PlannerClient {
  /** The request passed to the most recent run() call. */
  lastRequest: PlanRequest | null;
  callCount: number;
  /** Sends a progress update to the most recent run() call's callback. */
  emitProgress: (progress: PlanProgress) => void;
  /** Resolves the most recent run() call. */
  resolveRun: (result: PlanResult) => void;
  /** Rejects the most recent run() call (e.g. with a plain Error). */
  rejectRun: (err: unknown) => void;
}

export function createFakePlannerClient(): FakePlannerClient {
  let onProgress: ((p: PlanProgress) => void) | null = null;
  let resolveFn: ((r: PlanResult) => void) | null = null;
  let rejectFn: ((e: unknown) => void) | null = null;

  const client: FakePlannerClient = {
    lastRequest: null,
    callCount: 0,

    run(request: PlanRequest, progress: (p: PlanProgress) => void, signal?: AbortSignal): Promise<PlanResult> {
      client.lastRequest = request;
      client.callCount += 1;
      onProgress = progress;

      return new Promise<PlanResult>((resolve, reject) => {
        resolveFn = resolve;
        rejectFn = reject;
        if (signal) {
          if (signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        }
      });
    },

    emitProgress(progress: PlanProgress) {
      onProgress?.(progress);
    },
    resolveRun(result: PlanResult) {
      resolveFn?.(result);
    },
    rejectRun(err: unknown) {
      rejectFn?.(err);
    },
  };

  return client;
}
