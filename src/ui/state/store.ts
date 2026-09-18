import { create } from 'zustand';
import { CROP_BY_ID } from '../../data/crops';
import { buildGarden } from '../../engine/garden';
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
  type PlanProgress,
  type PlanResult,
  type Placement,
  type PlotPos,
  type TilePos,
} from '../../engine/types';
import type { DragItem, DropTarget } from '../dnd/types';
import { applyDrop, reorderGoals } from '../goals/goalDrops';
import { eraseAt, placeCropAt, toggleLockAtTile, toggleLockPlotAt as computeLockPlotToggle } from '../results/edit';
import { isSearchTime, type SearchTime } from '../results/planTiming';

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
  searchTime: SearchTime;
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
    { id: makeId(), crop: ALL_GOAL_CROPS, measure: 'waterRetain', amount: { kind: 'all' }, importance: 'medium' },
    { id: makeId(), crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'low' },
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

/** Validates the part of the persisted shape that predates the searchTime field (see readPersisted). */
function isPersistedCore(v: unknown): v is Omit<PersistedShape, 'searchTime'> {
  if (!v || typeof v !== 'object') return false;
  const p = v as { settings?: unknown; customPlots?: unknown; spaceLimit?: unknown };
  return isPlanSettings(p.settings) && Array.isArray(p.customPlots) && p.customPlots.every(isPlotPos) && isSpaceLimit(p.spaceLimit);
}

function readPersisted(): PersistedShape | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedCore(parsed)) return null;
    // searchTime was added after the first release; default it rather than
    // rejecting otherwise-valid older saves that lack it.
    const storedSearchTime = (parsed as { searchTime?: unknown }).searchTime;
    return { ...parsed, searchTime: isSearchTime(storedSearchTime) ? storedSearchTime : 'normal' };
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
// Run state: a plan in progress or its result, and per-solution edits
// ---------------------------------------------------------------------------

export type RunStatus = 'idle' | 'running' | 'done' | 'stopped' | 'error';

/** One past state to undo back to (see undoEdit). */
interface EditSnapshot {
  placements: Placement[];
  lockedTiles: TilePos[];
}

/** The displayed layout for one solution tab: live placements, locks, and undo history. */
export interface SolutionEditState {
  placements: Placement[];
  lockedTiles: TilePos[];
  history: EditSnapshot[];
}

const MAX_UNDO_HISTORY = 50;

function withHistory(es: SolutionEditState): EditSnapshot[] {
  const history = [...es.history, { placements: es.placements, lockedTiles: es.lockedTiles }];
  return history.length > MAX_UNDO_HISTORY ? history.slice(history.length - MAX_UNDO_HISTORY) : history;
}

function freshSolutionStates(result: PlanResult): SolutionEditState[] {
  return result.solutions.map((s): SolutionEditState => ({ placements: s.placements, lockedTiles: [], history: [] }));
}

function clearedRunState() {
  return {
    status: 'idle' as RunStatus,
    progress: null as PlanProgress | null,
    result: null as PlanResult | null,
    selectedIndex: 0,
    solutionStates: [] as SolutionEditState[],
    errorMessage: null as string | null,
    lastPlanSettingsJson: null as string | null,
    reoptimizing: false,
    reoptimizeError: null as string | null,
  };
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
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  removeGoal: (id: string) => void;
  /** Moves a goal to `importance`'s lane at display position `index` (see reorderGoals in goals/goalDrops.ts). */
  reorderGoal: (id: string, importance: Importance, index: number) => void;
  toggleHelper: (cropId: CropId) => void;
  setHelpers: (ids: CropId[]) => void;
  resetToExample: () => void;
  /**
   * Applies one goals-board or helpers-tray drop or tap-to-place gesture
   * (see goals/goalDrops.ts's applyDrop for the full rule set). Returns
   * whether it was handled, so a useDropHandler can fall through to another
   * area's handler when it wasn't (e.g. a garden tile target).
   */
  applyGoalDrop: (item: DragItem, target: DropTarget | null) => boolean;

  // -- Run state (project task spec, Task A/B) --------------------------

  /** Quick/normal/thorough search time, persisted alongside settings. */
  searchTime: SearchTime;
  setSearchTime: (t: SearchTime) => void;

  status: RunStatus;
  progress: PlanProgress | null;
  result: PlanResult | null;
  /** Which solution tab (0 = Best) is shown. */
  selectedIndex: number;
  /** Per-solution displayed layout, locks and undo history; parallel to result.solutions. */
  solutionStates: SolutionEditState[];
  errorMessage: string | null;
  /** JSON snapshot of the settings used for the last plan run, for the "settings changed" note. */
  lastPlanSettingsJson: string | null;

  /** Called by useRunPlanner as a run starts, progresses, and finishes. */
  planStarted: (settingsUsed: PlanSettings) => void;
  planProgress: (progress: PlanProgress) => void;
  planSucceeded: (result: PlanResult) => void;
  /** Aborted early: `best` is the last progress snapshot's best layout, if any. */
  planStopped: (best: PlanResult['solutions'][number] | null) => void;
  planFailed: (message: string) => void;

  selectSolution: (index: number) => void;

  // -- Editing (Task B) ---------------------------------------------------

  placeCrop: (cropId: CropId, x: number, y: number) => { ok: boolean; message: string | null };
  eraseCrop: (x: number, y: number) => { ok: boolean; message: string | null };
  /** Moves the plant covering `from` so its top-left is `to`, as one undo step. */
  moveCrop: (from: TilePos, to: TilePos) => { ok: boolean; message: string | null };

  // -- Palette selection (tap a palette item, then tap where it goes) ------

  selectedItem: DragItem | null;
  selectItem: (item: DragItem | null) => void;
  toggleLockPlantAt: (x: number, y: number) => void;
  toggleLockPlotAt: (x: number, y: number) => void;
  unlockAllForSelected: () => void;
  undoEdit: () => void;

  reoptimizing: boolean;
  reoptimizeError: string | null;
  reoptimizeStarted: () => void;
  reoptimizeSucceeded: (index: number, placements: Placement[]) => void;
  reoptimizeFailed: (message: string) => void;
}

function initialPersistedState(): PersistedShape {
  return (
    readPersisted() ?? {
      settings: defaultSettings(),
      customPlots: [],
      spaceLimit: defaultSpaceLimit(),
      searchTime: 'normal',
    }
  );
}

export const useStore = create<PlannerStore>()((set, get) => {
  const init = initialPersistedState();

  return {
    settings: init.settings,
    customPlots: init.customPlots,
    spaceLimit: init.spaceLimit,
    searchTime: init.searchTime,
    ...clearedRunState(),

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

    reorderGoal: (id, importance, index) =>
      set((state) => ({
        settings: { ...state.settings, goals: reorderGoals(state.settings.goals, id, importance, index) },
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
        ...clearedRunState(),
      })),

    applyGoalDrop: (item, target) => {
      const state = get();
      const result = applyDrop({ goals: state.settings.goals, helpers: state.settings.helpers }, item, target);
      if (!result) return false;
      set((s) => ({ settings: { ...s.settings, goals: result.goals, helpers: result.helpers } }));
      return true;
    },

    // -- Run state ----------------------------------------------------

    setSearchTime: (t) => set({ searchTime: t }),

    planStarted: (settingsUsed) =>
      set({
        ...clearedRunState(),
        status: 'running',
        lastPlanSettingsJson: JSON.stringify(settingsUsed),
      }),

    planProgress: (progress) => set({ progress }),

    planSucceeded: (result) =>
      set({
        status: 'done',
        result,
        selectedIndex: 0,
        solutionStates: freshSolutionStates(result),
        progress: null,
      }),

    planStopped: (best) =>
      set(() => {
        if (!best) {
          return { status: 'stopped' as RunStatus, result: null, solutionStates: [], selectedIndex: 0, progress: null };
        }
        const result: PlanResult = { solutions: [best], arrangementsTried: 1, elapsedMs: 0 };
        return {
          status: 'stopped' as RunStatus,
          result,
          selectedIndex: 0,
          solutionStates: freshSolutionStates(result),
          progress: null,
        };
      }),

    planFailed: (message) =>
      set({ status: 'error', errorMessage: message, result: null, solutionStates: [], progress: null }),

    selectSolution: (index) =>
      set((s) => (s.result && index >= 0 && index < s.result.solutions.length ? { selectedIndex: index } : {})),

    // -- Editing --------------------------------------------------------

    placeCrop: (cropId, x, y) => {
      const s = get();
      const solution = s.result?.solutions[s.selectedIndex];
      const editState = s.solutionStates[s.selectedIndex];
      if (!solution || !editState) return { ok: false, message: null };

      const garden = buildGarden(solution.plots);
      const outcome = placeCropAt(garden, CROP_BY_ID, editState.placements, editState.lockedTiles, cropId, x, y);
      if (outcome.changed) {
        const index = s.selectedIndex;
        set((st) => ({
          solutionStates: st.solutionStates.map((es, i) =>
            i === index ? { placements: outcome.placements, lockedTiles: es.lockedTiles, history: withHistory(es) } : es,
          ),
        }));
      }
      return { ok: outcome.changed, message: outcome.message };
    },

    eraseCrop: (x, y) => {
      const s = get();
      const solution = s.result?.solutions[s.selectedIndex];
      const editState = s.solutionStates[s.selectedIndex];
      if (!solution || !editState) return { ok: false, message: null };

      const garden = buildGarden(solution.plots);
      const outcome = eraseAt(garden, CROP_BY_ID, editState.placements, editState.lockedTiles, x, y);
      if (outcome.changed) {
        const index = s.selectedIndex;
        set((st) => ({
          solutionStates: st.solutionStates.map((es, i) =>
            i === index ? { placements: outcome.placements, lockedTiles: es.lockedTiles, history: withHistory(es) } : es,
          ),
        }));
      }
      return { ok: outcome.changed, message: outcome.message };
    },

    moveCrop: (from, to) => {
      const s = get();
      const solution = s.result?.solutions[s.selectedIndex];
      const editState = s.solutionStates[s.selectedIndex];
      if (!solution || !editState) return { ok: false, message: null };

      const garden = buildGarden(solution.plots);
      const moving = editState.placements.find((p) => {
        const size = CROP_BY_ID.get(p.cropId)?.size ?? 1;
        return from.x >= p.x && from.x < p.x + size && from.y >= p.y && from.y < p.y + size;
      });
      if (!moving) return { ok: false, message: null };

      const erased = eraseAt(garden, CROP_BY_ID, editState.placements, editState.lockedTiles, from.x, from.y);
      if (!erased.changed) return { ok: false, message: erased.message };
      const placed = placeCropAt(garden, CROP_BY_ID, erased.placements, editState.lockedTiles, moving.cropId, to.x, to.y);
      if (!placed.changed) return { ok: false, message: placed.message };

      const index = s.selectedIndex;
      set((st) => ({
        solutionStates: st.solutionStates.map((es, i) =>
          i === index ? { placements: placed.placements, lockedTiles: es.lockedTiles, history: withHistory(es) } : es,
        ),
      }));
      return { ok: true, message: null };
    },

    selectedItem: null,
    selectItem: (item) => set({ selectedItem: item }),

    toggleLockPlantAt: (x, y) =>
      set((s) => {
        const index = s.selectedIndex;
        const solution = s.result?.solutions[index];
        const editState = s.solutionStates[index];
        if (!solution || !editState) return {};
        const garden = buildGarden(solution.plots);
        const lockedTiles = toggleLockAtTile(garden, CROP_BY_ID, editState.placements, editState.lockedTiles, x, y);
        return {
          solutionStates: s.solutionStates.map((es, i) =>
            i === index ? { placements: es.placements, lockedTiles, history: withHistory(es) } : es,
          ),
        };
      }),

    toggleLockPlotAt: (x, y) =>
      set((s) => {
        const index = s.selectedIndex;
        const solution = s.result?.solutions[index];
        const editState = s.solutionStates[index];
        if (!solution || !editState) return {};
        const garden = buildGarden(solution.plots);
        const lockedTiles = computeLockPlotToggle(garden, editState.lockedTiles, x, y);
        return {
          solutionStates: s.solutionStates.map((es, i) =>
            i === index ? { placements: es.placements, lockedTiles, history: withHistory(es) } : es,
          ),
        };
      }),

    unlockAllForSelected: () =>
      set((s) => {
        const index = s.selectedIndex;
        const editState = s.solutionStates[index];
        if (!editState || editState.lockedTiles.length === 0) return {};
        return {
          solutionStates: s.solutionStates.map((es, i) =>
            i === index ? { placements: es.placements, lockedTiles: [], history: withHistory(es) } : es,
          ),
        };
      }),

    undoEdit: () =>
      set((s) => {
        const index = s.selectedIndex;
        const es = s.solutionStates[index];
        if (!es || es.history.length === 0) return {};
        const last = es.history[es.history.length - 1];
        const updated: SolutionEditState = {
          placements: last.placements,
          lockedTiles: last.lockedTiles,
          history: es.history.slice(0, -1),
        };
        return { solutionStates: s.solutionStates.map((e, i) => (i === index ? updated : e)) };
      }),

    reoptimizeStarted: () => set({ reoptimizing: true, reoptimizeError: null }),

    reoptimizeSucceeded: (index, placements) =>
      set((s) => {
        const es = s.solutionStates[index];
        if (!es) return { reoptimizing: false };
        const updated: SolutionEditState = { placements, lockedTiles: es.lockedTiles, history: withHistory(es) };
        return {
          reoptimizing: false,
          solutionStates: s.solutionStates.map((e, i) => (i === index ? updated : e)),
        };
      }),

    reoptimizeFailed: (message) => set({ reoptimizing: false, reoptimizeError: message }),
  };
});

/** True once the current settings differ from the settings used for the last plan run. */
export function isStaleResult(state: PlannerStore): boolean {
  return state.lastPlanSettingsJson !== null && JSON.stringify(state.settings) !== state.lastPlanSettingsJson;
}

// Persist on every change. Kept outside the actions above so callers can't
// forget to save, and so the save logic stays in one place. Run state
// (status/progress/result/edits) is deliberately not persisted.
useStore.subscribe((state) => {
  writePersisted({
    settings: state.settings,
    customPlots: state.customPlots,
    spaceLimit: state.spaceLimit,
    searchTime: state.searchTime,
  });
});
