// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LayoutSolution } from '../../engine/types';
import OptionTabs from './OptionTabs';

afterEach(() => {
  cleanup();
});

function solution(label: string): LayoutSolution {
  return { plots: [{ x: 0, y: 0 }], placements: [], score: [], label };
}

describe('OptionTabs', () => {
  it('renders nothing when there is only one solution', () => {
    const { container } = render(
      <OptionTabs solutions={[solution('1 plot')]} editedFlags={[false]} selectedIndex={0} onSelect={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('labels tabs Best / Option 2 / Option 3 with the arrangement label, and marks the selected one', () => {
    const solutions = [solution('3x3 block'), solution('Row of 9'), solution('Rows of 5 and 4')];
    render(<OptionTabs solutions={solutions} editedFlags={[false, false, false]} selectedIndex={1} onSelect={() => {}} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);
    expect(tabs[0].textContent).toContain('Best');
    expect(tabs[0].textContent).toContain('3x3 block');
    expect(tabs[1].textContent).toContain('Option 2');
    expect(tabs[2].textContent).toContain('Option 3');

    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('marks an edited tab with "(edited)"', () => {
    const solutions = [solution('3x3 block'), solution('Row of 9')];
    render(<OptionTabs solutions={solutions} editedFlags={[false, true]} selectedIndex={0} onSelect={() => {}} />);
    expect(screen.getByText('Option 2 (edited)')).toBeTruthy();
    expect(screen.queryByText('Best (edited)')).toBeNull();
  });

  it('calls onSelect with the tab index when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const solutions = [solution('3x3 block'), solution('Row of 9')];
    render(<OptionTabs solutions={solutions} editedFlags={[false, false]} selectedIndex={0} onSelect={onSelect} />);
    await user.click(screen.getByRole('tab', { name: /Option 2/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
