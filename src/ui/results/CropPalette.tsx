/**
 * Crop palette for the Plant tool: crops visible at the Gardening level,
 * goal crops and helpers first under "Your crops" (project task spec, Task
 * B step 2).
 */
import { CROPS } from '../../data/crops';
import type { Crop, CropId } from '../../engine/types';
import { visibleCrops } from '../setup/cropVisibility';
import CropSwatch from '../CropSwatch';

export interface CropPaletteProps {
  gardeningLevel: number | null;
  goalCrops: ReadonlySet<CropId>;
  helpers: readonly CropId[];
  selectedCropId: CropId | null;
  onSelect: (id: CropId) => void;
}

function CropChip({ crop, selected, onClick }: { crop: Crop; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className="helper-chip" aria-pressed={selected} onClick={onClick}>
      <CropSwatch crop={crop} />
      <span className="helper-chip__text">
        <span>{crop.name}</span>
      </span>
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
          <legend className="goal-row__legend">Your crops</legend>
          <div className="helper-picker__wrap">
            {yourCrops.map((c) => (
              <CropChip key={c.id} crop={c} selected={c.id === selectedCropId} onClick={() => onSelect(c.id)} />
            ))}
          </div>
        </fieldset>
      )}
      {otherCrops.length > 0 && (
        <fieldset>
          <legend className="goal-row__legend">Other crops</legend>
          <div className="helper-picker__wrap">
            {otherCrops.map((c) => (
              <CropChip key={c.id} crop={c} selected={c.id === selectedCropId} onClick={() => onSelect(c.id)} />
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
