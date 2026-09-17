// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GoalBoard from './GoalBoard';
import { useStore } from '../state/store';
import type { PrecheckIssue } from '../../engine/types';

beforeEach(() => {
  useStore.getState().resetToExample();
});

afterEach(() => {
  cleanup();
});

type LaneName = 'Must' | 'High' | 'Medium' | 'Low';

/** Each lane is a labelled region (see GoalLane's aria-label). */
function lane(name: LaneName) {
  return screen.getByRole('region', { name: `${name} goals` });
}

describe('GoalBoard', () => {
  it('lays out four lanes in Must, High, Medium, Low order, each with a count badge', () => {
    render(<GoalBoard issues={[]} />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Must', 'High', 'Medium', 'Low']);
    // The default example has exactly one goal per lane.
    for (const name of ['Must', 'High', 'Medium', 'Low'] as const) {
      expect(within(lane(name)).getByText('1', { selector: '.badge' })).toBeTruthy();
    }
  });

  it('shows a dashed placeholder in an empty lane', async () => {
    const user = userEvent.setup();
    render(<GoalBoard issues={[]} />);
    await user.click(screen.getByRole('button', { name: 'Clear goals' }));
    for (const name of ['Must', 'High', 'Medium', 'Low'] as const) {
      expect(within(lane(name)).getByText('Drop goals here')).toBeTruthy();
      expect(within(lane(name)).getByText('0', { selector: '.badge' })).toBeTruthy();
    }
  });

  it('adds a goal through the UI', async () => {
    const user = userEvent.setup();
    render(<GoalBoard issues={[]} />);
    const before = useStore.getState().settings.goals.length;
    await user.click(screen.getByRole('button', { name: 'Add goal' }));
    expect(useStore.getState().settings.goals.length).toBe(before + 1);
  });

  it('removes a goal through the UI', async () => {
    const user = userEvent.setup();
    render(<GoalBoard issues={[]} />);
    const before = useStore.getState().settings.goals.length;
    const removeButtons = screen.getAllByRole('button', { name: /^Remove goal:/ });
    await user.click(removeButtons[0]);
    expect(useStore.getState().settings.goals.length).toBe(before - 1);
  });

  it('clears all goals through the UI', async () => {
    const user = userEvent.setup();
    render(<GoalBoard issues={[]} />);
    await user.click(screen.getByRole('button', { name: 'Clear goals' }));
    expect(useStore.getState().settings.goals).toEqual([]);
  });

  it('resets to the example goals through the UI', async () => {
    const user = userEvent.setup();
    render(<GoalBoard issues={[]} />);
    await user.click(screen.getByRole('button', { name: 'Clear goals' }));
    await user.click(screen.getByRole('button', { name: 'Reset to example' }));
    expect(useStore.getState().settings.goals.length).toBe(4);
  });

  it('switches the amount control between At least and Maximize for a quantity goal', async () => {
    const user = userEvent.setup();
    render(<GoalBoard issues={[]} />);
    // Wheat / Quantity / Maximize is the Low-importance goal in the default example.
    const goalId = useStore.getState().settings.goals[3].id;
    const lowLane = lane('Low');

    const amountSelect = within(lowLane).getByLabelText('Amount') as HTMLSelectElement;
    expect(amountSelect.value).toBe('max');
    expect(within(lowLane).queryByLabelText('Plant count')).toBeNull();

    await user.selectOptions(amountSelect, 'count');
    expect(useStore.getState().settings.goals.find((g) => g.id === goalId)?.amount).toEqual({ kind: 'count', n: 1 });
    const numberInput = within(lowLane).getByLabelText('Plant count') as HTMLInputElement;
    expect(numberInput.value).toBe('1');

    await user.selectOptions(within(lowLane).getByLabelText('Amount'), 'max');
    expect(useStore.getState().settings.goals.find((g) => g.id === goalId)?.amount).toEqual({ kind: 'max' });
    expect(within(lowLane).queryByLabelText('Plant count')).toBeNull();
  });

  it('restores the stored plant count on blur instead of leaving it blank or stale', async () => {
    const user = userEvent.setup();
    render(<GoalBoard issues={[]} />);
    const goalId = useStore.getState().settings.goals[0].id; // Apple / Quantity / at least 4 / Must
    const mustLane = lane('Must');
    const input = within(mustLane).getByLabelText('Plant count') as HTMLInputElement;
    expect(input.value).toBe('4');

    await user.clear(input);
    expect(input.value).toBe(''); // shown while editing
    expect(useStore.getState().settings.goals.find((g) => g.id === goalId)?.amount).toEqual({ kind: 'count', n: 4 });

    await user.tab(); // blur with no valid edit made
    expect(input.value).toBe('4'); // restored, not left blank
    expect(useStore.getState().settings.goals.find((g) => g.id === goalId)?.amount).toEqual({ kind: 'count', n: 4 });

    await user.clear(input);
    await user.type(input, '7');
    await user.tab();
    expect(input.value).toBe('7'); // a valid edit is kept across blur
    expect(useStore.getState().settings.goals.find((g) => g.id === goalId)?.amount).toEqual({ kind: 'count', n: 7 });
  });

  it('changes importance through the accessible fallback select, moving the card to that lane', async () => {
    const user = userEvent.setup();
    render(<GoalBoard issues={[]} />);
    const goalId = useStore.getState().settings.goals[0].id; // Apple / Quantity, currently Must

    const importanceSelect = within(lane('Must')).getByLabelText('Importance') as HTMLSelectElement;
    expect(importanceSelect.value).toBe('must');
    await user.selectOptions(importanceSelect, 'high');

    expect(useStore.getState().settings.goals.find((g) => g.id === goalId)?.importance).toBe('high');
    // The Must lane is now empty; the card now lives in the High lane alongside the existing High goal.
    expect(within(lane('Must')).queryByLabelText('Crop')).toBeNull();
    expect(within(lane('High')).getAllByLabelText('Crop').length).toBe(2);
  });

  it('the importance select in every lane offers Must, High, Medium and Low', () => {
    render(<GoalBoard issues={[]} />);
    const select = within(lane('Must')).getByLabelText('Importance') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent);
    expect(options).toEqual(['Must', 'High', 'Medium', 'Low']);
  });

  it('shows a goal-specific issue directly under its card, in its lane, and a global issue above the board', () => {
    const goalId = useStore.getState().settings.goals[0].id; // Must lane
    const issues: PrecheckIssue[] = [
      { goalId: null, severity: 'error', message: 'Add at least one goal.' },
      { goalId, severity: 'warning', message: 'Example row warning.' },
    ];
    render(<GoalBoard issues={issues} />);
    expect(screen.getByText('Error: Add at least one goal.')).toBeTruthy();
    expect(within(lane('Must')).getByText('Warning: Example row warning.')).toBeTruthy();
    expect(within(lane('High')).queryByText('Warning: Example row warning.')).toBeNull();
  });
});
