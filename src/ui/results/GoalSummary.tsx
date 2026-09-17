/**
 * One row per goal: a status badge, label, importance, value, a thin score
 * bar and the reason (project task spec, Task A step 5). Falls back to a
 * stacked card layout at narrow widths (see .goal-summary in results.css).
 */
import { IMPORTANCE_NAMES, type Goal, type GoalReport } from '../../engine/types';

const STATUS_TEXT: Record<GoalReport['status'], string> = {
  met: 'Met',
  partial: 'Partly met',
  unmet: 'Not met',
  info: 'Result',
};

const STATUS_BADGE: Record<GoalReport['status'], string> = {
  met: 'badge--ok',
  partial: 'badge--warn',
  unmet: 'badge--danger',
  info: '',
};

export interface GoalSummaryProps {
  reports: readonly GoalReport[];
  goalsById: ReadonlyMap<string, Goal>;
}

export default function GoalSummary({ reports, goalsById }: GoalSummaryProps) {
  return (
    <div className="table-scroll">
      <table className="goal-summary">
        <caption>Goal summary</caption>
        <thead>
          <tr>
            <th scope="col">Status</th>
            <th scope="col">Goal</th>
            <th scope="col">Importance</th>
            <th scope="col">Value</th>
            <th scope="col">Score</th>
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => {
            const goal = goalsById.get(r.goalId);
            return (
              <tr key={r.goalId} className={`goal-summary__row goal-summary__row--${r.status}`}>
                <td data-label="Status">
                  <span className={`badge ${STATUS_BADGE[r.status]}`.trim()}>{STATUS_TEXT[r.status]}</span>
                </td>
                <td data-label="Goal">{r.label}</td>
                <td data-label="Importance">{goal ? IMPORTANCE_NAMES[goal.importance] : ''}</td>
                <td data-label="Value">{r.value}</td>
                <td data-label="Score" className="num">
                  <progress
                    className="goal-summary__score"
                    value={r.score}
                    max={1}
                    aria-label={`Score ${Math.round(r.score * 100)}%`}
                  />
                </td>
                <td data-label="Reason" className="muted">
                  {r.reason ?? ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
