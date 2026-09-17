import { useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { RULES } from '../../engine/rules';
import type { PlotPos } from '../../engine/types';
import { useStore } from '../state/store';

const PLOT_SIZE = RULES.plotSize;
const MAX_PLOTS = RULES.maxPlots;
const BOARD_SIZE = MAX_PLOTS * PLOT_SIZE; // 27: room for every plot laid end to end, in either direction.

function overlaps(a: PlotPos, b: PlotPos): boolean {
  return a.x < b.x + PLOT_SIZE && a.x + PLOT_SIZE > b.x && a.y < b.y + PLOT_SIZE && a.y + PLOT_SIZE > b.y;
}

function snappedTopLeft(x: number, y: number): PlotPos {
  return { x: Math.floor(x / PLOT_SIZE) * PLOT_SIZE, y: Math.floor(y / PLOT_SIZE) * PLOT_SIZE };
}

function clampedTopLeft(x: number, y: number): PlotPos {
  const max = BOARD_SIZE - PLOT_SIZE;
  return { x: Math.min(Math.max(x, 0), max), y: Math.min(Math.max(y, 0), max) };
}

function plotIndexAt(plots: readonly PlotPos[], x: number, y: number): number {
  return plots.findIndex((p) => x >= p.x && x < p.x + PLOT_SIZE && y >= p.y && y < p.y + PLOT_SIZE);
}

function threeByThreeBlock(): PlotPos[] {
  const plots: PlotPos[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      plots.push({ x: col * PLOT_SIZE, y: row * PLOT_SIZE });
    }
  }
  return plots;
}

function tileCoordsFromTarget(target: EventTarget | null): PlotPos | null {
  if (!(target instanceof Element)) return null;
  const xAttr = target.getAttribute('data-x');
  const yAttr = target.getAttribute('data-y');
  if (xAttr === null || yAttr === null) return null;
  return { x: Number(xAttr), y: Number(yAttr) };
}

const ALL_TILES: readonly PlotPos[] = (() => {
  const tiles: PlotPos[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) tiles.push({ x, y });
  }
  return tiles;
})();

/**
 * Where a plot being dragged would land: snapped or clamped per `snap`, and
 * marked invalid when it would overlap a plot other than the one being
 * dragged. Pure and DOM-free so it's directly testable; the component's
 * pointer-to-tile conversion (screenToTile, below) is not, since it needs a
 * real SVG CTM that jsdom doesn't implement.
 */
export function candidateForDrag(
  plots: readonly PlotPos[],
  draggingIndex: number,
  tile: PlotPos,
  snap: boolean,
): { pos: PlotPos; valid: boolean } {
  const pos = snap ? snappedTopLeft(tile.x, tile.y) : clampedTopLeft(tile.x, tile.y);
  const valid = !plots.some((p, i) => i !== draggingIndex && overlaps(p, pos));
  return { pos, valid };
}

/**
 * Converts a viewport point to a tile coordinate using the SVG's own screen
 * transform, so it's correct regardless of how the viewBox is scaled to fit
 * the page - unlike dnd-kit's default drag translation, which moves a node
 * by real pixel deltas and would drift wildly inside a scaled viewBox.
 */
function screenToTile(svg: SVGSVGElement, clientX: number, clientY: number): PlotPos | null {
  if (typeof svg.createSVGPoint !== 'function' || typeof svg.getScreenCTM !== 'function') return null;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const local = point.matrixTransform(ctm.inverse());
  const x = Math.floor(local.x);
  const y = Math.floor(local.y);
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return null;
  return { x, y };
}

/** dnd-kit's setNodeRef is typed for HTMLElement; SVG elements measure and drag just as well. */
function svgNodeRef(setNodeRef: (element: HTMLElement | null) => void) {
  return (element: SVGGElement | null) => setNodeRef(element as unknown as HTMLElement | null);
}

interface PlacedPlotProps {
  index: number;
  plot: PlotPos;
  total: number;
  onRemove: (index: number) => void;
  onPointerEnter: () => void;
}

/** One placed plot: click to remove, drag to reposition (see candidateForDrag), Enter/Space to remove when focused. */
function PlacedPlot({ index, plot, total, onRemove, onPointerEnter }: PlacedPlotProps) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: index });

  return (
    <g
      ref={svgNodeRef(setNodeRef)}
      className={`arrangement-editor__plot-button drag-handle${isDragging ? ' arrangement-editor__plot-button--dragging' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Plot ${index + 1} of ${total} placed. Press to remove it, or drag to move it.`}
      onMouseEnter={onPointerEnter}
      onClick={(e) => {
        e.stopPropagation();
        onRemove(index);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRemove(index);
        }
      }}
      {...listeners}
    >
      <rect className="arrangement-editor__plot" x={plot.x} y={plot.y} width={PLOT_SIZE} height={PLOT_SIZE} rx={0.4} ry={0.4} />
      <text className="arrangement-editor__plot-label" x={plot.x + PLOT_SIZE / 2} y={plot.y + PLOT_SIZE / 2}>
        {index + 1}
      </text>
    </g>
  );
}

/**
 * Draws the 27x27-tile board and lets the player place up to 9 plots by
 * clicking empty tiles (adds) or placed plots (removes), or by dragging a
 * placed plot to a new spot.
 */
export default function ArrangementEditor() {
  const customPlots = useStore((s) => s.customPlots);
  const setCustomPlots = useStore((s) => s.setCustomPlots);
  const [snap, setSnap] = useState(true);
  const [hover, setHover] = useState<PlotPos | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragCandidate, setDragCandidate] = useState<{ pos: PlotPos; valid: boolean } | null>(null);

  const boardRef = useRef<SVGSVGElement | null>(null);
  // Swallows the native "ghost click" a browser fires on the drag target right
  // after a drag ends, so finishing a drag never also adds or removes a plot.
  const justDraggedRef = useRef(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const candidate = useMemo(() => {
    if (draggingIndex !== null) return null; // the drag preview takes over while repositioning
    if (!hover) return null;
    if (customPlots.length >= MAX_PLOTS) return null;
    if (plotIndexAt(customPlots, hover.x, hover.y) !== -1) return null;
    const topLeft = snap ? snappedTopLeft(hover.x, hover.y) : clampedTopLeft(hover.x, hover.y);
    if (customPlots.some((p) => overlaps(p, topLeft))) return null;
    return topLeft;
  }, [hover, snap, customPlots, draggingIndex]);

  function consumeJustDragged(): boolean {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return true;
    }
    return false;
  }

  function addOrRemoveAt(x: number, y: number) {
    setMessage(null);
    const existingIndex = plotIndexAt(customPlots, x, y);
    if (existingIndex !== -1) {
      setCustomPlots(customPlots.filter((_, i) => i !== existingIndex));
      return;
    }
    if (customPlots.length >= MAX_PLOTS) {
      setMessage(`A garden can have at most ${MAX_PLOTS} plots.`);
      return;
    }
    const topLeft = snap ? snappedTopLeft(x, y) : clampedTopLeft(x, y);
    if (customPlots.some((p) => overlaps(p, topLeft))) {
      setMessage('Plots can’t overlap.');
      return;
    }
    setCustomPlots([...customPlots, topLeft]);
  }

  function removeAt(index: number) {
    setMessage(null);
    setCustomPlots(customPlots.filter((_, i) => i !== index));
  }

  function handleRemoveClick(index: number) {
    if (consumeJustDragged()) return;
    removeAt(index);
  }

  function handleClear() {
    setMessage(null);
    setCustomPlots([]);
  }

  function handleStartBlock() {
    setMessage(null);
    setCustomPlots(threeByThreeBlock());
  }

  function handleBoardClick(e: MouseEvent<SVGSVGElement>) {
    if (consumeJustDragged()) return;
    const coords = tileCoordsFromTarget(e.target);
    if (coords) addOrRemoveAt(coords.x, coords.y);
  }

  function handleBoardMouseMove(e: MouseEvent<SVGSVGElement>) {
    const coords = tileCoordsFromTarget(e.target);
    if (!coords) return;
    setHover((prev) => (prev && prev.x === coords.x && prev.y === coords.y ? prev : coords));
  }

  function handleDragStart(e: DragStartEvent) {
    setMessage(null);
    setDraggingIndex(Number(e.active.id));
  }

  function handleDragMove(e: DragMoveEvent) {
    const svg = boardRef.current;
    const rect = e.active.rect.current.translated;
    const index = Number(e.active.id);
    if (!svg || !rect) return;
    const tile = screenToTile(svg, rect.left + rect.width / 2, rect.top + rect.height / 2);
    setDragCandidate(tile ? candidateForDrag(customPlots, index, tile, snap) : null);
  }

  function handleDragEnd(e: DragEndEvent) {
    const index = Number(e.active.id);
    justDraggedRef.current = true;
    setTimeout(() => {
      justDraggedRef.current = false;
    }, 0);

    if (dragCandidate && dragCandidate.valid) {
      setCustomPlots(customPlots.map((p, i) => (i === index ? dragCandidate.pos : p)));
    }
    setDraggingIndex(null);
    setDragCandidate(null);
  }

  function handleDragCancel() {
    setDraggingIndex(null);
    setDragCandidate(null);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="arrangement-editor">
        <label className="arrangement-editor__snap">
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
          Line up plots on a 3-tile grid
        </label>

        <div className="arrangement-editor__board-wrap">
          <svg
            ref={boardRef}
            className="arrangement-editor__board"
            viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
            role="group"
            aria-label="Garden plot arrangement editor"
            onClick={handleBoardClick}
            onMouseMove={handleBoardMouseMove}
            onMouseLeave={() => setHover(null)}
          >
            <rect className="arrangement-editor__board-bg" x={0} y={0} width={BOARD_SIZE} height={BOARD_SIZE} />

            {ALL_TILES.map(({ x, y }) => (
              <rect
                key={`${x}-${y}`}
                className="arrangement-editor__tile"
                data-testid={`tile-${x}-${y}`}
                data-x={x}
                data-y={y}
                x={x}
                y={y}
                width={1}
                height={1}
              />
            ))}

            {candidate && (
              <rect
                className="arrangement-editor__preview"
                x={candidate.x}
                y={candidate.y}
                width={PLOT_SIZE}
                height={PLOT_SIZE}
                rx={0.4}
                ry={0.4}
              />
            )}

            {dragCandidate && (
              <rect
                className={`arrangement-editor__drop-preview${dragCandidate.valid ? '' : ' arrangement-editor__drop-preview--invalid'}`}
                x={dragCandidate.pos.x}
                y={dragCandidate.pos.y}
                width={PLOT_SIZE}
                height={PLOT_SIZE}
                rx={0.4}
                ry={0.4}
              />
            )}

            {customPlots.map((plot, index) => (
              <PlacedPlot
                key={index}
                index={index}
                plot={plot}
                total={customPlots.length}
                onRemove={handleRemoveClick}
                onPointerEnter={() => setHover(null)}
              />
            ))}
          </svg>
        </div>

        <div className="arrangement-editor__toolbar">
          <button type="button" className="btn btn--sm" onClick={handleClear}>
            Clear
          </button>
          <button type="button" className="btn btn--sm" onClick={handleStartBlock}>
            Start with a 3x3 block
          </button>
        </div>

        <p className="arrangement-editor__status" aria-live="polite">
          {customPlots.length} of {MAX_PLOTS} plots placed
        </p>
        {message && (
          <p className="issue issue--error" role="status">
            Error: {message}
          </p>
        )}
      </div>
    </DndContext>
  );
}
