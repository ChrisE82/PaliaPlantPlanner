/**
 * The results panel: planner progress, the selected solution evaluated live
 * against the current settings, and edit mode (project task spec, Task A
 * step 5, Task B) — including drag and drop, layered over the same store
 * actions and edit.ts rules that click-to-place and the keyboard paths use.
 */
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDndContext,
  useSensor,
  useSensors,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core';
import { useEffect, useState } from 'react';
import { CROPS, CROP_BY_ID } from '../../data/crops';
import { computeBuffs, describeBuffs } from '../../engine/buffs';
import { explainGoals } from '../../engine/explain';
import { buildGarden } from '../../engine/garden';
import { goalCropIds, goalLabel } from '../../engine/goals';
import { precheck } from '../../engine/precheck';
import { layoutStats, makeScoreContext } from '../../engine/score';
import { shoppingList } from '../../engine/shopping';
import type { CropId, Goal, TilePos } from '../../engine/types';
import { CheckIcon, PencilIcon } from '../icons';
import CropSwatch from '../CropSwatch';
import { isStaleResult, useStore } from '../state/store';
import { goalsInvolvingCrop } from './buffRequests';
import CompareTable, { type CompareOption } from './CompareTable';
import CropPalette from './CropPalette';
import { createDragAnnouncements, gridCollisionDetection, tileKeyboardCoordinateGetter } from './dndConfig';
import { planDrop, type DragItemData } from './dragDrop';
import EditToolbar from './EditToolbar';
import GardenGrid, { type EditTool } from './GardenGrid';
import GoalSummary from './GoalSummary';
import OptionTabs from './OptionTabs';
import PlantDetails from './PlantDetails';
import ProgressView from './ProgressView';
import ShoppingList from './ShoppingList';

export interface ResultsPanelProps {
  onStop: () => void;
  onReoptimize: () => void;
}

// Stable across the component's lifetime (CROP_BY_ID is static data), so
// these live at module scope rather than being recreated, or memoized,
// every render.
const dragAnnouncements = createDragAnnouncements(CROP_BY_ID);
const dragInstructions: ScreenReaderInstructions = {
  draggable:
    'To pick this up, press space or enter. Use the arrow keys to move it over the garden, space or enter to drop it, or escape to cancel.',
};

/** The crop icon following the pointer/keyboard focus while dragging; reads the active drag from context. */
function DragOverlayGhost() {
  const { active } = useDndContext();
  const data = active?.data.current as DragItemData | undefined;
  const crop = data ? CROP_BY_ID.get(data.cropId) : undefined;
  if (!crop) return null;
  return (
    <div className="garden-grid__drag-ghost">
      <CropSwatch crop={crop} />
    </div>
  );
}

export default function ResultsPanel({ onStop, onReoptimize }: ResultsPanelProps) {
  const status = useStore((s) => s.status);
  const progress = useStore((s) => s.progress);
  const result = useStore((s) => s.result);
  const errorMessage = useStore((s) => s.errorMessage);
  const settings = useStore((s) => s.settings);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const solutionStates = useStore((s) => s.solutionStates);
  const reoptimizing = useStore((s) => s.reoptimizing);
  const reoptimizeError = useStore((s) => s.reoptimizeError);
  const stale = useStore(isStaleResult);

  const selectSolution = useStore((s) => s.selectSolution);
  const placeCrop = useStore((s) => s.placeCrop);
  const eraseCrop = useStore((s) => s.eraseCrop);
  const toggleLockPlantAt = useStore((s) => s.toggleLockPlantAt);
  const toggleLockPlotAt = useStore((s) => s.toggleLockPlotAt);
  const unlockAllForSelected = useStore((s) => s.unlockAllForSelected);
  const undoEdit = useStore((s) => s.undoEdit);
  const setCustomPlots = useStore((s) => s.setCustomPlots);
  const setArrangementMode = useStore((s) => s.setArrangementMode);

  const [editMode, setEditMode] = useState(false);
  const [tool, setTool] = useState<EditTool>('plant');
  const [selectedCropId, setSelectedCropId] = useState<CropId | null>(null);
  const [selectedPlacementIndex, setSelectedPlacementIndex] = useState<number | null>(null);
  const [toolMessage, setToolMessage] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: tileKeyboardCoordinateGetter }),
  );

  const idx = result ? Math.min(selectedIndex, result.solutions.length - 1) : 0;
  const currentPlacements = result ? solutionStates[idx]?.placements : undefined;

  // A tab switch or any edit invalidates a previously selected placement index.
  useEffect(() => {
    setSelectedPlacementIndex(null);
  }, [idx, currentPlacements]);

  if (status === 'idle') {
    return (
      <section className="panel results-panel results-panel--empty" aria-label="Results">
        <p>Set your goals, then plan your garden.</p>
      </section>
    );
  }

  if (status === 'running') {
    return <ProgressView progress={progress} onStop={onStop} />;
  }

  if (status === 'error') {
    return (
      <section className="panel results-panel results-panel--empty" aria-label="Results">
        <p className="issue issue--error" role="alert">{`Error: ${errorMessage ?? 'Something went wrong.'}`}</p>
      </section>
    );
  }

  if (!result || result.solutions.length === 0) {
    return (
      <section className="panel results-panel results-panel--empty" aria-label="Results">
        <p>
          {status === 'stopped'
            ? 'Stopped before finding a layout. Plan again to try.'
            : 'The planner could not find a layout. Try different goals, helpers or more plots.'}
        </p>
      </section>
    );
  }

  const solution = result.solutions[idx];
  const editState = solutionStates[idx] ?? { placements: solution.placements, lockedTiles: [], history: [] };
  const placements = editState.placements;

  const garden = buildGarden(solution.plots);
  const buffs = computeBuffs(garden, placements, CROP_BY_ID);
  const scoreCtx = makeScoreContext(garden, settings.goals, CROP_BY_ID);
  const issues = precheck(settings, CROPS);
  const goalReports = explainGoals(scoreCtx, placements, buffs, issues);
  const shopping = shoppingList(placements, CROP_BY_ID);
  const goalCrops = goalCropIds(settings.goals);
  const goalsById = new Map<string, Goal>(settings.goals.map((g) => [g.id, g]));
  const goalLabelsById = new Map<string, string>(settings.goals.map((g) => [g.id, goalLabel(g, CROP_BY_ID)]));

  const mustUnmet = goalReports.filter((r) => {
    const goal = goalsById.get(r.goalId);
    return goal?.importance === 'must' && (r.status === 'partial' || r.status === 'unmet');
  });
  const mustStatusBadge = mustUnmet.some((r) => r.status === 'unmet')
    ? 'badge--danger'
    : mustUnmet.length > 0
      ? 'badge--warn'
      : 'badge--ok';
  const mustStatusText =
    mustUnmet.length === 0 ? 'All goals met' : `${mustUnmet.length} Must goal${mustUnmet.length > 1 ? 's' : ''} not met`;

  const editedFlags = solutionStates.map((es) => es.history.length > 0);

  const selectedPlacement = selectedPlacementIndex !== null ? placements[selectedPlacementIndex] : null;
  const selectedCrop = selectedPlacement ? CROP_BY_ID.get(selectedPlacement.cropId) : null;
  const selectedDetails =
    selectedPlacementIndex !== null ? describeBuffs(garden, placements, CROP_BY_ID, selectedPlacementIndex) : [];
  const selectedGoals = selectedCrop ? goalsInvolvingCrop(settings.goals, goalCrops, selectedCrop.id) : [];

  const compareOptions: CompareOption[] = result.solutions.map((s, i) => {
    const es = solutionStates[i] ?? { placements: s.placements, lockedTiles: [] };
    const g = buildGarden(s.plots);
    const b = computeBuffs(g, es.placements, CROP_BY_ID);
    const ctx = makeScoreContext(g, settings.goals, CROP_BY_ID);
    const reports = explainGoals(ctx, es.placements, b);
    const stats = layoutStats(ctx, es.placements, b);
    return {
      label: s.label,
      goalValues: new Map(reports.map((r) => [r.goalId, r.value])),
      filledTiles: stats.filledTiles,
    };
  });

  function handleTileActivate(x: number, y: number) {
    setToolMessage(null);
    if (tool === 'plant') {
      if (!selectedCropId) {
        setToolMessage('Choose a crop to plant first.');
        return;
      }
      const outcome = placeCrop(selectedCropId, x, y);
      if (!outcome.ok && outcome.message) setToolMessage(outcome.message);
    } else if (tool === 'erase') {
      const outcome = eraseCrop(x, y);
      if (!outcome.ok && outcome.message) setToolMessage(outcome.message);
    } else if (tool === 'lockPlant') {
      toggleLockPlantAt(x, y);
    } else {
      toggleLockPlotAt(x, y);
    }
  }

  /**
   * Carries out a drop (a palette chip placing a crop, or a plant being
   * moved) using the same rules as the click/keyboard paths. A move is not
   * a single store action (see the setup agent note in the task report), so
   * it's an erase of the old tiles followed by a place at the new ones;
   * planDrop already validated the whole thing first, so the place step is
   * only expected to fail if something changed underneath it, in which case
   * the erase is undone rather than leaving the plant missing.
   */
  function handleDragEnd(event: DragEndEvent) {
    const overData = event.over?.data.current as TilePos | undefined;
    if (!overData) return;
    const itemData = event.active.data.current as DragItemData | undefined;
    if (!itemData) return;

    const plan = planDrop(garden, CROP_BY_ID, placements, editState.lockedTiles, itemData, overData);
    if (plan.action === 'none') {
      setToolMessage(plan.message);
      return;
    }
    setToolMessage(null);

    if (plan.action === 'place') {
      const outcome = placeCrop(plan.cropId, plan.x, plan.y);
      if (!outcome.ok && outcome.message) setToolMessage(outcome.message);
      return;
    }

    const erased = eraseCrop(plan.from.x, plan.from.y);
    if (!erased.ok) {
      if (erased.message) setToolMessage(erased.message);
      return;
    }
    const placed = placeCrop(plan.cropId, plan.to.x, plan.to.y);
    if (!placed.ok) {
      undoEdit();
      if (placed.message) setToolMessage(placed.message);
    }
  }

  function handleToggleEditMode() {
    setEditMode((v) => !v);
    setTool('plant');
    setToolMessage(null);
    setSelectedPlacementIndex(null);
  }

  function handleUseArrangement() {
    setCustomPlots(solution.plots);
    setArrangementMode('custom');
  }

  return (
    <DndContext
      id="garden-dnd"
      sensors={sensors}
      collisionDetection={gridCollisionDetection}
      onDragStart={() => setToolMessage(null)}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements: dragAnnouncements, screenReaderInstructions: dragInstructions }}
    >
      <section className="panel results-panel" aria-label="Results">
        {stale && <p className="issue issue--warning">Your settings changed after this plan. Plan again to update it.</p>}
        {status === 'stopped' && <p className="muted">Stopped early. This is the best layout found so far.</p>}

        <div className="results-toolbar">
          <OptionTabs solutions={result.solutions} editedFlags={editedFlags} selectedIndex={idx} onSelect={selectSolution} />
          <div className="results-toolbar__actions">
            <button type="button" className={editMode ? 'primary' : ''} aria-pressed={editMode} onClick={handleToggleEditMode}>
              {editMode ? <CheckIcon aria-hidden="true" /> : <PencilIcon aria-hidden="true" />}
              {editMode ? 'Done editing' : 'Edit layout'}
            </button>
            <button type="button" onClick={handleUseArrangement}>
              Use this arrangement
            </button>
          </div>
        </div>

        <div className="results-status">
          <span className={`badge ${mustStatusBadge}`}>{mustStatusText}</span>
        </div>

        {mustUnmet.map((r) => (
          <p key={r.goalId} className="issue issue--error" role="alert">
            {`Must goal not met: ${r.label}.${r.reason ? ` ${r.reason}` : ''}`}
          </p>
        ))}

        <GardenGrid
          garden={garden}
          placements={placements}
          cropsById={CROP_BY_ID}
          buffs={buffs}
          goals={settings.goals}
          goalCrops={goalCrops}
          lockedTiles={editState.lockedTiles}
          selectedIndex={editMode ? null : selectedPlacementIndex}
          onSelectPlacement={editMode ? undefined : (i) => setSelectedPlacementIndex(i)}
          interactive={
            editMode
              ? { tool, previewCropId: tool === 'plant' ? selectedCropId : null, onTileActivate: handleTileActivate }
              : undefined
          }
        />

        {editMode && (
          <>
            <EditToolbar
              tool={tool}
              onToolChange={(t) => {
                setTool(t);
                setToolMessage(null);
              }}
              onUndo={undoEdit}
              canUndo={editState.history.length > 0}
              onUnlockAll={unlockAllForSelected}
              canUnlockAll={editState.lockedTiles.length > 0}
              onReoptimize={onReoptimize}
              reoptimizing={reoptimizing}
            />
            {tool === 'plant' && (
              <CropPalette
                gardeningLevel={settings.gardeningLevel}
                goalCrops={goalCrops}
                helpers={settings.helpers}
                selectedCropId={selectedCropId}
                onSelect={setSelectedCropId}
              />
            )}
            {toolMessage && (
              <p className="issue issue--error" role="alert">
                {toolMessage}
              </p>
            )}
            {reoptimizeError && (
              <p className="issue issue--error" role="alert">
                {reoptimizeError}
              </p>
            )}
          </>
        )}

        {!editMode && selectedCrop && selectedPlacement && (
          <PlantDetails
            crop={selectedCrop}
            x={selectedPlacement.x}
            y={selectedPlacement.y}
            details={selectedDetails}
            cropsById={CROP_BY_ID}
            goalsForCrop={selectedGoals}
          />
        )}

        <GoalSummary reports={goalReports} goalsById={goalsById} />

        <CompareTable goals={settings.goals} goalLabels={goalLabelsById} options={compareOptions} />

        <ShoppingList list={shopping} />
      </section>

      {/* No drop-animation: DragOverlayGhost reads the active drag reactively, so it
          disappears the instant the drop is committed rather than animating an
          overlay that no longer has anything to show. */}
      <DragOverlay dropAnimation={null}>
        <DragOverlayGhost />
      </DragOverlay>
    </DndContext>
  );
}
