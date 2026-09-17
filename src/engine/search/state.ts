/**
 * Mutable layout the search mutates in place: a tile -> placement-slot grid
 * plus parallel slot arrays. Slot indices are pure bookkeeping (never shown
 * outside this module); toPlacements() is the stable, meaningful view.
 */
import type { Placement } from '../types';
import type { CompiledProblem } from './problem';

export class LayoutState {
  readonly problem: CompiledProblem;
  /** tile index -> slot index, or -1 when empty (includes non-soil tiles, always -1). */
  readonly tileSlot: Int16Array;
  /** slot -> crop index, or -1 when the slot is free (unused). */
  readonly slotCrop: Int16Array;
  /** slot -> anchor tile index (top-left of the footprint). Meaningless when the slot is free. */
  readonly slotAnchor: Int16Array;
  /** slot -> 1 when this placement covers a locked tile and may not be changed or removed. */
  readonly slotLocked: Uint8Array;
  /** Free slot indices available for reuse (LIFO). */
  freeSlots: number[];
  /** One past the highest slot index ever used; active slots are a subset of [0, slotCount). */
  slotCount: number;

  constructor(problem: CompiledProblem) {
    this.problem = problem;
    const tiles = problem.garden.width * problem.garden.height;
    // At most one placement per soil tile in the worst case (all 1x1 crops).
    const capacity = problem.tileCount;
    this.tileSlot = new Int16Array(tiles).fill(-1);
    this.slotCrop = new Int16Array(capacity).fill(-1);
    this.slotAnchor = new Int16Array(capacity);
    this.slotLocked = new Uint8Array(capacity);
    this.freeSlots = [];
    this.slotCount = 0;
  }

  /** True when every tile of the size x size footprint at anchorTile is empty. */
  isFootprintFree(size: number, anchorTile: number): boolean {
    const sIdx = size - 1;
    const slotIdx = this.problem.anchorSlotBySize[sIdx][anchorTile];
    if (slotIdx < 0) return false;
    const footprint = this.problem.footprintBySize[sIdx][slotIdx];
    for (let i = 0; i < footprint.length; i++) {
      if (this.tileSlot[footprint[i]] !== -1) return false;
    }
    return true;
  }

  /** Distinct occupied slots overlapping the size x size footprint at anchorTile (may be empty). */
  overlappingSlots(size: number, anchorTile: number): number[] {
    const sIdx = size - 1;
    const slotIdx = this.problem.anchorSlotBySize[sIdx][anchorTile];
    if (slotIdx < 0) throw new Error('overlappingSlots: not a valid anchor for this size');
    const footprint = this.problem.footprintBySize[sIdx][slotIdx];
    const seen = new Set<number>();
    for (let i = 0; i < footprint.length; i++) {
      const s = this.tileSlot[footprint[i]];
      if (s !== -1) seen.add(s);
    }
    return Array.from(seen);
  }

  /**
   * Create a new placement of cropIndex at anchorTile. Caller must ensure the
   * footprint is free first (isFootprintFree / overlappingSlots). Locked
   * status is derived from the problem's lockedTileMask, so freshly placed
   * crops (moves/greedy never target locked tiles) are never locked.
   * Returns the slot index used.
   */
  place(cropIndex: number, anchorTile: number): number {
    const size = this.problem.cropSize[cropIndex];
    const sIdx = size - 1;
    const slotIdx = this.problem.anchorSlotBySize[sIdx][anchorTile];
    if (slotIdx < 0) throw new Error('place: not a valid anchor for this crop size');
    const footprint = this.problem.footprintBySize[sIdx][slotIdx];

    const slot = this.freeSlots.length > 0 ? this.freeSlots.pop()! : this.slotCount++;
    this.slotCrop[slot] = cropIndex;
    this.slotAnchor[slot] = anchorTile;
    let locked = 0;
    for (let i = 0; i < footprint.length; i++) {
      this.tileSlot[footprint[i]] = slot;
      if (this.problem.lockedTileMask[footprint[i]]) locked = 1;
    }
    this.slotLocked[slot] = locked;
    return slot;
  }

  /** Remove the placement in this slot, freeing its tiles. Slot must be active. */
  remove(slot: number): void {
    const cropIndex = this.slotCrop[slot];
    if (cropIndex < 0) throw new Error('remove: slot is already free');
    const size = this.problem.cropSize[cropIndex];
    const sIdx = size - 1;
    const anchorTile = this.slotAnchor[slot];
    const slotIdx = this.problem.anchorSlotBySize[sIdx][anchorTile];
    const footprint = this.problem.footprintBySize[sIdx][slotIdx];
    for (let i = 0; i < footprint.length; i++) this.tileSlot[footprint[i]] = -1;
    this.slotCrop[slot] = -1;
    this.slotAnchor[slot] = 0;
    this.slotLocked[slot] = 0;
    this.freeSlots.push(slot);
  }

  /** Change the crop of an existing active, same-footprint slot (for swap/change moves). */
  setCrop(slot: number, cropIndex: number): void {
    if (this.slotCrop[slot] < 0) throw new Error('setCrop: slot is free');
    this.slotCrop[slot] = cropIndex;
  }

  /** Deep copy: an independent LayoutState with the same content. */
  clone(): LayoutState {
    const copy = new LayoutState(this.problem);
    copy.tileSlot.set(this.tileSlot);
    copy.slotCrop.set(this.slotCrop);
    copy.slotAnchor.set(this.slotAnchor);
    copy.slotLocked.set(this.slotLocked);
    copy.freeSlots = this.freeSlots.slice();
    copy.slotCount = this.slotCount;
    return copy;
  }

  /** Copy this state's content into an existing LayoutState for the same problem (no allocation). */
  copyInto(dest: LayoutState): void {
    dest.tileSlot.set(this.tileSlot);
    dest.slotCrop.set(this.slotCrop);
    dest.slotAnchor.set(this.slotAnchor);
    dest.slotLocked.set(this.slotLocked);
    dest.freeSlots.length = 0;
    for (const s of this.freeSlots) dest.freeSlots.push(s);
    dest.slotCount = this.slotCount;
  }

  /** Active placements as crop id + top-left tile, in slot order. */
  toPlacements(): Placement[] {
    const width = this.problem.garden.width;
    const result: Placement[] = [];
    for (let slot = 0; slot < this.slotCount; slot++) {
      const cropIndex = this.slotCrop[slot];
      if (cropIndex < 0) continue;
      const anchor = this.slotAnchor[slot];
      result.push({ cropId: this.problem.cropIds[cropIndex], x: anchor % width, y: Math.floor(anchor / width) });
    }
    return result;
  }

  /**
   * Reset to empty, then place every given Placement. A placement is locked
   * automatically when it covers a locked tile (see problem.lockedTileMask),
   * matching "placements that cover a locked tile stay fixed".
   */
  loadPlacements(placements: readonly Placement[]): void {
    this.tileSlot.fill(-1);
    this.slotCrop.fill(-1);
    this.slotAnchor.fill(0);
    this.slotLocked.fill(0);
    this.freeSlots = [];
    this.slotCount = 0;
    const width = this.problem.garden.width;
    for (const p of placements) {
      const cropIndex = this.problem.cropIndexOf.get(p.cropId);
      if (cropIndex === undefined) throw new Error(`loadPlacements: unknown crop id "${p.cropId}"`);
      const anchorTile = p.y * width + p.x;
      this.place(cropIndex, anchorTile);
    }
  }
}
