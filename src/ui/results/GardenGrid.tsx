/**
 * The result grid (project task spec, Task A step 5 and Task B): soil tiles,
 * plot outlines, placed crops with buff dots, and (in edit mode) tap targets
 * for the active tool with a hover preview for the Plant tool.
 */
import { useId, useMemo, useState } from 'react';
import { RULES } from '../../engine/rules';
import {
  BUFF_IDS,
  BUFF_NAMES,
  type BuffId,
  type Crop,
  type CropId,
  type Garden,
  type Goal,
  type Placement,
  type PlacementBuffs,
  type TilePos,
} from '../../engine/types';
import { readableTextColor } from '../format';
import { requestedBuffsForCrop } from './buffRequests';
import { previewPlacement } from './edit';

export type EditTool = 'plant' | 'erase' | 'lockPlant' | 'lockPlot';

export interface GardenGridInteractive {
  tool: EditTool;
  /** Crop to preview for the Plant tool; ignored for other tools. */
  previewCropId: CropId | null;
  onTileActivate: (x: number, y: number) => void;
}

export interface GardenGridProps {
  garden: Garden;
  placements: readonly Placement[];
  cropsById: ReadonlyMap<CropId, Crop>;
  buffs: readonly PlacementBuffs[];
  goals: readonly Goal[];
  goalCrops: ReadonlySet<CropId>;
  lockedTiles: readonly TilePos[];
  selectedIndex?: number | null;
  onSelectPlacement?: (index: number) => void;
  interactive?: GardenGridInteractive;
}

const TILE_PX_CAP = 48;

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function footprintTiles(x: number, y: number, size: number): TilePos[] {
  const tiles: TilePos[] = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) tiles.push({ x: x + dx, y: y + dy });
  }
  return tiles;
}

/** A crop's name fits its footprint (a rough character-width heuristic), size 1 never shows it. */
function nameFits(crop: Crop): boolean {
  return crop.size >= 2 && crop.name.length <= crop.size * 7;
}

function decodeReceivedBuffs(mask: number): BuffId[] {
  return BUFF_IDS.filter((_b, i) => (mask & (1 << i)) !== 0);
}

function placementAriaLabel(crop: Crop, x: number, y: number, received: BuffId[], missing: BuffId[]): string {
  const parts = [`${crop.name}, ${crop.size}x${crop.size}, at column ${x + 1}, row ${y + 1}.`];
  for (const b of received) parts.push(`Has ${BUFF_NAMES[b]}.`);
  for (const b of missing) parts.push(`Missing ${BUFF_NAMES[b]}.`);
  return parts.join(' ');
}

export default function GardenGrid({
  garden,
  placements,
  cropsById,
  buffs,
  goals,
  goalCrops,
  lockedTiles,
  selectedIndex = null,
  onSelectPlacement,
  interactive,
}: GardenGridProps) {
  const hatchId = useId();
  const [hover, setHover] = useState<TilePos | null>(null);

  const occByTile = useMemo(() => {
    const occ = new Int16Array(garden.width * garden.height).fill(-1);
    placements.forEach((p, i) => {
      const crop = cropsById.get(p.cropId);
      if (!crop) return;
      for (const t of footprintTiles(p.x, p.y, crop.size)) {
        occ[t.y * garden.width + t.x] = i;
      }
    });
    return occ;
  }, [garden, placements, cropsById]);

  const lockedSet = useMemo(() => new Set(lockedTiles.map((t) => tileKey(t.x, t.y))), [lockedTiles]);

  const soilTiles = useMemo(() => {
    const tiles: TilePos[] = [];
    for (let y = 0; y < garden.height; y++) {
      for (let x = 0; x < garden.width; x++) {
        if (garden.soil[y * garden.width + x]) tiles.push({ x, y });
      }
    }
    return tiles;
  }, [garden]);

  const lockedEmptyTiles = useMemo(
    () => soilTiles.filter((t) => lockedSet.has(tileKey(t.x, t.y)) && occByTile[t.y * garden.width + t.x] === -1),
    [soilTiles, lockedSet, occByTile, garden.width],
  );

  const buffsGiven = useMemo(() => {
    const given = new Set<BuffId>();
    for (const c of cropsById.values()) {
      if (c.buff) given.add(c.buff);
    }
    return BUFF_IDS.filter((b) => given.has(b));
  }, [cropsById]);

  const preview =
    interactive?.tool === 'plant' && interactive.previewCropId && hover
      ? previewPlacement(garden, cropsById, lockedTiles, interactive.previewCropId, hover.x, hover.y)
      : null;
  const previewCrop = preview && interactive?.previewCropId ? cropsById.get(interactive.previewCropId) : undefined;

  function activate(x: number, y: number) {
    interactive?.onTileActivate(x, y);
  }

  return (
    <div className="garden-grid__wrap">
      <svg
        className="garden-grid"
        style={{ maxWidth: `${garden.width * TILE_PX_CAP}px` }}
        viewBox={`0 0 ${garden.width} ${garden.height}`}
        role="group"
        aria-label="Garden layout"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <pattern id={hatchId} width="0.22" height="0.22" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="0.22" className="garden-grid__hatch-line" />
          </pattern>
        </defs>

        {soilTiles.map(({ x, y }) => {
          const empty = occByTile[y * garden.width + x] === -1;
          return (
            <rect
              key={`tile-${x}-${y}`}
              className="garden-grid__tile"
              data-testid={`grid-tile-${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              role={interactive && empty ? 'button' : undefined}
              tabIndex={interactive && empty ? 0 : undefined}
              aria-label={interactive && empty ? `Empty tile, column ${x + 1}, row ${y + 1}.` : undefined}
              onMouseEnter={() => interactive && setHover({ x, y })}
              onClick={() => activate(x, y)}
              onKeyDown={(e) => {
                if (!interactive || !empty) return;
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                activate(x, y);
              }}
            />
          );
        })}

        {lockedEmptyTiles.map(({ x, y }) => (
          <rect
            key={`locked-${x}-${y}`}
            className="garden-grid__locked-empty"
            x={x}
            y={y}
            width={1}
            height={1}
            style={{ fill: `url(#${hatchId})` }}
            aria-hidden="true"
          />
        ))}

        {garden.plots.map((plot, i) => (
          <rect
            key={`plot-${i}`}
            className="garden-grid__plot-outline"
            x={plot.x}
            y={plot.y}
            width={RULES.plotSize}
            height={RULES.plotSize}
          />
        ))}

        {placements.map((p, i) => {
          const crop = cropsById.get(p.cropId);
          if (!crop) return null;
          const receivedMask = buffs[i]?.receivedMask ?? 0;
          const received = decodeReceivedBuffs(receivedMask);
          const requested = requestedBuffsForCrop(goals, goalCrops, p.cropId);
          const missing = BUFF_IDS.filter((b) => requested.has(b) && !received.includes(b));
          const dots = BUFF_IDS.filter((b) => received.includes(b) || missing.includes(b));
          const locked = footprintTiles(p.x, p.y, crop.size).some((t) => lockedSet.has(tileKey(t.x, t.y)));
          const label = placementAriaLabel(crop, p.x, p.y, received, missing);
          const showName = nameFits(crop);
          const cx = p.x + crop.size / 2;
          const cy = p.y + crop.size / 2;
          const textColor = readableTextColor(crop.color);

          return (
            <g
              key={`${p.x}-${p.y}-${p.cropId}`}
              role="button"
              tabIndex={0}
              aria-label={label}
              aria-pressed={!interactive && selectedIndex === i}
              className={`garden-grid__placement${!interactive && selectedIndex === i ? ' garden-grid__placement--selected' : ''}`}
              onMouseEnter={() => interactive && setHover({ x: p.x, y: p.y })}
              onClick={() => (interactive ? activate(p.x, p.y) : onSelectPlacement?.(i))}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                if (interactive) activate(p.x, p.y);
                else onSelectPlacement?.(i);
              }}
            >
              <rect
                className="garden-grid__crop"
                x={p.x}
                y={p.y}
                width={crop.size}
                height={crop.size}
                rx={0.15}
                style={{ fill: crop.color }}
              />
              <text
                className="garden-grid__abbr"
                x={cx}
                y={showName ? cy - 0.16 : cy}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fill: textColor }}
              >
                {crop.abbr}
              </text>
              {showName && (
                <text
                  className="garden-grid__name"
                  x={cx}
                  y={cy + 0.22}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fill: textColor }}
                >
                  {crop.name}
                </text>
              )}
              {dots.map((b, di) => (
                <circle
                  key={b}
                  className={`garden-grid__dot garden-grid__dot--${b}${received.includes(b) ? '' : ' garden-grid__dot--hollow'}`}
                  cx={p.x + ((di + 1) / (dots.length + 1)) * crop.size}
                  cy={p.y + crop.size - 0.14}
                  r={0.075}
                />
              ))}
              {locked && (
                <g className="garden-grid__lock-mark" transform={`translate(${p.x + crop.size - 0.34}, ${p.y + 0.08})`}>
                  <rect className="garden-grid__lock-mark-bg" x={-0.03} y={-0.03} width={0.34} height={0.34} rx={0.05} />
                  <path className="garden-grid__lock-mark-shackle" d="M0.07 0.16 V0.11 a0.09 0.09 0 0 1 0.18 0 V0.16" />
                  <rect className="garden-grid__lock-mark-body" x={0.03} y={0.15} width={0.26} height={0.15} rx={0.03} />
                </g>
              )}
            </g>
          );
        })}

        {preview && previewCrop && (
          <rect
            className={`garden-grid__preview ${preview.valid ? 'garden-grid__preview--valid' : 'garden-grid__preview--invalid'}`}
            x={preview.topLeft.x}
            y={preview.topLeft.y}
            width={previewCrop.size}
            height={previewCrop.size}
            rx={0.15}
          />
        )}
      </svg>

      <ul className="garden-grid__legend">
        {buffsGiven.map((b) => (
          <li key={b}>
            <span className={`garden-grid__legend-dot garden-grid__dot--${b}`} aria-hidden="true" />
            {BUFF_NAMES[b]}
          </li>
        ))}
        <li>
          <span className="garden-grid__legend-dot garden-grid__legend-dot--hollow" aria-hidden="true" />
          A goal asks for this buff, but the plant doesn’t have it
        </li>
      </ul>
    </div>
  );
}
