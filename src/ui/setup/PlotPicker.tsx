/**
 * Plot count as a 3x3 grid of small squares (Suggest-best mode only; Draw my
 * own derives its count from the plots drawn on the board). Pressing the
 * k-th square sets the plot count to k.
 */
import { RULES } from '../../engine/rules';
import { useStore } from '../state/store';

const CELLS = Array.from({ length: RULES.maxPlots }, (_, i) => i + 1);

export default function PlotPicker() {
  const plotCount = useStore((s) => s.settings.plotCount);
  const setPlotCount = useStore((s) => s.setPlotCount);

  return (
    <div className="plot-picker">
      <span className="field-label" id="plot-picker-label">
        Plots
      </span>
      <div className="plot-picker__grid" role="group" aria-labelledby="plot-picker-label">
        {CELLS.map((k) => (
          <button
            key={k}
            type="button"
            className="plot-picker__cell"
            aria-pressed={k <= plotCount}
            aria-label={`${k} plot${k === 1 ? '' : 's'}`}
            onClick={() => setPlotCount(k)}
          >
            <span className="plot-picker__mark" aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="plot-picker__value">
        {plotCount} plot{plotCount === 1 ? '' : 's'}
      </p>
    </div>
  );
}
