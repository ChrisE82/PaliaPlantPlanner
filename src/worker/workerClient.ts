/**
 * Browser PlannerClient: a pool of module Web Workers running
 * planner.worker.ts, distributing OptimizeTasks and resolving in task order.
 * Falls back to the synchronous runner when Workers aren't available (e.g.
 * in some test environments).
 */
import type { PlanProgress, PlanRequest, PlanResult, PlannerClient } from '../engine/types';
import { plan, runTasksSync, type OptimizeResult, type OptimizeTask, type TaskRunner } from '../engine/search/planner';
import type { WorkerResponse } from './planner.worker';

interface PendingTask {
  resolve: (result: OptimizeResult) => void;
  reject: (err: unknown) => void;
}

interface ManagedWorker {
  worker: Worker;
  current: PendingTask | null;
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

class PlannerWorkerPool {
  private managed: ManagedWorker[] = [];
  private idle: ManagedWorker[] = [];
  private waiters: ((mw: ManagedWorker) => void)[] = [];

  constructor(size: number) {
    for (let i = 0; i < size; i++) this.managed.push(this.spawn());
    this.idle.push(...this.managed);
  }

  private spawn(): ManagedWorker {
    const worker = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' });
    const mw: ManagedWorker = { worker, current: null };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = mw.current;
      mw.current = null;
      if (pending) {
        if (response.type === 'result') pending.resolve(response.result);
        else pending.reject(new Error(response.message));
      }
      this.handBack(mw);
    };

    worker.onerror = (event: ErrorEvent) => {
      const pending = mw.current;
      mw.current = null;
      if (pending) pending.reject(event.error ?? new Error(event.message || 'Worker error'));
      // The worker may be in a broken state after an uncaught error; replace it.
      this.replace(mw);
    };

    return mw;
  }

  private replace(mw: ManagedWorker): void {
    try {
      mw.worker.terminate();
    } catch {
      // Already gone.
    }
    const index = this.managed.indexOf(mw);
    const fresh = this.spawn();
    if (index >= 0) this.managed[index] = fresh;
    else this.managed.push(fresh);
    this.handBack(fresh);
  }

  private handBack(mw: ManagedWorker): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(mw);
    else this.idle.push(mw);
  }

  private acquire(): Promise<ManagedWorker> {
    const mw = this.idle.pop();
    if (mw) return Promise.resolve(mw);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  get size(): number {
    return this.managed.length;
  }

  runTask(task: OptimizeTask, signal?: AbortSignal): Promise<OptimizeResult> {
    return this.acquire().then((mw) => {
      // A task still queued when its run was aborted must not start: hand the
      // worker straight to the next waiter instead.
      if (signal?.aborted) {
        this.handBack(mw);
        return Promise.reject(abortError());
      }
      return new Promise<OptimizeResult>((resolve, reject) => {
        mw.current = { resolve, reject };
        mw.worker.postMessage(task);
      });
    });
  }

  /** Terminates every worker immediately and respawns fresh ones; rejects any in-flight tasks. */
  resetAll(reason: unknown): void {
    const toReject: PendingTask[] = [];
    for (const mw of this.managed) {
      if (mw.current) toReject.push(mw.current);
      mw.current = null;
      try {
        mw.worker.terminate();
      } catch {
        // Already gone.
      }
    }
    this.managed = this.managed.map(() => this.spawn());
    this.idle = [...this.managed];
    while (this.waiters.length > 0 && this.idle.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter(this.idle.pop()!);
    }
    for (const pending of toReject) pending.reject(reason);
  }
}

function makeTaskRunner(pool: PlannerWorkerPool): TaskRunner {
  const run = (tasks: OptimizeTask[], onResult: (result: OptimizeResult) => void, signal?: AbortSignal) =>
    new Promise<OptimizeResult[]>((resolve, reject) => {
      if (tasks.length === 0) {
        resolve([]);
        return;
      }
      if (signal?.aborted) {
        reject(abortError());
        return;
      }

      const results = new Array<OptimizeResult>(tasks.length);
      let remaining = tasks.length;
      let settled = false;

      const onAbort = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        pool.resetAll(abortError());
        reject(abortError());
      };
      if (signal) signal.addEventListener('abort', onAbort);

      tasks.forEach((task, i) => {
        pool.runTask(task, signal).then(
          (result) => {
            if (settled) return;
            results[i] = result;
            onResult(result);
            remaining--;
            if (remaining === 0) {
              settled = true;
              signal?.removeEventListener('abort', onAbort);
              resolve(results);
            }
          },
          (err) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener('abort', onAbort);
            reject(err);
          },
        );
      });
    });
  return Object.assign(run, { parallelism: pool.size });
}

function defaultPoolSize(): number {
  const cores = typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
    ? navigator.hardwareConcurrency
    : 4;
  return Math.min(8, Math.max(1, cores - 1));
}

/** A PlannerClient backed by a pool of module Web Workers, one per (up to 8) CPU core. */
export function createWorkerPlannerClient(): PlannerClient {
  const canUseWorkers = typeof Worker !== 'undefined';
  const pool = canUseWorkers ? new PlannerWorkerPool(defaultPoolSize()) : null;
  const runTasks: TaskRunner = pool ? makeTaskRunner(pool) : runTasksSync;

  return {
    run(request: PlanRequest, onProgress: (progress: PlanProgress) => void, signal?: AbortSignal): Promise<PlanResult> {
      return plan(request, runTasks, onProgress, signal);
    },
  };
}
