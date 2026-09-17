/**
 * Top-level search orchestration (PLAN.md 5.2, 5.3): optimizing one
 * arrangement (greedy + LAHC restarts), running batches of those as tasks
 * (synchronously here; src/worker/workerClient.ts adds a parallel version),
 * and the fixed / custom / suggest arrangement-screening pipeline.
 */
import { CROP_BY_ID } from '../../data/crops';
import { arrangementLabel, enumerateArrangements, fitsSpace } from '../arrangement';
import { buildGarden, normalizePlots } from '../garden';
import { compareScores } from '../score';
import type {
  CropId,
  Goal,
  LayoutSolution,
  PlanProgress,
  PlanRequest,
  PlanResult,
  Placement,
  PlotPos,
  ScoreVector,
  TilePos,
} from '../types';
import { Evaluator } from './evaluate';
import { greedyFill, strategyForRestart } from './greedy';
import { runLahc } from './lahc';
import { compileProblem, type CompiledProblem } from './problem';
import { Rng } from './rng';
import { LayoutState } from './state';

// ---------------------------------------------------------------------------
// Single-arrangement optimization
// ---------------------------------------------------------------------------

export interface OptimizeTask {
  taskId: number;
  plots: PlotPos[];
  goals: Goal[];
  helpers: CropId[];
  seed: number;
  restarts: number;
  iterationsPerRestart: number;
  timeLimitMs: number;
  fixed?: { placements: Placement[]; lockedTiles: TilePos[] };
  keep: number;
}

export interface OptimizeResult {
  taskId: number;
  solutions: { placements: Placement[]; score: ScoreVector }[];
  iterations: number;
  elapsedMs: number;
}

/** Fraction of soil tiles that must differ for two solutions to count as distinct alternatives. */
const DISTINCT_FRACTION = 0.15;

/**
 * Runs `task.restarts` rounds of greedy fill + LAHC within the given
 * iteration and time limits, and returns up to `task.keep` best distinct
 * solutions. With `task.fixed`, placements covering a locked tile stay
 * fixed, locked tiles with no placement stay empty, and the unlocked fixed
 * placements seed the first restart only (later restarts start from locks
 * alone, for diversity).
 */
export function optimizeArrangement(task: OptimizeTask): OptimizeResult {
  const start = performance.now();
  const garden = buildGarden(task.plots);
  const problem = compileProblem({
    garden,
    goals: task.goals,
    helpers: task.helpers,
    cropsById: CROP_BY_ID,
    fixed: task.fixed,
  });

  const rng = new Rng(task.seed);
  const evaluator = new Evaluator(problem);

  const fullFixedBase = new LayoutState(problem);
  if (task.fixed) fullFixedBase.loadPlacements(task.fixed.placements);
  const lockedOnlyBase = fullFixedBase.clone();
  for (let slot = 0; slot < lockedOnlyBase.slotCount; slot++) {
    if (lockedOnlyBase.slotCrop[slot] >= 0 && lockedOnlyBase.slotLocked[slot] === 0) {
      lockedOnlyBase.remove(slot);
    }
  }

  const deadline = start + Math.max(0, task.timeLimitMs);
  const keep = Math.max(1, task.keep);
  const found: { state: LayoutState; score: ScoreVector }[] = [];
  let totalIterations = 0;

  const restarts = Math.max(1, task.restarts);
  const historyLength = Math.min(400, Math.max(20, problem.tileCount * 4));
  const idleLimit = Math.max(1000, Math.floor(task.iterationsPerRestart * 0.4));

  for (let r = 0; r < restarts; r++) {
    if (performance.now() >= deadline) break;

    const state = (r === 0 ? fullFixedBase : lockedOnlyBase).clone();
    greedyFill(problem, state, rng, strategyForRestart(r), deadline);

    const result = runLahc(problem, state, rng, evaluator, {
      historyLength,
      iterationLimit: Math.max(1, task.iterationsPerRestart),
      idleLimit,
      deadline,
    });
    totalIterations += result.iterations;
    insertDistinct(found, result.best, result.bestScore, keep, problem);
  }

  return {
    taskId: task.taskId,
    solutions: found.map((f) => ({ placements: f.state.toPlacements(), score: f.score })),
    iterations: totalIterations,
    elapsedMs: performance.now() - start,
  };
}

function insertDistinct(
  found: { state: LayoutState; score: ScoreVector }[],
  state: LayoutState,
  score: ScoreVector,
  keep: number,
  problem: CompiledProblem,
): void {
  for (const f of found) {
    if (differenceFraction(f.state, state, problem) < DISTINCT_FRACTION) {
      if (compareScores(score, f.score) > 0) {
        f.state = state;
        f.score = score;
      }
      return;
    }
  }
  found.push({ state, score });
  found.sort((a, b) => -compareScores(a.score, b.score));
  if (found.length > keep) found.length = keep;
}

/** Fraction of soil tiles whose occupying crop (or emptiness) differs between two states. */
function differenceFraction(a: LayoutState, b: LayoutState, problem: CompiledProblem): number {
  const soil = problem.soilTiles;
  if (soil.length === 0) return 0;
  let diff = 0;
  for (let i = 0; i < soil.length; i++) {
    const t = soil[i];
    const slotA = a.tileSlot[t];
    const slotB = b.tileSlot[t];
    const cropA = slotA === -1 ? -1 : a.slotCrop[slotA];
    const cropB = slotB === -1 ? -1 : b.slotCrop[slotB];
    if (cropA !== cropB) diff++;
  }
  return diff / soil.length;
}

// ---------------------------------------------------------------------------
// Task running
// ---------------------------------------------------------------------------

/** Runs a batch of optimize tasks, in task order, reporting each as it completes. */
export type TaskRunner = (
  tasks: OptimizeTask[],
  onResult: (result: OptimizeResult) => void,
  signal?: AbortSignal,
) => Promise<OptimizeResult[]>;

/** Sequential fallback / test runner: runs every task on the calling thread. */
export const runTasksSync: TaskRunner = async (tasks, onResult, signal) => {
  const results: OptimizeResult[] = [];
  for (const task of tasks) {
    throwIfAborted(signal);
    const result = optimizeArrangement(task);
    results.push(result);
    onResult(result);
  }
  return results;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function deriveSeed(base: number, salt: number): number {
  let h = (base ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ salt, 2654435761) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Full plan(): fixed / custom / suggest
// ---------------------------------------------------------------------------

/** Assumed worker count, used only to size per-task time limits within a stage's budget. */
const ASSUMED_PARALLELISM = 8;
const REFINE_CANDIDATES = 24;
const FINISH_CANDIDATES = 3;
const MIN_TASK_TIME_MS = 5;

const SINGLE_RESTARTS = 8;
const SINGLE_ITERATIONS = 60000;
const SCREEN_RESTARTS = 1;
const SCREEN_ITERATIONS = 4000;
const REFINE_RESTARTS = 3;
const REFINE_ITERATIONS = 20000;
const FINISH_RESTARTS = 8;
const FINISH_ITERATIONS = 60000;

export async function plan(
  request: PlanRequest,
  runTasks: TaskRunner,
  onProgress: (p: PlanProgress) => void,
  signal?: AbortSignal,
): Promise<PlanResult> {
  const start = performance.now();
  throwIfAborted(signal);
  const settings = request.settings;

  if (request.fixed) {
    return planSingleArrangement(
      request.fixed.plots,
      settings.goals,
      settings.helpers,
      request.seed,
      request.timeBudgetMs,
      { placements: request.fixed.placements, lockedTiles: request.fixed.lockedTiles },
      'Current arrangement',
      runTasks,
      onProgress,
      signal,
      start,
    );
  }

  if (settings.arrangement.mode === 'custom') {
    return planSingleArrangement(
      settings.arrangement.plots,
      settings.goals,
      settings.helpers,
      request.seed,
      request.timeBudgetMs,
      undefined,
      'Your arrangement',
      runTasks,
      onProgress,
      signal,
      start,
    );
  }

  return planSuggest(request, runTasks, onProgress, signal, start);
}

async function planSingleArrangement(
  plots: PlotPos[],
  goals: Goal[],
  helpers: CropId[],
  seed: number,
  timeBudgetMs: number,
  fixed: { placements: Placement[]; lockedTiles: TilePos[] } | undefined,
  label: string,
  runTasks: TaskRunner,
  onProgress: (p: PlanProgress) => void,
  signal: AbortSignal | undefined,
  start: number,
): Promise<PlanResult> {
  const task: OptimizeTask = {
    taskId: 0,
    plots,
    goals,
    helpers,
    seed,
    restarts: SINGLE_RESTARTS,
    iterationsPerRestart: SINGLE_ITERATIONS,
    timeLimitMs: Math.max(MIN_TASK_TIME_MS, timeBudgetMs),
    fixed,
    keep: 3,
  };

  let best: LayoutSolution | null = null;
  const [result] = await runTasks(
    [task],
    (r) => {
      const solutions = toLayoutSolutions(plots, r.solutions, label);
      best = solutions.length > 0 ? solutions[0] : null;
      onProgress({ stage: 'finishing', done: 1, total: 1, best });
    },
    signal,
  );
  throwIfAborted(signal);

  const solutions = toLayoutSolutions(plots, result.solutions, label);
  return {
    solutions,
    arrangementsTried: solutions.length > 0 ? 1 : 0,
    elapsedMs: performance.now() - start,
  };
}

function toLayoutSolutions(
  plots: readonly PlotPos[],
  solutions: readonly { placements: Placement[]; score: ScoreVector }[],
  label: string,
): LayoutSolution[] {
  const normalized = normalizePlots(plots);
  return solutions.map((s) => ({ plots: normalized, placements: s.placements, score: s.score, label }));
}

interface RankedCandidate {
  index: number;
  plots: PlotPos[];
  result: OptimizeResult;
}

function rankCandidates(candidates: { index: number; plots: PlotPos[] }[], results: Map<number, OptimizeResult>): RankedCandidate[] {
  const ranked: RankedCandidate[] = [];
  for (const c of candidates) {
    const result = results.get(c.index);
    if (result && result.solutions.length > 0) ranked.push({ index: c.index, plots: c.plots, result });
  }
  ranked.sort((a, b) => -compareScores(a.result.solutions[0].score, b.result.solutions[0].score));
  return ranked;
}

async function planSuggest(
  request: PlanRequest,
  runTasks: TaskRunner,
  onProgress: (p: PlanProgress) => void,
  signal: AbortSignal | undefined,
  start: number,
): Promise<PlanResult> {
  const settings = request.settings;
  if (settings.arrangement.mode !== 'suggest') throw new Error('planSuggest: settings.arrangement must be "suggest"');
  const { maxWidth, maxHeight } = settings.arrangement;

  const allPlots = enumerateArrangements(settings.plotCount).filter((plots) => fitsSpace(plots, maxWidth, maxHeight));
  if (allPlots.length === 0) {
    return { solutions: [], arrangementsTried: 0, elapsedMs: performance.now() - start };
  }
  const allCandidates = allPlots.map((plots, index) => ({ index, plots }));

  let bestOverall: LayoutSolution | null = null;
  const noteBest = (plots: readonly PlotPos[], result: OptimizeResult, label: string) => {
    if (result.solutions.length === 0) return;
    const candidate = toLayoutSolutions(plots, [result.solutions[0]], label)[0];
    if (!bestOverall || compareScores(candidate.score, bestOverall.score) > 0) bestOverall = candidate;
  };

  const screeningBudget = request.timeBudgetMs * 0.4;
  const refiningBudget = request.timeBudgetMs * 0.35;
  const finishingBudget = Math.max(0, request.timeBudgetMs - screeningBudget - refiningBudget);

  // ---- Screening: a quick pass over every fitting candidate. ----
  const screeningTaskTime = Math.max(
    MIN_TASK_TIME_MS,
    screeningBudget / Math.ceil(allCandidates.length / ASSUMED_PARALLELISM),
  );
  const screeningResults = new Map<number, OptimizeResult>();
  let screeningDone = 0;
  await runTasks(
    allCandidates.map((c) => makeTask(c, settings, request.seed, 1, SCREEN_RESTARTS, SCREEN_ITERATIONS, screeningTaskTime)),
    (result) => {
      screeningDone++;
      screeningResults.set(result.taskId, result);
      noteBest(allPlots[result.taskId], result, arrangementLabel(allPlots[result.taskId]));
      onProgress({ stage: 'screening', done: screeningDone, total: allCandidates.length, best: bestOverall });
    },
    signal,
  );
  throwIfAborted(signal);

  // ---- Refining: more time on the best few dozen. ----
  const refineCandidates = rankCandidates(allCandidates, screeningResults).slice(0, REFINE_CANDIDATES);
  const refiningTaskTime = Math.max(
    MIN_TASK_TIME_MS,
    refiningBudget / Math.ceil(Math.max(1, refineCandidates.length) / ASSUMED_PARALLELISM),
  );
  const refiningResults = new Map<number, OptimizeResult>();
  let refiningDone = 0;
  await runTasks(
    refineCandidates.map((c) =>
      makeTask(c, settings, request.seed, 2, REFINE_RESTARTS, REFINE_ITERATIONS, refiningTaskTime),
    ),
    (result) => {
      refiningDone++;
      refiningResults.set(result.taskId, result);
      noteBest(allPlots[result.taskId], result, arrangementLabel(allPlots[result.taskId]));
      onProgress({ stage: 'refining', done: refiningDone, total: refineCandidates.length, best: bestOverall });
    },
    signal,
  );
  throwIfAborted(signal);

  // ---- Finishing: most remaining time on the best 3. ----
  const finishCandidates = rankCandidates(refineCandidates, refiningResults).slice(0, FINISH_CANDIDATES);
  const finishingTaskTime = Math.max(
    MIN_TASK_TIME_MS,
    finishingBudget / Math.ceil(Math.max(1, finishCandidates.length) / ASSUMED_PARALLELISM),
  );
  const finishingResults = new Map<number, OptimizeResult>();
  let finishingDone = 0;
  await runTasks(
    finishCandidates.map((c) =>
      makeTask(c, settings, request.seed, 3, FINISH_RESTARTS, FINISH_ITERATIONS, finishingTaskTime),
    ),
    (result) => {
      finishingDone++;
      finishingResults.set(result.taskId, result);
      noteBest(allPlots[result.taskId], result, arrangementLabel(allPlots[result.taskId]));
      onProgress({ stage: 'finishing', done: finishingDone, total: finishCandidates.length, best: bestOverall });
    },
    signal,
  );
  throwIfAborted(signal);

  const finalRanked = rankCandidates(finishCandidates, finishingResults);
  const solutions: LayoutSolution[] = finalRanked.map((c) => ({
    plots: normalizePlots(c.plots),
    placements: c.result.solutions[0].placements,
    score: c.result.solutions[0].score,
    label: arrangementLabel(c.plots),
  }));

  return {
    solutions,
    arrangementsTried: allCandidates.length,
    elapsedMs: performance.now() - start,
  };
}

function makeTask(
  candidate: { index: number; plots: PlotPos[] },
  settings: PlanRequest['settings'],
  baseSeed: number,
  saltRound: number,
  restarts: number,
  iterationsPerRestart: number,
  timeLimitMs: number,
): OptimizeTask {
  return {
    taskId: candidate.index,
    plots: candidate.plots,
    goals: settings.goals,
    helpers: settings.helpers,
    seed: deriveSeed(baseSeed, candidate.index * 4 + saltRound),
    restarts,
    iterationsPerRestart,
    timeLimitMs,
    keep: 1,
  };
}
