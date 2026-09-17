// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CROPS, CROP_BY_ID } from '../data/crops';
import type { Crop } from '../engine/types';
import CropSwatch from './CropSwatch';
import { CROP_ICONS, cropIcon } from './cropIcons';

afterEach(() => {
  cleanup();
});

describe('crop icons', () => {
  // Icons are optional: src/assets/crops can be emptied and the UI falls back
  // to short labels. But when icons are present, the ids must match the data.
  const hasIcons = Object.keys(CROP_ICONS).length > 0;

  it.runIf(hasIcons)('has an icon for every crop', () => {
    expect(CROPS.filter((c) => !cropIcon(c.id)).map((c) => c.id)).toEqual([]);
  });

  it.runIf(hasIcons)('has no icon files that do not match a crop id', () => {
    expect(Object.keys(CROP_ICONS).filter((id) => !CROP_BY_ID.has(id))).toEqual([]);
  });

  it('returns undefined for an unknown crop', () => {
    expect(cropIcon('lettuce')).toBeUndefined();
  });
});

describe('CropSwatch', () => {
  it.runIf(Object.keys(CROP_ICONS).length > 0)('shows the crop icon, with empty alt text', () => {
    const { container } = render(<CropSwatch crop={CROP_BY_ID.get('tomato')!} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('tomato');
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('falls back to the short label when a crop has no icon', () => {
    const crop: Crop = { ...CROP_BY_ID.get('tomato')!, id: 'sweet-leaf', abbr: 'Sl' };
    render(<CropSwatch crop={crop} />);
    expect(screen.getByText('Sl')).toBeTruthy();
  });
});
