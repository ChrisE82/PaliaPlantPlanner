import { describe, expect, it } from 'vitest';
import { basePlanTimeMs, REOPTIMIZE_BASE_TIME_MS, scaledTimeBudgetMs } from './planTiming';
import type { PlanSettings } from '../../engine/types';

function settingsWith(plotCount: number, mode: 'suggest' | 'custom' = 'suggest'): Pick<PlanSettings, 'arrangement' | 'plotCount'> {
  return {
    plotCount,
    arrangement:
      mode === 'suggest'
        ? { mode: 'suggest', maxWidth: null, maxHeight: null }
        : { mode: 'custom', plots: Array.from({ length: plotCount }, (_, i) => ({ x: i * 3, y: 0 })) },
  };
}

describe('basePlanTimeMs', () => {
  it('uses 12000 for 7 to 9 plots in suggest mode', () => {
    expect(basePlanTimeMs(settingsWith(9))).toBe(12000);
    expect(basePlanTimeMs(settingsWith(7))).toBe(12000);
  });

  it('uses 8000 for 4 to 6 plots in suggest mode', () => {
    expect(basePlanTimeMs(settingsWith(6))).toBe(8000);
    expect(basePlanTimeMs(settingsWith(4))).toBe(8000);
  });

  it('uses 4000 for 1 to 3 plots in suggest mode', () => {
    expect(basePlanTimeMs(settingsWith(3))).toBe(4000);
    expect(basePlanTimeMs(settingsWith(1))).toBe(4000);
  });

  it('always uses 5000 for a custom arrangement, regardless of plot count', () => {
    expect(basePlanTimeMs(settingsWith(9, 'custom'))).toBe(5000);
    expect(basePlanTimeMs(settingsWith(1, 'custom'))).toBe(5000);
  });

  it('re-optimize always uses a base of 5000', () => {
    expect(REOPTIMIZE_BASE_TIME_MS).toBe(5000);
  });
});

describe('scaledTimeBudgetMs', () => {
  it('scales by 0.5 / 1 / 3 for quick / normal / thorough', () => {
    expect(scaledTimeBudgetMs(8000, 'quick')).toBe(4000);
    expect(scaledTimeBudgetMs(8000, 'normal')).toBe(8000);
    expect(scaledTimeBudgetMs(8000, 'thorough')).toBe(24000);
  });
});
