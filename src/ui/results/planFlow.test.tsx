// @vitest-environment jsdom
/**
 * End-to-end coverage for Task A (run + show results) and Task B (editing),
 * driven through the real App with a fake PlannerClient.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { PlannerClientProvider } from '../state/plannerClient';
import { useStore } from '../state/store';
import { createFakePlannerClient, type FakePlannerClient } from '../testHelpers';
import type { LayoutSolution, PlanResult, Placement, PlotPos } from '../../engine/types';

let client: FakePlannerClient;

beforeEach(() => {
  useStore.getState().resetToExample();
  client = createFakePlannerClient();
});

afterEach(() => {
  cleanup();
});

function renderApp() {
  return render(
    <PlannerClientProvider client={client}>
      <App />
    </PlannerClientProvider>,
  );
}

// Two touching 3x3 plots: 6 tiles wide, 3 tall, tiles (0,0)-(5,2).
const TWO_PLOTS: PlotPos[] = [{ x: 0, y: 0 }, { x: 3, y: 0 }];

function solution(placements: Placement[], label = 'Row of 2'): LayoutSolution {
  return { plots: TWO_PLOTS, placements, score: [], label };
}

function planResult(solutions: LayoutSolution[]): PlanResult {
  return { solutions, arrangementsTried: solutions.length, elapsedMs: 12 };
}

function seedResult(solutions: LayoutSolution[]) {
  useStore.getState().planSucceeded(planResult(solutions));
}

/** Sorted so tile-set comparisons don't depend on insertion order. */
function sortedTiles<T extends { x: number; y: number }>(tiles: readonly T[]): T[] {
  return [...tiles].sort((a, b) => a.y - b.y || a.x - b.x);
}

describe('plan flow', () => {
  it('shows progress, then results with tabs, a goal summary and a shopping total', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Plan my garden' }));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(client.callCount).toBe(1);

    client.emitProgress({
      stage: 'screening',
      done: 5,
      total: 20,
      best: solution([{ cropId: 'apple', x: 0, y: 0 }], '1 plot'),
    });
    expect(await screen.findByText('Comparing arrangements: 5 of 20')).toBeTruthy();
    expect(screen.getByText('Best so far')).toBeTruthy();

    const solutions = [
      solution([{ cropId: 'apple', x: 0, y: 0 }, { cropId: 'wheat', x: 3, y: 0 }], '3x3 block'),
      solution([{ cropId: 'wheat', x: 0, y: 0 }], 'Row of 9'),
    ];
    client.resolveRun(planResult(solutions));

    await screen.findByRole('tablist');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent).toContain('Best');
    expect(tabs[1].textContent).toContain('Option 2');

    expect(screen.getByText('Goal summary')).toBeTruthy();
    expect(screen.getByText(/^Total: /)).toBeTruthy();
  });

  it('Stop keeps the best-so-far layout as the result', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Plan my garden' }));

    const best = solution([{ cropId: 'apple', x: 0, y: 0 }], '1 plot');
    client.emitProgress({ stage: 'screening', done: 3, total: 10, best });
    await user.click(screen.getByRole('button', { name: 'Stop' }));

    expect(await screen.findByText('Stopped early. This is the best layout found so far.')).toBeTruthy();
    expect(useStore.getState().status).toBe('stopped');
    expect(useStore.getState().solutionStates[0].placements).toEqual(best.placements);
  });

  it('shows a plain error message when the run fails', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Plan my garden' }));
    client.rejectRun(new Error('Worker crashed'));
    expect(await screen.findByText('Error: Worker crashed')).toBeTruthy();
  });

  it('shows a stale-settings note once settings change after a plan', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Plan my garden' }));
    client.resolveRun(planResult([solution([{ cropId: 'apple', x: 0, y: 0 }])]));
    await screen.findByText('Goal summary');

    expect(screen.queryByText(/Your settings changed/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add goal' }));
    expect(await screen.findByText('Your settings changed after this plan. Plan again to update it.')).toBeTruthy();
  });
});

describe('re-optimize', () => {
  it('sends the displayed placements and locked tiles as fixed, and keeps the locks after applying the result', async () => {
    const user = userEvent.setup();
    seedResult([solution([{ cropId: 'apple', x: 0, y: 0 }])]);
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Edit layout' }));
    await user.click(screen.getByRole('button', { name: 'Lock plant' }));
    await user.click(screen.getByTestId('grid-tile-1-1')); // a tile inside the apple

    await user.click(screen.getByRole('button', { name: 'Re-optimize unlocked' }));

    expect(client.callCount).toBe(1);
    const req = client.lastRequest!;
    expect(req.fixed).toBeTruthy();
    expect(req.fixed!.plots).toEqual(TWO_PLOTS);
    expect(req.fixed!.placements).toEqual([{ cropId: 'apple', x: 0, y: 0 }]);
    expect(sortedTiles(req.fixed!.lockedTiles)).toEqual(
      sortedTiles([
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
        { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
        { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
      ]),
    );

    client.resolveRun(planResult([solution([{ cropId: 'apple', x: 0, y: 0 }, { cropId: 'wheat', x: 3, y: 0 }])]));

    await waitFor(() => {
      expect(useStore.getState().solutionStates[0].placements).toEqual([
        { cropId: 'apple', x: 0, y: 0 },
        { cropId: 'wheat', x: 3, y: 0 },
      ]);
    });
    expect(useStore.getState().solutionStates[0].lockedTiles.length).toBe(9);
  });
});

describe('editing', () => {
  it('places a 1x1 crop with the Plant tool', async () => {
    const user = userEvent.setup();
    seedResult([solution([])]);
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Edit layout' }));
    const palette = screen.getByRole('group', { name: 'Your crops' });
    await user.click(within(palette).getByRole('button', { name: /Wheat/ }));
    await user.click(screen.getByTestId('grid-tile-3-0'));

    expect(useStore.getState().solutionStates[0].placements).toEqual([{ cropId: 'wheat', x: 3, y: 0 }]);
  });

  it('places a 3x3 crop with the Plant tool', async () => {
    const user = userEvent.setup();
    seedResult([solution([])]);
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Edit layout' }));
    const palette = screen.getByRole('group', { name: 'Your crops' });
    await user.click(within(palette).getByRole('button', { name: /Apple/ }));
    await user.click(screen.getByTestId('grid-tile-0-0'));

    expect(useStore.getState().solutionStates[0].placements).toEqual([{ cropId: 'apple', x: 0, y: 0 }]);
  });

  it('refuses to plant over a locked plant and leaves it in place', async () => {
    const user = userEvent.setup();
    seedResult([solution([{ cropId: 'apple', x: 0, y: 0 }])]);
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Edit layout' }));
    await user.click(screen.getByRole('button', { name: 'Lock plant' }));
    await user.click(screen.getByTestId('grid-tile-1-1')); // locks the whole apple

    await user.click(screen.getByRole('button', { name: 'Plant' }));
    const palette = screen.getByRole('group', { name: 'Your crops' });
    await user.click(within(palette).getByRole('button', { name: /Wheat/ }));
    await user.click(screen.getByTestId('grid-tile-1-1'));

    expect(await screen.findByText('Apple is locked. Unlock it first.')).toBeTruthy();
    expect(useStore.getState().solutionStates[0].placements).toEqual([{ cropId: 'apple', x: 0, y: 0 }]);
  });

  it('erases a plant with the Erase tool', async () => {
    const user = userEvent.setup();
    seedResult([solution([{ cropId: 'wheat', x: 3, y: 0 }])]);
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Edit layout' }));
    await user.click(screen.getByRole('button', { name: 'Erase' }));
    await user.click(screen.getByTestId('grid-tile-3-0'));

    expect(useStore.getState().solutionStates[0].placements).toEqual([]);
  });

  it('locks and unlocks a plant with the Lock plant tool', async () => {
    const user = userEvent.setup();
    seedResult([solution([{ cropId: 'wheat', x: 3, y: 0 }])]);
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Edit layout' }));
    await user.click(screen.getByRole('button', { name: 'Lock plant' }));
    await user.click(screen.getByTestId('grid-tile-3-0'));
    expect(useStore.getState().solutionStates[0].lockedTiles).toEqual([{ x: 3, y: 0 }]);

    await user.click(screen.getByTestId('grid-tile-3-0'));
    expect(useStore.getState().solutionStates[0].lockedTiles).toEqual([]);
  });

  it('locks all 9 tiles of a plot with the Lock plot tool', async () => {
    const user = userEvent.setup();
    seedResult([solution([])]);
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Edit layout' }));
    await user.click(screen.getByRole('button', { name: 'Lock plot' }));
    await user.click(screen.getByTestId('grid-tile-4-1'));

    expect(useStore.getState().solutionStates[0].lockedTiles.length).toBe(9);
  });

  it('Undo reverts the last edit', async () => {
    const user = userEvent.setup();
    seedResult([solution([])]);
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Edit layout' }));
    const palette = screen.getByRole('group', { name: 'Your crops' });
    await user.click(within(palette).getByRole('button', { name: /Wheat/ }));
    await user.click(screen.getByTestId('grid-tile-3-0'));
    expect(useStore.getState().solutionStates[0].placements.length).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useStore.getState().solutionStates[0].placements).toEqual([]);
  });
});
