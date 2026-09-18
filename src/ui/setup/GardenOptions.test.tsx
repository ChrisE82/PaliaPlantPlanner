// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../state/store';
import GardenOptions from './GardenOptions';

beforeEach(() => {
  useStore.getState().resetToExample();
});

afterEach(() => {
  cleanup();
});

describe('GardenOptions', () => {
  it('is collapsed by default and opens when the summary is pressed', async () => {
    const user = userEvent.setup();
    const { container } = render(<GardenOptions />);
    expect(container.querySelector('details')?.open).toBe(false);
    await user.click(screen.getByText('Options'));
    expect(container.querySelector('details')?.open).toBe(true);
  });

  it('shows the width and height sliders as Off by default, in Suggest mode', () => {
    render(<GardenOptions />);
    expect(screen.getByLabelText('Width limit')).toBeTruthy();
    expect(screen.getByLabelText('Height limit')).toBeTruthy();
    expect(screen.getAllByText('Off')).toHaveLength(2);
  });

  it('hides the space-limit sliders in Draw-my-own mode but keeps the Gardening level slider', () => {
    useStore.getState().setArrangementMode('custom');
    render(<GardenOptions />);
    expect(screen.queryByLabelText('Width limit')).toBeNull();
    expect(screen.queryByLabelText('Height limit')).toBeNull();
    expect(screen.getByLabelText('Your Gardening level')).toBeTruthy();
  });

  it('moving the width slider off its minimum sets a tile limit', () => {
    render(<GardenOptions />);
    const width = screen.getByLabelText('Width limit') as HTMLInputElement;
    fireEvent.change(width, { target: { value: '15' } });
    expect(useStore.getState().spaceLimit.width).toBe(15);
    expect(width.value).toBe('15');
    expect(screen.getByText('15 tiles')).toBeTruthy();
  });

  it('moving the width slider back to its minimum turns the limit off', () => {
    useStore.getState().setSpaceLimit(15, null);
    render(<GardenOptions />);
    fireEvent.change(screen.getByLabelText('Width limit'), { target: { value: '2' } });
    expect(useStore.getState().spaceLimit.width).toBeNull();
  });

  it('the Gardening level slider defaults to Any and can be set to a level', () => {
    render(<GardenOptions />);
    expect(screen.getByText('Any')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Your Gardening level'), { target: { value: '8' } });
    expect(useStore.getState().settings.gardeningLevel).toBe(8);
    expect(screen.getByText('Level 8')).toBeTruthy();
  });

  it('moving the Gardening level slider back to 0 clears it to Any', () => {
    useStore.getState().setGardeningLevel(8);
    render(<GardenOptions />);
    fireEvent.change(screen.getByLabelText('Your Gardening level'), { target: { value: '0' } });
    expect(useStore.getState().settings.gardeningLevel).toBeNull();
  });
});
