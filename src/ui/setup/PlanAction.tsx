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
 * The plan button and search-time select. A normal block at the end of the
 * rail on wide screens; on phones (see setup.css's override of shell.css's
 * .action-bar--mobile) it becomes a sticky bar pinned to the bottom.
 */
export default function PlanAction({ onPlan, canPlan, isRunning, errorCount }: PlanActionProps) {
  const searchTime = useStore((s) => s.searchTime);
  const setSearchTime = useStore((s) => s.setSearchTime);

  return (
    <div className="plan-action action-bar action-bar--mobile">
      <div className="plan-action__row">
        <div className="field plan-action__search">
          <label htmlFor="search-time" className="field-label">
            Search time
          </label>
          <select id="search-time" value={searchTime} onChange={(e) => setSearchTime(e.target.value as SearchTime)}>
            {SEARCH_TIME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
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
