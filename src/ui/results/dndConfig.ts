/**
 * dnd-kit configuration shared by ResultsPanel's drag and drop: a collision
 * strategy that's precise for pointer/touch dragging but still works for
 * keyboard dragging (which has no pointer position), a keyboard step sized
 * to one tile, and screen-reader announcements that name the crop and tile
 * instead of dnd-kit's generic defaults.
 */
import {
  pointerWithin,
  rectIntersection,
  type Active,
  type Announcements,
  type KeyboardCoordinateGetter,
  type Over,
} from '@dnd-kit/core';
import type { Crop, CropId } from '../../engine/types';
import type { DragItemData } from './dragDrop';

/** Precise under the pointer; falls back to rect overlap for keyboard dragging, which has no pointer position. */
export function gridCollisionDetection(args: Parameters<typeof pointerWithin>[0]) {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
}

/** Moves by one tile per arrow press, reading the actual rendered tile size from the measured droppables. */
export const tileKeyboardCoordinateGetter: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const firstRect = context.droppableRects.values().next().value;
  const stepX = firstRect?.width || 32;
  const stepY = firstRect?.height || 32;
  switch (event.code) {
    case 'ArrowRight':
      return { ...currentCoordinates, x: currentCoordinates.x + stepX };
    case 'ArrowLeft':
      return { ...currentCoordinates, x: currentCoordinates.x - stepX };
    case 'ArrowDown':
      return { ...currentCoordinates, y: currentCoordinates.y + stepY };
    case 'ArrowUp':
      return { ...currentCoordinates, y: currentCoordinates.y - stepY };
    default:
      return undefined;
  }
};

function describeItem(active: Active, cropsById: ReadonlyMap<CropId, Crop>): string {
  const data = active.data.current as DragItemData | undefined;
  if (!data) return 'the crop';
  return cropsById.get(data.cropId)?.name ?? data.cropId;
}

function describeTile(over: Over | null): string | null {
  const data = over?.data.current as { x: number; y: number } | undefined;
  return data ? `column ${data.x + 1}, row ${data.y + 1}` : null;
}

/** Bound to the crop table so announcements can name the crop, not just its id. */
export function createDragAnnouncements(cropsById: ReadonlyMap<CropId, Crop>): Announcements {
  return {
    onDragStart({ active }) {
      return `Picked up ${describeItem(active, cropsById)}.`;
    },
    onDragOver({ active, over }) {
      const tile = describeTile(over);
      const name = describeItem(active, cropsById);
      return tile ? `${name} is over ${tile}.` : `${name} is no longer over a tile.`;
    },
    onDragEnd({ active, over }) {
      const name = describeItem(active, cropsById);
      const tile = describeTile(over);
      return tile ? `${name} was dropped over ${tile}.` : `${name} was dropped outside the garden. No change.`;
    },
    onDragCancel({ active }) {
      return `Moving ${describeItem(active, cropsById)} was cancelled.`;
    },
  };
}
