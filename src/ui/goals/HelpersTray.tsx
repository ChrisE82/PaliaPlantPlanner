/**
 * The helpers tray: explicit helper crops as small draggable tiles. Drag one
 * to the palette to remove it, or into a lane to make it a goal (and stop
 * being a helper); tap-to-place also works via the shared selectedItem path.
 * A small remove button on each tile covers keyboard/no-drag removal, since
 * helper tiles otherwise only support pointer dragging (see GoalToken.tsx's
 * note on why goal tokens, but not these, also wire up keyboard dragging).
 */
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { PointerEventHandler } from 'react';
import { CROP_BY_ID } from '../../data/crops';
import type { CropId } from '../../engine/types';
import { useActiveDragItem } from '../dnd/AppDnd';
import { dragId, dropId, type DragItem } from '../dnd/types';
import { TrashIcon } from '../icons';
import { CropTileFace } from '../palette/CropTile';
import { useStore } from '../state/store';

function sameHelper(a: DragItem | null, cropId: CropId): boolean {
  return a !== null && a.kind === 'helper' && a.cropId === cropId;
}

function HelperTile({ cropId }: { cropId: CropId }) {
  const crop = CROP_BY_ID.get(cropId);
  const selectedItem = useStore((s) => s.selectedItem);
  const selectItem = useStore((s) => s.selectItem);
  const applyGoalDrop = useStore((s) => s.applyGoalDrop);
  const item: DragItem = { kind: 'helper', cropId };
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: dragId(item), data: { item } });

  if (!crop) return null;
  const selected = sameHelper(selectedItem, cropId);

  return (
    <span className="helpers-tray__item">
      <button
        ref={setNodeRef}
        type="button"
        className={`helpers-tray__tile${isDragging ? ' is-dragging' : ''}`}
        aria-pressed={selected}
        aria-label={`${crop.name} helper. Drag it to the palette to remove, or into a lane to make it a goal. Press to select it instead.`}
        title={crop.name}
        onPointerDown={listeners?.onPointerDown as PointerEventHandler<HTMLButtonElement> | undefined}
        onClick={() => selectItem(selected ? null : item)}
      >
        <CropTileFace crop={crop} size="sm" selected={selected} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--sm helpers-tray__remove"
        aria-label={`Remove ${crop.name} from helpers`}
        onClick={() => applyGoalDrop(item, { kind: 'trash' })}
      >
        <TrashIcon />
      </button>
    </span>
  );
}

export default function HelpersTray() {
  const helpers = useStore((s) => s.settings.helpers);
  const selectedItem = useStore((s) => s.selectedItem);
  const selectItem = useStore((s) => s.selectItem);
  const activeItem = useActiveDragItem();

  const target = { kind: 'helpers' as const };
  const { setNodeRef, isOver } = useDroppable({ id: dropId(target), data: { target } });

  function addHere() {
    if (!selectedItem) return;
    if (useStore.getState().applyGoalDrop(selectedItem, target)) selectItem(null);
  }

  return (
    <section className="card helpers-tray" aria-label="Helpers">
      <div className="card__header">
        <h2 className="card__title">Helpers</h2>
      </div>

      <p className="helpers-tray__hint text-sm muted">
        Extra crops the planner may plant for their buffs or to fill space. Crops already in a goal are always allowed,
        whether or not they're listed here.
      </p>

      <div ref={setNodeRef} className={`helpers-tray__list${isOver && activeItem ? ' helpers-tray__list--over' : ''}`}>
        {helpers.map((cropId) => (
          <HelperTile key={cropId} cropId={cropId} />
        ))}
        {helpers.length === 0 && !selectedItem && <p className="helpers-tray__empty">No helpers yet</p>}
        {selectedItem && (
          <button type="button" className="tap-target helpers-tray__add" onClick={addHere}>
            Add here
          </button>
        )}
      </div>
    </section>
  );
}
