import { useDraggable } from '@dnd-kit/core';
import type { CSSProperties, PointerEventHandler, ReactNode } from 'react';
import { BUFF_NAMES, type Crop } from '../../engine/types';
import { cropIcon } from '../cropIcons';
import { dragId, type DragItem } from '../dnd/types';
import { BuffIcon } from './BuffBadge';

export interface CropTileFaceProps {
  crop: Crop;
  size?: 'md' | 'sm';
  selected?: boolean;
  /** Shown faded, e.g. above the player's Gardening level. */
  dimmed?: boolean;
  /** The look while following the pointer. */
  lifted?: boolean;
  /** Extra corner content, such as a count. */
  badge?: ReactNode;
}

/** A crop as a square tile: its icon on its tint, the buff it gives in the corner, and its size if larger than 1x1. */
export function CropTileFace({ crop, size = 'md', selected = false, dimmed = false, lifted = false, badge }: CropTileFaceProps) {
  const icon = cropIcon(crop.id);
  const classes = [
    'crop-tile',
    size === 'sm' ? 'crop-tile--sm' : '',
    selected ? 'is-selected' : '',
    dimmed ? 'is-dimmed' : '',
    lifted ? 'is-lifted' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} style={{ '--crop-color': crop.color } as CSSProperties}>
      {icon ? (
        <img className="crop-tile__icon" src={icon} alt="" draggable={false} />
      ) : (
        <span className="crop-tile__abbr">{crop.abbr}</span>
      )}
      {crop.buff && (
        <span className={`crop-tile__buff buff-dot buff-dot--${crop.buff}`} title={BUFF_NAMES[crop.buff]}>
          <BuffIcon buff={crop.buff} />
        </span>
      )}
      {crop.size > 1 && (
        <span className="crop-tile__size">
          {crop.size}×{crop.size}
        </span>
      )}
      {badge}
    </span>
  );
}

export interface PaletteCropTileProps {
  crop: Crop;
  selected: boolean;
  /** Gardening level the crop needs when it's above the player's level; null otherwise. */
  lockedLevel: number | null;
  onSelect: (item: DragItem) => void;
}

/**
 * A crop in the palette. Drag it into a goal lane, the helpers tray, or the
 * garden (edit mode); or press it to select it and then press where it
 * should go. Pointer drags only: Enter and Space select, which keeps the
 * keyboard path simple.
 */
export function PaletteCropTile({ crop, selected, lockedLevel, onSelect }: PaletteCropTileProps) {
  const item: DragItem = { kind: 'palette-crop', cropId: crop.id };
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: dragId(item), data: { item } });

  const details = [
    `${crop.size}x${crop.size}`,
    crop.buff ? `gives ${BUFF_NAMES[crop.buff]}` : null,
    lockedLevel !== null ? `needs Gardening level ${lockedLevel}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`palette-crop${isDragging ? ' is-dragging' : ''}`}
      aria-pressed={selected}
      aria-label={`${crop.name}, ${details}. Drag it where it should go, or press to select.`}
      title={`${crop.name} (${details})`}
      onPointerDown={listeners?.onPointerDown as PointerEventHandler<HTMLButtonElement> | undefined}
      onClick={() => onSelect(item)}
    >
      <CropTileFace crop={crop} selected={selected} dimmed={lockedLevel !== null} />
      <span className="palette-crop__name">{crop.name}</span>
    </button>
  );
}
