// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CROP_BY_ID } from '../../data/crops';
import { computeBuffs } from '../../engine/buffs';
import { buildGarden } from '../../engine/garden';
import { ALL_GOAL_CROPS, type Goal, type Placement } from '../../engine/types';
import GardenGrid from './GardenGrid';

afterEach(() => {
  cleanup();
});

// Two touching plots: apple (3x3) on the left, three wheat plants (1x1,
// harvestBoost) along apple's right edge.
const PLOTS = [{ x: 0, y: 0 }, { x: 3, y: 0 }];
const PLACEMENTS: Placement[] = [
  { cropId: 'apple', x: 0, y: 0 },
  { cropId: 'wheat', x: 3, y: 0 },
  { cropId: 'wheat', x: 3, y: 1 },
  { cropId: 'wheat', x: 3, y: 2 },
];

function buildFixture(goals: Goal[], goalCrops: Set<string>) {
  const garden = buildGarden(PLOTS);
  const buffs = computeBuffs(garden, PLACEMENTS, CROP_BY_ID);
  return { garden, buffs, goals, goalCrops };
}

describe('GardenGrid crop icons', () => {
  it('draws one icon per plant when icons are available', () => {
    const { garden, buffs } = buildFixture([], new Set());
    const { container } = render(
      <GardenGrid
        garden={garden}
        placements={PLACEMENTS}
        cropsById={CROP_BY_ID}
        buffs={buffs}
        goals={[]}
        goalCrops={new Set()}
        lockedTiles={[]}
      />,
    );

    const icons = container.querySelectorAll('img.garden-grid__icon');
    // With no icon files, the grid shows short labels instead.
    if (icons.length === 0) {
      expect(screen.getAllByText('Ap').length).toBe(1);
      return;
    }
    expect(icons.length).toBe(PLACEMENTS.length);
    expect(icons[0].getAttribute('src')).toContain('apple');
  });
});

describe('GardenGrid aria labels', () => {
  it('describes crop, size, position, and received buffs it has and requested buffs it is missing', () => {
    const goals: Goal[] = [{ id: 'g1', crop: 'apple', measure: 'waterRetain', amount: { kind: 'all' }, importance: 'high' }];
    const { garden, buffs } = buildFixture(goals, new Set(['apple']));

    render(
      <GardenGrid
        garden={garden}
        placements={PLACEMENTS}
        cropsById={CROP_BY_ID}
        buffs={buffs}
        goals={goals}
        goalCrops={new Set(['apple'])}
        lockedTiles={[]}
      />,
    );

    // Apple gets 3 harvestBoost contacts (from the 3 wheat along its right
    // edge) which meets its size-3 threshold, but nothing gives waterRetain.
    expect(
      screen.getByRole('button', {
        name: 'Apple, 3x3, at column 1, row 1. Has Harvest Boost. Missing Water Retain.',
      }),
    ).toBeTruthy();
  });

  it('describes a 1x1 crop at its column and row with no buff sentences when it has no neighbors', () => {
    const garden = buildGarden([{ x: 0, y: 0 }]);
    const placements: Placement[] = [{ cropId: 'wheat', x: 0, y: 0 }];
    const buffs = computeBuffs(garden, placements, CROP_BY_ID);
    render(
      <GardenGrid
        garden={garden}
        placements={placements}
        cropsById={CROP_BY_ID}
        buffs={buffs}
        goals={[]}
        goalCrops={new Set()}
        lockedTiles={[]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Wheat, 1x1, at column 1, row 1.' })).toBeTruthy();
  });
});

describe('GardenGrid hollow-dot rule', () => {
  it('draws a solid dot for a received buff and a hollow dot for a requested-but-missing one', () => {
    const goals: Goal[] = [{ id: 'g1', crop: 'apple', measure: 'waterRetain', amount: { kind: 'all' }, importance: 'high' }];
    const { garden, buffs } = buildFixture(goals, new Set(['apple']));
    const { container } = render(
      <GardenGrid
        garden={garden}
        placements={PLACEMENTS}
        cropsById={CROP_BY_ID}
        buffs={buffs}
        goals={goals}
        goalCrops={new Set(['apple'])}
        lockedTiles={[]}
      />,
    );

    // Scoped to the grid itself (not .garden-grid__wrap) so the legend's own
    // swatches, which reuse these same buff classes, aren't mistaken for a
    // plant's dot: the legend always lists every buff any crop in the whole
    // crop table gives, regardless of what's actually in this layout.
    const grid = container.querySelector('.garden-grid')!;
    const harvestDot = grid.querySelector('.garden-grid__dot--harvestBoost');
    const waterDot = grid.querySelector('.garden-grid__dot--waterRetain');
    expect(harvestDot).toBeTruthy();
    expect(harvestDot?.classList.contains('garden-grid__dot--hollow')).toBe(false);
    expect(waterDot).toBeTruthy();
    expect(waterDot?.classList.contains('garden-grid__dot--hollow')).toBe(true);

    // Nothing requests or gives Weed Block here, so no dot is drawn for it.
    expect(grid.querySelector('.garden-grid__dot--weedBlock')).toBeNull();
  });

  it('only shows a hollow dot for "All goal crops" on a crop that is itself a goal crop', () => {
    const goals: Goal[] = [{ id: 'g1', crop: ALL_GOAL_CROPS, measure: 'waterRetain', amount: { kind: 'all' }, importance: 'low' }];
    // apple is a goal crop (named elsewhere); wheat here is only a helper.
    const { garden, buffs } = buildFixture(goals, new Set(['apple']));
    const { container } = render(
      <GardenGrid
        garden={garden}
        placements={PLACEMENTS}
        cropsById={CROP_BY_ID}
        buffs={buffs}
        goals={goals}
        goalCrops={new Set(['apple'])}
        lockedTiles={[]}
      />,
    );

    const dots = container.querySelector('.garden-grid')!.querySelectorAll('.garden-grid__dot--waterRetain');
    // Only apple's hollow waterRetain dot; the three wheat plants (not goal crops) get none.
    expect(dots.length).toBe(1);
    expect(dots[0].classList.contains('garden-grid__dot--hollow')).toBe(true);
  });

  it('shows no dots at all when nothing is received or requested', () => {
    const { garden } = buildFixture([], new Set());
    const { container } = render(
      <GardenGrid
        garden={garden}
        placements={[{ cropId: 'wheat', x: 3, y: 0 }]}
        cropsById={CROP_BY_ID}
        buffs={computeBuffs(garden, [{ cropId: 'wheat', x: 3, y: 0 }], CROP_BY_ID)}
        goals={[]}
        goalCrops={new Set()}
        lockedTiles={[]}
      />,
    );
    // Scoped to the grid: the legend still lists the buffs crops give in general.
    expect(container.querySelector('.garden-grid')!.querySelectorAll('.garden-grid__dot').length).toBe(0);
  });
});

describe('GardenGrid interaction', () => {
  it('selects a placement on click in view mode', async () => {
    const user = userEvent.setup();
    const { garden, buffs } = buildFixture([], new Set());
    const onSelect = vi.fn();
    render(
      <GardenGrid
        garden={garden}
        placements={PLACEMENTS}
        cropsById={CROP_BY_ID}
        buffs={buffs}
        goals={[]}
        goalCrops={new Set()}
        lockedTiles={[]}
        onSelectPlacement={onSelect}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^Apple/ }));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('routes a tile tap to the active tool in edit mode instead of selecting', async () => {
    const user = userEvent.setup();
    const { garden, buffs } = buildFixture([], new Set());
    const onSelect = vi.fn();
    const onTileActivate = vi.fn();
    render(
      <GardenGrid
        garden={garden}
        placements={PLACEMENTS}
        cropsById={CROP_BY_ID}
        buffs={buffs}
        goals={[]}
        goalCrops={new Set()}
        lockedTiles={[]}
        onSelectPlacement={onSelect}
        interactive={{ tool: 'erase', previewCropId: null, onTileActivate }}
      />,
    );
    await user.click(screen.getByTestId('grid-tile-3-0')); // the wheat tile
    expect(onTileActivate).toHaveBeenCalledWith(3, 0);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('exposes empty tiles as keyboard-activatable buttons only in edit mode', () => {
    const { garden, buffs } = buildFixture([], new Set());
    const { rerender } = render(
      <GardenGrid
        garden={garden}
        placements={PLACEMENTS}
        cropsById={CROP_BY_ID}
        buffs={buffs}
        goals={[]}
        goalCrops={new Set()}
        lockedTiles={[]}
      />,
    );
    // (4, 0) is empty soil in this layout.
    expect(screen.queryByTestId('grid-tile-4-0')?.getAttribute('role')).toBeNull();

    rerender(
      <GardenGrid
        garden={garden}
        placements={PLACEMENTS}
        cropsById={CROP_BY_ID}
        buffs={buffs}
        goals={[]}
        goalCrops={new Set()}
        lockedTiles={[]}
        interactive={{ tool: 'plant', previewCropId: null, onTileActivate: () => {} }}
      />,
    );
    expect(screen.getByTestId('grid-tile-4-0').getAttribute('role')).toBe('button');
  });
});

describe('GardenGrid locks', () => {
  it('marks a fully-locked plant and draws a hatch pattern over a locked empty tile', () => {
    const { garden, buffs } = buildFixture([], new Set());
    const { container } = render(
      <GardenGrid
        garden={garden}
        placements={PLACEMENTS}
        cropsById={CROP_BY_ID}
        buffs={buffs}
        goals={[]}
        goalCrops={new Set()}
        lockedTiles={[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 4, y: 1 }]}
      />,
    );
    expect(container.querySelector('.garden-grid__lock-mark')).toBeTruthy();
    expect(container.querySelector('.garden-grid__tile--locked')).toBeTruthy();
  });
});
