import { describe, expect, it } from 'vitest';
import { buildGarden, footprintOnSoil, isSoil, normalizePlots } from './garden';
import { RULES } from './rules';

describe('buildGarden', () => {
  it('builds a 3x3 block of plots as a 9x9 field', () => {
    const plots = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) plots.push({ x: x * 3, y: y * 3 });
    const g = buildGarden(plots);
    expect([g.width, g.height, g.tileCount]).toEqual([9, 9, 81]);
    expect(Array.from(g.soil).every((v) => v === 1)).toBe(true);
    expect(g.plotOf[0]).toBe(0);
    expect(g.plotOf[80]).toBe(8);
  });

  it('normalizes positions and marks gaps as non-soil', () => {
    const g = buildGarden([
      { x: 10, y: 5 },
      { x: 14, y: 5 }, // one-tile gap
    ]);
    expect(g.plots).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ]);
    expect([g.width, g.height, g.tileCount]).toEqual([7, 3, 18]);
    expect(isSoil(g, 3, 1)).toBe(false);
    expect(isSoil(g, 4, 1)).toBe(true);
    expect(isSoil(g, -1, 0)).toBe(false);
  });

  it('supports offset plots', () => {
    const g = buildGarden([
      { x: 0, y: 0 },
      { x: 3, y: 1 },
    ]);
    expect([g.width, g.height]).toEqual([6, 4]);
    expect(isSoil(g, 3, 0)).toBe(false);
    expect(isSoil(g, 3, 3)).toBe(true);
  });

  it('rejects empty, overlapping and oversized gardens', () => {
    expect(() => buildGarden([])).toThrow();
    expect(() => buildGarden([{ x: 0, y: 0 }, { x: 2, y: 0 }])).toThrow();
    const ten = Array.from({ length: 10 }, (_, i) => ({ x: i * 3, y: 0 }));
    expect(() => buildGarden(ten)).toThrow();
  });

  it('normalizePlots handles an empty list', () => {
    expect(normalizePlots([])).toEqual([]);
  });
});

describe('footprintOnSoil', () => {
  const twoPlots = buildGarden([
    { x: 0, y: 0 },
    { x: 3, y: 0 },
  ]);

  it('allows crops across a plot border by default', () => {
    expect(footprintOnSoil(twoPlots, 2, 0, 2)).toBe(true);
    expect(footprintOnSoil(twoPlots, 1, 0, 3)).toBe(true);
  });

  it('rejects footprints that leave the soil', () => {
    expect(footprintOnSoil(twoPlots, 5, 0, 2)).toBe(false);
    expect(footprintOnSoil(twoPlots, 0, 1, 3)).toBe(false);
    expect(footprintOnSoil(twoPlots, -1, 0, 1)).toBe(false);
  });

  it('keeps crops inside one plot when the rule says so', () => {
    const strict = { ...RULES, cropsCrossPlotBorders: false };
    expect(footprintOnSoil(twoPlots, 2, 0, 2, strict)).toBe(false);
    expect(footprintOnSoil(twoPlots, 3, 0, 3, strict)).toBe(true);
  });
});
