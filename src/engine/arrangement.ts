/**
 * Plot arrangements: enumerating every connected shape of N plots on the
 * 3-tile plot grid (up to rotation and mirroring), and shape utilities used
 * to screen and describe them (PLAN.md section 5.3).
 */
import { isSoil } from './garden';
import { RULES } from './rules';
import type { Garden, PlotPos } from './types';

// ---------------------------------------------------------------------------
// Free-polyomino enumeration
//
// Plots live on a grid where one grid step = one plot (plotSize tiles). A
// connected arrangement of N plots is exactly a "free polyomino" of size N:
// free polyomino counts for 1..9 are 1, 1, 2, 5, 12, 35, 108, 369, 1285,
// which is the required count sequence.
//
// Shapes are grown one cell at a time: every free polyomino of size k has a
// cell whose removal leaves a connected free polyomino of size k - 1 (a leaf
// of a spanning tree of its adjacency graph), so growing every canonical
// shape of size k - 1 by one adjacent cell, in every position, and keeping
// one canonical orientation per distinct result, finds every shape of size k.
// ---------------------------------------------------------------------------

interface Cell {
  x: number;
  y: number;
}

interface CanonicalShape {
  /** Normalized (min 0,0) and sorted by (y, x); one fixed orientation. */
  cells: Cell[];
  /** cellsKey(cells); the smallest such key among all 8 orientations. */
  key: string;
}

function rotate90(cells: readonly Cell[]): Cell[] {
  return cells.map((c) => ({ x: -c.y, y: c.x }));
}

function mirrorX(cells: readonly Cell[]): Cell[] {
  return cells.map((c) => ({ x: -c.x, y: c.y }));
}

function normalize(cells: readonly Cell[]): Cell[] {
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  return cells.map((c) => ({ x: c.x - minX, y: c.y - minY })).sort((a, b) => a.y - b.y || a.x - b.x);
}

function cellsKey(cells: readonly Cell[]): string {
  return cells.map((c) => `${c.x},${c.y}`).join(';');
}

/** The lexicographically smallest of the 8 rotations/mirrors, normalized. */
function canonicalize(cells: readonly Cell[]): CanonicalShape {
  let best: Cell[] | null = null;
  let bestKey = '';
  let current = cells;
  for (let m = 0; m < 2; m++) {
    for (let r = 0; r < 4; r++) {
      const norm = normalize(current);
      const key = cellsKey(norm);
      if (best === null || key < bestKey) {
        best = norm;
        bestKey = key;
      }
      current = rotate90(current);
    }
    current = mirrorX(current);
  }
  return { cells: best!, key: bestKey };
}

/** Canonical shapes (one per free polyomino) of exactly `size` cells. */
function growPolyominoes(size: number): CanonicalShape[] {
  let generation: CanonicalShape[] = [canonicalize([{ x: 0, y: 0 }])];
  for (let n = 2; n <= size; n++) {
    const seen = new Map<string, CanonicalShape>();
    for (const shape of generation) {
      const occupied = new Set(shape.cells.map((c) => `${c.x},${c.y}`));
      for (const c of shape.cells) {
        const neighbors: Cell[] = [
          { x: c.x + 1, y: c.y },
          { x: c.x - 1, y: c.y },
          { x: c.x, y: c.y + 1 },
          { x: c.x, y: c.y - 1 },
        ];
        for (const cand of neighbors) {
          if (occupied.has(`${cand.x},${cand.y}`)) continue;
          const grown = canonicalize([...shape.cells, cand]);
          if (!seen.has(grown.key)) seen.set(grown.key, grown);
        }
      }
    }
    generation = Array.from(seen.values());
  }
  return generation;
}

const arrangementCache = new Map<number, PlotPos[][]>();

/**
 * Every connected arrangement of `plotCount` plots on the plot grid,
 * rotations and mirror images removed, as tile-space plot positions
 * (multiples of plotSize, normalized, plots sorted by (y, x)).
 * Ordered by descending sharedPlotEdges, then ascending bounding-box area,
 * then a canonical key, so the order is deterministic. Cached per plotCount.
 */
export function enumerateArrangements(plotCount: number): PlotPos[][] {
  if (!Number.isInteger(plotCount) || plotCount < 1 || plotCount > 9) {
    throw new Error(`plotCount must be an integer between 1 and 9, got ${plotCount}.`);
  }
  const cached = arrangementCache.get(plotCount);
  if (cached) return cached;

  const plotSize = RULES.plotSize;
  const shapes = growPolyominoes(plotCount);
  const scored = shapes.map((shape) => {
    const plots = shape.cells.map((c) => ({ x: c.x * plotSize, y: c.y * plotSize }));
    const width = Math.max(...plots.map((p) => p.x)) + plotSize;
    const height = Math.max(...plots.map((p) => p.y)) + plotSize;
    return { plots, key: shape.key, area: width * height, edges: sharedPlotEdges(plots) };
  });
  scored.sort((a, b) => b.edges - a.edges || a.area - b.area || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const result = scored.map((s) => s.plots);
  arrangementCache.set(plotCount, result);
  return result;
}

/** Pairs of plots that share a full plotSize-tile edge (no offset). */
export function sharedPlotEdges(plots: readonly PlotPos[]): number {
  const size = RULES.plotSize;
  let count = 0;
  for (let i = 0; i < plots.length; i++) {
    for (let j = i + 1; j < plots.length; j++) {
      const dx = plots[j].x - plots[i].x;
      const dy = plots[j].y - plots[i].y;
      if ((Math.abs(dx) === size && dy === 0) || (Math.abs(dy) === size && dx === 0)) count++;
    }
  }
  return count;
}

/** Orthogonally adjacent soil tile pairs in the garden (works for offset plots). */
export function touchingTilePairs(garden: Garden): number {
  let count = 0;
  for (let y = 0; y < garden.height; y++) {
    for (let x = 0; x < garden.width; x++) {
      if (!isSoil(garden, x, y)) continue;
      if (isSoil(garden, x + 1, y)) count++;
      if (isSoil(garden, x, y + 1)) count++;
    }
  }
  return count;
}

/**
 * True when the arrangement's tile bounding box fits within maxWidth x
 * maxHeight in either orientation. null means no limit in that dimension.
 */
export function fitsSpace(plots: readonly PlotPos[], maxWidth: number | null, maxHeight: number | null): boolean {
  if (plots.length === 0) return true;
  const size = RULES.plotSize;
  const xs = plots.map((p) => p.x);
  const ys = plots.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs) + size;
  const height = Math.max(...ys) - Math.min(...ys) + size;
  const fitsAsIs = (maxWidth === null || width <= maxWidth) && (maxHeight === null || height <= maxHeight);
  const fitsRotated = (maxWidth === null || height <= maxWidth) && (maxHeight === null || width <= maxHeight);
  return fitsAsIs || fitsRotated;
}

/** { w, h } when plots exactly fill a solid w x h rectangle, else null. */
function solidBlockDims(plots: readonly PlotPos[]): { w: number; h: number } | null {
  const size = RULES.plotSize;
  const xs = plots.map((p) => p.x);
  const ys = plots.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = (Math.max(...xs) - minX) / size + 1;
  const h = (Math.max(...ys) - minY) / size + 1;
  if (w * h !== plots.length) return null;
  const present = new Set(plots.map((p) => `${p.x},${p.y}`));
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      if (!present.has(`${minX + gx * size},${minY + gy * size}`)) return null;
    }
  }
  return { w, h };
}

/**
 * Run lengths when every group of plots sharing a coordinate (`y` for rows,
 * `x` for columns) forms one contiguous run along the other axis, ordered by
 * the group coordinate ascending. Null when some group has a gap.
 */
function contiguousRunLengths(plots: readonly PlotPos[], groupBy: 'x' | 'y'): number[] | null {
  const size = RULES.plotSize;
  const along = groupBy === 'y' ? 'x' : 'y';
  const groups = new Map<number, number[]>();
  for (const p of plots) {
    const key = p[groupBy];
    const list = groups.get(key);
    if (list) list.push(p[along]);
    else groups.set(key, [p[along]]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a - b);
    for (let i = 1; i < list.length; i++) {
      if (list[i] - list[i - 1] !== size) return null;
    }
  }
  return Array.from(groups.keys())
    .sort((a, b) => a - b)
    .map((k) => groups.get(k)!.length);
}

function formatRunLengths(lengths: number[]): string {
  const parts = lengths.map(String);
  const last = parts.pop()!;
  return parts.length === 0 ? `Row of ${last}` : `Rows of ${parts.join(', ')} and ${last}`;
}

/**
 * A short, rotation- and mirror-independent description of an arrangement's
 * shape: "1 plot", a full rectangle ("3x3 block", smaller side first), a
 * single line ("Row of 9"), rows or columns that are each internally
 * contiguous ("Rows of 5 and 4"), or "Custom shape" otherwise.
 */
export function arrangementLabel(plots: readonly PlotPos[]): string {
  if (plots.length === 1) return '1 plot';

  const block = solidBlockDims(plots);
  if (block) {
    if (block.w === 1 || block.h === 1) return `Row of ${plots.length}`;
    const a = Math.min(block.w, block.h);
    const b = Math.max(block.w, block.h);
    return `${a}x${b} block`;
  }

  // Describe by rows or by columns, whichever needs fewer runs, reading the
  // runs in the direction that puts longer runs first. Rotating or mirroring
  // an arrangement then gives the same label.
  const options = [contiguousRunLengths(plots, 'y'), contiguousRunLengths(plots, 'x')]
    .filter((runs): runs is number[] => runs !== null)
    .map(longerRunsFirst)
    .sort((a, b) => a.length - b.length || compareRunsLongerFirst(a, b));
  // More than 3 runs is hard to read as text; the UI draws the shape instead.
  return options.length > 0 && options[0].length <= 3 ? formatRunLengths(options[0]) : 'Custom shape';
}

function compareRunsLongerFirst(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return a.length - b.length;
}

function longerRunsFirst(runs: number[]): number[] {
  const reversed = [...runs].reverse();
  return compareRunsLongerFirst(reversed, runs) < 0 ? reversed : runs;
}
