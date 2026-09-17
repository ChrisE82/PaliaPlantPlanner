import { useMemo, type ChangeEvent } from 'react';
import { CROPS } from '../../data/crops';
import { precheck } from '../../engine/precheck';
import { RULES } from '../../engine/rules';
import { useStore } from '../state/store';
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

  const issues = useMemo(() => precheck(settings, CROPS), [settings]);
  const errorCount = useMemo(() => issues.filter((i) => i.severity === 'error').length, [issues]);
  const canPlan = errorCount === 0;

  const isSuggest = settings.arrangement.mode === 'suggest';

  function handleWidthChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setSpaceLimit(raw === '' ? null : Math.max(1, Math.round(Number(raw))), spaceLimit.height);
  }

  function handleHeightChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setSpaceLimit(spaceLimit.width, raw === '' ? null : Math.max(1, Math.round(Number(raw))));
  }

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
                value={spaceLimit.width ?? ''}
                onChange={handleWidthChange}
              />
              <label htmlFor="space-limit-height">Height</label>
              <input
                id="space-limit-height"
                type="number"
                min={1}
                step={1}
                value={spaceLimit.height ?? ''}
                onChange={handleHeightChange}
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
        <button type="button" className="primary" disabled={!canPlan} onClick={onPlan}>
          Plan my garden
        </button>
        {!canPlan && (
          <p className="plan-action__reason">
            {errorCount === 1 ? 'Fix the error above before planning.' : `Fix the ${errorCount} errors above before planning.`}
          </p>
        )}
      </div>
    </section>
  );
}
