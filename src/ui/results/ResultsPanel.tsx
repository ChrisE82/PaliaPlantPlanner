/**
 * The results panel: planner progress, the selected solution evaluated live
 * against the current settings, and edit mode (project task spec, Task A
 * step 5, Task B) - including drag and drop, over the same store actions
 * and edit.ts rules that click-to-place and the keyboard paths use. Drag and
 * drop is plugged into the one app-wide drag context (src/ui/dnd/AppDnd.tsx)
 * shared with the palette and the goals board, rather than a context of its
 * own: see decideGardenDrop in dragDrop.ts for what a drop onto the garden
 * means.
 */
import { useState } from 'react';
import { CROPS, CROP_BY_ID } from '../../data/crops';
import { computeBuffs, describeBuffs } from '../../engine/buffs';
import { explainGoals } from '../../engine/explain';
import { buildGarden } from '../../engine/garden';
import { goalCropIds, goalLabel } from '../../engine/goals';
import { precheck } from '../../engine/precheck';
import { layoutStats, makeScoreContext } from '../../engine/score';
import { shoppingList } from '../../engine/shopping';
import type { Goal } from '../../engine/types';
import { useDropHandler } from '../dnd/AppDnd';
import type { DragItem, DropTarget } from '../dnd/types';
import { CheckIcon, PencilIcon } from '../icons';
import { isStaleResult, useStore } from '../state/store';
import { goalsInvolvingCrop } from './buffRequests';
import CompareTable, { type CompareOption } from './CompareTable';
import { decideGardenDrop } from './dragDrop';
import EditToolbar from './EditToolbar';
import GardenGrid, { type EditTool } from './GardenGrid';
import GoalSummary from './GoalSummary';
import OptionTabs from './OptionTabs';
import PlantDetails from './PlantDetails';
import ProgressView from './ProgressView';
import ResultTabs, { type ResultTab } from './ResultTabs';
import ShoppingList from './ShoppingList';

export interface ResultsPanelProps {
  onStop: () => void;
  onReoptimize: () => void;
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
  const moveCrop = useStore((s) => s.moveCrop);
  const toggleLockPlantAt = useStore((s) => s.toggleLockPlantAt);
  const toggleLockPlotAt = useStore((s) => s.toggleLockPlotAt);
  const unlockAllForSelected = useStore((s) => s.unlockAllForSelected);
  const undoEdit = useStore((s) => s.undoEdit);
  const setCustomPlots = useStore((s) => s.setCustomPlots);
  const setArrangementMode = useStore((s) => s.setArrangementMode);
  const selectedItem = useStore((s) => s.selectedItem);

  const [editMode, setEditMode] = useState(false);
  const [tool, setTool] = useState<EditTool>('plant');
  const [selectedPlacementIndex, setSelectedPlacementIndex] = useState<number | null>(null);
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>('goals');

  const selectedPaletteCropId = selectedItem?.kind === 'palette-crop' ? selectedItem.cropId : null;

  // Registered once; always calls the latest closure (see useDropHandler),
  // so it's fine that this reads settings-derived locals defined below the
  // early returns further down - garden/placements are recomputed fresh
  // from the store here rather than reused, since a hook can't follow an
  // early return.
  useDropHandler((item: DragItem, target: DropTarget | null): boolean => {
    if (!result || result.solutions.length === 0) return false;
    const i = Math.min(selectedIndex, result.solutions.length - 1);
    const solution = result.solutions[i];
    const editState = solutionStates[i] ?? { placements: solution.placements, lockedTiles: [], history: [] };
    const garden = buildGarden(solution.plots);
    const decision = decideGardenDrop(garden, CROP_BY_ID, editState.placements, editState.lockedTiles, item, target);

    switch (decision.action) {
      case 'not-garden':
        return false;
      case 'noop':
        setToolMessage(null);
        return true;
      case 'refused':
        setToolMessage(decision.message);
        return true;
      case 'place': {
        if (!editMode) {
          setEditMode(true);
          setTool('plant');
        }
        const outcome = placeCrop(decision.cropId, decision.x, decision.y);
        setToolMessage(outcome.ok ? null : outcome.message);
        return true;
      }
      case 'move': {
        const outcome = moveCrop(decision.from, decision.to);
        setToolMessage(outcome.ok ? null : outcome.message);
        return true;
      }
      case 'erase': {
        const outcome = eraseCrop(decision.x, decision.y);
        setToolMessage(outcome.ok ? null : outcome.message);
        return true;
      }
    }
  });

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

  const idx = Math.min(selectedIndex, result.solutions.length - 1);
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

  const showCompare = result.solutions.length > 1;
  const effectiveResultTab: ResultTab = resultTab === 'compare' && !showCompare ? 'goals' : resultTab;

  function handleTileActivate(x: number, y: number) {
    setToolMessage(null);
    if (tool === 'plant') {
      if (!selectedPaletteCropId) return; // the hint below the toolbar already says to pick one
      const outcome = placeCrop(selectedPaletteCropId, x, y);
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

      <div className="results-grid-row">
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
              ? { tool, previewCropId: tool === 'plant' ? selectedPaletteCropId : null, onTileActivate: handleTileActivate }
              : undefined
          }
        />

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
      </div>

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
          {tool === 'plant' && !selectedPaletteCropId && (
            <p className="muted">Pick a crop from the palette above, then tap or drag it onto the garden.</p>
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

      <ResultTabs tab={effectiveResultTab} onChange={setResultTab} showCompare={showCompare} />
      <div role="tabpanel" id={`result-tabpanel-${effectiveResultTab}`} aria-labelledby={`result-tab-${effectiveResultTab}`}>
        {effectiveResultTab === 'goals' && <GoalSummary reports={goalReports} goalsById={goalsById} />}
        {effectiveResultTab === 'compare' && (
          <CompareTable goals={settings.goals} goalLabels={goalLabelsById} options={compareOptions} />
        )}
        {effectiveResultTab === 'seeds' && <ShoppingList list={shopping} />}
      </div>
    </section>
  );
}
