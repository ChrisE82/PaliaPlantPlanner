/**
 * Search benchmark (PLAN.md 5.4). Run with `npx tsx scripts/benchmark.ts`.
 *
 * (a) one fixed 3x3-block arrangement, all 15 crops allowed, ~8 mixed goals, 3 seeds.
 * (b) suggest mode, 9 plots, the PLAN.md 4.1 example goals, via runTasksSync
 *     (sequential); reports both the measured sequential time (= total CPU
 *     time, since nothing runs in parallel here) and that time divided by 8
 *     as the time 8 parallel workers would imply.
 * (c) the known optimums (PLAN.md 5.3), each on the 3x3 block and the 5-over-4
 *     row arrangement.
 */
import { CROPS } from '../src/data/crops';
import type { Goal, Placement, PlanRequest, PlotPos, ScoreVector } from '../src/engine/types';
import {
  optimizeArrangement,
  plan,
  runTasksSync,
  type OptimizeResult,
  type OptimizeTask,
  type TaskRunner,
} from '../src/engine/search/planner';

function block3x3(): PlotPos[] {
  const plots: PlotPos[] = [];
  for (const y of [0, 3, 6]) for (const x of [0, 3, 6]) plots.push({ x, y });
  return plots;
}

/** Row of 5 plots with a row of 4 below it, aligned at the left (PLAN.md 5.3). */
function row5over4(): PlotPos[] {
  const plots: PlotPos[] = [];
  for (const x of [0, 3, 6, 9, 12]) plots.push({ x, y: 0 });
  for (const x of [0, 3, 6, 9]) plots.push({ x, y: 3 });
  return plots;
}

function formatScore(score: ScoreVector): string {
  return `[${score.map((n) => n.toFixed(3)).join(', ')}]`;
}

function countByCrop(placements: readonly Placement[]): string {
  const counts = new Map<string, number>();
  for (const p of placements) counts.set(p.cropId, (counts.get(p.cropId) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${id}:${n}`)
    .join(' ');
}

function line(): void {
  console.log('-'.repeat(72));
}

// ---------------------------------------------------------------------------
// (a) One fixed 3x3-block arrangement, all 15 crops allowed, ~8 mixed goals.
// ---------------------------------------------------------------------------

async function benchmarkA(): Promise<void> {
  console.log('\n(a) Fixed 3x3 block, all 15 crops allowed, 8 mixed goals, 3 seeds');
  line();

  const goals: Goal[] = [
    { id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 }, importance: 'must' },
    { id: 'g2', crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'high' },
    { id: 'g3', crop: 'blueberry', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' },
    { id: 'g4', crop: 'blueberry', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'medium' },
    { id: 'g5', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'medium' },
    { id: 'g6', crop: 'carrot', measure: 'quantity', amount: { kind: 'count', n: 6 }, importance: 'medium' },
    { id: 'g7', crop: 'cotton', measure: 'quantity', amount: { kind: 'count', n: 3 }, importance: 'low' },
    { id: 'g8', crop: 'spicy-pepper', measure: 'qualityBoost', amount: { kind: 'all' }, importance: 'low' },
  ];
  const helpers = CROPS.map((c) => c.id); // all 15 crops allowed

  const scores: ScoreVector[] = [];
  for (const seed of [1, 2, 3]) {
    const t0 = performance.now();
    const result = optimizeArrangement({
      taskId: 0,
      plots: block3x3(),
      goals,
      helpers,
      seed,
      restarts: 8,
      iterationsPerRestart: 60000,
      timeLimitMs: 3000,
      keep: 1,
    });
    const elapsed = performance.now() - t0;
    const best = result.solutions[0];
    scores.push(best.score);
    console.log(`seed=${seed}: ${elapsed.toFixed(0)}ms, ${result.iterations} iterations`);
    console.log(`  score ${formatScore(best.score)}`);
    console.log(`  ${countByCrop(best.placements)}`);
  }
  const allSame = scores.every((s) => s.every((v, i) => Math.abs(v - scores[0][i]) < 1e-6));
  console.log(allSame ? 'All 3 seeds reached the same score.' : 'Seeds reached different scores (see above).');
}

// ---------------------------------------------------------------------------
// (b) Suggest mode, 9 plots, PLAN.md 4.1 example goals.
// ---------------------------------------------------------------------------

async function benchmarkB(): Promise<void> {
  console.log('\n(b) Suggest mode, 9 plots, PLAN.md 4.1 example goals (sequential runTasksSync)');
  line();

  // Apple Quantity>=4 (Must), Apple Harvest Boost All (High),
  // Wheat Quantity Maximize (Medium), Apple Quality Boost All (Low; no
  // allowed crop gives it, so this goal scores 0 -- PLAN.md's own example
  // of a precheck warning).
  const goals: Goal[] = [
    { id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 }, importance: 'must' },
    { id: 'g2', crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'high' },
    { id: 'g3', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'medium' },
    { id: 'g4', crop: 'apple', measure: 'qualityBoost', amount: { kind: 'all' }, importance: 'low' },
  ];
  const helpers = ['carrot', 'onion', 'corn'];

  const timeBudgetMs = 6000;
  const request: PlanRequest = {
    settings: { plotCount: 9, arrangement: { mode: 'suggest', maxWidth: null, maxHeight: null }, gardeningLevel: null, goals, helpers },
    seed: 20260917,
    timeBudgetMs,
  };

  let firstResultMs: number | null = null;
  let screeningDoneMs: number | null = null;
  const start = performance.now();
  // Runs tasks one at a time but tells plan() to size them for 8 parallel
  // workers, so the total time divided by 8 estimates the browser wall time.
  const simulated8Workers: TaskRunner = Object.assign(
    (tasks: OptimizeTask[], onResult: (r: OptimizeResult) => void, signal?: AbortSignal) =>
      runTasksSync(tasks, onResult, signal),
    { parallelism: 8 },
  );
  const result = await plan(
    request,
    simulated8Workers,
    (p) => {
      if (firstResultMs === null && p.best) firstResultMs = performance.now() - start;
      if (screeningDoneMs === null && p.stage !== 'screening') screeningDoneMs = performance.now() - start;
    },
  );
  const totalCpuMs = performance.now() - start;

  console.log(`requested timeBudgetMs: ${timeBudgetMs} (this is the per-run budget the 8-worker pool would get)`);
  console.log(`sequential run = total CPU time across all tasks: ${totalCpuMs.toFixed(0)}ms`);
  console.log(`implied wall time at 8 parallel workers: ${(totalCpuMs / 8).toFixed(0)}ms`);
  if (firstResultMs !== null) {
    console.log(`first result available (sequential / implied parallel): ${(firstResultMs as number).toFixed(0)}ms / ${((firstResultMs as number) / 8).toFixed(0)}ms`);
  }
  if (screeningDoneMs !== null) {
    console.log(`screening stage done (sequential / implied parallel): ${(screeningDoneMs as number).toFixed(0)}ms / ${((screeningDoneMs as number) / 8).toFixed(0)}ms`);
  }
  console.log(`arrangementsTried: ${result.arrangementsTried}, elapsedMs (reported): ${result.elapsedMs.toFixed(0)}`);
  result.solutions.forEach((s, i) => {
    console.log(`  #${i + 1} [${s.label}] score ${formatScore(s.score)}`);
    console.log(`      ${countByCrop(s.placements)}`);
  });
}

// ---------------------------------------------------------------------------
// (c) Known optimums (PLAN.md 5.3).
// ---------------------------------------------------------------------------

interface KnownCase {
  name: string;
  crop: string;
  goals: Goal[];
  helpers: string[];
  expectBlock: number;
  expectRow: number;
}

const KNOWN_CASES: KnownCase[] = [
  {
    name: '(a) Most Blueberries, no helpers',
    crop: 'blueberry',
    goals: [{ id: 'g1', crop: 'blueberry', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' }],
    helpers: [],
    expectBlock: 16,
    expectRow: 19,
  },
  {
    name: '(b) Most Blueberries, all Harvest Boost, helper Wheat',
    crop: 'blueberry',
    goals: [
      { id: 'g1', crop: 'blueberry', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'high' },
      { id: 'g2', crop: 'blueberry', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' },
    ],
    helpers: ['wheat'],
    expectBlock: 16,
    expectRow: 15,
  },
  {
    name: '(c) Most Apples, all Harvest Boost, helper Wheat',
    crop: 'apple',
    goals: [
      { id: 'g1', crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'high' },
      { id: 'g2', crop: 'apple', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' },
    ],
    helpers: ['wheat'],
    expectBlock: 6,
    expectRow: 7,
  },
];

async function benchmarkC(): Promise<void> {
  console.log('\n(c) Known optimums (PLAN.md 5.3)');
  line();

  let allOk = true;
  for (const c of KNOWN_CASES) {
    for (const [label, plots, expected] of [
      ['3x3 block', block3x3(), c.expectBlock],
      ['row 5-over-4', row5over4(), c.expectRow],
    ] as const) {
      const task: OptimizeTask = {
        taskId: 0,
        plots,
        goals: c.goals,
        helpers: c.helpers,
        seed: 20260917,
        restarts: 10,
        iterationsPerRestart: 150000,
        timeLimitMs: 6000,
        keep: 1,
      };
      const t0 = performance.now();
      const result = optimizeArrangement(task);
      const elapsed = performance.now() - t0;
      const count = result.solutions[0]?.placements.filter((p) => p.cropId === c.crop).length ?? 0;
      const ok = count === expected;
      allOk &&= ok;
      console.log(`  ${c.name} [${label}]: ${count} ${c.crop} (expected ${expected}) in ${elapsed.toFixed(0)}ms - ${ok ? 'OK' : 'MISMATCH'}`);
    }
  }
  console.log(allOk ? 'All known optimums reached.' : 'Some known optimums were NOT reached.');
}

async function main(): Promise<void> {
  await benchmarkA();
  await benchmarkB();
  await benchmarkC();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
