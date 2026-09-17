// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ArrangementEditor, { candidateForDrag } from './ArrangementEditor';
import { useStore } from '../state/store';

beforeEach(() => {
  useStore.getState().setCustomPlots([]);
});

afterEach(() => {
  cleanup();
});

describe('ArrangementEditor', () => {
  it('adds a plot snapped to the 3-tile grid when an empty tile is clicked', async () => {
    const user = userEvent.setup();
    render(<ArrangementEditor />);
    await user.click(screen.getByTestId('tile-4-4'));
    expect(useStore.getState().customPlots).toEqual([{ x: 3, y: 3 }]);
    expect(screen.getByText('1 of 9 plots placed')).toBeTruthy();
  });

  it('removes a plot when it is clicked', async () => {
    const user = userEvent.setup();
    useStore.getState().setCustomPlots([{ x: 3, y: 3 }]);
    render(<ArrangementEditor />);
    const plotButton = screen.getByRole('button', { name: /Plot 1 of 1 placed/ });
    await user.click(plotButton);
    expect(useStore.getState().customPlots).toEqual([]);
    expect(screen.getByText('0 of 9 plots placed')).toBeTruthy();
  });

  it('refuses a 10th plot', async () => {
    const user = userEvent.setup();
    render(<ArrangementEditor />);
    await user.click(screen.getByRole('button', { name: 'Start with a 3x3 block' }));
    expect(useStore.getState().customPlots.length).toBe(9);

    await user.click(screen.getByTestId('tile-20-20'));
    expect(useStore.getState().customPlots.length).toBe(9);
    expect(screen.getByText('Error: A garden can have at most 9 plots.')).toBeTruthy();
  });

  it('refuses an overlapping plot when snapping is off', async () => {
    const user = userEvent.setup();
    render(<ArrangementEditor />);
    await user.click(screen.getByLabelText('Line up plots on a 3-tile grid')); // turn snapping off
    await user.click(screen.getByTestId('tile-5-5'));
    expect(useStore.getState().customPlots).toEqual([{ x: 5, y: 5 }]);

    await user.click(screen.getByTestId('tile-3-6'));
    expect(useStore.getState().customPlots).toEqual([{ x: 5, y: 5 }]);
    expect(screen.getByText(/Plots can.t overlap\./)).toBeTruthy();
  });

  it('clears every plot', async () => {
    const user = userEvent.setup();
    useStore.getState().setCustomPlots([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    render(<ArrangementEditor />);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(useStore.getState().customPlots).toEqual([]);
  });
});

// candidateForDrag drives the drag-to-reposition preview (see ArrangementEditor.tsx's
// handleDragMove/handleDragEnd). It's pure and DOM-free, unlike the pointer-to-tile
// conversion around it, which needs a real SVG CTM that jsdom doesn't implement.
describe('candidateForDrag', () => {
  const plots = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 6, y: 6 },
  ];

  it('snaps the hovered tile to the 3-tile grid when snap is on', () => {
    const result = candidateForDrag(plots, 2, { x: 8, y: 13 }, true);
    expect(result).toEqual({ pos: { x: 6, y: 12 }, valid: true });
  });

  it('uses the exact (clamped) tile when snap is off', () => {
    const result = candidateForDrag(plots, 2, { x: 8, y: 13 }, false);
    expect(result.pos).toEqual({ x: 8, y: 13 });
  });

  it('clamps to the board edge so the plot never hangs off it', () => {
    const result = candidateForDrag(plots, 2, { x: 26, y: 0 }, false);
    expect(result.pos).toEqual({ x: 24, y: 0 }); // BOARD_SIZE (27) - PLOT_SIZE (3)
  });

  it('refuses a position that overlaps a different plot', () => {
    // Dragging plot 2 onto plot 0's tile (snapped) would overlap it.
    const result = candidateForDrag(plots, 2, { x: 1, y: 1 }, true);
    expect(result).toEqual({ pos: { x: 0, y: 0 }, valid: false });
  });

  it('is valid when the only "overlap" is the plot being dragged itself', () => {
    // Hovering back over plot 2's own current tile must not refuse the drop.
    const result = candidateForDrag(plots, 2, { x: 6, y: 6 }, true);
    expect(result).toEqual({ pos: { x: 6, y: 6 }, valid: true });
  });
});
