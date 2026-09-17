import data from './crops.json';
import type { Crop, CropData, CropId } from '../engine/types';

export const CROP_DATA = data as unknown as CropData;

export const CROPS: readonly Crop[] = CROP_DATA.crops;

export const CROP_BY_ID: ReadonlyMap<CropId, Crop> = new Map(CROPS.map((c) => [c.id, c]));

export function getCrop(id: CropId): Crop {
  const crop = CROP_BY_ID.get(id);
  if (!crop) throw new Error(`Unknown crop: ${id}`);
  return crop;
}
