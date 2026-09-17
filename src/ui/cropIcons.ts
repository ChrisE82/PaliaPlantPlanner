import type { CropId } from '../engine/types';

/**
 * Crop icons from the game, one PNG per crop id (see src/assets/crops/).
 * The art belongs to Singularity 6 / Daybreak Game Company; see the credits
 * in README.md and src/assets/crops/sources.json.
 */
const files = import.meta.glob('../assets/crops/*.png', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;

export const CROP_ICONS: Readonly<Record<CropId, string>> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.png'.length), url]),
);

/** The icon for a crop, or undefined when there is none (the UI then shows the crop's short label). */
export function cropIcon(id: CropId): string | undefined {
  return CROP_ICONS[id];
}
