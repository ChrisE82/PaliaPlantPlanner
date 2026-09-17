/**
 * Fast scoring: writes an 11-entry ScoreVector for a LayoutState with no
 * allocation per call (all scratch buffers are allocated once, in the
 * constructor, and reused). Must match engine-score's
 * scoreLayout(makeScoreContext(...), placements, computeBuffs(...)) exactly
 * -- see evaluate.crosscheck.test.ts.
 *
 * Score vector layout (see PLAN.md 4.3 and the task's score spec):
 *   [0] must targets     [1] must maximize
 *   [2] high targets     [3] high maximize
 *   [4] medium targets   [5] medium maximize
 *   [6] low targets      [7] low maximize
 *   [8] filled tiles
 *   [9] goal-crop buffs received (summed over goal-crop placements)
 *   [10] goal-crop tiles (summed over goal-crop placements)
 */
import type { ScoreVector } from '../types';
import type { CompiledProblem } from './problem';
import type { LayoutState } from './state';

export const SCORE_LENGTH = 11;

const BUFF_COUNT = 5;

export class Evaluator {
  private readonly problem: CompiledProblem;
  private readonly plantsByCrop: Int32Array;
  private readonly buffCountByCropBuff: Int32Array;
  private readonly contactsScratch: Int32Array;
  private readonly levelScratch: Float64Array;

  constructor(problem: CompiledProblem) {
    this.problem = problem;
    this.plantsByCrop = new Int32Array(problem.cropCount);
    this.buffCountByCropBuff = new Int32Array(problem.cropCount * BUFF_COUNT);
    this.contactsScratch = new Int32Array(BUFF_COUNT);
    this.levelScratch = new Float64Array(8);
  }

  /** Writes the 11-entry score vector into `out` (out.length must be >= 11). No allocations. */
  evaluate(state: LayoutState, out: ScoreVector): void {
    const problem = this.problem;
    this.plantsByCrop.fill(0);
    this.buffCountByCropBuff.fill(0);
    let filledTiles = 0;
    let goalCropBuffs = 0;
    let goalCropTiles = 0;

    for (let slot = 0; slot < state.slotCount; slot++) {
      const cropIndex = state.slotCrop[slot];
      if (cropIndex < 0) continue;
      const size = problem.cropSize[cropIndex];
      const tiles = size * size;
      filledTiles += tiles;
      this.plantsByCrop[cropIndex]++;

      const anchorTile = state.slotAnchor[slot];
      const anchorSlotIdx = problem.anchorSlotBySize[size - 1][anchorTile];
      const ring = problem.ringBySize[size - 1][anchorSlotIdx];

      const contacts = this.contactsScratch;
      contacts.fill(0);
      for (let i = 0; i < ring.length; i++) {
        const otherSlot = state.tileSlot[ring[i]];
        if (otherSlot < 0) continue;
        const otherCrop = state.slotCrop[otherSlot];
        if (otherCrop === cropIndex) continue; // never buffed by the same crop type
        const buffIdx = problem.cropBuffIndex[otherCrop];
        if (buffIdx < 0) continue;
        contacts[buffIdx]++;
      }

      const threshold = problem.receiveThreshold[size - 1];
      let receivedCount = 0;
      for (let b = 0; b < BUFF_COUNT; b++) {
        if (contacts[b] >= threshold) {
          receivedCount++;
          this.buffCountByCropBuff[cropIndex * BUFF_COUNT + b]++;
        }
      }
      if (problem.isGoalCrop[cropIndex]) {
        goalCropBuffs += receivedCount;
        goalCropTiles += tiles;
      }
    }

    const sums = this.levelScratch;
    sums.fill(0);
    for (let g = 0; g < problem.goalCount; g++) {
      const importance = problem.goalImportance[g];
      const amountKind = problem.goalAmountKind[g]; // 0 count, 1 max, 2 all
      let score: number;

      if (!problem.goalIsBuff[g]) {
        const cropIdx = problem.goalCropIndex[g];
        const plants = cropIdx >= 0 ? this.plantsByCrop[cropIdx] : 0;
        if (amountKind === 1) {
          const size = cropIdx >= 0 ? problem.cropSize[cropIdx] : 0;
          score = problem.tileCount === 0 ? 0 : (plants * size * size) / problem.tileCount;
        } else {
          const n = problem.goalAmountN[g];
          score = n > 0 ? Math.min(plants, n) / n : 1; // matches score.ts: "at least 0" is met
        }
      } else {
        const buffIdx = problem.goalBuffIndex[g];
        const cropIdx = problem.goalCropIndex[g];
        let p = 0;
        let b = 0;
        if (cropIdx < 0) {
          const list = problem.goalCropIndices;
          for (let i = 0; i < list.length; i++) {
            const ci = list[i];
            p += this.plantsByCrop[ci];
            b += this.buffCountByCropBuff[ci * BUFF_COUNT + buffIdx];
          }
        } else {
          p = this.plantsByCrop[cropIdx];
          b = this.buffCountByCropBuff[cropIdx * BUFF_COUNT + buffIdx];
        }
        if (amountKind === 2) {
          score = p === 0 ? 0 : b / p;
        } else {
          const n = problem.goalAmountN[g];
          score = n > 0 ? Math.min(b, n) / n : 1;
        }
      }

      const levelBase = importance * 2;
      if (amountKind === 1) sums[levelBase + 1] += Math.sqrt(score);
      else sums[levelBase] += score;
    }

    for (let i = 0; i < 8; i++) out[i] = sums[i];
    out[8] = filledTiles;
    out[9] = goalCropBuffs;
    out[10] = goalCropTiles;
  }
}

/** A fresh 11-entry score vector, initialized to zero. */
export function createScoreVector(): ScoreVector {
  return new Array(SCORE_LENGTH).fill(0);
}

export function copyScore(src: ScoreVector, dest: ScoreVector): void {
  for (let i = 0; i < SCORE_LENGTH; i++) dest[i] = src[i];
}
