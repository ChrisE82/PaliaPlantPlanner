/**
 * Turns a dnd-kit drag (a palette chip, or an already-placed plant being
 * moved) into a concrete action, plus a preview footprint to show while the
 * drag is over a tile. Pure and store-free, so the drop logic is simple to
 * unit test directly — dnd-kit's own pointer/keyboard physics aren't part of
 * this module. The placement rules themselves live in edit.ts; this module
 * only decides *which* edit.ts call a given drag should become.
 */
import type { Crop, CropId, Garden, Placement, TilePos } from '../../engine/types';
import { previewMove, previewPlacement } from './edit';

/** Data carried by a dnd-kit draggable: a palette chip, or a placed plant being moved. */
export type DragItemData =
  | { kind: 'palette'; cropId: CropId }
  | { kind: 'plant'; index: number; cropId: CropId; x: number; y: number };

/** Data carried by a dnd-kit droppable: the tile under it. */
export interface DropTarget {
  x: number;
  y: number;
}

/** The footprint and validity to preview while a drag is over a tile. */
export interface DragGhost {
  cropId: CropId;
  size: number;
  topLeft: TilePos;
  valid: boolean;
}

/** Live preview for whatever is being dragged, over `target`; null when the crop is unknown. */
export function dragGhostFor(
  garden: Garden,
  cropsById: ReadonlyMap<CropId, Crop>,
  placements: readonly Placement[],
  lockedTiles: readonly TilePos[],
  item: DragItemData,
  target: DropTarget,
): DragGhost | null {
  const crop = cropsById.get(item.cropId);
  if (!crop) return null;

  if (item.kind === 'palette') {
    const preview = previewPlacement(garden, cropsById, lockedTiles, item.cropId, target.x, target.y);
    if (!preview) return null;
    return { cropId: item.cropId, size: crop.size, topLeft: preview.topLeft, valid: preview.valid };
  }

  const preview = previewMove(
    garden,
    cropsById,
    placements,
    lockedTiles,
    { cropId: item.cropId, x: item.x, y: item.y },
    target.x,
    target.y,
  );
  return { cropId: item.cropId, size: crop.size, topLeft: preview.topLeft, valid: preview.valid };
}

/** What dropping `item` on `target` should do, using the same rules as click-to-place/move. */
export type DropPlan =
  | { action: 'place'; cropId: CropId; x: number; y: number }
  | { action: 'move'; cropId: CropId; from: TilePos; to: TilePos }
  | { action: 'none'; message: string | null };

/**
 * Decides the effect of a drop: a palette chip always attempts a placement
 * at the target (placeCropAt itself decides ok/refused); a dragged plant
 * either moves (erase its old tiles, place at the resolved new top-left),
 * is refused with a reason, or is a no-op when dropped back where it
 * started.
 */
export function planDrop(
  garden: Garden,
  cropsById: ReadonlyMap<CropId, Crop>,
  placements: readonly Placement[],
  lockedTiles: readonly TilePos[],
  item: DragItemData,
  target: DropTarget,
): DropPlan {
  if (item.kind === 'palette') {
    return { action: 'place', cropId: item.cropId, x: target.x, y: target.y };
  }

  const preview = previewMove(
    garden,
    cropsById,
    placements,
    lockedTiles,
    { cropId: item.cropId, x: item.x, y: item.y },
    target.x,
    target.y,
  );
  if (!preview.valid) return { action: 'none', message: preview.message };
  if (preview.topLeft.x === item.x && preview.topLeft.y === item.y) return { action: 'none', message: null };
  return { action: 'move', cropId: item.cropId, from: { x: item.x, y: item.y }, to: preview.topLeft };
}
