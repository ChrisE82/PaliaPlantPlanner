/**
 * The goals board: four importance lanes, each a wrapping row of goal
 * tokens. One useDropHandler here covers every drag-and-drop and
 * tap-to-place gesture on this side of the app (see goalDrops.ts for the
 * rules); a lane is just the goals with that importance, filtered from the
 * single settings.goals array, so its display order is that array's order.
 */
import { useDroppable } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { useMemo } from 'react';
import { IMPORTANCE_NAMES, IMPORTANCE_ORDER, type Goal, type Importance, type PrecheckIssue } from '../../engine/types';
import { useDragPreview, useDropHandler } from '../dnd/AppDnd';
import { dragId, dropId, type DragItem } from '../dnd/types';
import IssueMessage from '../setup/IssueMessage';
import { useStore } from '../state/store';
import GoalToken, { GoalTokenFace } from './GoalToken';

const LANE_DESCRIPTIONS: Readonly<Record<Importance, string>> = {
  must: 'Has to be met, or the plan shows a warning.',
  high: 'Gets space before Medium and Low.',
  medium: 'Gets what is left after Must and High.',
  low: 'Only gets space if nothing else needs it.',
};

interface LaneProps {
  importance: Importance;
  goals: Goal[];
  issuesByGoal: ReadonlyMap<string, PrecheckIssue[]>;
  selectedItem: DragItem | null;
  onAddHere: (importance: Importance) => void;
}

function Lane({ importance, goals, issuesByGoal, selectedItem, onAddHere }: LaneProps) {
  const target = { kind: 'lane' as const, importance };
  const { setNodeRef, isOver } = useDroppable({ id: dropId(target), data: { target } });
  const ids = goals.map((g) => dragId({ kind: 'goal', goalId: g.id }));

  return (
    <section
      ref={setNodeRef}
      className={`goal-lane${isOver ? ' goal-lane--over' : ''}`}
      aria-label={`${IMPORTANCE_NAMES[importance]} goals`}
    >
      <div className="goal-lane__header">
        <h3 className="goal-lane__title">{IMPORTANCE_NAMES[importance]}</h3>
        <span className="badge">{goals.length}</span>
      </div>
      <p className="goal-lane__desc">{LANE_DESCRIPTIONS[importance]}</p>

      <SortableContext id={importance} items={ids} strategy={rectSortingStrategy}>
        <div className="goal-lane__tokens">
          {goals.map((goal) => (
            <GoalToken key={goal.id} goal={goal} issues={issuesByGoal.get(goal.id) ?? []} />
          ))}
          {selectedItem && (
            <button type="button" className="tap-target goal-lane__add" onClick={() => onAddHere(importance)}>
              Add here
            </button>
          )}
        </div>
      </SortableContext>

      {goals.length === 0 && !selectedItem && <p className="goal-lane__empty">Drag crops here</p>}
    </section>
  );
}

export interface GoalsBoardProps {
  /** Precheck issues for the whole plan (see engine/precheck.ts), computed once by the setup panel. */
  issues: readonly PrecheckIssue[];
}

export default function GoalsBoard({ issues }: GoalsBoardProps) {
  const goals = useStore((s) => s.settings.goals);
  const selectedItem = useStore((s) => s.selectedItem);
  const selectItem = useStore((s) => s.selectItem);
  const resetToExample = useStore((s) => s.resetToExample);
  const clearGoals = useStore((s) => s.clearGoals);

  const issuesByGoal = useMemo(() => {
    const map = new Map<string, PrecheckIssue[]>();
    for (const issue of issues) {
      if (issue.goalId === null) continue;
      const list = map.get(issue.goalId) ?? [];
      list.push(issue);
      map.set(issue.goalId, list);
    }
    return map;
  }, [issues]);

  const globalIssues = issues.filter((issue) => issue.goalId === null);

  useDropHandler((item, target) => useStore.getState().applyGoalDrop(item, target));

  useDragPreview((item) => {
    if (item.kind !== 'goal') return null;
    const goal = goals.find((g) => g.id === item.goalId);
    return goal ? <GoalTokenFace goal={goal} issues={issuesByGoal.get(goal.id) ?? []} lifted /> : null;
  });

  function addHere(importance: Importance) {
    if (!selectedItem) return;
    if (useStore.getState().applyGoalDrop(selectedItem, { kind: 'lane', importance })) selectItem(null);
  }

  return (
    <section className="card goals-board" aria-label="Goals">
      <div className="card__header">
        <h2 className="card__title">Goals</h2>
        <div className="card__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={resetToExample}>
            Reset to example
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={clearGoals} disabled={goals.length === 0}>
            Clear all
          </button>
        </div>
      </div>

      {globalIssues.map((issue, i) => (
        <IssueMessage key={i} issue={issue} />
      ))}

      <div className="goals-board__lanes">
        {IMPORTANCE_ORDER.map((level) => (
          <Lane
            key={level}
            importance={level}
            goals={goals.filter((g) => g.importance === level)}
            issuesByGoal={issuesByGoal}
            selectedItem={selectedItem}
            onAddHere={addHere}
          />
        ))}
      </div>
    </section>
  );
}
