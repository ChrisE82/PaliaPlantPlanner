import { describe, expect, it } from 'vitest';
import { buildGarden } from '../garden';
import { CROP_BY_ID } from '../../data/crops';
import type { Goal } from '../types';
import { compileProblem } from './problem';
import { LayoutState } from './state';

function block3x3() {
  const plots = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) plots.push({ x: x * 3, y: y * 3 });
  return buildGarden(plots);
}

const goals: Goal[] = [
  { id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'max' }, importance: 'high' },
];

function makeProblem() {
  const garden = block3x3();
  return compileProblem({ garden, goals, helpers: ['wheat', 'blueberry'], cropsById: CROP_BY_ID });
}

describe('LayoutState', () => {
  it('starts empty', () => {
    const problem = makeProblem();
    const state = new LayoutState(problem);
    expect(state.toPlacements()).toEqual([]);
    expect(state.slotCount).toBe(0);
  });

  it('place/remove round trip via toPlacements', () => {
    const problem = makeProblem();
    const state = new LayoutState(problem);
    const appleIdx = problem.cropIndexOf.get('apple')!;
    const wheatIdx = problem.cropIndexOf.get('wheat')!;
    state.place(appleIdx, 0); // 3x3 apple at (0,0)
    state.place(wheatIdx, 3 * problem.garden.width + 3); // wheat tile at (3,3)
    const placements = state.toPlacements();
    expect(placements).toHaveLength(2);
    expect(placements).toContainEqual({ cropId: 'apple', x: 0, y: 0 });
    expect(placements).toContainEqual({ cropId: 'wheat', x: 3, y: 3 });
  });

  it('loadPlacements followed by toPlacements reproduces the same set regardless of input order', () => {
    const problem = makeProblem();
    const input = [
      { cropId: 'apple', x: 0, y: 0 },
      { cropId: 'wheat', x: 3, y: 3 },
      { cropId: 'blueberry', x: 4, y: 4 },
      { cropId: 'wheat', x: 3, y: 4 },
    ];
    const state = new LayoutState(problem);
    state.loadPlacements(input);
    const out = state.toPlacements();
    expect(out).toHaveLength(input.length);
    for (const p of input) expect(out).toContainEqual(p);

    // Loading in a different order gives the same set back.
    const state2 = new LayoutState(problem);
    state2.loadPlacements([...input].reverse());
    const out2 = state2.toPlacements();
    expect(new Set(out2.map((p) => `${p.cropId}:${p.x},${p.y}`))).toEqual(
      new Set(out.map((p) => `${p.cropId}:${p.x},${p.y}`)),
    );
  });

  it('remove() frees the tiles so a new placement can reuse them', () => {
    const problem = makeProblem();
    const state = new LayoutState(problem);
    const appleIdx = problem.cropIndexOf.get('apple')!;
    const wheatIdx = problem.cropIndexOf.get('wheat')!;
    const slot = state.place(appleIdx, 0);
    expect(state.isFootprintFree(1, 0)).toBe(false);
    state.remove(slot);
    expect(state.toPlacements()).toEqual([]);
    expect(state.isFootprintFree(1, 0)).toBe(true);
    state.place(wheatIdx, 0);
    expect(state.toPlacements()).toEqual([{ cropId: 'wheat', x: 0, y: 0 }]);
  });

  it('clone() is independent of the original', () => {
    const problem = makeProblem();
    const state = new LayoutState(problem);
    const wheatIdx = problem.cropIndexOf.get('wheat')!;
    state.place(wheatIdx, 0);
    const clone = state.clone();
    const appleIdx = problem.cropIndexOf.get('apple')!;
    // Mutate the original after cloning; the clone must not see the change.
    state.place(appleIdx, 3);
    expect(clone.toPlacements()).toEqual([{ cropId: 'wheat', x: 0, y: 0 }]);
    expect(state.toPlacements()).toHaveLength(2);
  });

  it('copyInto() mirrors content without allocating a new state', () => {
    const problem = makeProblem();
    const a = new LayoutState(problem);
    const b = new LayoutState(problem);
    const wheatIdx = problem.cropIndexOf.get('wheat')!;
    a.place(wheatIdx, 0);
    a.copyInto(b);
    expect(b.toPlacements()).toEqual([{ cropId: 'wheat', x: 0, y: 0 }]);
  });

  it('loadPlacements marks placements covering a locked tile as locked', () => {
    const garden = block3x3();
    const problem = compileProblem({
      garden,
      goals,
      helpers: ['wheat'],
      cropsById: CROP_BY_ID,
      fixed: { placements: [{ cropId: 'apple', x: 0, y: 0 }], lockedTiles: [{ x: 1, y: 1 }] },
    });
    const state = new LayoutState(problem);
    state.loadPlacements(problem.fixedPlacements);
    // The apple's slot is the only active slot and must be locked.
    expect(state.slotLocked[state.tileSlot[0]]).toBe(1);
  });

  it('rejects loading an unknown crop id', () => {
    const problem = makeProblem();
    const state = new LayoutState(problem);
    expect(() => state.loadPlacements([{ cropId: 'not-a-crop', x: 0, y: 0 }])).toThrow();
  });
});
