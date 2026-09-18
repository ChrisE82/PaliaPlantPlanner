// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultTabs from './ResultTabs';

afterEach(() => {
  cleanup();
});

describe('ResultTabs', () => {
  it('shows Goals, Compare and Seeds, marking the current one selected', () => {
    render(<ResultTabs tab="goals" onChange={() => {}} showCompare />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Goals', 'Compare', 'Seeds']);
    expect(screen.getByRole('tab', { name: 'Goals' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Compare' }).getAttribute('aria-selected')).toBe('false');
  });

  it('hides Compare when there is nothing to compare', () => {
    render(<ResultTabs tab="goals" onChange={() => {}} showCompare={false} />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Goals', 'Seeds']);
  });

  it('calls onChange with the clicked tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ResultTabs tab="goals" onChange={onChange} showCompare />);
    await user.click(screen.getByRole('tab', { name: 'Seeds' }));
    expect(onChange).toHaveBeenCalledWith('seeds');
  });
});
