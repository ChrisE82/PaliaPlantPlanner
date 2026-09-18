/**
 * The small popover a goal token opens: presets/stepper or segmented/stepper
 * for the amount, an Importance segmented control (the non-drag way to move
 * a goal to another lane), any precheck messages, and Remove.
 */
import { useEffect, useRef } from 'react';
import { CROP_BY_ID } from '../../data/crops';
import { goalLabel } from '../../engine/goals';
import { IMPORTANCE_NAMES, IMPORTANCE_ORDER, type Goal, type PrecheckIssue } from '../../engine/types';
import { MinusIcon, PlusIcon, TrashIcon } from '../icons';
import IssueMessage from '../setup/IssueMessage';
import { useStore } from '../state/store';

const QUANTITY_PRESETS = [1, 2, 3, 4, 6, 9, 12, 18, 27] as const;
/** Landing value when stepping "-" down from Max: the top preset, so it reads as one step below "as many as possible". */
const STEP_DOWN_FROM_MAX = 27;

export interface GoalPopoverProps {
  goal: Goal;
  issues: readonly PrecheckIssue[];
  onClose: () => void;
}

export default function GoalPopover({ goal, issues, onClose }: GoalPopoverProps) {
  const updateGoal = useStore((s) => s.updateGoal);
  const removeGoal = useStore((s) => s.removeGoal);
  const reorderGoal = useStore((s) => s.reorderGoal);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button, input')?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [onClose]);

  const isQuantity = goal.measure === 'quantity';
  const count = goal.amount.kind === 'count' ? goal.amount.n : null;

  function setCount(n: number) {
    updateGoal(goal.id, { amount: { kind: 'count', n: Math.max(1, Math.round(n)) } });
  }

  function step(delta: number) {
    if (goal.amount.kind === 'max') {
      if (delta < 0) setCount(STEP_DOWN_FROM_MAX);
      return;
    }
    setCount((count ?? 1) + delta);
  }

  return (
    <div className="goal-popover" role="dialog" aria-label={`Edit ${goalLabel(goal, CROP_BY_ID)}`} ref={ref}>
      <p className="goal-popover__label">{goalLabel(goal, CROP_BY_ID)}</p>

      {isQuantity ? (
        <div className="goal-popover__section">
          <div className="goal-popover__presets" role="group" aria-label="Preset amount">
            {QUANTITY_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                className="chip goal-popover__chip"
                aria-pressed={goal.amount.kind === 'count' && goal.amount.n === n}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className="chip goal-popover__chip"
              aria-pressed={goal.amount.kind === 'max'}
              onClick={() => updateGoal(goal.id, { amount: { kind: 'max' } })}
            >
              Max
            </button>
          </div>
          <div className="stepper goal-popover__stepper" role="group" aria-label="Plant count">
            <button type="button" className="icon-btn icon-btn--sm" aria-label="Fewer" onClick={() => step(-1)}>
              <MinusIcon />
            </button>
            <span className="stepper__value">{goal.amount.kind === 'max' ? 'Max' : (count ?? 1)}</span>
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              aria-label="More"
              onClick={() => step(1)}
              disabled={goal.amount.kind === 'max'}
            >
              <PlusIcon />
            </button>
          </div>
        </div>
      ) : (
        <div className="goal-popover__section">
          <div className="segmented" role="group" aria-label="Amount">
            <label className="segmented__option">
              <input
                type="radio"
                name={`amount-${goal.id}`}
                checked={goal.amount.kind === 'all'}
                onChange={() => updateGoal(goal.id, { amount: { kind: 'all' } })}
              />
              <span className="segmented__label">All plants</span>
            </label>
            <label className="segmented__option">
              <input
                type="radio"
                name={`amount-${goal.id}`}
                checked={goal.amount.kind === 'count'}
                onChange={() => setCount(count ?? 1)}
              />
              <span className="segmented__label">At least</span>
            </label>
          </div>
          {goal.amount.kind === 'count' && (
            <div className="stepper goal-popover__stepper" role="group" aria-label="Plant count">
              <button type="button" className="icon-btn icon-btn--sm" aria-label="Fewer" onClick={() => step(-1)}>
                <MinusIcon />
              </button>
              <span className="stepper__value">{count}</span>
              <button type="button" className="icon-btn icon-btn--sm" aria-label="More" onClick={() => step(1)}>
                <PlusIcon />
              </button>
            </div>
          )}
        </div>
      )}

      <fieldset className="goal-popover__section">
        <legend className="field-label">Importance</legend>
        <div className="segmented">
          {IMPORTANCE_ORDER.map((level) => (
            <label key={level} className="segmented__option">
              <input
                type="radio"
                name={`importance-${goal.id}`}
                checked={goal.importance === level}
                onChange={() => reorderGoal(goal.id, level, Number.MAX_SAFE_INTEGER)}
              />
              <span className="segmented__label">{IMPORTANCE_NAMES[level]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {issues.map((issue, i) => (
        <IssueMessage key={i} issue={issue} />
      ))}

      <button
        type="button"
        className="btn btn--danger btn--sm goal-popover__remove"
        onClick={() => {
          removeGoal(goal.id);
          onClose();
        }}
      >
        <TrashIcon /> Remove
      </button>
    </div>
  );
}
