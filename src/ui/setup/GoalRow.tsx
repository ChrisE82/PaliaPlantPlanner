import type { ChangeEvent } from 'react';
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
  type Measure,
  type PrecheckIssue,
} from '../../engine/types';
import { useStore } from '../state/store';
import { visibleCrops } from './cropVisibility';
import IssueMessage from './IssueMessage';

const MEASURE_BUFFS = buffsGivenByCrops(CROPS);
const SIZE_LABELS = { 1: '1x1', 2: '2x2', 3: '3x3' } as const;

function groupedBySize(crops: readonly Crop[]): { label: string; crops: Crop[] }[] {
  return ([1, 2, 3] as const)
    .map((size) => ({ label: SIZE_LABELS[size], crops: crops.filter((c) => c.size === size) }))
    .filter((group) => group.crops.length > 0);
}

interface GoalRowProps {
  goal: Goal;
  issues: readonly PrecheckIssue[];
}

export default function GoalRow({ goal, issues }: GoalRowProps) {
  const gardeningLevel = useStore((s) => s.settings.gardeningLevel);
  const updateGoal = useStore((s) => s.updateGoal);
  const removeGoal = useStore((s) => s.removeGoal);

  const isBuff = goal.measure !== 'quantity';
  const selectedCropId = goal.crop === ALL_GOAL_CROPS ? undefined : goal.crop;
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

  function handleAmountNumberChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw === '') return; // let the field show empty while the user is mid-edit
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) {
      updateGoal(goal.id, { amount: { kind: 'count', n: Math.round(n) } });
    }
  }

  return (
    <div className="goal-row">
      <div className="goal-row__controls">
        <select aria-label="Crop" value={goal.crop} onChange={handleCropChange}>
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

        <select aria-label="Measure" value={goal.measure} onChange={handleMeasureChange}>
          <option value="quantity">Quantity</option>
          {MEASURE_BUFFS.map((buff) => (
            <option key={buff} value={buff}>
              {BUFF_NAMES[buff]}
            </option>
          ))}
        </select>

        <div className="goal-row__amount">
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
              value={goal.amount.n}
              onChange={handleAmountNumberChange}
            />
          )}
        </div>

        <button
          type="button"
          className="goal-row__remove"
          aria-label={`Remove goal: ${goalLabel(goal, CROP_BY_ID)}`}
          onClick={() => removeGoal(goal.id)}
        >
          Remove
        </button>
      </div>

      <fieldset className="goal-row__importance">
        <legend className="goal-row__legend">Importance</legend>
        <div className="segmented">
          {IMPORTANCE_ORDER.map((level) => (
            <span className="segmented__option" key={level}>
              <input
                type="radio"
                name={`importance-${goal.id}`}
                id={`importance-${goal.id}-${level}`}
                checked={goal.importance === level}
                onChange={() => updateGoal(goal.id, { importance: level })}
              />
              <label className="segmented__label" htmlFor={`importance-${goal.id}-${level}`}>
                {IMPORTANCE_NAMES[level]}
              </label>
            </span>
          ))}
        </div>
      </fieldset>

      {issues.map((issue, i) => (
        <IssueMessage key={i} issue={issue} />
      ))}
    </div>
  );
}
