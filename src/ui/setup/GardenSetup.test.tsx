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
    await user.click(screen.getByRole('radio', { name: 'Draw my own' }));
    expect(screen.getByRole('group', { name: 'Garden plot arrangement editor' })).toBeTruthy();
    expect(screen.getByText('0', { selector: '.stepper__value' })).toBeTruthy();
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

  it('offers Quick, Normal and Thorough search time, defaulting to Normal', () => {
    render(<GardenSetup />);
    const select = screen.getByLabelText('Search time') as HTMLSelectElement;
    expect(select.value).toBe('normal');
    expect(screen.getByRole('option', { name: 'Quick' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Thorough' })).toBeTruthy();
  });

  it('changing the search time updates the store', async () => {
    const user = userEvent.setup();
    render(<GardenSetup />);
    await user.selectOptions(screen.getByLabelText('Search time'), 'thorough');
    expect(useStore.getState().searchTime).toBe('thorough');
  });

  it('disables Plan my garden and relabels it while a run is in progress', () => {
    useStore.getState().planStarted(useStore.getState().settings);
    render(<GardenSetup />);
    const button = screen.getByRole('button', { name: 'Planning...' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.queryByText(/before planning/)).toBeNull();
  });

  it('restores the stored space limit on blur instead of leaving a blank or stale value', async () => {
    const user = userEvent.setup();
    useStore.getState().setSpaceLimit(15, 12);
    render(<GardenSetup />);
    const width = screen.getByLabelText('Width') as HTMLInputElement;
    expect(width.value).toBe('15');

    await user.clear(width);
    await user.tab();
    expect(width.value).toBe(''); // blank commits null immediately: "no limit"
    expect(useStore.getState().spaceLimit.width).toBeNull();

    await user.type(width, '0'); // below the min of 1: not committed
    expect(width.value).toBe('0');
    await user.tab();
    expect(width.value).toBe(''); // reflects the actual stored value, not the stale "0"
  });
});
