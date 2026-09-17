/**
 * One row per goal: status, label, importance, value and reason (project
 * task spec, Task A step 5).
 */
import { IMPORTANCE_NAMES, type Goal, type GoalReport } from '../../engine/types';

const STATUS_TEXT: Record<GoalReport['status'], string> = {
  met: 'Met',
  partial: 'Partly met',
  unmet: 'Not met',
  info: 'Result',
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
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => {
            const goal = goalsById.get(r.goalId);
            return (
              <tr key={r.goalId} className={`goal-summary__row goal-summary__row--${r.status}`}>
                <td>{STATUS_TEXT[r.status]}</td>
                <td>{r.label}</td>
                <td>{goal ? IMPORTANCE_NAMES[goal.importance] : ''}</td>
                <td>{r.value}</td>
                <td>{r.reason ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
