// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HelperPicker from './HelperPicker';
import { useStore } from '../state/store';
import { CROPS } from '../../data/crops';

beforeEach(() => {
  useStore.getState().resetToExample();
});

afterEach(() => {
  cleanup();
});

describe('HelperPicker', () => {
  it('shows every crop as a toggle button when there is no gardening level limit', () => {
    render(<HelperPicker />);
    for (const crop of CROPS) {
      expect(screen.getByRole('button', { name: new RegExp(crop.name) })).toBeTruthy();
    }
  });

  it('shows the default helpers as pressed', () => {
    render(<HelperPicker />);
    const cornButton = screen.getByRole('button', { name: /Corn/ });
    expect(cornButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles a helper crop on and off by clicking its chip', async () => {
    const user = userEvent.setup();
    render(<HelperPicker />);
    const onionButton = screen.getByRole('button', { name: /Onion/ });
    expect(onionButton.getAttribute('aria-pressed')).toBe('false');

    await user.click(onionButton);
    expect(useStore.getState().settings.helpers).toContain('onion');
    expect(onionButton.getAttribute('aria-pressed')).toBe('true');

    await user.click(onionButton);
    expect(useStore.getState().settings.helpers).not.toContain('onion');
  });

  it('shows goal crops as selected and disabled with "In a goal"', () => {
    render(<HelperPicker />);
    // Apple and Wheat are named in the default example's goals.
    const appleButton = screen.getByRole('button', { name: /Apple/ }) as HTMLButtonElement;
    expect(appleButton.getAttribute('aria-pressed')).toBe('true');
    expect(appleButton.disabled).toBe(true);
    expect(appleButton.textContent).toContain('In a goal');

    const wheatButton = screen.getByRole('button', { name: /Wheat/ }) as HTMLButtonElement;
    expect(wheatButton.getAttribute('aria-pressed')).toBe('true');
    expect(wheatButton.disabled).toBe(true);
  });

  it('does not toggle a disabled goal-crop chip', async () => {
    const user = userEvent.setup();
    render(<HelperPicker />);
    const appleButton = screen.getByRole('button', { name: /Apple/ });
    const before = useStore.getState().settings.helpers;
    await user.click(appleButton);
    expect(useStore.getState().settings.helpers).toEqual(before);
  });

  it('Select all selects every visible crop not already in a goal', async () => {
    const user = userEvent.setup();
    render(<HelperPicker />);
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    const helpers = useStore.getState().settings.helpers;
    expect(helpers).not.toContain('apple');
    expect(helpers).not.toContain('wheat');
    expect(helpers).toContain('onion');
    expect(helpers.length).toBe(CROPS.length - 2);
  });

  it('Clear empties the helpers list', async () => {
    const user = userEvent.setup();
    render(<HelperPicker />);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(useStore.getState().settings.helpers).toEqual([]);
  });
});
