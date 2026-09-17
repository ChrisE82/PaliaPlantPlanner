/**
 * Buffs each placed crop receives from its neighbors (PLAN.md section 3,
 * rules 3 to 7): orthogonal contact only, own-type exclusion, per-size
 * receive thresholds, and no stacking (a binary received mask).
 */
import { isSoil } from './garden';
import { buildOccupancy, placementAt } from './layout';
import { RULES, type Rules } from './rules';
import { BUFF_IDS, BUFF_INDEX, type BuffDetail, type Crop, type CropId, type Garden, type Placement, type PlacementBuffs } from './types';

/**
 * Calls visit(nx, ny) for every tile directly above, below, left and right
 * of a size x size footprint at (x, y) — the outward-facing ring, no
 * diagonals. Tiles may be off the garden or off soil; callers filter those.
 */
function visitRing(x: number, y: number, size: number, visit: (nx: number, ny: number) => void): void {
  for (let d = 0; d < size; d++) {
    visit(x + d, y - 1); // above
    visit(x + d, y + size); // below
    visit(x - 1, y + d); // left
    visit(x + size, y + d); // right
  }
}

/** True when `giver` gives a buff that `receiver` can receive under `rules`. */
function givesTo(giver: Crop, receiver: Crop, rules: Rules): boolean {
  if (!giver.buff) return false;
  if (!rules.sameTypeGivesBuffs && giver.id === receiver.id) return false;
  return true;
}

/**
 * Buffs received by each placement, same order as `placements`. Pass `occ`
 * (from buildOccupancy) when the caller already has it, to avoid rebuilding
 * it and to skip re-validating the placements.
 */
export function computeBuffs(
  garden: Garden,
  placements: readonly Placement[],
  cropsById: ReadonlyMap<CropId, Crop>,
  rules: Rules = RULES,
  occ?: Int16Array,
): PlacementBuffs[] {
  const occupancy = occ ?? buildOccupancy(garden, placements, cropsById, rules);
  const buffCount = BUFF_IDS.length;

  const results: PlacementBuffs[] = placements.map(() => ({
    contacts: new Array<number>(buffCount).fill(0),
    receivedMask: 0,
  }));

  placements.forEach((p, i) => {
    const crop = cropsById.get(p.cropId);
    if (!crop) return; // only reachable with a caller-supplied, unvalidated occ
    const contacts = results[i].contacts;

    visitRing(p.x, p.y, crop.size, (nx, ny) => {
      if (!isSoil(garden, nx, ny)) return;
      const otherIndex = placementAt(garden, occupancy, nx, ny);
      if (otherIndex < 0 || otherIndex === i) return;
      const otherCrop = cropsById.get(placements[otherIndex].cropId);
      if (!otherCrop || !givesTo(otherCrop, crop, rules)) return;
      contacts[BUFF_INDEX[otherCrop.buff!]] += 1;
    });

    const threshold = rules.receiveThreshold[crop.size];
    let mask = 0;
    for (let b = 0; b < buffCount; b++) {
      if (contacts[b] >= threshold) mask |= 1 << b;
    }
    results[i].receivedMask = mask;
  });

  return results;
}

/**
 * Buff-by-buff detail for one placement: contacts, the threshold for its
 * size, whether it received the buff, and which neighbor crops gave it.
 * Only lists buffs that at least one crop in `cropsById` actually gives.
 */
export function describeBuffs(
  garden: Garden,
  placements: readonly Placement[],
  cropsById: ReadonlyMap<CropId, Crop>,
  index: number,
  rules: Rules = RULES,
  occ?: Int16Array,
): BuffDetail[] {
  const occupancy = occ ?? buildOccupancy(garden, placements, cropsById, rules);
  const p = placements[index];
  const crop = cropsById.get(p.cropId);
  if (!crop) return [];

  const buffCount = BUFF_IDS.length;
  const contacts = new Array<number>(buffCount).fill(0);
  const givers: CropId[][] = BUFF_IDS.map(() => []);
  const givenByAnyCrop = new Array<boolean>(buffCount).fill(false);
  for (const c of cropsById.values()) {
    if (c.buff) givenByAnyCrop[BUFF_INDEX[c.buff]] = true;
  }

  visitRing(p.x, p.y, crop.size, (nx, ny) => {
    if (!isSoil(garden, nx, ny)) return;
    const otherIndex = placementAt(garden, occupancy, nx, ny);
    if (otherIndex < 0 || otherIndex === index) return;
    const otherCrop = cropsById.get(placements[otherIndex].cropId);
    if (!otherCrop || !givesTo(otherCrop, crop, rules)) return;
    const b = BUFF_INDEX[otherCrop.buff!];
    contacts[b] += 1;
    if (!givers[b].includes(otherCrop.id)) givers[b].push(otherCrop.id);
  });

  const needed = rules.receiveThreshold[crop.size];
  const details: BuffDetail[] = [];
  for (let b = 0; b < buffCount; b++) {
    if (!givenByAnyCrop[b]) continue;
    details.push({
      buff: BUFF_IDS[b],
      contacts: contacts[b],
      needed,
      received: contacts[b] >= needed,
      givers: givers[b],
    });
  }
  return details;
}
