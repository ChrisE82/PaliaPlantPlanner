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
      [ALL_GOAL_CROPS, 'waterRetain', { kind: 'all' }, 'medium'],
      ['wheat', 'quantity', { kind: 'max' }, 'low'],
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

  describe('reorderGoal (the goals board drag-and-drop)', () => {
    it('moving a goal to another lane changes its importance and places it at the given position', async () => {
      const { useStore } = await freshStore();
      // Default example: [apple/must, apple/high, all/medium, wheat/low].
      const goalsBefore = useStore.getState().settings.goals;
      const wheat = goalsBefore[3];
      const appleHigh = goalsBefore[1];
      expect(wheat.importance).toBe('low');

      useStore.getState().reorderGoal(wheat.id, 'high', 0);

      const goals = useStore.getState().settings.goals;
      expect(goals.find((g) => g.id === wheat.id)?.importance).toBe('high');
      // Dropped at index 0 of the High lane, so it now precedes the apple/high goal.
      expect(goals.filter((g) => g.importance === 'high').map((g) => g.id)).toEqual([wheat.id, appleHigh.id]);
      // The Low lane is now empty; Must and Medium are untouched.
      expect(goals.filter((g) => g.importance === 'low')).toEqual([]);
    });

    it('dropping at the end of a lane places the goal after that lane’s other goals', async () => {
      const { useStore } = await freshStore();
      const apple = useStore.getState().settings.goals[0]; // must
      useStore.getState().reorderGoal(apple.id, 'medium', 5); // past the end: appends
      const mediumLane = useStore.getState().settings.goals.filter((g) => g.importance === 'medium');
      expect(mediumLane.at(-1)?.id).toBe(apple.id);
    });

    it('reorders within the same lane without touching other lanes', async () => {
      const { useStore } = await freshStore();
      // Give the High lane two goals so within-lane order is meaningful.
      useStore.getState().applyGoalDrop({ kind: 'palette-crop', cropId: 'onion' }, { kind: 'lane', importance: 'high' });
      const added = useStore.getState().settings.goals.at(-1)!;
      useStore.getState().updateGoal(added.id, { measure: 'harvestBoost', amount: { kind: 'all' } });

      const beforeIds = useStore.getState().settings.goals.map((g) => g.id);
      const highLaneBefore = useStore.getState().settings.goals.filter((g) => g.importance === 'high').map((g) => g.id);
      expect(highLaneBefore).toEqual([beforeIds[1], added.id]); // apple/high, then the new one

      // Move the second High goal to index 0 of its own lane.
      useStore.getState().reorderGoal(added.id, 'high', 0);

      const goals = useStore.getState().settings.goals;
      expect(goals.filter((g) => g.importance === 'high').map((g) => g.id)).toEqual([added.id, beforeIds[1]]);
      // Every other goal keeps its importance and relative order.
      expect(goals.filter((g) => g.importance === 'must').map((g) => g.id)).toEqual([beforeIds[0]]);
      expect(goals.filter((g) => g.importance === 'medium').map((g) => g.id)).toEqual([beforeIds[2]]);
      expect(goals.filter((g) => g.importance === 'low').map((g) => g.id)).toEqual([beforeIds[3]]);
    });

    it('is a no-op for an unknown goal id', async () => {
      const { useStore } = await freshStore();
      const before = useStore.getState().settings.goals;
      useStore.getState().reorderGoal('does-not-exist', 'high', 0);
      expect(useStore.getState().settings.goals).toEqual(before);
    });

    it('clamps an out-of-range or negative index into the lane', async () => {
      const { useStore } = await freshStore();
      const apple = useStore.getState().settings.goals[0];
      useStore.getState().reorderGoal(apple.id, 'must', -5);
      expect(useStore.getState().settings.goals.filter((g) => g.importance === 'must').map((g) => g.id)).toEqual([
        apple.id,
      ]);
    });
  });

  it('changing measure from quantity to a buff turns Maximize into All plants', async () => {
    const { useStore } = await freshStore();
    useStore.getState().applyGoalDrop({ kind: 'palette-crop', cropId: 'onion' }, { kind: 'lane', importance: 'medium' });
    const goal = useStore.getState().settings.goals.at(-1)!;
    useStore.getState().updateGoal(goal.id, { amount: { kind: 'max' } });
    useStore.getState().updateGoal(goal.id, { measure: 'waterRetain' });
    const updated = useStore.getState().settings.goals.find((g) => g.id === goal.id)!;
    expect(updated.amount).toEqual({ kind: 'all' });
  });

  it('changing measure from a buff to quantity turns All plants into count 1 and All goal crops into tomato', async () => {
    const { useStore } = await freshStore();
    const goal = useStore.getState().settings.goals[2]; // ALL_GOAL_CROPS / waterRetain / all / medium
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

  it('resetToExample restores the default settings after changes', async () => {
    const { useStore, defaultSettings } = await freshStore();
    useStore.getState().removeGoal(useStore.getState().settings.goals[0].id);
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

describe('applyGoalDrop', () => {
  it('applies a handled rule to settings.goals and returns true', async () => {
    const { useStore } = await freshStore();
    const before = useStore.getState().settings.goals.length;
    const handled = useStore.getState().applyGoalDrop({ kind: 'palette-crop', cropId: 'onion' }, { kind: 'lane', importance: 'high' });
    expect(handled).toBe(true);
    const goals = useStore.getState().settings.goals;
    expect(goals.length).toBe(before + 1);
    const added = goals.at(-1)!;
    expect([added.crop, added.measure, added.amount, added.importance]).toEqual(['onion', 'quantity', { kind: 'count', n: 1 }, 'high']);
  });

  it('applies a handled rule to settings.helpers too', async () => {
    const { useStore } = await freshStore();
    const handled = useStore.getState().applyGoalDrop({ kind: 'palette-crop', cropId: 'onion' }, { kind: 'helpers' });
    expect(handled).toBe(true);
    expect(useStore.getState().settings.helpers).toContain('onion');
  });

  it('returns false and leaves settings untouched for an unhandled item/target pair', async () => {
    const { useStore } = await freshStore();
    const before = useStore.getState().settings;
    const handled = useStore.getState().applyGoalDrop({ kind: 'plant', index: 0, cropId: 'apple', x: 0, y: 0 }, { kind: 'tile', x: 0, y: 0 });
    expect(handled).toBe(false);
    expect(useStore.getState().settings).toBe(before);
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

  it('defaults searchTime to normal and persists a change', async () => {
    const { useStore, STORAGE_KEY } = await freshStore();
    expect(useStore.getState().searchTime).toBe('normal');

    useStore.getState().setSearchTime('thorough');
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.searchTime).toBe('thorough');

    vi.resetModules();
    const reloaded = await import('./store');
    expect(reloaded.useStore.getState().searchTime).toBe('thorough');
  });

  it('defaults searchTime to normal for a save written before that field existed', async () => {
    const { STORAGE_KEY, defaultSettings, defaultSpaceLimit } = await freshStore();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ settings: defaultSettings(), customPlots: [], spaceLimit: defaultSpaceLimit() }),
    );
    vi.resetModules();
    const reloaded = await import('./store');
    expect(reloaded.useStore.getState().searchTime).toBe('normal');
  });
});

describe('run state', () => {
  it('starts idle with no result', async () => {
    const { useStore } = await freshStore();
    expect(useStore.getState().status).toBe('idle');
    expect(useStore.getState().result).toBeNull();
    expect(useStore.getState().solutionStates).toEqual([]);
  });

  it('planStarted marks running, clears any previous result and error, and snapshots the settings used', async () => {
    const { useStore } = await freshStore();
    const settings = useStore.getState().settings;
    useStore.getState().planStarted(settings);
    const s = useStore.getState();
    expect(s.status).toBe('running');
    expect(s.result).toBeNull();
    expect(s.errorMessage).toBeNull();
    expect(s.lastPlanSettingsJson).toBe(JSON.stringify(settings));
  });

  it('planProgress records the latest progress', async () => {
    const { useStore } = await freshStore();
    useStore.getState().planStarted(useStore.getState().settings);
    useStore.getState().planProgress({ stage: 'refining', done: 2, total: 8, best: null });
    expect(useStore.getState().progress).toEqual({ stage: 'refining', done: 2, total: 8, best: null });
  });

  it('planSucceeded stores the result and seeds one edit state per solution', async () => {
    const { useStore } = await freshStore();
    const result = {
      solutions: [
        { plots: [{ x: 0, y: 0 }], placements: [{ cropId: 'apple', x: 0, y: 0 }], score: [], label: '1 plot' },
        { plots: [{ x: 0, y: 0 }], placements: [], score: [], label: 'Row of 1' },
      ],
      arrangementsTried: 2,
      elapsedMs: 10,
    };
    useStore.getState().planSucceeded(result);
    const s = useStore.getState();
    expect(s.status).toBe('done');
    expect(s.selectedIndex).toBe(0);
    expect(s.solutionStates.length).toBe(2);
    expect(s.solutionStates[0]).toEqual({ placements: result.solutions[0].placements, lockedTiles: [], history: [] });
  });

  it('planStopped with a best-so-far layout stores it as a one-solution result', async () => {
    const { useStore } = await freshStore();
    const best = { plots: [{ x: 0, y: 0 }], placements: [{ cropId: 'wheat', x: 0, y: 0 }], score: [], label: '1 plot' };
    useStore.getState().planStopped(best);
    const s = useStore.getState();
    expect(s.status).toBe('stopped');
    expect(s.result?.solutions).toEqual([best]);
    expect(s.solutionStates[0].placements).toEqual(best.placements);
  });

  it('planStopped with no best-so-far layout leaves the result empty', async () => {
    const { useStore } = await freshStore();
    useStore.getState().planStopped(null);
    const s = useStore.getState();
    expect(s.status).toBe('stopped');
    expect(s.result).toBeNull();
  });

  it('planFailed records the status and message', async () => {
    const { useStore } = await freshStore();
    useStore.getState().planFailed('Worker crashed');
    const s = useStore.getState();
    expect(s.status).toBe('error');
    expect(s.errorMessage).toBe('Worker crashed');
    expect(s.result).toBeNull();
  });

  it('selectSolution clamps to a valid index', async () => {
    const { useStore } = await freshStore();
    const result = {
      solutions: [
        { plots: [{ x: 0, y: 0 }], placements: [], score: [], label: 'a' },
        { plots: [{ x: 0, y: 0 }], placements: [], score: [], label: 'b' },
      ],
      arrangementsTried: 2,
      elapsedMs: 1,
    };
    useStore.getState().planSucceeded(result);
    useStore.getState().selectSolution(1);
    expect(useStore.getState().selectedIndex).toBe(1);
    useStore.getState().selectSolution(5); // out of range: ignored
    expect(useStore.getState().selectedIndex).toBe(1);
  });
});

describe('isStaleResult', () => {
  it('is false before any plan and right after one', async () => {
    const { useStore, isStaleResult } = await freshStore();
    expect(isStaleResult(useStore.getState())).toBe(false);
    useStore.getState().planStarted(useStore.getState().settings);
    expect(isStaleResult(useStore.getState())).toBe(false);
  });

  it('becomes true once settings change after a plan', async () => {
    const { useStore, isStaleResult } = await freshStore();
    useStore.getState().planStarted(useStore.getState().settings);
    useStore.getState().setPlotCount(3);
    expect(isStaleResult(useStore.getState())).toBe(true);
  });
});

describe('editing', () => {
  const onePlotResult = () => ({
    solutions: [{ plots: [{ x: 0, y: 0 }], placements: [{ cropId: 'apple', x: 0, y: 0 }], score: [], label: '1 plot' }],
    arrangementsTried: 1,
    elapsedMs: 1,
  });

  it('placeCrop replaces overlapped crops and records an outcome', async () => {
    const { useStore } = await freshStore();
    useStore.getState().planSucceeded({
      solutions: [{ plots: [{ x: 0, y: 0 }], placements: [], score: [], label: '1 plot' }],
      arrangementsTried: 1,
      elapsedMs: 1,
    });
    const outcome = useStore.getState().placeCrop('wheat', 1, 1);
    expect(outcome).toEqual({ ok: true, message: null });
    expect(useStore.getState().solutionStates[0].placements).toEqual([{ cropId: 'wheat', x: 1, y: 1 }]);
  });

  it('eraseCrop removes the plant at the tapped tile', async () => {
    const { useStore } = await freshStore();
    useStore.getState().planSucceeded(onePlotResult());
    const outcome = useStore.getState().eraseCrop(1, 1);
    expect(outcome).toEqual({ ok: true, message: null });
    expect(useStore.getState().solutionStates[0].placements).toEqual([]);
  });

  it('toggleLockPlantAt locks and unlocks all of a plant\'s tiles', async () => {
    const { useStore } = await freshStore();
    useStore.getState().planSucceeded(onePlotResult());
    useStore.getState().toggleLockPlantAt(1, 1);
    expect(useStore.getState().solutionStates[0].lockedTiles.length).toBe(9);
    useStore.getState().toggleLockPlantAt(0, 0);
    expect(useStore.getState().solutionStates[0].lockedTiles).toEqual([]);
  });

  it('toggleLockPlotAt locks and unlocks all 9 tiles of the plot', async () => {
    const { useStore } = await freshStore();
    useStore.getState().planSucceeded(onePlotResult());
    useStore.getState().toggleLockPlotAt(2, 2);
    expect(useStore.getState().solutionStates[0].lockedTiles.length).toBe(9);
    useStore.getState().toggleLockPlotAt(0, 0);
    expect(useStore.getState().solutionStates[0].lockedTiles).toEqual([]);
  });

  it('unlockAllForSelected clears every lock on the selected solution', async () => {
    const { useStore } = await freshStore();
    useStore.getState().planSucceeded(onePlotResult());
    useStore.getState().toggleLockPlotAt(0, 0);
    useStore.getState().unlockAllForSelected();
    expect(useStore.getState().solutionStates[0].lockedTiles).toEqual([]);
  });

  it('undoEdit reverts the last edit and can be repeated up to the start', async () => {
    const { useStore } = await freshStore();
    useStore.getState().planSucceeded(onePlotResult());
    useStore.getState().eraseCrop(1, 1);
    useStore.getState().placeCrop('wheat', 1, 1);
    expect(useStore.getState().solutionStates[0].placements).toEqual([{ cropId: 'wheat', x: 1, y: 1 }]);

    useStore.getState().undoEdit();
    expect(useStore.getState().solutionStates[0].placements).toEqual([]);

    useStore.getState().undoEdit();
    expect(useStore.getState().solutionStates[0].placements).toEqual([{ cropId: 'apple', x: 0, y: 0 }]);

    useStore.getState().undoEdit(); // nothing left to undo: no-op
    expect(useStore.getState().solutionStates[0].placements).toEqual([{ cropId: 'apple', x: 0, y: 0 }]);
  });

  it('a new plan clears locks and edit history', async () => {
    const { useStore } = await freshStore();
    useStore.getState().planSucceeded(onePlotResult());
    useStore.getState().eraseCrop(1, 1);
    useStore.getState().toggleLockPlotAt(0, 0);
    expect(useStore.getState().solutionStates[0].lockedTiles.length).toBe(9);
    expect(useStore.getState().solutionStates[0].history.length).toBe(2);

    useStore.getState().planSucceeded(onePlotResult());
    expect(useStore.getState().solutionStates[0].lockedTiles).toEqual([]);
    expect(useStore.getState().solutionStates[0].history).toEqual([]);
  });

  it('reoptimizeSucceeded replaces the placements and keeps the locks', async () => {
    const { useStore } = await freshStore();
    useStore.getState().planSucceeded(onePlotResult());
    useStore.getState().toggleLockPlantAt(1, 1);
    useStore.getState().reoptimizeStarted();
    expect(useStore.getState().reoptimizing).toBe(true);

    useStore.getState().reoptimizeSucceeded(0, [{ cropId: 'wheat', x: 1, y: 1 }]);
    const s = useStore.getState();
    expect(s.reoptimizing).toBe(false);
    expect(s.solutionStates[0].placements).toEqual([{ cropId: 'wheat', x: 1, y: 1 }]);
    expect(s.solutionStates[0].lockedTiles.length).toBe(9);
  });

  it('reoptimizeFailed records a message without changing placements', async () => {
    const { useStore } = await freshStore();
    useStore.getState().planSucceeded(onePlotResult());
    useStore.getState().reoptimizeStarted();
    useStore.getState().reoptimizeFailed('No layout found.');
    const s = useStore.getState();
    expect(s.reoptimizing).toBe(false);
    expect(s.reoptimizeError).toBe('No layout found.');
    expect(s.solutionStates[0].placements).toEqual([{ cropId: 'apple', x: 0, y: 0 }]);
  });
});
