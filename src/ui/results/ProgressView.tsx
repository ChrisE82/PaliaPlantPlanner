/**
 * Planner progress: stage text, a progress bar, a Stop button, and the best
 * layout found so far (project task spec, Task A step 4).
 */
import { CROP_BY_ID } from '../../data/crops';
import { computeBuffs } from '../../engine/buffs';
import { buildGarden } from '../../engine/garden';
import type { CropId, Goal, PlanProgress, Placement, PlotPos } from '../../engine/types';
import { formatInt } from '../format';
import GardenGrid from './GardenGrid';

const NO_GOALS: readonly Goal[] = [];
const NO_GOAL_CROPS: ReadonlySet<CropId> = new Set();

function stageLabel(p: PlanProgress): string {
  const done = formatInt(p.done);
  const total = formatInt(p.total);
  if (p.stage === 'screening') return `Comparing arrangements: ${done} of ${total}`;
  if (p.stage === 'refining') return `Refining the best arrangements: ${done} of ${total}`;
  return `Finishing: ${done} of ${total}`;
}

export interface ProgressViewProps {
  progress: PlanProgress | null;
  onStop: () => void;
}

export default function ProgressView({ progress, onStop }: ProgressViewProps) {
  const hasTotal = !!progress && progress.total > 0;

  return (
    <section className="panel results-panel results-panel--progress" aria-label="Planning progress">
      <p className="progress-view__stage" aria-live="polite">
        {progress ? stageLabel(progress) : 'Planning...'}
      </p>
      <progress
        className="progress-view__bar"
        value={hasTotal ? progress!.done : undefined}
        max={hasTotal ? progress!.total : undefined}
      />
      <div className="progress-view__actions">
        <button type="button" onClick={onStop}>
          Stop
        </button>
      </div>

      {progress?.best && <BestSoFar plots={progress.best.plots} placements={progress.best.placements} />}
    </section>
  );
}

function BestSoFar({ plots, placements }: { plots: readonly PlotPos[]; placements: readonly Placement[] }) {
  const garden = buildGarden(plots);
  return (
    <div className="progress-view__best">
      <p className="progress-view__best-label">Best so far</p>
      <GardenGrid
        garden={garden}
        placements={placements}
        cropsById={CROP_BY_ID}
        buffs={computeBuffs(garden, placements, CROP_BY_ID)}
        goals={NO_GOALS}
        goalCrops={NO_GOAL_CROPS}
        lockedTiles={[]}
      />
    </div>
  );
}
