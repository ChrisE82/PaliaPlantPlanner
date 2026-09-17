/**
 * Known optimums (PLAN.md 5.3): proven maximums from an exhaustive
 * brute-force check of every arrangement of 9 plots (research/
 * arrangement_bruteforce.py). The planner must match them, on both the most
 * compact arrangement (3x3 block) and a row-shaped one that beats it for two
 * of the three goals.
 */
import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../../data/crops';
import { computeBuffs } from '../buffs';
import { buildGarden } from '../garden';
import type { Goal, Placement, PlotPos } from '../types';
import { optimizeArrangement } from './planner';

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

function countCrop(placements: readonly Placement[], cropId: string): number {
  return placements.filter((p) => p.cropId === cropId).length;
}

function allReceiveBuff(plots: PlotPos[], placements: readonly Placement[], cropId: string, buffBit: number): boolean {
  const garden = buildGarden(plots);
  const buffs = computeBuffs(garden, placements, CROP_BY_ID);
  return placements.every((p, i) => p.cropId !== cropId || (buffs[i].receivedMask & buffBit) !== 0);
}

const HARVEST_BOOST_BIT = 1 << 2; // BUFF_INDEX.harvestBoost

const RESTARTS = 10;
const ITERATIONS_PER_RESTART = 150000;
const TIME_LIMIT_MS = 6000;
const SEED = 1234567;

function run(plots: PlotPos[], goals: Goal[], helpers: string[]) {
  return optimizeArrangement({
    taskId: 0,
    plots,
    goals,
    helpers,
    seed: SEED,
    restarts: RESTARTS,
    iterationsPerRestart: ITERATIONS_PER_RESTART,
    timeLimitMs: TIME_LIMIT_MS,
    keep: 1,
  });
}

describe('known optimums (PLAN.md 5.3)', () => {
  it('(a) most Blueberries, no helpers: 16 on the block, 19 on 5-over-4', () => {
    const goals: Goal[] = [{ id: 'g1', crop: 'blueberry', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' }];

    const block = run(block3x3(), goals, []);
    expect(countCrop(block.solutions[0].placements, 'blueberry')).toBe(16);

    const row = run(row5over4(), goals, []);
    expect(countCrop(row.solutions[0].placements, 'blueberry')).toBe(19);
  }, 30000);

  it('(b) most Blueberries all with Harvest Boost, helper Wheat: 16 on the block, 15 on 5-over-4', () => {
    const goals: Goal[] = [
      { id: 'g1', crop: 'blueberry', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'high' },
      { id: 'g2', crop: 'blueberry', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' },
    ];
    const helpers = ['wheat'];

    const block = run(block3x3(), goals, helpers);
    expect(allReceiveBuff(block3x3(), block.solutions[0].placements, 'blueberry', HARVEST_BOOST_BIT)).toBe(true);
    expect(countCrop(block.solutions[0].placements, 'blueberry')).toBe(16);

    const row = run(row5over4(), goals, helpers);
    expect(allReceiveBuff(row5over4(), row.solutions[0].placements, 'blueberry', HARVEST_BOOST_BIT)).toBe(true);
    expect(countCrop(row.solutions[0].placements, 'blueberry')).toBe(15);
  }, 30000);

  it('(c) most Apples all with Harvest Boost, helper Wheat: 6 on the block, 7 on 5-over-4', () => {
    const goals: Goal[] = [
      { id: 'g1', crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'high' },
      { id: 'g2', crop: 'apple', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' },
    ];
    const helpers = ['wheat'];

    const block = run(block3x3(), goals, helpers);
    expect(allReceiveBuff(block3x3(), block.solutions[0].placements, 'apple', HARVEST_BOOST_BIT)).toBe(true);
    expect(countCrop(block.solutions[0].placements, 'apple')).toBe(6);

    const row = run(row5over4(), goals, helpers);
    expect(allReceiveBuff(row5over4(), row.solutions[0].placements, 'apple', HARVEST_BOOST_BIT)).toBe(true);
    expect(countCrop(row.solutions[0].placements, 'apple')).toBe(7);
  }, 30000);
});
