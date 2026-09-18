/**
 * The shared drag and drop contract. Every draggable puts a DragItem in its
 * dnd-kit data under `item`; every drop target puts a DropTarget under
 * `target`. A sortable goal token is both, so it sets both.
 *
 * AppDndProvider (AppDnd.tsx) hands each finished drop to the registered
 * drop handlers in turn; the first handler that returns true has handled it.
 */
import type { BuffId, CropId, Importance } from '../../engine/types';

export type DragItem =
  /** A crop tile from the palette. */
  | { kind: 'palette-crop'; cropId: CropId }
  /** A buff badge from the palette. */
  | { kind: 'palette-buff'; buff: BuffId }
  /** A goal token on the goals board. */
  | { kind: 'goal'; goalId: string }
  /** A crop token in the helpers tray. */
  | { kind: 'helper'; cropId: CropId }
  /** A plant on the garden grid (edit mode). */
  | { kind: 'plant'; index: number; cropId: CropId; x: number; y: number };

export type DropTarget =
  /** An importance lane on the goals board (its empty space). */
  | { kind: 'lane'; importance: Importance }
  /** A goal token (to reorder before it, or to attach a buff to its crop). */
  | { kind: 'goal'; goalId: string; importance: Importance }
  /** The helpers tray. */
  | { kind: 'helpers' }
  /** Anywhere that removes what's dropped: the palette while a token is dragged. */
  | { kind: 'trash' }
  /** A tile of the garden grid (edit mode). */
  | { kind: 'tile'; x: number; y: number };

/** The data object to pass to useDraggable / useDroppable / useSortable. */
export interface DndData {
  item?: DragItem;
  target?: DropTarget;
}

/** A stable, unique dnd-kit id for a draggable. */
export function dragId(item: DragItem): string {
  switch (item.kind) {
    case 'palette-crop':
      return `palette-crop:${item.cropId}`;
    case 'palette-buff':
      return `palette-buff:${item.buff}`;
    case 'goal':
      return `goal:${item.goalId}`;
    case 'helper':
      return `helper:${item.cropId}`;
    case 'plant':
      return `plant:${item.index}`;
  }
}

/** A stable, unique dnd-kit id for a drop target. A goal token uses its dragId instead. */
export function dropId(target: DropTarget): string {
  switch (target.kind) {
    case 'lane':
      return `lane:${target.importance}`;
    case 'goal':
      return `goal:${target.goalId}`;
    case 'helpers':
      return 'helpers';
    case 'trash':
      return 'trash';
    case 'tile':
      return `tile:${target.x},${target.y}`;
  }
}

/** True for items that can be removed by dropping them on a trash target. */
export function isRemovable(item: DragItem | null): boolean {
  return item !== null && (item.kind === 'goal' || item.kind === 'helper' || item.kind === 'plant');
}
