// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ALL_GOAL_CROPS, type PrecheckIssue } from '../../engine/types';
import { AppDndProvider } from '../dnd/AppDnd';
import { useStore } from '../state/store';
import GoalsBoard from './GoalsBoard';

beforeEach(() => {
  useStore.getState().resetToExample();
});

afterEach(() => {
  cleanup();
});

function renderBoard(issues: readonly PrecheckIssue[] = []) {
  return render(
    <AppDndProvider>
      <GoalsBoard issues={issues} />
    </AppDndProvider>,
  );
}

describe('GoalsBoard layout', () => {
  it('places the default example goals in their lanes', () => {
    renderBoard();
    expect(within(screen.getByRole('region', { name: 'Must goals' })).getByRole('button', { name: /^Apple · Quantity · At least 4/ })).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'High goals' })).getByRole('button', { name: /^Apple · Harvest Boost · All plants/ }),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Medium goals' })).getByRole('button', { name: /^All goal crops · Water Retain · All plants/ }),
    ).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Low goals' })).getByRole('button', { name: /^Wheat · Quantity · Maximize/ })).toBeTruthy();
  });

  it('shows a dashed empty state for a lane with no goals and nothing selected', () => {
    renderBoard();
    // Nothing is in the Low lane besides the wheat goal by default; clear helpers/selection isn't needed -
    // instead check a lane that truly has none by removing wheat first.
    const wheat = useStore.getState().settings.goals.find((g) => g.crop === 'wheat')!;
    useStore.getState().removeGoal(wheat.id);
    cleanup();
    renderBoard();
    expect(within(screen.getByRole('region', { name: 'Low goals' })).getByText('Drag crops here')).toBeTruthy();
  });

  it('shows a precheck flag and its message when a goal has an issue', async () => {
    const user = userEvent.setup();
    const appleGoal = useStore.getState().settings.goals.find((g) => g.crop === 'apple' && g.measure === 'quantity')!;
    const issues: PrecheckIssue[] = [{ goalId: appleGoal.id, severity: 'warning', message: 'At most 9 Apple plants fit in 9 plots.' }];
    renderBoard(issues);
    const token = screen.getByRole('button', { name: /^Apple · Quantity · At least 4.*warning/ });
    await user.click(token);
    expect(screen.getByText('Warning: At most 9 Apple plants fit in 9 plots.')).toBeTruthy();
  });

  it('shows plan-wide issues (no goalId) above the lanes', () => {
    renderBoard([{ goalId: null, severity: 'error', message: 'Add at least one goal.' }]);
    expect(screen.getByText('Error: Add at least one goal.')).toBeTruthy();
  });
});

describe('GoalsBoard popover', () => {
  it('opens on click, closes on Escape', async () => {
    const user = userEvent.setup();
    renderBoard();
    const token = screen.getByRole('button', { name: /^Wheat · Quantity · Maximize/ });
    await user.click(token);
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on an outside click', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByRole('button', { name: /^Wheat · Quantity · Maximize/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a quantity preset chip sets the count', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByRole('button', { name: /^Apple · Quantity · At least 4/ }));
    await user.click(screen.getByRole('button', { name: '6' }));
    const apple = useStore.getState().settings.goals.find((g) => g.crop === 'apple' && g.measure === 'quantity')!;
    expect(apple.amount).toEqual({ kind: 'count', n: 6 });
    expect(screen.getByRole('button', { name: /^Apple · Quantity · At least 6/ })).toBeTruthy();
  });

  it('the Max chip switches a quantity goal to Maximize', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByRole('button', { name: /^Apple · Quantity · At least 4/ }));
    await user.click(screen.getByRole('button', { name: 'Max' }));
    const apple = useStore.getState().settings.goals.find((g) => g.crop === 'apple' && g.measure === 'quantity')!;
    expect(apple.amount).toEqual({ kind: 'max' });
  });

  it('the stepper increments and decrements a quantity goal', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByRole('button', { name: /^Apple · Quantity · At least 4/ }));
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(useStore.getState().settings.goals.find((g) => g.crop === 'apple' && g.measure === 'quantity')!.amount).toEqual({
      kind: 'count',
      n: 5,
    });
    await user.click(screen.getByRole('button', { name: 'Fewer' }));
    await user.click(screen.getByRole('button', { name: 'Fewer' }));
    expect(useStore.getState().settings.goals.find((g) => g.crop === 'apple' && g.measure === 'quantity')!.amount).toEqual({
      kind: 'count',
      n: 3,
    });
  });

  it('stepping down from Max lands on 27, not below 1', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByRole('button', { name: /^Wheat · Quantity · Maximize/ }));
    await user.click(screen.getByRole('button', { name: 'Fewer' }));
    expect(useStore.getState().settings.goals.find((g) => g.crop === 'wheat')!.amount).toEqual({ kind: 'count', n: 27 });
  });

  it('a buff goal offers All plants / At least with a stepper only for At least', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByRole('button', { name: /^Apple · Harvest Boost · All plants/ }));
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'At least' }));
    const apple = useStore.getState().settings.goals.find((g) => g.measure === 'harvestBoost')!;
    expect(apple.amount).toEqual({ kind: 'count', n: 1 });
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(useStore.getState().settings.goals.find((g) => g.measure === 'harvestBoost')!.amount).toEqual({ kind: 'count', n: 2 });
  });

  it('the Importance control moves the goal to another lane, appended at the end', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByRole('button', { name: /^Wheat · Quantity · Maximize/ }));
    await user.click(screen.getByRole('radio', { name: 'Must' }));
    const wheat = useStore.getState().settings.goals.find((g) => g.crop === 'wheat')!;
    expect(wheat.importance).toBe('must');
    expect(useStore.getState().settings.goals.filter((g) => g.importance === 'must').at(-1)?.id).toBe(wheat.id);
  });

  it('Remove deletes the goal and closes the popover', async () => {
    const user = userEvent.setup();
    renderBoard();
    const before = useStore.getState().settings.goals.length;
    await user.click(screen.getByRole('button', { name: /^Wheat · Quantity · Maximize/ }));
    await user.click(screen.getByRole('button', { name: /^Remove/ }));
    expect(useStore.getState().settings.goals.length).toBe(before - 1);
    expect(useStore.getState().settings.goals.some((g) => g.crop === 'wheat')).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('GoalsBoard tap-to-place', () => {
  it('shows an Add here button in every lane once an item is selected, and applies the drop', async () => {
    const user = userEvent.setup();
    renderBoard();
    expect(screen.queryByRole('button', { name: 'Add here' })).toBeNull();

    useStore.getState().selectItem({ kind: 'palette-crop', cropId: 'onion' });
    cleanup();
    renderBoard();
    const addButtons = screen.getAllByRole('button', { name: 'Add here' });
    expect(addButtons.length).toBe(4); // one per lane

    await user.click(within(screen.getByRole('region', { name: 'Low goals' })).getByRole('button', { name: 'Add here' }));
    expect(useStore.getState().settings.goals.some((g) => g.crop === 'onion' && g.importance === 'low')).toBe(true);
    expect(useStore.getState().selectedItem).toBeNull();
  });

  it('a buff selected and applied to the All-crops lane creates the All-goal-crops token', async () => {
    const user = userEvent.setup();
    renderBoard();
    useStore.getState().selectItem({ kind: 'palette-buff', buff: 'qualityBoost' });
    cleanup();
    renderBoard();
    await user.click(within(screen.getByRole('region', { name: 'Low goals' })).getByRole('button', { name: 'Add here' }));
    expect(
      useStore.getState().settings.goals.some((g) => g.crop === ALL_GOAL_CROPS && g.measure === 'qualityBoost' && g.importance === 'low'),
    ).toBe(true);
  });
});
