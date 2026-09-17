import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { IMPORTANCE_NAMES, type Goal, type Importance, type PrecheckIssue } from '../../engine/types';
import GoalCard from './GoalCard';

interface GoalLaneProps {
  importance: Importance;
  goals: readonly Goal[];
  issues: readonly PrecheckIssue[];
  /** Highlighted because a drag is currently over this lane (see GoalBoard). */
  isOver: boolean;
}

/** One tier of the goals board: a header with a count badge, and a droppable, sortable list of goal cards. */
export default function GoalLane({ importance, goals, issues, isOver }: GoalLaneProps) {
  const { setNodeRef } = useDroppable({ id: importance });

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

      <SortableContext id={importance} items={goals.map((g) => g.id)} strategy={verticalListSortingStrategy}>
        {goals.length === 0 ? (
          <p className="goal-lane__empty">Drop goals here</p>
        ) : (
          <ul className="goal-lane__list">
            {goals.map((goal) => (
              <li key={goal.id} className="goal-lane__item">
                <GoalCard goal={goal} issues={issues.filter((issue) => issue.goalId === goal.id)} />
              </li>
            ))}
          </ul>
        )}
      </SortableContext>
    </section>
  );
}
