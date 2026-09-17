import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CROP_BY_ID } from '../../data/crops';
import { goalLabel } from '../../engine/goals';
import { IMPORTANCE_NAMES, IMPORTANCE_ORDER, type Importance, type PrecheckIssue } from '../../engine/types';
import { useStore } from '../state/store';
import { GoalCardPreview } from './GoalCard';
import GoalLane from './GoalLane';
import IssueMessage from './IssueMessage';

interface GoalBoardProps {
  issues: readonly PrecheckIssue[];
}

function isImportance(value: string): value is Importance {
  return (IMPORTANCE_ORDER as readonly string[]).includes(value);
}

/**
 * The Goals card: a tier board with one lane per importance level. Dragging a
 * card into another lane sets its importance; dragging within a lane
 * reorders it. Both paths, plus the keyboard path, funnel into the store's
 * reorderGoal action through one DndContext shared by every lane's
 * SortableContext.
 */
export default function GoalBoard({ issues }: GoalBoardProps) {
  const goals = useStore((s) => s.settings.goals);
  const addGoal = useStore((s) => s.addGoal);
  const resetToExample = useStore((s) => s.resetToExample);
  const clearGoals = useStore((s) => s.clearGoals);
  const reorderGoal = useStore((s) => s.reorderGoal);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overLane, setOverLane] = useState<Importance | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const globalIssues = issues.filter((issue) => issue.goalId === null);
  const activeGoal = activeId ? goals.find((g) => g.id === activeId) : undefined;

  function laneOf(id: string): Importance | undefined {
    return goals.find((g) => g.id === id)?.importance;
  }

  function resolveLane(overId: string | number | null | undefined): Importance | null {
    if (overId == null) return null;
    const idStr = String(overId);
    if (isImportance(idStr)) return idStr;
    return laneOf(idStr) ?? null;
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    setOverLane(resolveLane(e.over?.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    setOverLane(null);

    const targetLane = resolveLane(over?.id);
    if (!targetLane) return;

    const activeIdStr = String(active.id);
    const overIdStr = over ? String(over.id) : null;
    // Index within the target lane, excluding the dragged goal itself -
    // exactly what reorderGoal expects (see store.ts).
    const laneGoals = goals.filter((g) => g.importance === targetLane && g.id !== activeIdStr);
    const overIndex = overIdStr ? laneGoals.findIndex((g) => g.id === overIdStr) : -1;
    const index = overIndex === -1 ? laneGoals.length : overIndex;
    reorderGoal(activeIdStr, targetLane, index);
  }

  function handleDragCancel() {
    setActiveId(null);
    setOverLane(null);
  }

  const announcements: Announcements = {
    onDragStart({ active }) {
      const goal = goals.find((g) => g.id === active.id);
      if (!goal) return undefined;
      return `Picked up ${goalLabel(goal, CROP_BY_ID)}. Currently in the ${IMPORTANCE_NAMES[goal.importance]} lane.`;
    },
    onDragOver({ active, over }) {
      const goal = goals.find((g) => g.id === active.id);
      if (!goal) return undefined;
      const lane = resolveLane(over?.id);
      return lane ? `${goalLabel(goal, CROP_BY_ID)} is over the ${IMPORTANCE_NAMES[lane]} lane.` : undefined;
    },
    onDragEnd({ active, over }) {
      const goal = goals.find((g) => g.id === active.id);
      if (!goal) return undefined;
      const lane = resolveLane(over?.id);
      return lane
        ? `${goalLabel(goal, CROP_BY_ID)} dropped in the ${IMPORTANCE_NAMES[lane]} lane.`
        : `${goalLabel(goal, CROP_BY_ID)} was dropped outside any lane and stays in the ${IMPORTANCE_NAMES[goal.importance]} lane.`;
    },
    onDragCancel({ active }) {
      const goal = goals.find((g) => g.id === active.id);
      return goal ? `Reordering ${goalLabel(goal, CROP_BY_ID)} was cancelled.` : undefined;
    },
  };

  return (
    <section className="card goal-board" aria-label="Goals">
      <div className="card__header">
        <h2 className="card__title">Goals</h2>
        <div className="card__actions">
          <button type="button" className="btn btn--sm" onClick={addGoal}>
            Add goal
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={resetToExample}>
            Reset to example
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={clearGoals}>
            Clear goals
          </button>
        </div>
      </div>

      {globalIssues.map((issue, i) => (
        <IssueMessage key={i} issue={issue} />
      ))}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{ announcements }}
      >
        <div className="goal-board__lanes">
          {IMPORTANCE_ORDER.map((level) => (
            <GoalLane
              key={level}
              importance={level}
              goals={goals.filter((g) => g.importance === level)}
              issues={issues}
              isOver={overLane === level}
            />
          ))}
        </div>

        <DragOverlay>{activeGoal ? <GoalCardPreview goal={activeGoal} /> : null}</DragOverlay>
      </DndContext>
    </section>
  );
}
