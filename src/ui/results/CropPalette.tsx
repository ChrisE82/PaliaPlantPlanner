/**
 * Crop palette for the Plant tool: crops visible at the Gardening level,
 * goal crops and helpers first under "Your crops" (project task spec, Task
 * B step 2). Chips are draggable onto the grid as an addition to picking one
 * here and then tapping a tile.
 */
import { useDraggable } from '@dnd-kit/core';
import { CROPS } from '../../data/crops';
import type { Crop, CropId } from '../../engine/types';
import { visibleCrops } from '../setup/cropVisibility';
import CropSwatch from '../CropSwatch';
import type { DragItemData } from './dragDrop';

export interface CropPaletteProps {
  gardeningLevel: number | null;
  goalCrops: ReadonlySet<CropId>;
  helpers: readonly CropId[];
  selectedCropId: CropId | null;
  onSelect: (id: CropId) => void;
}

function CropChip({ crop, selected, onClick }: { crop: Crop; selected: boolean; onClick: () => void }) {
  const dragData: DragItemData = { kind: 'palette', cropId: crop.id };
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `palette-${crop.id}`, data: dragData });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`chip crop-palette__chip${isDragging ? ' crop-palette__chip--dragging' : ''}`}
      aria-pressed={selected}
      onClick={onClick}
      onPointerDown={(e) => listeners?.onPointerDown?.(e)}
    >
      <CropSwatch crop={crop} />
      <span>{crop.name}</span>
    </button>
  );
}

export default function CropPalette({ gardeningLevel, goalCrops, helpers, selectedCropId, onSelect }: CropPaletteProps) {
  const crops = visibleCrops(CROPS, gardeningLevel, selectedCropId ?? undefined);
  const yours = new Set<CropId>([...goalCrops, ...helpers]);
  const yourCrops = crops.filter((c) => yours.has(c.id));
  const otherCrops = crops.filter((c) => !yours.has(c.id));

  return (
    <div className="crop-palette">
      {yourCrops.length > 0 && (
        <fieldset>
          <legend>Your crops</legend>
          <div className="row-wrap">
            {yourCrops.map((c) => (
              <CropChip key={c.id} crop={c} selected={c.id === selectedCropId} onClick={() => onSelect(c.id)} />
            ))}
          </div>
        </fieldset>
      )}
      {otherCrops.length > 0 && (
        <fieldset>
          <legend>Other crops</legend>
          <div className="row-wrap">
            {otherCrops.map((c) => (
              <CropChip key={c.id} crop={c} selected={c.id === selectedCropId} onClick={() => onSelect(c.id)} />
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
