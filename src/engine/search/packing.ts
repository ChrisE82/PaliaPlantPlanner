/**
 * Exact (time-boxed) branch-and-bound packing: the most non-overlapping
 * size x size placements that fit on the problem's soil (skipping locked
 * tiles), optionally requiring each to keep at least `threshold` ring tiles
 * free of another placement of the same crop -- the geometry behind PLAN.md
 * 5.3's "N crops that all get buff B" optimums (a crop's ring tiles that
 * aren't covered by a same-type neighbor get filled by a buff-giving helper
 * during the final fill, so "keeps `threshold` ring tiles free" is exactly
 * "receives the buff"). Ports research/arrangement_bruteforce.py's
 * best_count, which finds these same optimums by exhaustive search.
 *
 * Every k x k square covers exactly one cell of each (x mod k, y mod k)
 * residue class, so the number of undecided cells in the thinnest class
 * bounds how many more squares can still be placed -- the key prune that
 * keeps this fast (single-digit milliseconds up to low seconds for a
 * 9-plot garden) despite the search space.
 *
 * Uses BigInt bitmasks (cell counts run to ~80, past native 32-bit bitwise
 * range). Only called from greedy.ts, at most once per (problem, size,
 * threshold), and cached there across restarts.
 */
import type { CompiledProblem } from './problem';

/** Best anchor tiles found within the deadline; not necessarily optimal if time ran out (anytime search). */
export function bestDensePacking(
  problem: CompiledProblem,
  size: number,
  threshold: number | null,
  deadline: number,
): number[] {
  const width = problem.garden.width;
  const cells = Array.from(problem.soilTiles)
    .filter((t) => problem.lockedTileMask[t] === 0)
    .sort((a, b) => {
      const ay = Math.floor(a / width);
      const by = Math.floor(b / width);
      return ay !== by ? ay - by : (a % width) - (b % width);
    });
  const n = cells.length;
  if (n === 0) return [];
  const indexOf = new Map<number, number>(cells.map((c, i) => [c, i]));

  const sIdx = size - 1;
  const footprintMask = new Array<bigint>(n).fill(0n);
  const borderMask = new Array<bigint>(n).fill(0n);

  for (let i = 0; i < n; i++) {
    const tile = cells[i];
    const anchorSlot = problem.anchorSlotBySize[sIdx][tile];
    if (anchorSlot === -1) continue;
    const footprint = problem.footprintBySize[sIdx][anchorSlot];
    let mask = 0n;
    let ok = true;
    for (let k = 0; k < footprint.length; k++) {
      const ft = footprint[k];
      if (problem.lockedTileMask[ft]) {
        ok = false;
        break;
      }
      const fi = indexOf.get(ft);
      if (fi === undefined) {
        ok = false;
        break;
      }
      mask |= 1n << BigInt(fi);
    }
    if (!ok) continue;
    footprintMask[i] = mask;

    const ring = problem.ringBySize[sIdx][anchorSlot];
    let bmask = 0n;
    for (let k = 0; k < ring.length; k++) {
      const fi = indexOf.get(ring[k]);
      if (fi !== undefined) bmask |= 1n << BigInt(fi);
    }
    borderMask[i] = bmask;
  }

  const classCount = size * size;
  const classes = new Array<bigint>(classCount).fill(0n);
  for (let i = 0; i < n; i++) {
    const t = cells[i];
    const x = t % width;
    const y = Math.floor(t / width);
    const c = (x % size) * size + (y % size);
    classes[c] |= 1n << BigInt(i);
  }

  const allMask = (1n << BigInt(n)) - 1n;
  let bestCount = -1;
  let bestPlaced: number[] = [];
  let timedOut = false;
  let nodeCount = 0;

  function popcount(bits: bigint): number {
    let count = 0;
    let b = bits;
    while (b !== 0n) {
      b &= b - 1n;
      count++;
    }
    return count;
  }

  function aliveCount(placed: readonly number[], mask: bigint): number {
    if (threshold === null) return placed.length;
    let alive = 0;
    for (const p of placed) {
      if (popcount(borderMask[p] & ~mask) >= threshold) alive++;
    }
    return alive;
  }

  function dfs(startI: number, used: bigint, mask: bigint, placed: number[]): void {
    if (timedOut) return;
    nodeCount++;
    if ((nodeCount & 511) === 0 && performance.now() > deadline) {
      timedOut = true;
      return;
    }
    let i = startI;
    while (i < n && ((used >> BigInt(i)) & 1n) === 1n) i++;

    const alive = aliveCount(placed, mask);
    if (i >= n) {
      if (alive > bestCount) {
        bestCount = alive;
        bestPlaced = threshold === null ? placed.slice() : placed.filter((p) => popcount(borderMask[p] & ~mask) >= threshold);
      }
      return;
    }

    const undecided = allMask & ~used;
    let minClassCount = Infinity;
    for (const c of classes) {
      const count = popcount(undecided & c);
      if (count < minClassCount) minClassCount = count;
    }
    if (alive + minClassCount <= bestCount) return;

    const m = footprintMask[i];
    if (m !== 0n && (used & m) === 0n) {
      placed.push(i);
      dfs(i + 1, used | m, mask | m, placed);
      placed.pop();
      if (timedOut) return;
    }
    dfs(i + 1, used | (1n << BigInt(i)), mask, placed);
  }

  dfs(0, 0n, 0n, []);
  return bestPlaced.map((i) => cells[i]);
}
