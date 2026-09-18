// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../state/store';
import PlotPicker from './PlotPicker';

beforeEach(() => {
  useStore.getState().resetToExample();
});

afterEach(() => {
  cleanup();
});

describe('PlotPicker', () => {
  it('shows 9 cells and the current count as a label', () => {
    render(<PlotPicker />);
    expect(screen.getAllByRole('button')).toHaveLength(9);
    expect(screen.getByText('9 plots')).toBeTruthy();
  });

  it('pressing the k-th cell sets the plot count to k', async () => {
    const user = userEvent.setup();
    render(<PlotPicker />);
    await user.click(screen.getByRole('button', { name: '4 plots' }));
    expect(useStore.getState().settings.plotCount).toBe(4);
  });

  it('marks cells up to the current count as pressed, and no further', async () => {
    const user = userEvent.setup();
    render(<PlotPicker />);
    await user.click(screen.getByRole('button', { name: '3 plots' }));
    expect(screen.getByRole('button', { name: '1 plot' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '3 plots' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '4 plots' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('singular label for 1 plot', async () => {
    const user = userEvent.setup();
    render(<PlotPicker />);
    await user.click(screen.getByRole('button', { name: '1 plot' }));
    expect(screen.getByText('1 plot')).toBeTruthy();
  });
});
