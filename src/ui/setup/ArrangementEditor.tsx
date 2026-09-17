import { useMemo, useState, type MouseEvent } from 'react';
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
 * Draws the 27x27-tile board and lets the player place up to 9 plots by
 * clicking empty tiles (adds) or placed plots (removes).
 */
export default function ArrangementEditor() {
  const customPlots = useStore((s) => s.customPlots);
  const setCustomPlots = useStore((s) => s.setCustomPlots);
  const [snap, setSnap] = useState(true);
  const [hover, setHover] = useState<PlotPos | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const candidate = useMemo(() => {
    if (!hover) return null;
    if (customPlots.length >= MAX_PLOTS) return null;
    if (plotIndexAt(customPlots, hover.x, hover.y) !== -1) return null;
    const topLeft = snap ? snappedTopLeft(hover.x, hover.y) : clampedTopLeft(hover.x, hover.y);
    if (customPlots.some((p) => overlaps(p, topLeft))) return null;
    return topLeft;
  }, [hover, snap, customPlots]);

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

  function handleClear() {
    setMessage(null);
    setCustomPlots([]);
  }

  function handleStartBlock() {
    setMessage(null);
    setCustomPlots(threeByThreeBlock());
  }

  function handleBoardClick(e: MouseEvent<SVGSVGElement>) {
    const coords = tileCoordsFromTarget(e.target);
    if (coords) addOrRemoveAt(coords.x, coords.y);
  }

  function handleBoardMouseMove(e: MouseEvent<SVGSVGElement>) {
    const coords = tileCoordsFromTarget(e.target);
    if (!coords) return;
    setHover((prev) => (prev && prev.x === coords.x && prev.y === coords.y ? prev : coords));
  }

  return (
    <div className="arrangement-editor">
      <label>
        <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
        Line up plots on a 3-tile grid
      </label>

      <div className="arrangement-editor__board-wrap">
        <svg
          className="arrangement-editor__board"
          viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
          role="group"
          aria-label="Garden plot arrangement editor"
          onClick={handleBoardClick}
          onMouseMove={handleBoardMouseMove}
          onMouseLeave={() => setHover(null)}
        >
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
            />
          )}

          {customPlots.map((plot, index) => (
            <g
              key={`${plot.x}-${plot.y}`}
              role="button"
              tabIndex={0}
              aria-label={`Plot ${index + 1} of ${customPlots.length} placed. Press to remove it.`}
              onMouseEnter={() => setHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                removeAt(index);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  removeAt(index);
                }
              }}
            >
              <rect className="arrangement-editor__plot" x={plot.x} y={plot.y} width={PLOT_SIZE} height={PLOT_SIZE} />
              <text className="arrangement-editor__plot-label" x={plot.x + PLOT_SIZE / 2} y={plot.y + PLOT_SIZE / 2}>
                {index + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="arrangement-editor__toolbar">
        <button type="button" onClick={handleClear}>
          Clear
        </button>
        <button type="button" onClick={handleStartBlock}>
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
  );
}
