/**
 * The result grid (project task spec, Task A step 5 and Task B): soil tiles,
 * plot outlines, placed crops with buff dots, and (in edit mode) tap targets
 * for the active tool with a hover preview for the Plant tool, plus drag and
 * drop - shared with the rest of the app via src/ui/dnd - for placing and
 * moving crops, and pointer-paint for the Plant/Erase tools.
 *
 * An HTML CSS grid, one cell per tile: a `GardenTile` per soil tile (always
 * present, so it keeps its `data-testid` and is always a drop target for a
 * palette crop, even outside edit mode; only an empty tile gets the button
 * role) and a `GardenPlacement` per plant, spanning its footprint with
 * `grid-column`/`grid-row`. Plot outlines and the drag-preview ghost are
 * drawn as a separate absolutely-positioned overlay so a crop crossing a
 * plot border still looks continuous.
 *
 * Painting: with the Plant tool and a crop selected, or with the Erase tool,
 * pressing down on a tile and moving across others acts on each tile the
 * pointer enters, like a paint tool. A plant's own move-drag (the grip
 * handle) is a separate dnd-kit activator, so it never competes with this -
 * the tile body's own pointerdown either starts a paint stroke or, when
 * painting isn't active for the current tool, starts a dnd-kit drag of the
 * plant there; never both.
 */
import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
import { cropIcon } from '../cropIcons';
import { useActiveDragItem } from '../dnd/AppDnd';
import { dragId, dropId, type DndData, type DropTarget } from '../dnd/types';
import { GripIcon, LockIcon } from '../icons';
import { requestedBuffsForCrop } from './buffRequests';
import { dragGhostFor, type DragGhost } from './dragDrop';
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

const TILE_PX_MIN = 28;
const TILE_PX_MAX = 52;

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

/** Percentage box for a footprint of `size` tiles at (x, y), for the absolutely-positioned overlay. */
function footprintBoxStyle(x: number, y: number, size: number, garden: Garden): CSSProperties {
  return {
    left: `${(x / garden.width) * 100}%`,
    top: `${(y / garden.height) * 100}%`,
    width: `${(size / garden.width) * 100}%`,
    height: `${(size / garden.height) * 100}%`,
  };
}

/** Whether the Plant (with a crop chosen) or Erase tool is active, so a press-and-move paints tiles. */
function isPaintEligible(interactive: GardenGridInteractive | undefined): boolean {
  if (!interactive) return false;
  return interactive.tool === 'erase' || (interactive.tool === 'plant' && interactive.previewCropId !== null);
}

// ---------------------------------------------------------------------------
// One soil tile: always present (drop target, data-testid), a keyboard
// button only when empty and interactive.
// ---------------------------------------------------------------------------

interface GardenTileProps {
  x: number;
  y: number;
  empty: boolean;
  lockedEmpty: boolean;
  interactive?: GardenGridInteractive;
  paintEligible: boolean;
  onHover: (t: TilePos | null) => void;
  onPaintStart: (x: number, y: number) => void;
  onPaintEnter: (x: number, y: number) => void;
}

function GardenTile({
  x,
  y,
  empty,
  lockedEmpty,
  interactive,
  paintEligible,
  onHover,
  onPaintStart,
  onPaintEnter,
}: GardenTileProps) {
  const target: DropTarget = { kind: 'tile', x, y };
  const { setNodeRef } = useDroppable({ id: dropId(target), data: { target } });

  return (
    <div
      ref={setNodeRef}
      data-testid={`grid-tile-${x}-${y}`}
      className={`garden-grid__tile${lockedEmpty ? ' garden-grid__tile--locked' : ''}`}
      style={{ gridColumn: x + 1, gridRow: y + 1 }}
      role={interactive && empty ? 'button' : undefined}
      tabIndex={interactive && empty ? 0 : undefined}
      aria-label={interactive && empty ? `Empty tile, column ${x + 1}, row ${y + 1}.` : undefined}
      onMouseEnter={() => {
        if (interactive) onHover({ x, y });
        onPaintEnter(x, y);
      }}
      onPointerDown={() => {
        if (paintEligible) onPaintStart(x, y);
      }}
      onClick={() => {
        if (!paintEligible) interactive?.onTileActivate(x, y);
      }}
      onKeyDown={(e) => {
        if (!interactive || !empty) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        interactive.onTileActivate(x, y);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// One placed crop: spans its footprint, draggable to move it via a grip
// handle (pointer dragging also works from the tile body itself, except
// while a paint stroke is eligible - see the module doc comment).
// ---------------------------------------------------------------------------

interface GardenPlacementProps {
  placement: Placement;
  index: number;
  crop: Crop;
  received: BuffId[];
  missing: BuffId[];
  locked: boolean;
  selected: boolean;
  interactive?: GardenGridInteractive;
  dragEnabled: boolean;
  paintEligible: boolean;
  onHover: (t: TilePos | null) => void;
  onPaintStart: (x: number, y: number) => void;
  onPaintEnter: (x: number, y: number) => void;
  onSelectPlacement?: (index: number) => void;
}

function GardenPlacement({
  placement: p,
  index,
  crop,
  received,
  missing,
  locked,
  selected,
  interactive,
  dragEnabled,
  paintEligible,
  onHover,
  onPaintStart,
  onPaintEnter,
  onSelectPlacement,
}: GardenPlacementProps) {
  const item = { kind: 'plant' as const, index, cropId: p.cropId, x: p.x, y: p.y };
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: dragId(item),
    data: { item },
    disabled: !dragEnabled,
  });

  const label = placementAriaLabel(crop, p.x, p.y, received, missing);
  const showName = nameFits(crop);
  const icon = cropIcon(crop.id);
  const dots = BUFF_IDS.filter((b) => received.includes(b) || missing.includes(b));
  const iconPct = crop.size === 1 ? '68%' : '52%';

  function activate() {
    if (interactive) interactive.onTileActivate(p.x, p.y);
    else onSelectPlacement?.(index);
  }

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={!interactive && selected}
      className={[
        'garden-grid__placement',
        !interactive && selected ? 'garden-grid__placement--selected' : '',
        isDragging ? 'garden-grid__placement--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          gridColumn: `${p.x + 1} / span ${crop.size}`,
          gridRow: `${p.y + 1} / span ${crop.size}`,
          '--crop-color': crop.color,
          '--icon-pct': iconPct,
        } as CSSProperties
      }
      onMouseEnter={() => {
        onHover({ x: p.x, y: p.y });
        onPaintEnter(p.x, p.y);
      }}
      onClick={() => {
        if (!paintEligible) activate();
      }}
      onPointerDown={(e) => {
        if (paintEligible) {
          onPaintStart(p.x, p.y);
        } else if (dragEnabled) {
          listeners?.onPointerDown?.(e);
        }
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        activate();
      }}
    >
      {icon ? (
        <img className="garden-grid__icon" src={icon} alt="" />
      ) : (
        <span className="garden-grid__abbr">{crop.abbr}</span>
      )}
      {showName && <span className="garden-grid__name">{crop.name}</span>}
      {dots.length > 0 && (
        <span className="garden-grid__dots">
          {dots.map((b) => (
            <span
              key={b}
              className={`garden-grid__dot garden-grid__dot--${b}${received.includes(b) ? '' : ' garden-grid__dot--hollow'}`}
            />
          ))}
        </span>
      )}
      {locked && (
        <span className="garden-grid__lock-mark" aria-hidden="true">
          <LockIcon />
        </span>
      )}
      {dragEnabled && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="garden-grid__handle"
          aria-label={`Move ${crop.name}, currently at column ${p.x + 1}, row ${p.y + 1}.`}
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
          onPointerDown={(e) => {
            // The handle is the one dnd-kit move-drag activator while a
            // paint stroke is eligible for the tile body (see the module
            // doc comment); it always starts a move otherwise too. Stop
            // this from bubbling to the tile body's own onPointerDown so
            // the same pointerdown isn't handled twice.
            e.stopPropagation();
            listeners?.onPointerDown?.(e);
          }}
          onKeyDown={(e) => {
            // Keep this handle's own keyboard-drag isolated from the tile's
            // Enter/Space tool activation above (which must keep working
            // exactly as it does today).
            e.stopPropagation();
            listeners?.onKeyDown?.(e);
          }}
        >
          <GripIcon />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

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
  const [hover, setHover] = useState<TilePos | null>(null);
  const dragEnabled = !!interactive;
  const paintEligible = isPaintEligible(interactive);

  // Tracks a paint stroke across renders without needing one, and survives
  // the pointer being released outside the grid entirely.
  const paintingRef = useRef(false);
  useEffect(() => {
    function stopPainting() {
      paintingRef.current = false;
    }
    window.addEventListener('pointerup', stopPainting);
    return () => window.removeEventListener('pointerup', stopPainting);
  }, []);

  function handlePaintStart(x: number, y: number) {
    if (!paintEligible || !interactive) return;
    paintingRef.current = true;
    interactive.onTileActivate(x, y);
  }

  function handlePaintEnter(x: number, y: number) {
    if (!paintEligible || !interactive || !paintingRef.current) return;
    interactive.onTileActivate(x, y);
  }

  // Reads the shared app-wide drag (a palette chip or an existing plant, see
  // src/ui/dnd/AppDnd.tsx) so a live drag anywhere - not just in edit mode,
  // so dragging a crop onto the garden from the top palette just works -
  // previews its drop footprint here, without the caller threading that
  // state down as a prop.
  const activeItem = useActiveDragItem();
  const { over } = useDndContext();
  const liveDragGhost = useMemo(() => {
    if (!activeItem) return null;
    const target = (over?.data.current as DndData | undefined)?.target ?? null;
    return dragGhostFor(garden, cropsById, placements, lockedTiles, activeItem, target);
  }, [activeItem, over, garden, cropsById, placements, lockedTiles]);

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

  const buffsGiven = useMemo(() => {
    const given = new Set<BuffId>();
    for (const c of cropsById.values()) {
      if (c.buff) given.add(c.buff);
    }
    return BUFF_IDS.filter((b) => given.has(b));
  }, [cropsById]);

  // While a drag is active, it takes over the ghost preview from the plain
  // mouse-hover preview used for click-to-place.
  const hoverGhost: DragGhost | null = useMemo(() => {
    if (liveDragGhost || interactive?.tool !== 'plant' || !interactive.previewCropId || !hover) return null;
    const crop = cropsById.get(interactive.previewCropId);
    const preview = previewPlacement(garden, cropsById, lockedTiles, interactive.previewCropId, hover.x, hover.y);
    if (!crop || !preview) return null;
    return { cropId: interactive.previewCropId, size: crop.size, topLeft: preview.topLeft, valid: preview.valid };
  }, [liveDragGhost, interactive, hover, garden, cropsById, lockedTiles]);

  const ghost = liveDragGhost ?? hoverGhost;

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${garden.width}, minmax(${TILE_PX_MIN}px, 1fr))`,
    maxWidth: `${garden.width * TILE_PX_MAX}px`,
  };

  return (
    <div className="garden-grid__wrap">
      <div
        className="garden-grid"
        style={gridStyle}
        role="group"
        aria-label="Garden layout"
        onMouseLeave={() => setHover(null)}
      >
        {soilTiles.map(({ x, y }) => {
          const empty = occByTile[y * garden.width + x] === -1;
          return (
            <GardenTile
              key={`tile-${x}-${y}`}
              x={x}
              y={y}
              empty={empty}
              lockedEmpty={empty && lockedSet.has(tileKey(x, y))}
              interactive={interactive}
              paintEligible={paintEligible}
              onHover={setHover}
              onPaintStart={handlePaintStart}
              onPaintEnter={handlePaintEnter}
            />
          );
        })}

        <div className="garden-grid__plots" aria-hidden="true">
          {garden.plots.map((plot, i) => (
            <span key={`plot-${i}`} className="garden-grid__plot-outline" style={footprintBoxStyle(plot.x, plot.y, RULES.plotSize, garden)} />
          ))}
        </div>

        {placements.map((p, i) => {
          const crop = cropsById.get(p.cropId);
          if (!crop) return null;
          const receivedMask = buffs[i]?.receivedMask ?? 0;
          const received = decodeReceivedBuffs(receivedMask);
          const requested = requestedBuffsForCrop(goals, goalCrops, p.cropId);
          const missing = BUFF_IDS.filter((b) => requested.has(b) && !received.includes(b));
          const locked = footprintTiles(p.x, p.y, crop.size).some((t) => lockedSet.has(tileKey(t.x, t.y)));

          return (
            <GardenPlacement
              key={`${p.x}-${p.y}-${p.cropId}`}
              placement={p}
              index={i}
              crop={crop}
              received={received}
              missing={missing}
              locked={locked}
              selected={selectedIndex === i}
              interactive={interactive}
              dragEnabled={dragEnabled}
              paintEligible={paintEligible}
              onHover={setHover}
              onPaintStart={handlePaintStart}
              onPaintEnter={handlePaintEnter}
              onSelectPlacement={onSelectPlacement}
            />
          );
        })}

        {ghost &&
          (() => {
            const ghostCrop = cropsById.get(ghost.cropId);
            if (!ghostCrop) return null;
            return (
              <span
                className={`garden-grid__ghost ${ghost.valid ? 'garden-grid__ghost--valid' : 'garden-grid__ghost--invalid'}`}
                style={footprintBoxStyle(ghost.topLeft.x, ghost.topLeft.y, ghost.size, garden)}
                aria-hidden="true"
              />
            );
          })()}
      </div>

      <Legend buffsGiven={buffsGiven} />
    </div>
  );
}

function Legend({ buffsGiven }: { buffsGiven: readonly BuffId[] }): ReactNode {
  return (
    <ul className="garden-grid__legend">
      {buffsGiven.map((b) => (
        <li key={b}>
          <span className={`garden-grid__dot garden-grid__dot--${b}`} aria-hidden="true" />
          {BUFF_NAMES[b]}
        </li>
      ))}
      <li>
        <span className="garden-grid__dot garden-grid__dot--muted-hollow" aria-hidden="true" />
        A goal asks for this buff, but the plant doesn’t have it
      </li>
    </ul>
  );
}
