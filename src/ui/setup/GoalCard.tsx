import type { ChangeEvent } from 'react';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CROPS, CROP_BY_ID } from '../../data/crops';
import { buffsGivenByCrops, goalLabel } from '../../engine/goals';
import {
  ALL_GOAL_CROPS,
  BUFF_NAMES,
  IMPORTANCE_NAMES,
  IMPORTANCE_ORDER,
  type Crop,
  type Goal,
  type GoalAmount,
  type Importance,
  type Measure,
  type PrecheckIssue,
} from '../../engine/types';
import CropSwatch from '../CropSwatch';
import { GripIcon, SproutIcon, TrashIcon } from '../icons';
import { useStore } from '../state/store';
import { useNumberField } from '../useNumberField';
import { visibleCrops } from './cropVisibility';
import IssueMessage from './IssueMessage';

const MEASURE_BUFFS = buffsGivenByCrops(CROPS);
const SIZE_LABELS = { 1: '1x1', 2: '2x2', 3: '3x3' } as const;

function groupedBySize(crops: readonly Crop[]): { label: string; crops: Crop[] }[] {
  return ([1, 2, 3] as const)
    .map((size) => ({ label: SIZE_LABELS[size], crops: crops.filter((c) => c.size === size) }))
    .filter((group) => group.crops.length > 0);
}

/** "Apple" or "All goal crops": the card's crop identity (goalLabel's string also carries the measure and amount, which is more than the card header needs). */
function cropDisplayName(goal: Goal): string {
  return goal.crop === ALL_GOAL_CROPS ? 'All goal crops' : (CROP_BY_ID.get(goal.crop)?.name ?? goal.crop);
}

function dragHandleLabel(goal: Goal): string {
  const measure = goal.measure === 'quantity' ? 'quantity' : BUFF_NAMES[goal.measure];
  return `Reorder ${cropDisplayName(goal)} ${measure} goal`;
}

interface GoalCardProps {
  goal: Goal;
  issues: readonly PrecheckIssue[];
}

/** One goal in the goals board: a drag handle, its fields, and the accessible importance fallback (see GoalBoard). */
export default function GoalCard({ goal, issues }: GoalCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: goal.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={`goal-card${isDragging ? ' goal-card--dragging' : ''}`}>
      <GoalCardBody goal={goal} issues={issues} handleAttributes={attributes} handleListeners={listeners} />
    </div>
  );
}

/** A static clone of a card's content for the DndContext's DragOverlay: same look, not itself sortable. */
export function GoalCardPreview({ goal }: { goal: Goal }) {
  return (
    <div className="goal-card goal-card--overlay">
      <GoalCardBody goal={goal} issues={[]} handleAttributes={{}} handleListeners={{}} />
    </div>
  );
}

interface GoalCardBodyProps {
  goal: Goal;
  issues: readonly PrecheckIssue[];
  handleAttributes: Partial<DraggableAttributes>;
  handleListeners: DraggableSyntheticListeners;
}

function GoalCardBody({ goal, issues, handleAttributes, handleListeners }: GoalCardBodyProps) {
  const gardeningLevel = useStore((s) => s.settings.gardeningLevel);
  const updateGoal = useStore((s) => s.updateGoal);
  const removeGoal = useStore((s) => s.removeGoal);

  const isBuff = goal.measure !== 'quantity';
  const selectedCropId = goal.crop === ALL_GOAL_CROPS ? undefined : goal.crop;
  const crop = selectedCropId ? CROP_BY_ID.get(selectedCropId) : undefined;
  const groups = groupedBySize(visibleCrops(CROPS, gardeningLevel, selectedCropId));

  function handleCropChange(e: ChangeEvent<HTMLSelectElement>) {
    updateGoal(goal.id, { crop: e.target.value });
  }

  function handleMeasureChange(e: ChangeEvent<HTMLSelectElement>) {
    updateGoal(goal.id, { measure: e.target.value as Measure });
  }

  function handleAmountKindChange(e: ChangeEvent<HTMLSelectElement>) {
    const kind = e.target.value;
    let amount: GoalAmount;
    if (kind === 'count') amount = { kind: 'count', n: goal.amount.kind === 'count' ? goal.amount.n : 1 };
    else if (kind === 'max') amount = { kind: 'max' };
    else amount = { kind: 'all' };
    updateGoal(goal.id, { amount });
  }

  function handleImportanceChange(e: ChangeEvent<HTMLSelectElement>) {
    updateGoal(goal.id, { importance: e.target.value as Importance });
  }

  // Blank has no meaning for a plant count, so it never commits; on blur the
  // field snaps back to the stored value instead of staying blank or stale.
  const amountField = useNumberField(
    goal.amount.kind === 'count' ? goal.amount.n : 1,
    (n) => {
      if (n !== null) updateGoal(goal.id, { amount: { kind: 'count', n } });
    },
    { min: 1, allowNull: false },
  );

  return (
    <>
      <div className="goal-card__top">
        <button
          type="button"
          className="icon-btn icon-btn--sm drag-handle goal-card__handle"
          aria-label={dragHandleLabel(goal)}
          {...handleAttributes}
          {...handleListeners}
        >
          <GripIcon />
        </button>

        <span className="goal-card__crop">
          {crop ? (
            <CropSwatch crop={crop} size="small" />
          ) : (
            <span className="goal-card__all-crops" aria-hidden="true" title="All goal crops">
              <SproutIcon />
            </span>
          )}
          <select aria-label="Crop" className="goal-card__crop-select" value={goal.crop} onChange={handleCropChange}>
            {isBuff && <option value={ALL_GOAL_CROPS}>All goal crops</option>}
            {groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.crops.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </span>

        <select aria-label="Importance" className="goal-card__importance" value={goal.importance} onChange={handleImportanceChange}>
          {IMPORTANCE_ORDER.map((level) => (
            <option key={level} value={level}>
              {IMPORTANCE_NAMES[level]}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="icon-btn icon-btn--sm btn--danger goal-card__remove"
          aria-label={`Remove goal: ${goalLabel(goal, CROP_BY_ID)}`}
          onClick={() => removeGoal(goal.id)}
        >
          <TrashIcon />
        </button>
      </div>

      <div className="goal-card__fields field-row">
        <select aria-label="Measure" className="goal-card__measure" value={goal.measure} onChange={handleMeasureChange}>
          <option value="quantity">Quantity</option>
          {MEASURE_BUFFS.map((buff) => (
            <option key={buff} value={buff}>
              {BUFF_NAMES[buff]}
            </option>
          ))}
        </select>

        <span className="goal-card__amount">
          <select aria-label="Amount" value={goal.amount.kind} onChange={handleAmountKindChange}>
            {isBuff ? (
              <>
                <option value="all">All plants</option>
                <option value="count">At least</option>
              </>
            ) : (
              <>
                <option value="count">At least</option>
                <option value="max">Maximize</option>
              </>
            )}
          </select>
          {goal.amount.kind === 'count' && (
            <input
              type="number"
              aria-label="Plant count"
              min={1}
              step={1}
              value={amountField.value}
              onChange={amountField.onChange}
              onBlur={amountField.onBlur}
            />
          )}
        </span>
      </div>

      {issues.map((issue, i) => (
        <IssueMessage key={i} issue={issue} />
      ))}
    </>
  );
}
