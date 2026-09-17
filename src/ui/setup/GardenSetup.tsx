import { useMemo } from 'react';
import { CROPS } from '../../data/crops';
import { precheck } from '../../engine/precheck';
import { RULES } from '../../engine/rules';
import { SEARCH_TIME_OPTIONS, type SearchTime } from '../results/planTiming';
import { useStore } from '../state/store';
import { useNumberField } from '../useNumberField';
import ArrangementEditor from './ArrangementEditor';
import GardeningLevelField from './GardeningLevelField';
import GoalList from './GoalList';
import HelperPicker from './HelperPicker';

export interface GardenSetupProps {
  /** Wired up once the results panel can run the planner (see PLAN.md section 5). */
  onPlan?: () => void;
}

/** The left-hand setup panel: plots, arrangement, goals and helpers. */
export default function GardenSetup({ onPlan }: GardenSetupProps) {
  const settings = useStore((s) => s.settings);
  const customPlots = useStore((s) => s.customPlots);
  const spaceLimit = useStore((s) => s.spaceLimit);
  const setPlotCount = useStore((s) => s.setPlotCount);
  const setArrangementMode = useStore((s) => s.setArrangementMode);
  const setSpaceLimit = useStore((s) => s.setSpaceLimit);
  const searchTime = useStore((s) => s.searchTime);
  const setSearchTime = useStore((s) => s.setSearchTime);
  const status = useStore((s) => s.status);

  const issues = useMemo(() => precheck(settings, CROPS), [settings]);
  const errorCount = useMemo(() => issues.filter((i) => i.severity === 'error').length, [issues]);
  const isRunning = status === 'running';
  const canPlan = errorCount === 0 && !isRunning;

  const isSuggest = settings.arrangement.mode === 'suggest';

  const widthField = useNumberField(spaceLimit.width, (w) => setSpaceLimit(w, spaceLimit.height), { min: 1 });
  const heightField = useNumberField(spaceLimit.height, (h) => setSpaceLimit(spaceLimit.width, h), { min: 1 });

  return (
    <section className="panel setup-panel" aria-label="Garden setup">
      <h2>Garden</h2>

      <section>
        {isSuggest ? (
          <div className="field">
            <span id="plots-label">Plots</span>
            <div className="stepper" role="group" aria-labelledby="plots-label">
              <button
                type="button"
                aria-label="Fewer plots"
                onClick={() => setPlotCount(settings.plotCount - 1)}
                disabled={settings.plotCount <= 1}
              >
                &minus;
              </button>
              <span className="stepper__value">{settings.plotCount}</span>
              <button
                type="button"
                aria-label="More plots"
                onClick={() => setPlotCount(settings.plotCount + 1)}
                disabled={settings.plotCount >= RULES.maxPlots}
              >
                +
              </button>
            </div>
          </div>
        ) : (
          <p>Plots: {customPlots.length}</p>
        )}

        <fieldset>
          <legend>Arrangement</legend>
          <div className="radio-group">
            <label>
              <input
                type="radio"
                name="arrangement-mode"
                checked={isSuggest}
                onChange={() => setArrangementMode('suggest')}
              />
              Suggest the best arrangement
            </label>
            <label>
              <input
                type="radio"
                name="arrangement-mode"
                checked={!isSuggest}
                onChange={() => setArrangementMode('custom')}
              />
              Use my own arrangement
            </label>
          </div>
        </fieldset>

        {isSuggest ? (
          <div className="field">
            <span id="space-limit-label">Space limit</span>
            <div className="field-row" role="group" aria-labelledby="space-limit-label">
              <label htmlFor="space-limit-width">Width</label>
              <input
                id="space-limit-width"
                type="number"
                min={1}
                step={1}
                value={widthField.value}
                onChange={widthField.onChange}
                onBlur={widthField.onBlur}
              />
              <label htmlFor="space-limit-height">Height</label>
              <input
                id="space-limit-height"
                type="number"
                min={1}
                step={1}
                value={heightField.value}
                onChange={heightField.onChange}
                onBlur={heightField.onBlur}
              />
            </div>
            <p className="field-hint">Only suggest arrangements that fit this space, in either direction.</p>
          </div>
        ) : (
          <ArrangementEditor />
        )}
      </section>

      <section>
        <GardeningLevelField />
      </section>

      <section>
        <h2>Goals</h2>
        <GoalList issues={issues} />
      </section>

      <section>
        <h2>Helpers</h2>
        <HelperPicker />
      </section>

      <div className="plan-action">
        <div className="field">
          <label htmlFor="search-time">Search time</label>
          <select
            id="search-time"
            value={searchTime}
            onChange={(e) => setSearchTime(e.target.value as SearchTime)}
          >
            {SEARCH_TIME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="primary" disabled={!canPlan} onClick={onPlan}>
          {isRunning ? 'Planning...' : 'Plan my garden'}
        </button>
        {!canPlan && errorCount > 0 && (
          <p className="plan-action__reason">
            {errorCount === 1 ? 'Fix the error above before planning.' : `Fix the ${errorCount} errors above before planning.`}
          </p>
        )}
      </div>
    </section>
  );
}
