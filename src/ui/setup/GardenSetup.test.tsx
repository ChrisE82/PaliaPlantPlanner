// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppDndProvider } from '../dnd/AppDnd';
import { useStore } from '../state/store';
import GardenSetup from './GardenSetup';

beforeEach(() => {
  useStore.getState().resetToExample();
});

afterEach(() => {
  cleanup();
});

function renderSetup(onPlan?: () => void) {
  return render(
    <AppDndProvider>
      <GardenSetup onPlan={onPlan} />
    </AppDndProvider>,
  );
}

describe('GardenSetup', () => {
  it('renders the Goals board, Helpers tray and Garden settings together', () => {
    renderSetup();
    expect(screen.getByRole('region', { name: 'Goals' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Helpers' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Garden' })).toBeTruthy();
  });

  it('enables Plan my garden with the default example goals', () => {
    renderSetup();
    const button = screen.getByRole('button', { name: 'Plan my garden' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('disables Plan my garden and explains why once every goal is removed', () => {
    for (const goal of [...useStore.getState().settings.goals]) {
      useStore.getState().removeGoal(goal.id);
    }
    renderSetup();
    const button = screen.getByRole('button', { name: 'Plan my garden' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/before planning/)).toBeTruthy();
  });

  it('calls onPlan when clicked while enabled', async () => {
    const user = userEvent.setup();
    let called = false;
    renderSetup(() => (called = true));
    await user.click(screen.getByRole('button', { name: 'Plan my garden' }));
    expect(called).toBe(true);
  });

  it('switches to custom arrangement mode and shows the arrangement editor', async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByRole('radio', { name: 'Draw my own' }));
    expect(screen.getByRole('group', { name: 'Garden plot arrangement editor' })).toBeTruthy();
    expect(screen.getByText('0', { selector: '.stepper__value' })).toBeTruthy();
  });

  it('the plot picker sets the plot count', async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByRole('button', { name: '5 plots' }));
    expect(useStore.getState().settings.plotCount).toBe(5);
  });

  it('disables Plan my garden and relabels it while a run is in progress', () => {
    useStore.getState().planStarted(useStore.getState().settings);
    renderSetup();
    const button = screen.getByRole('button', { name: 'Planning...' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.queryByText(/before planning/)).toBeNull();
  });
});
