/**
 * Shared types for the planner engine and the UI.
 *
 * Coordinates: x grows to the right, y grows down, both in tiles.
 * Tile index = y * garden.width + x.
 */

// ---------------------------------------------------------------------------
// Buffs
// ---------------------------------------------------------------------------

export type BuffId = 'waterRetain' | 'weedBlock' | 'harvestBoost' | 'qualityBoost' | 'growthBoost';

/** Fixed order used for bitmasks and for arrays indexed by buff. */
export const BUFF_IDS: readonly BuffId[] = [
  'waterRetain',
  'weedBlock',
  'harvestBoost',
  'qualityBoost',
  'growthBoost',
];

export const BUFF_INDEX: Readonly<Record<BuffId, number>> = {
  waterRetain: 0,
  weedBlock: 1,
  harvestBoost: 2,
  qualityBoost: 3,
  growthBoost: 4,
};

export const BUFF_NAMES: Readonly<Record<BuffId, string>> = {
  waterRetain: 'Water Retain',
  weedBlock: 'Weed Block',
  harvestBoost: 'Harvest Boost',
  qualityBoost: 'Quality Boost',
  growthBoost: 'Growth Boost',
};

/** Bit for a buff in a received-buffs bitmask. */
export function buffBit(buff: BuffId): number {
  return 1 << BUFF_INDEX[buff];
}

// ---------------------------------------------------------------------------
// Crops
// ---------------------------------------------------------------------------

export type CropSize = 1 | 2 | 3;
export type CropId = string;

export interface Crop {
  id: CropId;
  name: string;
  /** Short label drawn on tiles (2-3 characters). */
  abbr: string;
  /** Tile fill color, hex "#rrggbb". */
  color: string;
  /** Footprint is size x size tiles. */
  size: CropSize;
  /** Buff this crop gives to touching crops of other types. null = none. */
  buff: BuffId | null;
  seed: {
    /** null when seeds can't be bought with a currency. */
    price: number | null;
    currency: 'gold' | 'medals' | null;
    /** Where to get seeds, shown in the shopping list. */
    source: string;
  };
  unlock: {
    gardeningLevel: number | null;
    note: string | null;
  };
  /** Stored for later yield features; not used by the first version. */
  growDays: number | null;
  regrow: { everyDays: number; harvests: number } | null;
  yield: { base: number | null; boosted: number | null };
  sell: { base: number | null; star: number | null };
}

export interface CropData {
  /** Date the data was last checked, YYYY-MM-DD. */
  checkedOn: string;
  note: string;
  sources: { label: string; url: string }[];
  crops: Crop[];
}

// ---------------------------------------------------------------------------
// Garden and layouts
// ---------------------------------------------------------------------------

export interface TilePos {
  x: number;
  y: number;
}

/** Top-left tile of a 3x3 plot. */
export type PlotPos = TilePos;

/** A set of soil tiles built from plot positions (see engine/garden.ts). */
export interface Garden {
  /** Plot positions, shifted so the smallest x and y are 0. */
  plots: PlotPos[];
  /** Bounding box in tiles. */
  width: number;
  height: number;
  /** soil[index] is 1 for soil tiles, 0 otherwise. */
  soil: Uint8Array;
  /** plotOf[index] is the plot index for soil tiles, -1 otherwise. */
  plotOf: Int16Array;
  /** Number of soil tiles (9 per plot). */
  tileCount: number;
}

/** A crop placed with its top-left tile at (x, y). */
export interface Placement {
  cropId: CropId;
  x: number;
  y: number;
}

/** Buff result for one placement (same order as the placements array). */
export interface PlacementBuffs {
  /**
   * contacts[BUFF_INDEX[b]] = number of tiles touching the footprint
   * (orthogonally, outside it) that hold a crop of a different type giving b.
   */
  contacts: number[];
  /** Bit BUFF_INDEX[b] is set when contacts for b reach the receive threshold. */
  receivedMask: number;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export type Importance = 'must' | 'high' | 'medium' | 'low';

/** Most important first. Score vectors follow this order. */
export const IMPORTANCE_ORDER: readonly Importance[] = ['must', 'high', 'medium', 'low'];

export const IMPORTANCE_NAMES: Readonly<Record<Importance, string>> = {
  must: 'Must',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** 'quantity' counts plants; a BuffId counts plants that receive that buff. */
export type Measure = 'quantity' | BuffId;

/**
 * quantity goals: 'count' (at least n plants) or 'max'.
 * buff goals: 'all' (every plant of the crop) or 'count' (at least n plants with the buff).
 */
export type GoalAmount = { kind: 'count'; n: number } | { kind: 'max' } | { kind: 'all' };

/** Goal crop value meaning "every crop that appears in any goal". Buff goals only. */
export const ALL_GOAL_CROPS = '*';

export interface Goal {
  id: string;
  crop: CropId | typeof ALL_GOAL_CROPS;
  measure: Measure;
  amount: GoalAmount;
  importance: Importance;
}

/**
 * Compared left to right, higher is better (see engine/score.ts):
 *   for each level in IMPORTANCE_ORDER: [targets score, maximize score]
 *   then: [filled tiles, buffs received by goal crops, tiles used by goal crops]
 */
export type ScoreVector = number[];

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export type ArrangementSetting =
  | {
      mode: 'suggest';
      /** Optional space limit in tiles; either orientation may fit. */
      maxWidth: number | null;
      maxHeight: number | null;
    }
  | {
      mode: 'custom';
      plots: PlotPos[];
    };

export interface PlanSettings {
  /** 1 to 9. In custom mode this equals arrangement.plots.length. */
  plotCount: number;
  arrangement: ArrangementSetting;
  /** Hides crops above this level in the UI. null = show all. */
  gardeningLevel: number | null;
  goals: Goal[];
  /** Extra crops the planner may plant. Crops named in goals are always allowed. */
  helpers: CropId[];
}

/** Re-optimize input: keep the arrangement and every placement that touches a locked tile. */
export interface FixedLayout {
  plots: PlotPos[];
  placements: Placement[];
  lockedTiles: TilePos[];
}

export interface LayoutSolution {
  /** Normalized plot positions (smallest x and y are 0). */
  plots: PlotPos[];
  placements: Placement[];
  score: ScoreVector;
  /** Short description of the arrangement, e.g. "3x3 block" or "Your arrangement". */
  label: string;
}

export interface PlanRequest {
  settings: PlanSettings;
  /** Seed for the random number generator, so runs can be reproduced. */
  seed: number;
  /** Total time the planner may use. */
  timeBudgetMs: number;
  fixed?: FixedLayout;
}

export interface PlanProgress {
  stage: 'screening' | 'refining' | 'finishing';
  done: number;
  total: number;
  best: LayoutSolution | null;
}

export interface PlanResult {
  /** Best first. Up to 3, on different arrangements when the planner compared arrangements. */
  solutions: LayoutSolution[];
  arrangementsTried: number;
  elapsedMs: number;
}
