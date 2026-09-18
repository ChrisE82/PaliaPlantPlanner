// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppDndProvider } from '../dnd/AppDnd';
import { useStore } from '../state/store';
import HelpersTray from './HelpersTray';

beforeEach(() => {
  useStore.getState().resetToExample();
});

afterEach(() => {
  cleanup();
});

function renderTray() {
  return render(
    <AppDndProvider>
      <HelpersTray />
    </AppDndProvider>,
  );
}

describe('HelpersTray', () => {
  it('shows the default example helpers', () => {
    renderTray();
    expect(screen.getByRole('button', { name: /Corn helper/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Potato helper/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Carrot helper/ })).toBeTruthy();
  });

  it('shows an empty message when there are no helpers and nothing is selected', () => {
    useStore.getState().setHelpers([]);
    renderTray();
    expect(screen.getByText('No helpers yet')).toBeTruthy();
  });

  it('pressing a helper tile selects it, pressing again deselects it', async () => {
    const user = userEvent.setup();
    renderTray();
    const corn = screen.getByRole('button', { name: /Corn helper/ });
    expect(corn.getAttribute('aria-pressed')).toBe('false');

    await user.click(corn);
    expect(useStore.getState().selectedItem).toEqual({ kind: 'helper', cropId: 'corn' });
    expect(corn.getAttribute('aria-pressed')).toBe('true');

    await user.click(corn);
    expect(useStore.getState().selectedItem).toBeNull();
  });

  it('the remove button removes the crop from helpers', async () => {
    const user = userEvent.setup();
    renderTray();
    await user.click(screen.getByRole('button', { name: 'Remove Corn from helpers' }));
    expect(useStore.getState().settings.helpers).not.toContain('corn');
    expect(screen.queryByRole('button', { name: /Corn helper/ })).toBeNull();
  });

  it('tap-to-place: a selected palette crop is added as a helper via Add here', async () => {
    const user = userEvent.setup();
    useStore.getState().selectItem({ kind: 'palette-crop', cropId: 'onion' });
    renderTray();
    await user.click(screen.getByRole('button', { name: 'Add here' }));
    expect(useStore.getState().settings.helpers).toContain('onion');
    expect(useStore.getState().selectedItem).toBeNull();
  });

  it('shows no Add here button when nothing is selected', () => {
    renderTray();
    expect(screen.queryByRole('button', { name: 'Add here' })).toBeNull();
  });
});
