import { SEARCH_TIME_OPTIONS, type SearchTime } from '../results/planTiming';
import { useStore } from '../state/store';

interface PlanActionProps {
  /** Wired up once the results panel can run the planner (see PLAN.md section 5). */
  onPlan?: () => void;
  canPlan: boolean;
  isRunning: boolean;
  /** Precheck error count, for the disabled-reason line. */
  errorCount: number;
}

/**
 * The plan button and search-time segmented control (no select). A normal
 * block at the end of the rail on wide screens; on phones (see setup.css's
 * override of shell.css's .action-bar--mobile) it becomes a sticky bar
 * pinned to the bottom.
 */
export default function PlanAction({ onPlan, canPlan, isRunning, errorCount }: PlanActionProps) {
  const searchTime = useStore((s) => s.searchTime);
  const setSearchTime = useStore((s) => s.setSearchTime);

  return (
    <div className="plan-action action-bar action-bar--mobile">
      <div className="plan-action__row">
        <fieldset className="field plan-action__search">
          <legend className="field-label">Search time</legend>
          <div className="segmented">
            {SEARCH_TIME_OPTIONS.map((o) => (
              <label key={o.value} className="segmented__option">
                <input
                  type="radio"
                  name="search-time"
                  checked={searchTime === o.value}
                  onChange={() => setSearchTime(o.value as SearchTime)}
                />
                <span className="segmented__label">{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="button" className="btn btn--primary plan-action__button" disabled={!canPlan} onClick={onPlan}>
          {isRunning ? 'Planning...' : 'Plan my garden'}
        </button>
      </div>
      {!canPlan && errorCount > 0 && (
        <p className="plan-action__reason">
          {errorCount === 1 ? 'Fix the error above before planning.' : `Fix the ${errorCount} errors above before planning.`}
        </p>
      )}
    </div>
  );
}
