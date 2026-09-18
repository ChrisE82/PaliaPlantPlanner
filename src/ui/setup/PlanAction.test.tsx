// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../state/store';
import PlanAction from './PlanAction';

beforeEach(() => {
  useStore.getState().resetToExample();
});

afterEach(() => {
  cleanup();
});

describe('PlanAction', () => {
  it('offers Quick, Normal and Thorough as a segmented control, defaulting to Normal', () => {
    render(<PlanAction canPlan errorCount={0} isRunning={false} />);
    expect((screen.getByRole('radio', { name: 'Normal' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('radio', { name: 'Quick' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Thorough' })).toBeTruthy();
  });

  it('selecting a different search time updates the store', async () => {
    const user = userEvent.setup();
    render(<PlanAction canPlan errorCount={0} isRunning={false} />);
    await user.click(screen.getByRole('radio', { name: 'Thorough' }));
    expect(useStore.getState().searchTime).toBe('thorough');
  });

  it('enables the Plan button and calls onPlan when pressed', async () => {
    const user = userEvent.setup();
    let called = false;
    render(<PlanAction canPlan errorCount={0} isRunning={false} onPlan={() => (called = true)} />);
    const button = screen.getByRole('button', { name: 'Plan my garden' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await user.click(button);
    expect(called).toBe(true);
  });

  it('disables the button and explains why when blocked', () => {
    render(<PlanAction canPlan={false} errorCount={2} isRunning={false} />);
    const button = screen.getByRole('button', { name: 'Plan my garden' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Fix the 2 errors above before planning.')).toBeTruthy();
  });

  it('relabels the button and hides the reason while a run is in progress', () => {
    render(<PlanAction canPlan={false} errorCount={0} isRunning />);
    expect(screen.getByRole('button', { name: 'Planning...' })).toBeTruthy();
    expect(screen.queryByText(/before planning/)).toBeNull();
  });
});
