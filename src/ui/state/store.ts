import { create } from 'zustand';
import { RULES } from '../../engine/rules';
import {
  ALL_GOAL_CROPS,
  BUFF_IDS,
  type ArrangementSetting,
  type CropId,
  type Goal,
  type GoalAmount,
  type Importance,
  type Measure,
  type PlanSettings,
  type PlotPos,
} from '../../engine/types';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'palia-plant-planner:settings:v1';

export interface SpaceLimit {
  width: number | null;
  height: number | null;
}

interface PersistedShape {
  settings: PlanSettings;
  customPlots: PlotPos[];
  spaceLimit: SpaceLimit;
}

/** crypto.randomUUID with a fallback for environments that lack it. */
function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Defaults (PLAN.md section 4.1 example, as adapted for the app's first visit)
// ---------------------------------------------------------------------------

export function defaultGoals(): Goal[] {
  return [
    { id: makeId(), crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 }, importance: 'must' },
    { id: makeId(), crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'high' },
    { id: makeId(), crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'medium' },
    { id: makeId(), crop: ALL_GOAL_CROPS, measure: 'waterRetain', amount: { kind: 'all' }, importance: 'low' },
  ];
}

export function defaultSettings(): PlanSettings {
  return {
    plotCount: 9,
    arrangement: { mode: 'suggest', maxWidth: null, maxHeight: null },
    gardeningLevel: null,
    goals: defaultGoals(),
    helpers: ['corn', 'potato', 'carrot'],
  };
}

export function defaultSpaceLimit(): SpaceLimit {
  return { width: null, height: null };
}

function newGoal(): Goal {
  return { id: makeId(), crop: 'tomato', measure: 'quantity', amount: { kind: 'count', n: 10 }, importance: 'medium' };
}

// ---------------------------------------------------------------------------
// Loose validation of data loaded from localStorage
// ---------------------------------------------------------------------------

function isPlotPos(v: unknown): v is PlotPos {
  return !!v && typeof v === 'object' && typeof (v as PlotPos).x === 'number' && typeof (v as PlotPos).y === 'number';
}

function isImportance(v: unknown): v is Importance {
  return v === 'must' || v === 'high' || v === 'medium' || v === 'low';
}

function isMeasure(v: unknown): v is Measure {
  return v === 'quantity' || (typeof v === 'string' && (BUFF_IDS as readonly string[]).includes(v));
}

function isGoalAmount(v: unknown): v is GoalAmount {
  if (!v || typeof v !== 'object') return false;
  const a = v as { kind?: unknown; n?: unknown };
  if (a.kind === 'count') return typeof a.n === 'number';
  return a.kind === 'max' || a.kind === 'all';
}

function isGoal(v: unknown): v is Goal {
  if (!v || typeof v !== 'object') return false;
  const g = v as Partial<Goal>;
  return (
    typeof g.id === 'string' &&
    typeof g.crop === 'string' &&
    isMeasure(g.measure) &&
    isGoalAmount(g.amount) &&
    isImportance(g.importance)
  );
}

function isArrangement(v: unknown): v is ArrangementSetting {
  if (!v || typeof v !== 'object') return false;
  const a = v as { mode?: unknown; maxWidth?: unknown; maxHeight?: unknown; plots?: unknown };
  if (a.mode === 'suggest') {
    return (a.maxWidth === null || typeof a.maxWidth === 'number') && (a.maxHeight === null || typeof a.maxHeight === 'number');
  }
  if (a.mode === 'custom') {
    return Array.isArray(a.plots) && a.plots.every(isPlotPos);
  }
  return false;
}

function isPlanSettings(v: unknown): v is PlanSettings {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<PlanSettings>;
  return (
    typeof s.plotCount === 'number' &&
    isArrangement(s.arrangement) &&
    (s.gardeningLevel === null || typeof s.gardeningLevel === 'number') &&
    Array.isArray(s.goals) &&
    s.goals.every(isGoal) &&
    Array.isArray(s.helpers) &&
    s.helpers.every((h) => typeof h === 'string')
  );
}

function isSpaceLimit(v: unknown): v is SpaceLimit {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<SpaceLimit>;
  return (s.width === null || typeof s.width === 'number') && (s.height === null || typeof s.height === 'number');
}

function isPersistedShape(v: unknown): v is PersistedShape {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<PersistedShape>;
  return isPlanSettings(p.settings) && Array.isArray(p.customPlots) && p.customPlots.every(isPlotPos) && isSpaceLimit(p.spaceLimit);
}

function readPersisted(): PersistedShape | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPersistedShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writePersisted(data: PersistedShape): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full, disabled, or unavailable (private browsing) - ignore.
  }
}

// ---------------------------------------------------------------------------
// Goal measure/amount adjustment (see updateGoal below)
// ---------------------------------------------------------------------------

function applyGoalPatch(goal: Goal, patch: Partial<Goal>): Goal {
  const next: Goal = { ...goal, ...patch };
  if (patch.measure !== undefined && patch.measure !== goal.measure) {
    const nowQuantity = next.measure === 'quantity';
    if (!nowQuantity && next.amount.kind === 'max') {
      next.amount = { kind: 'all' };
    }
    if (nowQuantity) {
      if (next.amount.kind === 'all') next.amount = { kind: 'count', n: 1 };
      if (next.crop === ALL_GOAL_CROPS) next.crop = 'tomato';
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface PlannerStore {
  settings: PlanSettings;
  /** Raw positions in the arrangement editor; mirrored into settings.arrangement.plots in custom mode. */
  customPlots: PlotPos[];
  /** Kept independently of arrangement mode so it isn't lost when switching to custom and back. */
  spaceLimit: SpaceLimit;

  setPlotCount: (n: number) => void;
  setArrangementMode: (mode: ArrangementSetting['mode']) => void;
  setSpaceLimit: (width: number | null, height: number | null) => void;
  setCustomPlots: (plots: PlotPos[]) => void;
  setGardeningLevel: (level: number | null) => void;
  addGoal: () => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  removeGoal: (id: string) => void;
  toggleHelper: (cropId: CropId) => void;
  setHelpers: (ids: CropId[]) => void;
  resetToExample: () => void;
  clearGoals: () => void;

  // NOTE for the results agent: this is the seam for plan-run state. Add
  // fields here (e.g. `planResult`, `isPlanning`, `lockedTiles`) rather than
  // creating a second store, so goals/arrangement/helpers stay in one place.
}

function initialPersistedState(): PersistedShape {
  return (
    readPersisted() ?? {
      settings: defaultSettings(),
      customPlots: [],
      spaceLimit: defaultSpaceLimit(),
    }
  );
}

export const useStore = create<PlannerStore>()((set) => {
  const init = initialPersistedState();

  return {
    settings: init.settings,
    customPlots: init.customPlots,
    spaceLimit: init.spaceLimit,

    setPlotCount: (n) =>
      set((state) => ({
        settings: { ...state.settings, plotCount: clamp(n, 1, RULES.maxPlots) },
      })),

    setArrangementMode: (mode) =>
      set((state) => {
        if (mode === 'custom') {
          return {
            settings: {
              ...state.settings,
              plotCount: state.customPlots.length,
              arrangement: { mode: 'custom', plots: state.customPlots },
            },
          };
        }
        return {
          settings: {
            ...state.settings,
            plotCount: Math.max(1, state.settings.plotCount),
            arrangement: { mode: 'suggest', maxWidth: state.spaceLimit.width, maxHeight: state.spaceLimit.height },
          },
        };
      }),

    setSpaceLimit: (width, height) =>
      set((state) => {
        const spaceLimit: SpaceLimit = { width, height };
        if (state.settings.arrangement.mode === 'suggest') {
          return {
            spaceLimit,
            settings: { ...state.settings, arrangement: { mode: 'suggest', maxWidth: width, maxHeight: height } },
          };
        }
        return { spaceLimit };
      }),

    setCustomPlots: (plots) =>
      set((state) => {
        if (state.settings.arrangement.mode === 'custom') {
          return {
            customPlots: plots,
            settings: { ...state.settings, plotCount: plots.length, arrangement: { mode: 'custom', plots } },
          };
        }
        return { customPlots: plots };
      }),

    setGardeningLevel: (level) =>
      set((state) => ({
        settings: { ...state.settings, gardeningLevel: level === null ? null : Math.max(1, Math.round(level)) },
      })),

    addGoal: () =>
      set((state) => ({
        settings: { ...state.settings, goals: [...state.settings.goals, newGoal()] },
      })),

    updateGoal: (id, patch) =>
      set((state) => ({
        settings: {
          ...state.settings,
          goals: state.settings.goals.map((g) => (g.id === id ? applyGoalPatch(g, patch) : g)),
        },
      })),

    removeGoal: (id) =>
      set((state) => ({
        settings: { ...state.settings, goals: state.settings.goals.filter((g) => g.id !== id) },
      })),

    toggleHelper: (cropId) =>
      set((state) => {
        const has = state.settings.helpers.includes(cropId);
        return {
          settings: {
            ...state.settings,
            helpers: has ? state.settings.helpers.filter((id) => id !== cropId) : [...state.settings.helpers, cropId],
          },
        };
      }),

    setHelpers: (ids) =>
      set((state) => ({
        settings: { ...state.settings, helpers: Array.from(new Set(ids)) },
      })),

    resetToExample: () =>
      set(() => ({
        settings: defaultSettings(),
        customPlots: [],
        spaceLimit: defaultSpaceLimit(),
      })),

    clearGoals: () =>
      set((state) => ({
        settings: { ...state.settings, goals: [] },
      })),
  };
});

// Persist on every change. Kept outside the actions above so callers can't
// forget to save, and so the save logic stays in one place.
useStore.subscribe((state) => {
  writePersisted({ settings: state.settings, customPlots: state.customPlots, spaceLimit: state.spaceLimit });
});
