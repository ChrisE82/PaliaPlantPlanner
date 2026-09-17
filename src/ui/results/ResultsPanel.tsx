/**
 * The results panel: planner progress, the selected solution evaluated live
 * against the current settings, and edit mode (project task spec, Task A
 * step 5, Task B).
 */
import { useEffect, useState } from 'react';
import { CROPS, CROP_BY_ID } from '../../data/crops';
import { computeBuffs, describeBuffs } from '../../engine/buffs';
import { explainGoals } from '../../engine/explain';
import { buildGarden } from '../../engine/garden';
import { goalCropIds, goalLabel } from '../../engine/goals';
import { precheck } from '../../engine/precheck';
import { layoutStats, makeScoreContext } from '../../engine/score';
import { shoppingList } from '../../engine/shopping';
import type { CropId, Goal } from '../../engine/types';
import { isStaleResult, useStore } from '../state/store';
import { goalsInvolvingCrop } from './buffRequests';
import CompareTable, { type CompareOption } from './CompareTable';
import CropPalette from './CropPalette';
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

      <OptionTabs solutions={result.solutions} editedFlags={editedFlags} selectedIndex={idx} onSelect={selectSolution} />

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

      <div className="results-panel__toolbar">
        <button type="button" aria-pressed={editMode} onClick={handleToggleEditMode}>
          {editMode ? 'Done editing' : 'Edit layout'}
        </button>
        <button type="button" onClick={handleUseArrangement}>
          Use this arrangement
        </button>
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
  );
}
