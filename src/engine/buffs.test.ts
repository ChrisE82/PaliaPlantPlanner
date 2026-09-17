import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CROP_BY_ID, CROPS } from '../data/crops';
import { enumerateArrangements } from './arrangement';
import { computeBuffs, describeBuffs } from './buffs';
import { buildGarden, footprintOnSoil } from './garden';
import { buildOccupancy } from './layout';
import { RULES, type Rules } from './rules';
import { BUFF_IDS, BUFF_INDEX, buffBit, type Crop, type CropId, type Garden, type Placement, type PlacementBuffs, type PlotPos } from './types';

describe('rule 6 example from PLAN.md', () => {
  // A 2x2 block of plots (6x6 tiles). Apple at (1,1); Corn at (1,0) and
  // (2,0); Wheat at (0,2). 3 of the apple's touching tiles give Harvest
  // Boost, so it receives the buff. With only 2, it does not.
  const garden = buildGarden([
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 0, y: 3 },
    { x: 3, y: 3 },
  ]);

  it('apple receives Harvest Boost with 3 touching givers', () => {
    const placements: Placement[] = [
      { cropId: 'apple', x: 1, y: 1 },
      { cropId: 'corn', x: 1, y: 0 },
      { cropId: 'corn', x: 2, y: 0 },
      { cropId: 'wheat', x: 0, y: 2 },
    ];
    const buffs = computeBuffs(garden, placements, CROP_BY_ID);
    expect(buffs[0].contacts[BUFF_INDEX.harvestBoost]).toBe(3);
    expect(buffs[0].receivedMask & buffBit('harvestBoost')).not.toBe(0);
  });

  it('apple does not receive Harvest Boost with only 2 touching givers', () => {
    const placements: Placement[] = [
      { cropId: 'apple', x: 1, y: 1 },
      { cropId: 'corn', x: 1, y: 0 },
      { cropId: 'corn', x: 2, y: 0 },
    ];
    const buffs = computeBuffs(garden, placements, CROP_BY_ID);
    expect(buffs[0].contacts[BUFF_INDEX.harvestBoost]).toBe(2);
    expect(buffs[0].receivedMask & buffBit('harvestBoost')).toBe(0);
  });
});

describe('own-type exclusion (rule 4)', () => {
  it('a full 3x3 plot of Carrots: no carrot receives Weed Block', () => {
    const garden = buildGarden([{ x: 0, y: 0 }]);
    const placements: Placement[] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) placements.push({ cropId: 'carrot', x, y });
    const buffs = computeBuffs(garden, placements, CROP_BY_ID);
    for (const b of buffs) expect(b.receivedMask & buffBit('weedBlock')).toBe(0);
  });

  it('a Carrot next to an Onion receives Weed Block (different crop, same buff)', () => {
    const garden = buildGarden([{ x: 0, y: 0 }]);
    const placements: Placement[] = [
      { cropId: 'carrot', x: 0, y: 0 },
      { cropId: 'onion', x: 1, y: 0 },
    ];
    const buffs = computeBuffs(garden, placements, CROP_BY_ID);
    expect(buffs[0].receivedMask & buffBit('weedBlock')).not.toBe(0);
  });
});

it('Tomato next to Potato: both receive Water Retain', () => {
  const garden = buildGarden([{ x: 0, y: 0 }]);
  const placements: Placement[] = [
    { cropId: 'tomato', x: 0, y: 0 },
    { cropId: 'potato', x: 1, y: 0 },
  ];
  const buffs = computeBuffs(garden, placements, CROP_BY_ID);
  expect(buffs[0].receivedMask & buffBit('waterRetain')).not.toBe(0);
  expect(buffs[1].receivedMask & buffBit('waterRetain')).not.toBe(0);
});

it('Blueberry and Spicy Pepper across a shared 2-tile edge each get contacts 2', () => {
  // Two plots side by side; a 2x2 Blueberry and a 2x2 Spicy Pepper touching
  // along a full 2-tile edge.
  const garden = buildGarden([
    { x: 0, y: 0 },
    { x: 3, y: 0 },
  ]);
  const placements: Placement[] = [
    { cropId: 'blueberry', x: 0, y: 0 },
    { cropId: 'spicy-pepper', x: 2, y: 0 },
  ];
  const buffs = computeBuffs(garden, placements, CROP_BY_ID);
  expect(buffs[0].contacts[BUFF_INDEX.qualityBoost]).toBe(2);
  expect(buffs[0].receivedMask & buffBit('qualityBoost')).not.toBe(0);
  expect(buffs[1].contacts[BUFF_INDEX.harvestBoost]).toBe(2);
  expect(buffs[1].receivedMask & buffBit('harvestBoost')).not.toBe(0);
});

it('diagonal neighbors give no buff', () => {
  const garden = buildGarden([{ x: 0, y: 0 }]);
  const placements: Placement[] = [
    { cropId: 'carrot', x: 0, y: 0 },
    { cropId: 'onion', x: 1, y: 1 }, // diagonal to (0,0)
  ];
  const buffs = computeBuffs(garden, placements, CROP_BY_ID);
  expect(buffs[0].contacts[BUFF_INDEX.weedBlock]).toBe(0);
  expect(buffs[1].contacts[BUFF_INDEX.weedBlock]).toBe(0);
});

describe('gaps and plot borders (rule 3)', () => {
  it('a one-tile gap between plots blocks buffs across it', () => {
    const garden = buildGarden([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ]);
    const placements: Placement[] = [
      { cropId: 'wheat', x: 2, y: 0 }, // rightmost column of plot 1
      { cropId: 'corn', x: 4, y: 0 }, // leftmost column of plot 2
    ];
    const buffs = computeBuffs(garden, placements, CROP_BY_ID);
    expect(buffs[0].contacts[BUFF_INDEX.harvestBoost]).toBe(0);
    expect(buffs[1].contacts[BUFF_INDEX.harvestBoost]).toBe(0);
  });

  it('touching plots let buffs cross the seam', () => {
    const garden = buildGarden([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    const placements: Placement[] = [
      { cropId: 'wheat', x: 2, y: 0 },
      { cropId: 'corn', x: 3, y: 0 },
    ];
    const buffs = computeBuffs(garden, placements, CROP_BY_ID);
    expect(buffs[0].contacts[BUFF_INDEX.harvestBoost]).toBe(1);
    expect(buffs[1].contacts[BUFF_INDEX.harvestBoost]).toBe(1);
  });
});

it('a 1x1 Wheat touching an Apple receives Harvest Boost from it', () => {
  const garden = buildGarden([
    { x: 0, y: 0 },
    { x: 3, y: 0 },
  ]);
  const placements: Placement[] = [
    { cropId: 'apple', x: 0, y: 0 },
    { cropId: 'wheat', x: 3, y: 0 },
  ];
  const buffs = computeBuffs(garden, placements, CROP_BY_ID);
  expect(buffs[1].receivedMask & buffBit('harvestBoost')).not.toBe(0);
});

it('two different givers of the same buff: contacts 2, mask bit set once', () => {
  const garden = buildGarden([{ x: 0, y: 0 }]);
  const placements: Placement[] = [
    { cropId: 'napa-cabbage', x: 1, y: 0 },
    { cropId: 'wheat', x: 0, y: 0 },
    { cropId: 'corn', x: 2, y: 0 },
  ];
  const buffs = computeBuffs(garden, placements, CROP_BY_ID);
  expect(buffs[0].contacts[BUFF_INDEX.harvestBoost]).toBe(2);
  expect(buffs[0].receivedMask).toBe(buffBit('harvestBoost'));
});

describe('rule settings', () => {
  it('sameTypeGivesBuffs=true lets a crop buff its own type', () => {
    const garden = buildGarden([{ x: 0, y: 0 }]);
    const placements: Placement[] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) placements.push({ cropId: 'carrot', x, y });
    const sameTypeRules: Rules = { ...RULES, sameTypeGivesBuffs: true };
    const buffs = computeBuffs(garden, placements, CROP_BY_ID, sameTypeRules);
    const centerIndex = placements.findIndex((p) => p.x === 1 && p.y === 1);
    expect(buffs[centerIndex].contacts[BUFF_INDEX.weedBlock]).toBe(4);
    expect(buffs[centerIndex].receivedMask & buffBit('weedBlock')).not.toBe(0);
  });

  it('a changed receiveThreshold changes whether a crop receives a buff', () => {
    const garden = buildGarden([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    const placements: Placement[] = [
      { cropId: 'apple', x: 0, y: 0 },
      { cropId: 'wheat', x: 3, y: 0 },
    ];
    const defaultBuffs = computeBuffs(garden, placements, CROP_BY_ID);
    expect(defaultBuffs[1].receivedMask & buffBit('harvestBoost')).not.toBe(0);

    const strictRules: Rules = { ...RULES, receiveThreshold: { ...RULES.receiveThreshold, 1: 2 } };
    const strictBuffs = computeBuffs(garden, placements, CROP_BY_ID, strictRules);
    expect(strictBuffs[1].receivedMask & buffBit('harvestBoost')).toBe(0);
  });
});

describe('describeBuffs', () => {
  it('reports contacts, needed, received and givers for a mixed example', () => {
    const garden = buildGarden([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 0, y: 3 },
      { x: 3, y: 3 },
    ]);
    const placements: Placement[] = [
      { cropId: 'apple', x: 1, y: 1 },
      { cropId: 'corn', x: 1, y: 0 },
      { cropId: 'wheat', x: 2, y: 0 },
      { cropId: 'corn', x: 0, y: 2 },
      { cropId: 'onion', x: 4, y: 1 },
    ];
    const details = describeBuffs(garden, placements, CROP_BY_ID, 0);

    // growthBoost is skipped: no crop in crops.json gives it.
    expect(details.map((d) => d.buff)).toEqual(['waterRetain', 'weedBlock', 'harvestBoost', 'qualityBoost']);

    const harvest = details.find((d) => d.buff === 'harvestBoost')!;
    expect(harvest.contacts).toBe(3);
    expect(harvest.needed).toBe(3);
    expect(harvest.received).toBe(true);
    expect(harvest.givers).toEqual(['corn', 'wheat']);

    const weedBlock = details.find((d) => d.buff === 'weedBlock')!;
    expect(weedBlock).toEqual({ buff: 'weedBlock', contacts: 1, needed: 3, received: false, givers: ['onion'] });

    const waterRetain = details.find((d) => d.buff === 'waterRetain')!;
    expect(waterRetain).toEqual({ buff: 'waterRetain', contacts: 0, needed: 3, received: false, givers: [] });

    const qualityBoost = details.find((d) => d.buff === 'qualityBoost')!;
    expect(qualityBoost).toEqual({ buff: 'qualityBoost', contacts: 0, needed: 3, received: false, givers: [] });
  });
});

// ---------------------------------------------------------------------------
// Property test: computeBuffs vs. an independent brute-force reference.
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32) so a failing case can be replayed by seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plots placed left to right, each offset vertically and by an optional gap; never overlap. */
function buildOffsetPlots(steps: readonly { gapX: number; dy: number }[]): PlotPos[] {
  const plots: PlotPos[] = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  for (const s of steps) {
    x += 3 + s.gapX;
    y += s.dy;
    plots.push({ x, y });
  }
  return plots;
}

/** A random valid, non-overlapping set of placements covering part of the garden's soil. */
function randomPlacements(garden: Garden, rng: () => number): Placement[] {
  const total = garden.width * garden.height;
  const order = Array.from({ length: total }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const covered = new Uint8Array(total);
  const placements: Placement[] = [];
  for (const idx of order) {
    if (!garden.soil[idx] || covered[idx]) continue;
    if (rng() < 0.3) continue; // leave some tiles empty
    const x = idx % garden.width;
    const y = Math.floor(idx / garden.width);
    const crop = CROPS[Math.floor(rng() * CROPS.length)];
    if (!footprintOnSoil(garden, x, y, crop.size)) continue;
    const tiles: number[] = [];
    let ok = true;
    for (let dy = 0; dy < crop.size && ok; dy++) {
      for (let dx = 0; dx < crop.size; dx++) {
        const t = (y + dy) * garden.width + (x + dx);
        if (covered[t]) {
          ok = false;
          break;
        }
        tiles.push(t);
      }
    }
    if (!ok) continue;
    for (const t of tiles) covered[t] = 1;
    placements.push({ cropId: crop.id, x, y });
  }
  return placements;
}

/** Independent reference: for every footprint tile, look at its 4 orthogonal neighbors. */
function bruteForceBuffs(
  garden: Garden,
  placements: readonly Placement[],
  cropsById: ReadonlyMap<CropId, Crop>,
  rules: Rules,
  occ: Int16Array,
): PlacementBuffs[] {
  return placements.map((p, i) => {
    const crop = cropsById.get(p.cropId)!;
    const contacts = BUFF_IDS.map(() => 0);
    for (let dy = 0; dy < crop.size; dy++) {
      for (let dx = 0; dx < crop.size; dx++) {
        const tx = p.x + dx;
        const ty = p.y + dy;
        const neighbors = [
          [tx + 1, ty],
          [tx - 1, ty],
          [tx, ty + 1],
          [tx, ty - 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= garden.width || ny >= garden.height) continue;
          if (!garden.soil[ny * garden.width + nx]) continue;
          const otherIdx = occ[ny * garden.width + nx];
          if (otherIdx < 0 || otherIdx === i) continue;
          const otherCrop = cropsById.get(placements[otherIdx].cropId)!;
          if (!otherCrop.buff) continue;
          if (!rules.sameTypeGivesBuffs && otherCrop.id === crop.id) continue;
          contacts[BUFF_INDEX[otherCrop.buff]] += 1;
        }
      }
    }
    const threshold = rules.receiveThreshold[crop.size];
    let mask = 0;
    contacts.forEach((c, b) => {
      if (c >= threshold) mask |= 1 << b;
    });
    return { contacts, receivedMask: mask };
  });
}

describe('computeBuffs property: agrees with a brute-force reference', () => {
  it('matches on random gardens (aligned and offset) and random placements', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.constantFrom<'aligned' | 'offset'>('aligned', 'offset'),
        fc.integer({ min: 0, max: 1000 }),
        fc.array(fc.record({ gapX: fc.integer({ min: 0, max: 2 }), dy: fc.integer({ min: -2, max: 2 }) }), {
          minLength: 3,
          maxLength: 3,
        }),
        fc.integer({ min: 0, max: 0x7fffffff }),
        fc.boolean(),
        (plotCount, kind, pickSeed, offsetSteps, placementSeed, sameTypeGivesBuffs) => {
          const plots =
            kind === 'aligned'
              ? enumerateArrangements(plotCount)[pickSeed % enumerateArrangements(plotCount).length]
              : buildOffsetPlots(offsetSteps.slice(0, plotCount - 1));
          const garden = buildGarden(plots);
          const rules: Rules = { ...RULES, sameTypeGivesBuffs };
          const placements = randomPlacements(garden, mulberry32(placementSeed));
          const occ = buildOccupancy(garden, placements, CROP_BY_ID, rules);

          const actual = computeBuffs(garden, placements, CROP_BY_ID, rules, occ);
          const expected = bruteForceBuffs(garden, placements, CROP_BY_ID, rules, occ);
          expect(actual).toEqual(expected);

          placements.forEach((p, i) => {
            const crop = CROP_BY_ID.get(p.cropId)!;
            const threshold = rules.receiveThreshold[crop.size];
            for (let b = 0; b < BUFF_IDS.length; b++) {
              expect(actual[i].contacts[b]).toBeGreaterThanOrEqual(0);
              const bitSet = (actual[i].receivedMask & (1 << b)) !== 0;
              expect(bitSet).toBe(actual[i].contacts[b] >= threshold);
            }
          });
        },
      ),
      { numRuns: 200 },
    );
  });
});
