import { useDraggable } from '@dnd-kit/core';
import type { PointerEventHandler } from 'react';
import { BUFF_NAMES, type BuffId } from '../../engine/types';
import { dragId, type DragItem } from '../dnd/types';
import { DropletIcon, FastForwardIcon, SheafIcon, ShieldIcon, StarIcon } from '../icons';

export function BuffIcon({ buff }: { buff: BuffId }) {
  switch (buff) {
    case 'waterRetain':
      return <DropletIcon />;
    case 'weedBlock':
      return <ShieldIcon />;
    case 'harvestBoost':
      return <SheafIcon />;
    case 'qualityBoost':
      return <StarIcon />;
    case 'growthBoost':
      return <FastForwardIcon />;
  }
}

export interface BuffBadgeFaceProps {
  buff: BuffId;
  showLabel?: boolean;
  /** Small round badge, for corners of crop tiles and tokens. */
  compact?: boolean;
  selected?: boolean;
  /** The look while following the pointer. */
  lifted?: boolean;
}

/** A buff as a colored badge: its icon, and optionally its name. */
export function BuffBadgeFace({ buff, showLabel = false, compact = false, selected = false, lifted = false }: BuffBadgeFaceProps) {
  const classes = [
    'buff-badge',
    `buff-badge--${buff}`,
    compact ? 'buff-badge--compact' : '',
    selected ? 'is-selected' : '',
    lifted ? 'is-lifted' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes}>
      <span className="buff-badge__icon">
        <BuffIcon buff={buff} />
      </span>
      {showLabel && <span className="buff-badge__label">{BUFF_NAMES[buff]}</span>}
    </span>
  );
}

export interface PaletteBuffBadgeProps {
  buff: BuffId;
  selected: boolean;
  onSelect: (item: DragItem) => void;
}

/**
 * A buff in the palette. Drag it onto a crop goal (that crop must get the
 * buff) or onto a lane (every goal crop must get it); or press it to select
 * it and then press where it should go.
 */
export function PaletteBuffBadge({ buff, selected, onSelect }: PaletteBuffBadgeProps) {
  const item: DragItem = { kind: 'palette-buff', buff };
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: dragId(item), data: { item } });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`palette-buff${isDragging ? ' is-dragging' : ''}`}
      aria-pressed={selected}
      aria-label={`${BUFF_NAMES[buff]}. Drag onto a crop goal or a goal lane, or press to select.`}
      title={BUFF_NAMES[buff]}
      onPointerDown={listeners?.onPointerDown as PointerEventHandler<HTMLButtonElement> | undefined}
      onClick={() => onSelect(item)}
    >
      <BuffBadgeFace buff={buff} showLabel selected={selected} />
    </button>
  );
}
