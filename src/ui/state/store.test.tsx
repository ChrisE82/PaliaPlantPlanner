// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_GOAL_CROPS } from '../../engine/types';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

/** Fresh import of the store module, so its module-level init re-runs against current localStorage. */
async function freshStore() {
  return import('./store');
}

describe('planner store defaults', () => {
  it('starts with 9 plots, suggest mode, and no space limit', async () => {
    const { useStore } = await freshStore();
    const s = useStore.getState().settings;
    expect(s.plotCount).toBe(9);
    expect(s.arrangement).toEqual({ mode: 'suggest', maxWidth: null, maxHeight: null });
  });

  it('starts with no gardening level set and no custom plots', async () => {
    const { useStore } = await freshStore();
    expect(useStore.getState().settings.gardeningLevel).toBeNull();
    expect(useStore.getState().customPlots).toEqual([]);
    expect(useStore.getState().spaceLimit).toEqual({ width: null, height: null });
  });

  it('starts with the PLAN.md 4.1 example goals and helpers', async () => {
    const { useStore } = await freshStore();
    const s = useStore.getState().settings;
    expect(s.goals.map((g) => [g.crop, g.measure, g.amount, g.importance])).toEqual([
      ['apple', 'quantity', { kind: 'count', n: 4 }, 'must'],
      ['apple', 'harvestBoost', { kind: 'all' }, 'high'],
      ['wheat', 'quantity', { kind: 'max' }, 'medium'],
      [ALL_GOAL_CROPS, 'waterRetain', { kind: 'all' }, 'low'],
    ]);
    expect(new Set(s.goals.map((g) => g.id)).size).toBe(4);
    expect(s.helpers).toEqual(['corn', 'potato', 'carrot']);
  });
});

describe('plot count and arrangement mode', () => {
  it('clamps setPlotCount to 1..9', async () => {
    const { useStore } = await freshStore();
    useStore.getState().setPlotCount(20);
    expect(useStore.getState().settings.plotCount).toBe(9);
    useStore.getState().setPlotCount(0);
    expect(useStore.getState().settings.plotCount).toBe(1);
    useStore.getState().setPlotCount(5);
    expect(useStore.getState().settings.plotCount).toBe(5);
  });

  it('switching to custom mode syncs plotCount and arrangement.plots to customPlots', async () => {
    const { useStore } = await freshStore();
    useStore.getState().setCustomPlots([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    useStore.getState().setArrangementMode('custom');
    const s = useStore.getState().settings;
    expect(s.plotCount).toBe(2);
    expect(s.arrangement).toEqual({
      mode: 'custom',
      plots: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
    });
  });

  it('keeps the space limit values when switching to custom and back to suggest', async () => {
    const { useStore } = await freshStore();
    useStore.getState().setSpaceLimit(15, 12);
    useStore.getState().setArrangementMode('custom');
    useStore.getState().setArrangementMode('suggest');
    expect(useStore.getState().settings.arrangement).toEqual({ mode: 'suggest', maxWidth: 15, maxHeight: 12 });
  });
});

describe('goal editing', () => {
  it('adds a goal defaulting to Tomato, Quantity, at least 10, Medium', async () => {
    const { useStore } = await freshStore();
    const before = useStore.getState().settings.goals.length;
    useStore.getState().addGoal();
    const goals = useStore.getState().settings.goals;
    expect(goals.length).toBe(before + 1);
    const added = goals[goals.length - 1];
    expect([added.crop, added.measure, added.amount, added.importance]).toEqual([
      'tomato',
      'quantity',
      { kind: 'count', n: 10 },
      'medium',
    ]);
  });

  it('updates a goal field in place', async () => {
    const { useStore } = await freshStore();
    const id = useStore.getState().settings.goals[0].id;
    useStore.getState().updateGoal(id, { importance: 'low' });
    expect(useStore.getState().settings.goals[0].importance).toBe('low');
    expect(useStore.getState().settings.goals[0].id).toBe(id);
  });

  it('removes a goal', async () => {
    const { useStore } = await freshStore();
    const id = useStore.getState().settings.goals[0].id;
    const countBefore = useStore.getState().settings.goals.length;
    useStore.getState().removeGoal(id);
    expect(useStore.getState().settings.goals.length).toBe(countBefore - 1);
    expect(useStore.getState().settings.goals.some((g) => g.id === id)).toBe(false);
  });

  it('changing measure from quantity to a buff turns Maximize into All plants', async () => {
    const { useStore } = await freshStore();
    useStore.getState().addGoal();
    const goal = useStore.getState().settings.goals.at(-1)!;
    useStore.getState().updateGoal(goal.id, { amount: { kind: 'max' } });
    useStore.getState().updateGoal(goal.id, { measure: 'waterRetain' });
    const updated = useStore.getState().settings.goals.find((g) => g.id === goal.id)!;
    expect(updated.amount).toEqual({ kind: 'all' });
  });

  it('changing measure from a buff to quantity turns All plants into count 1 and All goal crops into tomato', async () => {
    const { useStore } = await freshStore();
    const goal = useStore.getState().settings.goals[3]; // ALL_GOAL_CROPS / waterRetain / all / low
    expect(goal.crop).toBe(ALL_GOAL_CROPS);
    useStore.getState().updateGoal(goal.id, { measure: 'quantity' });
    const updated = useStore.getState().settings.goals.find((g) => g.id === goal.id)!;
    expect(updated.amount).toEqual({ kind: 'count', n: 1 });
    expect(updated.crop).toBe('tomato');
  });

  it('changing measure between two buffs leaves a count amount alone', async () => {
    const { useStore } = await freshStore();
    const goal = useStore.getState().settings.goals[1]; // apple / harvestBoost / all / high
    useStore.getState().updateGoal(goal.id, { amount: { kind: 'count', n: 2 } });
    useStore.getState().updateGoal(goal.id, { measure: 'qualityBoost' });
    const updated = useStore.getState().settings.goals.find((g) => g.id === goal.id)!;
    expect(updated.amount).toEqual({ kind: 'count', n: 2 });
  });

  it('clears all goals', async () => {
    const { useStore } = await freshStore();
    useStore.getState().clearGoals();
    expect(useStore.getState().settings.goals).toEqual([]);
  });

  it('resetToExample restores the default settings after changes', async () => {
    const { useStore, defaultSettings } = await freshStore();
    useStore.getState().clearGoals();
    useStore.getState().setPlotCount(3);
    useStore.getState().resetToExample();
    const s = useStore.getState().settings;
    const def = defaultSettings();
    expect(s.plotCount).toBe(def.plotCount);
    expect(s.goals.map((g) => [g.crop, g.measure, g.amount, g.importance])).toEqual(
      def.goals.map((g) => [g.crop, g.measure, g.amount, g.importance]),
    );
    expect(s.helpers).toEqual(def.helpers);
  });
});

describe('helpers', () => {
  it('toggles a helper crop on and off', async () => {
    const { useStore } = await freshStore();
    expect(useStore.getState().settings.helpers).not.toContain('onion');
    useStore.getState().toggleHelper('onion');
    expect(useStore.getState().settings.helpers).toContain('onion');
    useStore.getState().toggleHelper('onion');
    expect(useStore.getState().settings.helpers).not.toContain('onion');
  });

  it('setHelpers replaces the list and removes duplicates', async () => {
    const { useStore } = await freshStore();
    useStore.getState().setHelpers(['corn', 'corn', 'onion']);
    expect(useStore.getState().settings.helpers).toEqual(['corn', 'onion']);
  });
});

describe('persistence', () => {
  it('round-trips a change through localStorage', async () => {
    const { useStore, STORAGE_KEY } = await freshStore();
    useStore.getState().setPlotCount(4);
    useStore.getState().toggleHelper('onion');

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.settings.plotCount).toBe(4);
    expect(saved.settings.helpers).toContain('onion');

    vi.resetModules();
    const reloaded = await import('./store');
    expect(reloaded.useStore.getState().settings.plotCount).toBe(4);
    expect(reloaded.useStore.getState().settings.helpers).toContain('onion');
  });

  it('falls back to defaults when stored data is invalid JSON', async () => {
    const { STORAGE_KEY } = await freshStore();
    localStorage.setItem(STORAGE_KEY, '{not json');
    vi.resetModules();
    const { useStore, defaultSettings } = await import('./store');
    expect(useStore.getState().settings.plotCount).toBe(defaultSettings().plotCount);
    expect(useStore.getState().settings.goals.length).toBe(defaultSettings().goals.length);
  });

  it('falls back to defaults when stored data has the wrong shape', async () => {
    const { STORAGE_KEY } = await freshStore();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hello: 'world' }));
    vi.resetModules();
    const { useStore, defaultSettings } = await import('./store');
    expect(useStore.getState().settings.plotCount).toBe(defaultSettings().plotCount);
  });

  it('falls back to defaults when a goal in storage is missing required fields', async () => {
    const { STORAGE_KEY, defaultSettings, defaultSpaceLimit } = await freshStore();
    const bad = {
      settings: { ...defaultSettings(), goals: [{ id: 'x', crop: 'apple' }] },
      customPlots: [],
      spaceLimit: defaultSpaceLimit(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
    vi.resetModules();
    const { useStore } = await import('./store');
    expect(useStore.getState().settings.goals.length).toBe(defaultSettings().goals.length);
  });
});
