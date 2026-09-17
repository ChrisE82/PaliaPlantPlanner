/**
 * Time budgets for planner runs (see the project task spec, Task A step 3):
 * a base budget from the arrangement/plot count, scaled by the user's
 * search-time choice. Kept dependency-free so it's simple to unit test.
 */
import type { PlanSettings } from '../../engine/types';

export type SearchTime = 'quick' | 'normal' | 'thorough';

export const SEARCH_TIME_OPTIONS: readonly { value: SearchTime; label: string }[] = [
  { value: 'quick', label: 'Quick' },
  { value: 'normal', label: 'Normal' },
  { value: 'thorough', label: 'Thorough' },
];

export function isSearchTime(v: unknown): v is SearchTime {
  return v === 'quick' || v === 'normal' || v === 'thorough';
}

const SEARCH_TIME_MULTIPLIER: Readonly<Record<SearchTime, number>> = {
  quick: 0.5,
  normal: 1,
  thorough: 3,
};

/** Base time budget in ms, before the search-time multiplier, for a fresh plan. */
export function basePlanTimeMs(settings: Pick<PlanSettings, 'arrangement' | 'plotCount'>): number {
  if (settings.arrangement.mode === 'custom') return 5000;
  const n = settings.plotCount;
  if (n >= 7) return 12000;
  if (n >= 4) return 8000;
  return 4000;
}

/** Base time budget in ms for a re-optimize run (always a single fixed arrangement). */
export const REOPTIMIZE_BASE_TIME_MS = 5000;

export function scaledTimeBudgetMs(baseMs: number, searchTime: SearchTime): number {
  return Math.round(baseMs * SEARCH_TIME_MULTIPLIER[searchTime]);
}
