import { RULES, type Rules } from './rules';
import type { Garden, PlotPos } from './types';

/** Shift plot positions so the smallest x and y are 0. */
export function normalizePlots(plots: readonly PlotPos[]): PlotPos[] {
  if (plots.length === 0) return [];
  const minX = Math.min(...plots.map((p) => p.x));
  const minY = Math.min(...plots.map((p) => p.y));
  return plots.map((p) => ({ x: p.x - minX, y: p.y - minY }));
}

/**
 * Build the soil tile set for a list of plot positions (top-left tiles).
 * Throws when there are no plots, too many plots, or plots overlap.
 */
export function buildGarden(plots: readonly PlotPos[], rules: Rules = RULES): Garden {
  if (plots.length === 0) throw new Error('A garden needs at least one plot.');
  if (plots.length > rules.maxPlots) {
    throw new Error(`A garden can have at most ${rules.maxPlots} plots.`);
  }
  const size = rules.plotSize;
  const normalized = normalizePlots(plots);
  const width = Math.max(...normalized.map((p) => p.x)) + size;
  const height = Math.max(...normalized.map((p) => p.y)) + size;
  const soil = new Uint8Array(width * height);
  const plotOf = new Int16Array(width * height).fill(-1);
  normalized.forEach((plot, plotIndex) => {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const i = (plot.y + dy) * width + (plot.x + dx);
        if (soil[i]) throw new Error('Plots overlap.');
        soil[i] = 1;
        plotOf[i] = plotIndex;
      }
    }
  });
  return { plots: normalized, width, height, soil, plotOf, tileCount: normalized.length * size * size };
}

export function tileIndex(garden: Garden, x: number, y: number): number {
  return y * garden.width + x;
}

export function isSoil(garden: Garden, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < garden.width && y < garden.height && garden.soil[y * garden.width + x] === 1;
}

/**
 * True when a size x size footprint with top-left (x, y) is entirely soil.
 * When crops may not cross plot borders, all tiles must also be in one plot.
 */
export function footprintOnSoil(garden: Garden, x: number, y: number, size: number, rules: Rules = RULES): boolean {
  if (x < 0 || y < 0 || x + size > garden.width || y + size > garden.height) return false;
  const firstPlot = garden.plotOf[y * garden.width + x];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const i = (y + dy) * garden.width + (x + dx);
      if (!garden.soil[i]) return false;
      if (!rules.cropsCrossPlotBorders && garden.plotOf[i] !== firstPlot) return false;
    }
  }
  return true;
}
