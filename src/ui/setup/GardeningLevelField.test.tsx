// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GardeningLevelField from './GardeningLevelField';
import { useStore } from '../state/store';

beforeEach(() => {
  useStore.getState().setGardeningLevel(null);
});

afterEach(() => {
  cleanup();
});

describe('GardeningLevelField', () => {
  it('shows a blank input when no level is set', () => {
    render(<GardeningLevelField />);
    const input = screen.getByLabelText('Your Gardening level') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('sets the gardening level as the user types', async () => {
    const user = userEvent.setup();
    render(<GardeningLevelField />);
    const input = screen.getByLabelText('Your Gardening level');
    await user.type(input, '7');
    expect(useStore.getState().settings.gardeningLevel).toBe(7);
  });

  it('clearing the field resets the level to null', async () => {
    useStore.getState().setGardeningLevel(5);
    const user = userEvent.setup();
    render(<GardeningLevelField />);
    const input = screen.getByLabelText('Your Gardening level') as HTMLInputElement;
    expect(input.value).toBe('5');
    await user.clear(input);
    expect(useStore.getState().settings.gardeningLevel).toBeNull();
  });

  it('leaving the field blank on blur stays blank, matching "no limit"', async () => {
    useStore.getState().setGardeningLevel(5);
    const user = userEvent.setup();
    render(<GardeningLevelField />);
    const input = screen.getByLabelText('Your Gardening level') as HTMLInputElement;
    await user.clear(input);
    await user.tab(); // blur
    expect(input.value).toBe('');
    expect(useStore.getState().settings.gardeningLevel).toBeNull();
  });

  it('typing a value below the minimum never commits, and blur restores the stored value', async () => {
    useStore.getState().setGardeningLevel(5);
    const user = userEvent.setup();
    render(<GardeningLevelField />);
    const input = screen.getByLabelText('Your Gardening level') as HTMLInputElement;

    await user.clear(input);
    await user.type(input, '0');
    expect(input.value).toBe('0'); // shown while typing, even though not yet committed
    expect(useStore.getState().settings.gardeningLevel).toBeNull(); // clearing already committed null

    await user.tab(); // blur without a further valid edit
    expect(input.value).toBe(''); // reflects the actually-stored value (null), not the stale "0"
    expect(useStore.getState().settings.gardeningLevel).toBeNull();
  });
});
