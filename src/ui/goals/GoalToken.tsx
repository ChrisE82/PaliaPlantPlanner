/**
 * One goal token on the goals board: a crop tile (quantity or buff goal) or
 * a round buff token ("All goal crops"), built from CropTileFace /
 * BuffBadgeFace per the task spec, not a form row.
 *
 * Two ways to grab it, because dnd-kit's KeyboardSensor claims Enter/Space
 * for keyboard-drag activation on whatever node carries its onKeyDown
 * listener, which would otherwise collide with "press the token to open its
 * popover": the token face carries pointer-drag + click-to-open only; a
 * small handle carries the real dnd-kit listeners (pointer and keyboard), so
 * "dnd-kit keyboard dragging works for tokens" stays literally true.
 */
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState, type KeyboardEventHandler, type PointerEventHandler } from 'react';
import { CROP_BY_ID } from '../../data/crops';
import { goalLabel } from '../../engine/goals';
import { ALL_GOAL_CROPS, type BuffId, type Goal, type PrecheckIssue } from '../../engine/types';
import { dragId } from '../dnd/types';
import { GripIcon } from '../icons';
import { BuffBadgeFace } from '../palette/BuffBadge';
import { CropTileFace } from '../palette/CropTile';
import GoalPopover from './GoalPopover';

function amountText(goal: Goal): string {
  const { amount } = goal;
  if (goal.measure === 'quantity') {
    return amount.kind === 'max' ? 'Max' : `×${amount.kind === 'count' ? amount.n : 1}`;
  }
  return amount.kind === 'all' ? 'All' : `≥ ${amount.kind === 'count' ? amount.n : 1}`;
}

function worstSeverity(issues: readonly PrecheckIssue[]): 'error' | 'warning' | null {
  if (issues.some((i) => i.severity === 'error')) return 'error';
  return issues.length > 0 ? 'warning' : null;
}

/** A small warning-triangle mark, drawn locally (not from icons.tsx): filled for an error, outlined for a warning, so the two read apart by shape, not only by color. */
function FlagMark({ severity }: { severity: 'error' | 'warning' }) {
  const filled = severity === 'error';
  return (
    <span className={`goal-token__flag goal-token__flag--${severity}`}>
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
        <path
          d="M12 3.4 2.2 20.6h19.6L12 3.4Z"
          fill={filled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M12 9.8v4.4" stroke={filled ? '#fff' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="16.8" r="1" fill={filled ? '#fff' : 'currentColor'} />
      </svg>
    </span>
  );
}

function issuesSummary(issues: readonly PrecheckIssue[]): string {
  const worst = worstSeverity(issues);
  if (!worst) return '';
  const noun = issues.length === 1 ? 'issue' : 'issues';
  return `, ${worst === 'error' ? 'error' : 'warning'} (${issues.length} ${noun})`;
}

export interface GoalTokenFaceProps {
  goal: Goal;
  issues: readonly PrecheckIssue[];
  /** The look while following the pointer in the drag overlay. */
  lifted?: boolean;
}

/** The token's visuals only: shared by the interactive token below and the drag-overlay preview (see GoalsBoard's useDragPreview). */
export function GoalTokenFace({ goal, issues, lifted = false }: GoalTokenFaceProps) {
  const worst = worstSeverity(issues);
  const flag = worst && <FlagMark severity={worst} />;

  if (goal.crop === ALL_GOAL_CROPS) {
    return (
      <span className={`goal-token__all-crops${lifted ? ' is-lifted' : ''}`}>
        <BuffBadgeFace buff={goal.measure as BuffId} lifted={lifted} />
        <span className="goal-token__all-crops-label">All crops</span>
        <span className="goal-token__amount goal-token__amount--pill">{amountText(goal)}</span>
        {flag}
      </span>
    );
  }

  const crop = CROP_BY_ID.get(goal.crop);
  if (!crop) return null;

  const badge = (
    <>
      {goal.measure === 'quantity' ? (
        <span className="goal-token__amount">{amountText(goal)}</span>
      ) : (
        <span className="goal-token__buff-req">
          <BuffBadgeFace buff={goal.measure as BuffId} compact />
          <span className="goal-token__amount">{amountText(goal)}</span>
        </span>
      )}
      {flag}
    </>
  );

  return <CropTileFace crop={crop} lifted={lifted} badge={badge} />;
}

export interface GoalTokenProps {
  goal: Goal;
  issues: readonly PrecheckIssue[];
}

/** One sortable goal token. Pointer users can drag from anywhere on the face; keyboard users Tab to the small handle for a real dnd-kit keyboard drag, or press the face itself (Enter/Space, native button behavior) to open the popover. */
export default function GoalToken({ goal, issues }: GoalTokenProps) {
  const [open, setOpen] = useState(false);
  const item = { kind: 'goal' as const, goalId: goal.id };
  const target = { kind: 'goal' as const, goalId: goal.id, importance: goal.importance };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragId(item),
    data: { item, target },
  });

  useEffect(() => {
    if (isDragging) setOpen(false);
  }, [isDragging]);

  const style = { transform: CSS.Transform.toString(transform), transition };
  const label = goalLabel(goal, CROP_BY_ID);

  return (
    <div ref={setNodeRef} style={style} className={`goal-token${isDragging ? ' goal-token--dragging' : ''}`}>
      <button
        type="button"
        className="goal-token__face-btn"
        onPointerDown={listeners?.onPointerDown as PointerEventHandler<HTMLButtonElement> | undefined}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}${issuesSummary(issues)}. Press to edit.`}
      >
        <GoalTokenFace goal={goal} issues={issues} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--sm drag-handle goal-token__handle"
        aria-label={`Reorder ${label}`}
        {...attributes}
        onKeyDown={listeners?.onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined}
        onPointerDown={listeners?.onPointerDown as PointerEventHandler<HTMLButtonElement> | undefined}
      >
        <GripIcon />
      </button>
      {open && <GoalPopover goal={goal} issues={issues} onClose={() => setOpen(false)} />}
    </div>
  );
}
