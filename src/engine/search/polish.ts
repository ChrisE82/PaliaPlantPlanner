/**
 * Single-tile descent. Tries every allowed 1x1 crop, and leaving the tile
 * empty, on every unlocked tile that is empty or holds a 1x1 crop, and keeps
 * the best strict improvement for each tile. Repeats until a full pass finds
 * nothing better or the deadline passes. Large crops are left to LAHC.
 *
 * Short LAHC runs leave many tiles one change away from a better layout (for
 * example helpers where a Maximize crop fits); this finishes them cheaply.
 */
import { compareScores } from '../score';
import type { ScoreVector } from '../types';
import { copyScore, createScoreVector, type Evaluator } from './evaluate';
import type { CompiledProblem } from './problem';
import type { Rng } from './rng';
import type { LayoutState } from './state';

/** Polishes `state` in place and returns its final score. */
export function polish(
  problem: CompiledProblem,
  state: LayoutState,
  evaluator: Evaluator,
  rng: Rng,
  deadline: number,
): ScoreVector {
  const current = createScoreVector();
  evaluator.evaluate(state, current);
  const best = createScoreVector();
  const candidate = createScoreVector();
  const crops = problem.allowedBySize[0];
  const tiles = Array.from(problem.soilTiles);

  let improved = true;
  while (improved) {
    improved = false;
    rng.shuffle(tiles);
    for (const tile of tiles) {
      if (performance.now() >= deadline) return current;
      if (problem.lockedTileMask[tile]) continue;
      const slot = state.tileSlot[tile];
      if (slot !== -1 && problem.cropSize[state.slotCrop[slot]] !== 1) continue;

      const original = slot === -1 ? -1 : state.slotCrop[slot];
      // Start every option from an empty tile.
      if (slot !== -1) state.remove(slot);
      let bestCrop = original;
      copyScore(current, best);

      for (let i = -1; i < crops.length; i++) {
        const option = i < 0 ? -1 : crops[i];
        if (option === original) continue;
        if (option === -1) {
          evaluator.evaluate(state, candidate);
        } else {
          const placed = state.place(option, tile);
          evaluator.evaluate(state, candidate);
          state.remove(placed);
        }
        if (compareScores(candidate, best) > 0) {
          bestCrop = option;
          copyScore(candidate, best);
        }
      }

      if (bestCrop !== -1) state.place(bestCrop, tile);
      if (bestCrop !== original) {
        copyScore(best, current);
        improved = true;
      }
    }
  }
  return current;
}
