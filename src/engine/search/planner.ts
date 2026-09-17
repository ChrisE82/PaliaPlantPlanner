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
  Garden,
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

/**
 * Runs a batch of optimize tasks and resolves with results in task order,
 * reporting each result as it completes. `parallelism` is how many tasks run
 * at the same time; plan() uses it to size per-task time limits.
 */
export type TaskRunner = ((
  tasks: OptimizeTask[],
  onResult: (result: OptimizeResult) => void,
  signal?: AbortSignal,
) => Promise<OptimizeResult[]>) & { readonly parallelism?: number };

/** How long runTasksSync may block before yielding to the event loop. */
const SYNC_YIELD_MS = 50;

/**
 * Sequential fallback and test runner: runs every task on the calling thread.
 * It yields to the event loop every SYNC_YIELD_MS so progress can render and
 * an abort can arrive.
 */
export const runTasksSync: TaskRunner = Object.assign(
  async (tasks: OptimizeTask[], onResult: (result: OptimizeResult) => void, signal?: AbortSignal) => {
    const results: OptimizeResult[] = [];
    let lastYield = performance.now();
    for (const task of tasks) {
      throwIfAborted(signal);
      const result = optimizeArrangement(task);
      results.push(result);
      onResult(result);
      if (performance.now() - lastYield > SYNC_YIELD_MS) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    }
    throwIfAborted(signal);
    return results;
  },
  { parallelism: 1 },
);

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

const REFINE_CANDIDATES = 24;
const FINISH_CANDIDATES = 3;
const MIN_TASK_TIME_MS = 5;

// Single-arrangement and finishing runs keep restarting until their time limit.
const SINGLE_RESTARTS = 1000;
const SINGLE_ITERATIONS = 60000;
const SCREEN_RESTARTS = 1;
const SCREEN_ITERATIONS = 4000;
const REFINE_RESTARTS = 3;
const REFINE_ITERATIONS = 20000;
const FINISH_RESTARTS = 1000;
const FINISH_ITERATIONS = 60000;

type Found = OptimizeResult['solutions'][number];

export async function plan(
  request: PlanRequest,
  runTasks: TaskRunner,
  onProgress: (p: PlanProgress) => void,
  signal?: AbortSignal,
): Promise<PlanResult> {
  const start = performance.now();
  throwIfAborted(signal);
  const settings = request.settings;
  const parallelism = Math.max(1, Math.floor(runTasks.parallelism ?? 1));

  if (request.fixed) {
    const target = {
      plots: request.fixed.plots,
      fixed: { placements: request.fixed.placements, lockedTiles: request.fixed.lockedTiles },
      label: 'Current arrangement',
    };
    return planSingleArrangement(target, request, runTasks, parallelism, onProgress, signal, start);
  }

  if (settings.arrangement.mode === 'custom') {
    const target = { plots: settings.arrangement.plots, fixed: undefined, label: 'Your arrangement' };
    return planSingleArrangement(target, request, runTasks, parallelism, onProgress, signal, start);
  }

  return planSuggest(request, runTasks, parallelism, onProgress, signal, start);
}

/**
 * One arrangement: one task per parallel runner, each with its own seed and
 * the whole time budget. Returns the best layout plus up to 2 distinct
 * alternatives.
 */
async function planSingleArrangement(
  target: { plots: PlotPos[]; fixed: OptimizeTask['fixed']; label: string },
  request: PlanRequest,
  runTasks: TaskRunner,
  parallelism: number,
  onProgress: (p: PlanProgress) => void,
  signal: AbortSignal | undefined,
  start: number,
): Promise<PlanResult> {
  const { plots, fixed, label } = target;
  const garden = buildGarden(plots);
  const tasks: OptimizeTask[] = Array.from({ length: parallelism }, (_, i) => ({
    taskId: i,
    plots,
    goals: request.settings.goals,
    helpers: request.settings.helpers,
    seed: deriveSeed(request.seed, i),
    restarts: SINGLE_RESTARTS,
    iterationsPerRestart: SINGLE_ITERATIONS,
    timeLimitMs: Math.max(MIN_TASK_TIME_MS, request.timeBudgetMs),
    fixed,
    keep: 3,
  }));

  const found: Found[] = [];
  let done = 0;
  await runTasks(
    tasks,
    (result) => {
      done++;
      found.push(...result.solutions);
      const [best] = distinctBest(found, garden, 1);
      onProgress({ stage: 'finishing', done, total: tasks.length, best: best ? toSolution(plots, best, label) : null });
    },
    signal,
  );
  throwIfAborted(signal);

  const solutions = distinctBest(found, garden, 3).map((s) => toSolution(plots, s, label));
  return { solutions, arrangementsTried: solutions.length > 0 ? 1 : 0, elapsedMs: performance.now() - start };
}

async function planSuggest(
  request: PlanRequest,
  runTasks: TaskRunner,
  parallelism: number,
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

  // Every solution found for each arrangement, across all stages. A later
  // stage can do worse than an earlier one (different seeds), so results are
  // always taken from the best found anywhere.
  const foundByCandidate = new Map<number, Found[]>();
  const bestOf = (index: number): Found | undefined => foundByCandidate.get(index)?.[0];
  let bestOverall: LayoutSolution | null = null;

  const record = (result: OptimizeResult) => {
    if (result.solutions.length === 0) return;
    const list = foundByCandidate.get(result.taskId) ?? [];
    list.push(...result.solutions);
    list.sort((a, b) => -compareScores(a.score, b.score));
    foundByCandidate.set(result.taskId, list);
    const top = list[0];
    if (!bestOverall || compareScores(top.score, bestOverall.score) > 0) {
      const plots = allPlots[result.taskId];
      bestOverall = toSolution(plots, top, arrangementLabel(plots));
    }
  };

  const ranked = (candidates: readonly { index: number; plots: PlotPos[] }[]) =>
    candidates
      .filter((c) => bestOf(c.index) !== undefined)
      .sort((a, b) => -compareScores(bestOf(a.index)!.score, bestOf(b.index)!.score));

  const runStage = async (
    stage: PlanProgress['stage'],
    candidates: readonly { index: number; plots: PlotPos[] }[],
    budgetMs: number,
    saltRound: number,
    restarts: number,
    iterations: number,
    keep: number,
  ) => {
    // Tasks run `parallelism` at a time, so the stage takes about
    // taskTime * ceil(candidates / parallelism).
    const taskTime = Math.max(MIN_TASK_TIME_MS, budgetMs / Math.ceil(Math.max(1, candidates.length) / parallelism));
    let done = 0;
    await runTasks(
      candidates.map((c) => makeTask(c, settings, request.seed, saltRound, restarts, iterations, taskTime, keep)),
      (result) => {
        done++;
        record(result);
        onProgress({ stage, done, total: candidates.length, best: bestOverall });
      },
      signal,
    );
    throwIfAborted(signal);
  };

  const screeningBudget = request.timeBudgetMs * 0.4;
  const refiningBudget = request.timeBudgetMs * 0.35;
  const finishingBudget = Math.max(0, request.timeBudgetMs - screeningBudget - refiningBudget);

  await runStage('screening', allCandidates, screeningBudget, 1, SCREEN_RESTARTS, SCREEN_ITERATIONS, 1);
  const refineCandidates = ranked(allCandidates).slice(0, REFINE_CANDIDATES);
  await runStage('refining', refineCandidates, refiningBudget, 2, REFINE_RESTARTS, REFINE_ITERATIONS, 1);
  const finishCandidates = ranked(refineCandidates).slice(0, FINISH_CANDIDATES);
  await runStage('finishing', finishCandidates, finishingBudget, 3, FINISH_RESTARTS, FINISH_ITERATIONS, 3);

  const finalRanked = ranked(finishCandidates);
  const solutions: LayoutSolution[] = finalRanked.map((c) => toSolution(c.plots, bestOf(c.index)!, arrangementLabel(c.plots)));

  // With fewer than 3 arrangements to show (1 to 3 plots, or a tight space
  // limit), fill the list with distinct layouts on the best arrangement.
  if (solutions.length > 0 && solutions.length < FINISH_CANDIDATES) {
    const best = finalRanked[0];
    const alternatives = distinctBest(foundByCandidate.get(best.index) ?? [], buildGarden(best.plots), FINISH_CANDIDATES).slice(1);
    for (const alternative of alternatives) {
      if (solutions.length >= FINISH_CANDIDATES) break;
      solutions.push(toSolution(best.plots, alternative, arrangementLabel(best.plots)));
    }
  }

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
  keep: number,
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
    keep,
  };
}

function toSolution(plots: readonly PlotPos[], found: Found, label: string): LayoutSolution {
  return { plots: normalizePlots(plots), placements: found.placements, score: found.score, label };
}

/** Crop id on every tile of the garden's bounding box, or null for empty and non-soil tiles. */
function tileCrops(garden: Garden, placements: readonly Placement[]): (CropId | null)[] {
  const tiles = new Array<CropId | null>(garden.width * garden.height).fill(null);
  for (const p of placements) {
    const size = CROP_BY_ID.get(p.cropId)?.size ?? 1;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) tiles[(p.y + dy) * garden.width + p.x + dx] = p.cropId;
    }
  }
  return tiles;
}

/**
 * The best solutions, best first, skipping any that differ from an already
 * chosen one on fewer than DISTINCT_FRACTION of the garden's tiles.
 */
function distinctBest(found: readonly Found[], garden: Garden, keep: number): Found[] {
  const sorted = [...found].sort((a, b) => -compareScores(a.score, b.score));
  const chosen: { found: Found; tiles: (CropId | null)[] }[] = [];
  const minDifferent = DISTINCT_FRACTION * garden.tileCount;
  for (const candidate of sorted) {
    if (chosen.length >= keep) break;
    const tiles = tileCrops(garden, candidate.placements);
    const distinct = chosen.every((c) => {
      let different = 0;
      for (let i = 0; i < tiles.length; i++) if (tiles[i] !== c.tiles[i]) different++;
      return different >= minDifferent;
    });
    if (distinct) chosen.push({ found: candidate, tiles });
  }
  return chosen.map((c) => c.found);
}
