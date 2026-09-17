import type { CSSProperties } from 'react';
import type { Crop } from '../engine/types';
import { cropIcon } from './cropIcons';

export interface CropSwatchProps {
  crop: Crop;
  /** 'small' is used in tables; the default suits chips and buttons. */
  size?: 'small' | 'normal';
}

/** The crop's icon on its color, falling back to the crop's short label. */
export default function CropSwatch({ crop, size = 'normal' }: CropSwatchProps) {
  const icon = cropIcon(crop.id);
  return (
    <span
      className={`crop-swatch${size === 'small' ? ' crop-swatch--small' : ''}`}
      style={{ '--crop-color': crop.color } as CSSProperties}
    >
      {icon ? <img className="crop-swatch__icon" src={icon} alt="" /> : crop.abbr}
    </span>
  );
}
