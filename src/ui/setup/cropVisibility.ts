import type { Crop, CropId } from '../../engine/types';

/** True when the crop is unlocked at the given Gardening level (null = show everything). */
export function isCropUnlocked(crop: Crop, gardeningLevel: number | null): boolean {
  if (gardeningLevel === null) return true;
  return crop.unlock.gardeningLevel === null || crop.unlock.gardeningLevel <= gardeningLevel;
}

/**
 * Crops visible at the given Gardening level. `alwaysIncludeId`, when given,
 * stays in the list even if it's above the level, so an existing selection
 * doesn't silently disappear from its own dropdown.
 */
export function visibleCrops(
  crops: readonly Crop[],
  gardeningLevel: number | null,
  alwaysIncludeId?: CropId,
): Crop[] {
  return crops.filter((c) => c.id === alwaysIncludeId || isCropUnlocked(c, gardeningLevel));
}
