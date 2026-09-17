// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CropPalette from './CropPalette';

afterEach(() => {
  cleanup();
});

describe('CropPalette', () => {
  it('lists goal crops and helpers under "Your crops" and the rest under "Other crops"', () => {
    render(
      <CropPalette
        gardeningLevel={null}
        goalCrops={new Set(['apple'])}
        helpers={['corn', 'potato']}
        selectedCropId={null}
        onSelect={() => {}}
      />,
    );

    const yours = screen.getByRole('group', { name: 'Your crops' });
    expect(within(yours).getByRole('button', { name: /Apple/ })).toBeTruthy();
    expect(within(yours).getByRole('button', { name: /Corn/ })).toBeTruthy();
    expect(within(yours).getByRole('button', { name: /Potato/ })).toBeTruthy();
    expect(within(yours).queryByRole('button', { name: /Wheat/ })).toBeNull();

    const others = screen.getByRole('group', { name: 'Other crops' });
    expect(within(others).getByRole('button', { name: /Wheat/ })).toBeTruthy();
    expect(within(others).queryByRole('button', { name: /Apple/ })).toBeNull();
  });

  it('hides crops above the given Gardening level', () => {
    render(
      <CropPalette gardeningLevel={1} goalCrops={new Set()} helpers={[]} selectedCropId={null} onSelect={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: /Apple/ })).toBeNull(); // needs level 10
    expect(screen.getByRole('button', { name: /Tomato/ })).toBeTruthy();
  });

  it('marks the selected crop pressed and calls onSelect with its id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <CropPalette
        gardeningLevel={null}
        goalCrops={new Set()}
        helpers={[]}
        selectedCropId="wheat"
        onSelect={onSelect}
      />,
    );
    const wheatButton = screen.getByRole('button', { name: /Wheat/ });
    expect(wheatButton.getAttribute('aria-pressed')).toBe('true');

    const appleButton = screen.getByRole('button', { name: /Apple/ });
    expect(appleButton.getAttribute('aria-pressed')).toBe('false');
    await user.click(appleButton);
    expect(onSelect).toHaveBeenCalledWith('apple');
  });
});
