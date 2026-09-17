// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GoalList from './GoalList';
import { useStore } from '../state/store';
import type { PrecheckIssue } from '../../engine/types';

beforeEach(() => {
  useStore.getState().resetToExample();
});

afterEach(() => {
  cleanup();
});

describe('GoalList', () => {
  it('adds a goal through the UI', async () => {
    const user = userEvent.setup();
    render(<GoalList issues={[]} />);
    const before = useStore.getState().settings.goals.length;
    await user.click(screen.getByRole('button', { name: 'Add goal' }));
    expect(useStore.getState().settings.goals.length).toBe(before + 1);
  });

  it('removes a goal through the UI', async () => {
    const user = userEvent.setup();
    render(<GoalList issues={[]} />);
    const before = useStore.getState().settings.goals.length;
    const removeButtons = screen.getAllByRole('button', { name: /^Remove goal:/ });
    await user.click(removeButtons[0]);
    expect(useStore.getState().settings.goals.length).toBe(before - 1);
  });

  it('clears all goals through the UI', async () => {
    const user = userEvent.setup();
    render(<GoalList issues={[]} />);
    await user.click(screen.getByRole('button', { name: 'Clear goals' }));
    expect(useStore.getState().settings.goals).toEqual([]);
  });

  it('switches the amount control between At least and Maximize for a quantity goal', async () => {
    const user = userEvent.setup();
    render(<GoalList issues={[]} />);
    // Wheat / Quantity / Maximize is the third goal in the default example.
    const goalId = useStore.getState().settings.goals[2].id;
    const rows = screen.getAllByRole('listitem');
    const wheatRow = rows[2];

    const amountSelect = within(wheatRow).getByLabelText('Amount') as HTMLSelectElement;
    expect(amountSelect.value).toBe('max');
    expect(within(wheatRow).queryByLabelText('Plant count')).toBeNull();

    await user.selectOptions(amountSelect, 'count');
    expect(useStore.getState().settings.goals.find((g) => g.id === goalId)?.amount).toEqual({ kind: 'count', n: 1 });
    const numberInput = within(wheatRow).getByLabelText('Plant count') as HTMLInputElement;
    expect(numberInput.value).toBe('1');

    await user.selectOptions(within(wheatRow).getByLabelText('Amount'), 'max');
    expect(useStore.getState().settings.goals.find((g) => g.id === goalId)?.amount).toEqual({ kind: 'max' });
    expect(within(wheatRow).queryByLabelText('Plant count')).toBeNull();
  });

  it('changes importance through the segmented radio control', async () => {
    const user = userEvent.setup();
    render(<GoalList issues={[]} />);
    const goalId = useStore.getState().settings.goals[0].id; // Apple / Quantity, currently Must
    const rows = screen.getAllByRole('listitem');
    const appleRow = rows[0];

    const highRadio = within(appleRow).getByRole('radio', { name: 'High' });
    await user.click(highRadio);
    expect(useStore.getState().settings.goals.find((g) => g.id === goalId)?.importance).toBe('high');
    expect((highRadio as HTMLInputElement).checked).toBe(true);
  });

  it('shows a goal-specific issue directly under its row and a global issue above the list', () => {
    const goalId = useStore.getState().settings.goals[0].id;
    const issues: PrecheckIssue[] = [
      { goalId: null, severity: 'error', message: 'Add at least one goal.' },
      { goalId, severity: 'warning', message: 'Example row warning.' },
    ];
    render(<GoalList issues={issues} />);
    expect(screen.getByText('Error: Add at least one goal.')).toBeTruthy();
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText('Warning: Example row warning.')).toBeTruthy();
  });
});
