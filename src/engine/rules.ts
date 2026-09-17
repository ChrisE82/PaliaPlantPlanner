import type { CropSize } from './types';

/**
 * Palia gardening rules the planner uses. Sources: the Palia wiki Gardening
 * page and the code of aisen's planner and garden-plot-optimizer (checked
 * 2026-09-17), confirmed by the project owner in game. If a game patch changes
 * a rule, change it here.
 */
export interface Rules {
  maxPlots: number;
  /** Plots are plotSize x plotSize tiles. */
  plotSize: number;
  /** Touching tiles that must give a buff before a crop of this size receives it. */
  receiveThreshold: Readonly<Record<CropSize, number>>;
  /** false: a crop never receives buffs from crops of its own type. */
  sameTypeGivesBuffs: boolean;
  /** true: a crop may cover tiles of two touching plots. */
  cropsCrossPlotBorders: boolean;
}

export const RULES: Readonly<Rules> = {
  maxPlots: 9,
  plotSize: 3,
  receiveThreshold: { 1: 1, 2: 2, 3: 3 },
  sameTypeGivesBuffs: false,
  cropsCrossPlotBorders: true,
};
