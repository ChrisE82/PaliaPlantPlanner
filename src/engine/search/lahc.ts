/**
 * Late Acceptance Hill Climbing (PLAN.md 5.2): a candidate move is accepted
 * when it is at least as good as the current layout or as the layout from
 * `historyLength` iterations ago, using the same lexicographic comparison
 * the rest of the planner uses (engine/score.ts). Keeps the best layout seen.
 */
import { compareScores } from '../score';
import type { ScoreVector } from '../types';
import { copyScore, createScoreVector, type Evaluator } from './evaluate';
import { applyRandomMove, resolveMoveWeights, type MoveWeights } from './moves';
import type { CompiledProblem } from './problem';
import type { Rng } from './rng';
import type { LayoutState } from './state';

export interface LahcOptions {
  /** Number of past iterations' scores to compare a candidate against. */
  historyLength: number;
  /** Hard cap on the number of iterations. */
  iterationLimit: number;
  /** Stop after this many iterations in a row without a new best. */
  idleLimit: number;
  /** performance.now() timestamp; checked periodically, never exceeded by much. */
  deadline: number;
  moveWeights?: MoveWeights;
}

export interface LahcResult {
  /** Independent from the input state; safe to keep after further calls reuse `state`. */
  best: LayoutState;
  bestScore: ScoreVector;
  iterations: number;
}

/**
 * Runs LAHC starting from `state` (mutated in place as the "current" layout
 * during the search; its content after return is unspecified). `evaluator`
 * is reused for every candidate, so pass one built for `problem`.
 */
export function runLahc(
  problem: CompiledProblem,
  state: LayoutState,
  rng: Rng,
  evaluator: Evaluator,
  options: LahcOptions,
): LahcResult {
  const weights = options.moveWeights ?? resolveMoveWeights(problem);

  const currentScore = createScoreVector();
  evaluator.evaluate(state, currentScore);

  const best = state.clone();
  const bestScore = createScoreVector();
  copyScore(currentScore, bestScore);

  const historyLength = Math.max(1, options.historyLength);
  const history: ScoreVector[] = [];
  for (let i = 0; i < historyLength; i++) {
    const h = createScoreVector();
    copyScore(currentScore, h);
    history.push(h);
  }

  const candidateScore = createScoreVector();
  let idle = 0;
  let iter = 0;
  for (; iter < options.iterationLimit; iter++) {
    if ((iter & 63) === 0 && performance.now() >= options.deadline) break;

    const outcome = applyRandomMove(problem, state, rng, weights);
    if (!outcome.changed) {
      idle++;
      if (idle >= options.idleLimit) break;
      continue;
    }

    evaluator.evaluate(state, candidateScore);
    const v = iter % historyLength;
    const accept = compareScores(candidateScore, currentScore) >= 0 || compareScores(candidateScore, history[v]) >= 0;

    if (accept) {
      copyScore(candidateScore, currentScore);
      if (compareScores(currentScore, bestScore) > 0) {
        copyScore(currentScore, bestScore);
        state.copyInto(best);
        idle = 0;
      } else {
        idle++;
      }
    } else {
      outcome.undo();
      idle++;
    }
    copyScore(currentScore, history[v]);

    if (idle >= options.idleLimit) break;
  }

  return { best, bestScore, iterations: iter };
}
