import type { PrecheckIssue } from '../../engine/types';
import { useStore } from '../state/store';
import GoalRow from './GoalRow';
import IssueMessage from './IssueMessage';

interface GoalListProps {
  issues: readonly PrecheckIssue[];
}

export default function GoalList({ issues }: GoalListProps) {
  const goals = useStore((s) => s.settings.goals);
  const addGoal = useStore((s) => s.addGoal);
  const resetToExample = useStore((s) => s.resetToExample);
  const clearGoals = useStore((s) => s.clearGoals);

  const globalIssues = issues.filter((issue) => issue.goalId === null);

  return (
    <div className="goal-list-section">
      {globalIssues.map((issue, i) => (
        <IssueMessage key={i} issue={issue} />
      ))}

      <div className="goal-toolbar">
        <button type="button" onClick={addGoal}>
          Add goal
        </button>
        <button type="button" onClick={resetToExample}>
          Reset to example
        </button>
        <button type="button" onClick={clearGoals}>
          Clear goals
        </button>
      </div>

      <ul className="goal-list">
        {goals.map((goal) => (
          <li key={goal.id}>
            <GoalRow goal={goal} issues={issues.filter((issue) => issue.goalId === goal.id)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
