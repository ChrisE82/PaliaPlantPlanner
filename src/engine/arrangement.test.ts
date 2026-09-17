import { describe, expect, it } from 'vitest';
import { buildGarden, normalizePlots } from './garden';
import { arrangementLabel, enumerateArrangements, fitsSpace, sharedPlotEdges, touchingTilePairs } from './arrangement';
import { RULES } from './rules';
import type { PlotPos } from './types';

const EXPECTED_COUNTS = [1, 1, 2, 5, 12, 35, 108, 369, 1285];

/** Grid-adjacency connectivity check (full-edge touching), independent of arrangement.ts. */
function isConnected(plots: readonly PlotPos[]): boolean {
  const size = RULES.plotSize;
  const visited = new Set<number>([0]);
  const stack = [0];
  while (stack.length > 0) {
    const i = stack.pop()!;
    for (let j = 0; j < plots.length; j++) {
      if (visited.has(j)) continue;
      const dx = plots[j].x - plots[i].x;
      const dy = plots[j].y - plots[i].y;
      if ((Math.abs(dx) === size && dy === 0) || (Math.abs(dy) === size && dx === 0)) {
        visited.add(j);
        stack.push(j);
      }
    }
  }
  return visited.size === plots.length;
}

function isNormalizedAndSorted(plots: readonly PlotPos[]): boolean {
  const minX = Math.min(...plots.map((p) => p.x));
  const minY = Math.min(...plots.map((p) => p.y));
  if (minX !== 0 || minY !== 0) return false;
  for (let i = 1; i < plots.length; i++) {
    const a = plots[i - 1];
    const b = plots[i];
    if (b.y < a.y || (b.y === a.y && b.x < a.x)) return false;
  }
  return true;
}

/** The 8 rotation/mirror variants of `plots`, each normalized+sorted, as string keys. Independent of arrangement.ts's own canonicalization. */
function symmetryKeys(plots: readonly PlotPos[]): string[] {
  const keyOf = (pts: PlotPos[]) => {
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    return pts
      .map((p) => ({ x: p.x - minX, y: p.y - minY }))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((p) => `${p.x},${p.y}`)
      .join(';');
  };
  const keys: string[] = [];
  let pts: PlotPos[] = plots.map((p) => ({ x: p.x, y: p.y }));
  for (let m = 0; m < 2; m++) {
    for (let r = 0; r < 4; r++) {
      keys.push(keyOf(pts));
      pts = pts.map((p) => ({ x: -p.y, y: p.x }));
    }
    pts = pts.map((p) => ({ x: -p.x, y: p.y }));
  }
  return keys;
}

describe('enumerateArrangements', () => {
  it('runs plotCount 9 in well under a second', () => {
    const start = Date.now();
    enumerateArrangements(9);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('matches the required counts for 1..9', () => {
    const counts = EXPECTED_COUNTS.map((_, i) => enumerateArrangements(i + 1).length);
    expect(counts).toEqual(EXPECTED_COUNTS);
  });

  it('throws for plotCount outside 1..9', () => {
    expect(() => enumerateArrangements(0)).toThrow();
    expect(() => enumerateArrangements(-1)).toThrow();
    expect(() => enumerateArrangements(10)).toThrow();
    expect(() => enumerateArrangements(1.5)).toThrow();
  });

  it('returns the same cached array on repeated calls', () => {
    expect(enumerateArrangements(4)).toBe(enumerateArrangements(4));
  });

  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    it(`every arrangement of ${n} plot(s) is connected, normalized and sorted`, () => {
      for (const plots of enumerateArrangements(n)) {
        expect(plots).toHaveLength(n);
        expect(isConnected(plots)).toBe(true);
        expect(isNormalizedAndSorted(plots)).toBe(true);
      }
    });

    it(`every arrangement of ${n} plot(s) is unique under all 8 rotations/mirrors`, () => {
      const arrangements = enumerateArrangements(n);
      const owner = new Map<string, number>();
      arrangements.forEach((plots, i) => {
        for (const key of symmetryKeys(plots)) {
          const existing = owner.get(key);
          expect(existing === undefined || existing === i).toBe(true);
          owner.set(key, i);
        }
      });
    });
  }
});

describe('sharedPlotEdges', () => {
  it('counts 12 for a 3x3 block', () => {
    const plots: PlotPos[] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) plots.push({ x: x * 3, y: y * 3 });
    expect(sharedPlotEdges(plots)).toBe(12);
  });

  it('counts 8 for a row of 9', () => {
    const plots: PlotPos[] = Array.from({ length: 9 }, (_, i) => ({ x: i * 3, y: 0 }));
    expect(sharedPlotEdges(plots)).toBe(8);
  });

  it('does not count plots that only touch by offset (no full shared edge)', () => {
    expect(sharedPlotEdges([{ x: 0, y: 0 }, { x: 3, y: 1 }])).toBe(0);
  });
});

describe('touchingTilePairs', () => {
  it('is 12 for one plot', () => {
    expect(touchingTilePairs(buildGarden([{ x: 0, y: 0 }]))).toBe(12);
  });

  it('is 27 for two plots side by side', () => {
    expect(touchingTilePairs(buildGarden([{ x: 0, y: 0 }, { x: 3, y: 0 }]))).toBe(27);
  });

  it('works for offset plots', () => {
    // Two plots touching along only part of an edge: fewer cross-border pairs than 3.
    const g = buildGarden([{ x: 0, y: 0 }, { x: 3, y: 1 }]);
    expect(touchingTilePairs(g)).toBe(12 + 12 + 2);
  });
});

describe('fitsSpace', () => {
  // Two plots side by side: tile bounding box is 6 wide, 3 tall.
  const plots: PlotPos[] = [{ x: 0, y: 0 }, { x: 3, y: 0 }];

  it('fits as-is', () => {
    expect(fitsSpace(plots, 6, 3)).toBe(true);
  });

  it('fits in the rotated orientation', () => {
    expect(fitsSpace(plots, 3, 6)).toBe(true);
  });

  it('rejects a space too small in both orientations', () => {
    expect(fitsSpace(plots, 5, 3)).toBe(false);
    expect(fitsSpace(plots, 5, 5)).toBe(false);
  });

  it('treats null as no limit in that dimension', () => {
    expect(fitsSpace(plots, null, null)).toBe(true);
    expect(fitsSpace(plots, null, 3)).toBe(true);
    expect(fitsSpace(plots, null, 2)).toBe(false);
  });
});

describe('arrangementLabel', () => {
  it('labels a single plot', () => {
    expect(arrangementLabel([{ x: 0, y: 0 }])).toBe('1 plot');
  });

  it('labels a 3x3 block', () => {
    const plots: PlotPos[] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) plots.push({ x: x * 3, y: y * 3 });
    expect(arrangementLabel(plots)).toBe('3x3 block');
  });

  it('labels a 2x4 block with the smaller number first', () => {
    const plots: PlotPos[] = [];
    for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 2; gx++) plots.push({ x: gx * 3, y: gy * 3 });
    expect(arrangementLabel(plots)).toBe('2x4 block');
  });

  it('labels a row of 9', () => {
    const plots: PlotPos[] = Array.from({ length: 9 }, (_, i) => ({ x: i * 3, y: 0 }));
    expect(arrangementLabel(plots)).toBe('Row of 9');
  });

  it('labels rows of 5 and 4', () => {
    const plots: PlotPos[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ x: i * 3, y: 0 })),
      ...Array.from({ length: 4 }, (_, i) => ({ x: i * 3, y: 3 })),
    ];
    expect(arrangementLabel(plots)).toBe('Rows of 5 and 4');
  });

  it('labels an L shape as rows', () => {
    const plots: PlotPos[] = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 3 },
    ];
    expect(arrangementLabel(plots)).toBe('Rows of 3 and 1');
  });

  it('falls back to Custom shape when neither rows nor columns are contiguous', () => {
    // A ring: 3x3 block of plots with the center missing.
    const plots: PlotPos[] = [];
    for (let gy = 0; gy < 3; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (gx === 1 && gy === 1) continue;
        plots.push({ x: gx * 3, y: gy * 3 });
      }
    }
    expect(arrangementLabel(plots)).toBe('Custom shape');
  });

  it('gives the same label for every rotation and mirror image', () => {
    const transforms: ((p: PlotPos) => PlotPos)[] = [
      (p) => ({ x: p.x, y: p.y }),
      (p) => ({ x: -p.x, y: p.y }),
      (p) => ({ x: p.x, y: -p.y }),
      (p) => ({ x: -p.x, y: -p.y }),
      (p) => ({ x: p.y, y: p.x }),
      (p) => ({ x: -p.y, y: p.x }),
      (p) => ({ x: p.y, y: -p.x }),
      (p) => ({ x: -p.y, y: -p.x }),
    ];
    for (let n = 1; n <= 9; n++) {
      for (const plots of enumerateArrangements(n)) {
        const labels = new Set(transforms.map((t) => arrangementLabel(normalizePlots(plots.map(t)))));
        expect([...labels]).toHaveLength(1);
      }
    }
  });
});
