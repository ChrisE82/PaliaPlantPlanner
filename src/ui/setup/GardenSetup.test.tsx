// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GardenSetup from './GardenSetup';
import { useStore } from '../state/store';

beforeEach(() => {
  useStore.getState().resetToExample();
});

afterEach(() => {
  cleanup();
});

describe('GardenSetup', () => {
  it('enables Plan my garden with the default example goals', () => {
    render(<GardenSetup />);
    const button = screen.getByRole('button', { name: 'Plan my garden' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('disables Plan my garden and explains why when there are no goals', async () => {
    const user = userEvent.setup();
    render(<GardenSetup />);
    await user.click(screen.getByRole('button', { name: 'Clear goals' }));
    const button = screen.getByRole('button', { name: 'Plan my garden' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/before planning/)).toBeTruthy();
  });

  it('calls onPlan when clicked while enabled', async () => {
    const user = userEvent.setup();
    let called = false;
    render(<GardenSetup onPlan={() => (called = true)} />);
    await user.click(screen.getByRole('button', { name: 'Plan my garden' }));
    expect(called).toBe(true);
  });

  it('switches to custom arrangement mode and shows the arrangement editor', async () => {
    const user = userEvent.setup();
    render(<GardenSetup />);
    await user.click(screen.getByRole('radio', { name: 'Use my own arrangement' }));
    expect(screen.getByRole('group', { name: 'Garden plot arrangement editor' })).toBeTruthy();
    expect(screen.getByText('Plots: 0')).toBeTruthy();
  });

  it('the plots stepper clamps between 1 and 9', async () => {
    const user = userEvent.setup();
    render(<GardenSetup />);
    const fewer = screen.getByRole('button', { name: 'Fewer plots' });
    for (let i = 0; i < 10; i++) {
      await user.click(fewer);
    }
    expect(useStore.getState().settings.plotCount).toBe(1);

    const more = screen.getByRole('button', { name: 'More plots' });
    for (let i = 0; i < 10; i++) {
      await user.click(more);
    }
    expect(useStore.getState().settings.plotCount).toBe(9);
  });
});
