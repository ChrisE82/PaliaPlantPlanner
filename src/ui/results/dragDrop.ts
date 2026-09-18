/**
 * Turns a drag from the shared app-wide drag context (src/ui/dnd) into a
 * concrete garden action, plus a preview footprint to show while a palette
 * crop or plant is dragged over a tile. Pure and store-free, so it's simple
 * to unit test directly - dnd-kit's own pointer/keyboard physics aren't part
 * of this module. The placement rules themselves live in edit.ts; this
 * module only decides *which* edit.ts-backed store action a drag, or a drop,
 * should become.
 */
import type { Crop, CropId, Garden, Placement, TilePos } from '../../engine/types';
import type { DragItem, DropTarget } from '../dnd/types';
import { previewMove, previewPlacement } from './edit';

/** The footprint and validity to preview while a drag is over a tile. */
export interface DragGhost {
  cropId: CropId;
  size: number;
  topLeft: TilePos;
  valid: boolean;
}

/**
 * Live preview for whatever is being dragged, over `target`: null when it
 * isn't a palette crop or a plant, the target isn't a tile, or the crop is
 * unknown.
 */
export function dragGhostFor(
  garden: Garden,
  cropsById: ReadonlyMap<CropId, Crop>,
  placements: readonly Placement[],
  lockedTiles: readonly TilePos[],
  item: DragItem,
  target: DropTarget | null,
): DragGhost | null {
  if (!target || target.kind !== 'tile') return null;
  if (item.kind !== 'palette-crop' && item.kind !== 'plant') return null;

  const crop = cropsById.get(item.cropId);
  if (!crop) return null;

  if (item.kind === 'palette-crop') {
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

/** What the garden should do about a drop, for the caller to carry out via the store. */
export type GardenDropDecision =
  | { action: 'place'; cropId: CropId; x: number; y: number }
  | { action: 'move'; from: TilePos; to: TilePos }
  | { action: 'erase'; x: number; y: number }
  /** Ours, but refused (e.g. the plant or the target tile is locked): show the reason. */
  | { action: 'refused'; message: string | null }
  /** Ours, but nothing to do (e.g. a plant dropped back on its own tile). */
  | { action: 'noop' }
  /** Not a garden drop: some other area (goals, helpers, the palette trash for those) should try it. */
  | { action: 'not-garden' };

/**
 * Decides what a drop onto the garden means, using the same rules as
 * click/keyboard editing (edit.ts):
 *  - a palette crop dropped on a tile always places at that tile;
 *  - a plant dropped on a tile either moves (erase its old tiles, place at
 *    the resolved new top-left), is refused with a reason, or is a no-op
 *    when dropped back where it started;
 *  - a plant dropped on the trash (the palette, while it's being dragged)
 *    erases it;
 *  - anything else - a goal, a helper, a buff, or a target the garden
 *    doesn't own - is 'not-garden', so the caller can let another area's
 *    drop handler try it.
 */
export function decideGardenDrop(
  garden: Garden,
  cropsById: ReadonlyMap<CropId, Crop>,
  placements: readonly Placement[],
  lockedTiles: readonly TilePos[],
  item: DragItem,
  target: DropTarget | null,
): GardenDropDecision {
  if (item.kind === 'palette-crop' && target?.kind === 'tile') {
    return { action: 'place', cropId: item.cropId, x: target.x, y: target.y };
  }

  if (item.kind === 'plant' && target?.kind === 'tile') {
    const preview = previewMove(
      garden,
      cropsById,
      placements,
      lockedTiles,
      { cropId: item.cropId, x: item.x, y: item.y },
      target.x,
      target.y,
    );
    if (!preview.valid) return { action: 'refused', message: preview.message };
    if (preview.topLeft.x === item.x && preview.topLeft.y === item.y) return { action: 'noop' };
    return { action: 'move', from: { x: item.x, y: item.y }, to: preview.topLeft };
  }

  if (item.kind === 'plant' && target?.kind === 'trash') {
    return { action: 'erase', x: item.x, y: item.y };
  }

  return { action: 'not-garden' };
}
