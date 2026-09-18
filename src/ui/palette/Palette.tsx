/**
 * The crop palette, the one source of crops and buffs for the whole app
 * (after aisen's Palia Garden Planner). Drag a crop into a goal lane, the
 * helpers tray, or the garden in edit mode; drag a buff onto a crop goal or a
 * lane. While a goal, helper or plant is being dragged, the palette becomes a
 * remove area.
 */
import { useDroppable } from '@dnd-kit/core';
import { useEffect, useState } from 'react';
import { CROPS } from '../../data/crops';
import { buffsGivenByCrops } from '../../engine/goals';
import { BUFF_NAMES, type BuffId } from '../../engine/types';
import { useActiveDragItem } from '../dnd/AppDnd';
import { isRemovable, type DragItem } from '../dnd/types';
import { TrashIcon } from '../icons';
import { useStore } from '../state/store';
import { BuffIcon, PaletteBuffBadge } from './BuffBadge';
import { PaletteCropTile } from './CropTile';

const BUFFS = buffsGivenByCrops(CROPS);

function sameItem(a: DragItem | null, b: DragItem): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === 'palette-crop' && b.kind === 'palette-crop') return a.cropId === b.cropId;
  if (a.kind === 'palette-buff' && b.kind === 'palette-buff') return a.buff === b.buff;
  return false;
}

export default function Palette() {
  const gardeningLevel = useStore((s) => s.settings.gardeningLevel);
  const selectedItem = useStore((s) => s.selectedItem);
  const selectItem = useStore((s) => s.selectItem);
  const activeItem = useActiveDragItem();
  const [filter, setFilter] = useState<BuffId | 'all'>('all');

  const removing = isRemovable(activeItem);
  const { setNodeRef, isOver } = useDroppable({
    id: 'trash',
    data: { target: { kind: 'trash' } },
    disabled: !removing,
  });

  // Escape drops the current selection.
  useEffect(() => {
    if (!selectedItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedItem, selectItem]);

  function toggle(item: DragItem) {
    selectItem(sameItem(selectedItem, item) ? null : item);
  }

  const crops = CROPS.filter((c) => filter === 'all' || c.buff === filter);

  return (
    <section
      ref={setNodeRef}
      className={['palette', removing ? 'palette--removing' : '', isOver ? 'palette--remove-over' : ''].filter(Boolean).join(' ')}
      aria-label="Crops and buffs"
    >
      <div className="palette__bar">
        <h2 className="palette__title">Crops</h2>
        <div className="palette__filters" role="group" aria-label="Show crops by the buff they give">
          <button type="button" className="palette__filter" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </button>
          {BUFFS.map((buff) => (
            <button
              key={buff}
              type="button"
              className={`palette__filter palette__filter--icon buff-dot--${buff}`}
              aria-pressed={filter === buff}
              aria-label={`Only crops that give ${BUFF_NAMES[buff]}`}
              title={BUFF_NAMES[buff]}
              onClick={() => setFilter(filter === buff ? 'all' : buff)}
            >
              <BuffIcon buff={buff} />
            </button>
          ))}
        </div>
        <p className="palette__hint">
          {selectedItem
            ? 'Now press where it goes, or press Esc.'
            : 'Drag a crop into your goals or onto the garden. Drop a buff on a crop goal to require it.'}
        </p>
      </div>

      <div className="palette__body">
        <div className="palette__crops">
          {crops.map((crop) => {
            const level = crop.unlock.gardeningLevel;
            const locked = gardeningLevel !== null && level !== null && level > gardeningLevel;
            return (
              <PaletteCropTile
                key={crop.id}
                crop={crop}
                selected={sameItem(selectedItem, { kind: 'palette-crop', cropId: crop.id })}
                lockedLevel={locked ? level : null}
                onSelect={toggle}
              />
            );
          })}
        </div>
        <div className="palette__buffs" role="group" aria-label="Buffs">
          {BUFFS.map((buff) => (
            <PaletteBuffBadge
              key={buff}
              buff={buff}
              selected={sameItem(selectedItem, { kind: 'palette-buff', buff })}
              onSelect={toggle}
            />
          ))}
        </div>
      </div>

      {removing && (
        <div className="palette__remove" aria-hidden="true">
          <TrashIcon /> Drop here to remove
        </div>
      )}
    </section>
  );
}
