// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditToolbar from './EditToolbar';

afterEach(() => {
  cleanup();
});

describe('EditToolbar', () => {
  it('shows Plant, Erase, Lock plant and Lock plot as a tool group, checking the active one', () => {
    render(
      <EditToolbar
        tool="erase"
        onToolChange={() => {}}
        onUndo={() => {}}
        canUndo={false}
        onUnlockAll={() => {}}
        canUnlockAll={false}
        onReoptimize={() => {}}
        reoptimizing={false}
      />,
    );
    expect(screen.getByRole('group', { name: 'Edit tool' })).toBeTruthy();
    expect((screen.getByRole('radio', { name: 'Plant' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('radio', { name: 'Erase' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('radio', { name: 'Lock plant' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Lock plot' })).toBeTruthy();
  });

  it('calls onToolChange with the clicked tool', async () => {
    const user = userEvent.setup();
    const onToolChange = vi.fn();
    render(
      <EditToolbar
        tool="plant"
        onToolChange={onToolChange}
        onUndo={() => {}}
        canUndo={false}
        onUnlockAll={() => {}}
        canUnlockAll={false}
        onReoptimize={() => {}}
        reoptimizing={false}
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'Lock plot' }));
    expect(onToolChange).toHaveBeenCalledWith('lockPlot');
  });

  it('disables Undo and Unlock all when there is nothing to undo or unlock', () => {
    render(
      <EditToolbar
        tool="plant"
        onToolChange={() => {}}
        onUndo={() => {}}
        canUndo={false}
        onUnlockAll={() => {}}
        canUnlockAll={false}
        onReoptimize={() => {}}
        reoptimizing={false}
      />,
    );
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Unlock all' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Undo and Unlock all when there is something to act on, and shows Re-optimizing while busy', () => {
    render(
      <EditToolbar
        tool="plant"
        onToolChange={() => {}}
        onUndo={() => {}}
        canUndo
        onUnlockAll={() => {}}
        canUnlockAll
        onReoptimize={() => {}}
        reoptimizing
      />,
    );
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Unlock all' }) as HTMLButtonElement).disabled).toBe(false);
    const reoptButton = screen.getByRole('button', { name: 'Re-optimizing...' }) as HTMLButtonElement;
    expect(reoptButton.disabled).toBe(true);
  });
});
