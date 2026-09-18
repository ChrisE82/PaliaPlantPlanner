/**
 * The Garden card: plot count, arrangement mode, and the collapsed Options
 * (space limit, Gardening level). No dropdowns or number fields.
 */
import { useStore } from '../state/store';
import ArrangementEditor from './ArrangementEditor';
import GardenOptions from './GardenOptions';
import PlotPicker from './PlotPicker';

export default function GardenSettings() {
  const isSuggest = useStore((s) => s.settings.arrangement.mode === 'suggest');
  const customPlotCount = useStore((s) => s.customPlots.length);
  const setArrangementMode = useStore((s) => s.setArrangementMode);

  return (
    <section className="card garden-settings" aria-label="Garden">
      <div className="card__header">
        <h2 className="card__title">Garden</h2>
      </div>

      <div className="stack">
        {isSuggest ? (
          <PlotPicker />
        ) : (
          <p className="garden-settings__plot-count">
            <span className="stepper__value">{customPlotCount}</span>{' '}
            <span className="muted">plot{customPlotCount === 1 ? '' : 's'}</span>
          </p>
        )}

        <fieldset className="field">
          <legend className="field-label">Arrangement</legend>
          <div className="segmented">
            <label className="segmented__option">
              <input type="radio" name="arrangement-mode" checked={isSuggest} onChange={() => setArrangementMode('suggest')} />
              <span className="segmented__label">Suggest best</span>
            </label>
            <label className="segmented__option">
              <input type="radio" name="arrangement-mode" checked={!isSuggest} onChange={() => setArrangementMode('custom')} />
              <span className="segmented__label">Draw my own</span>
            </label>
          </div>
        </fieldset>

        {!isSuggest && <ArrangementEditor />}

        <GardenOptions />
      </div>
    </section>
  );
}
