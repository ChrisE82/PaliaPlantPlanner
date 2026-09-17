import { useState } from 'react';
import { RULES } from '../../engine/rules';
import { MinusIcon, PlusIcon } from '../icons';
import { useStore } from '../state/store';
import { useNumberField } from '../useNumberField';
import ArrangementEditor from './ArrangementEditor';
import GardeningLevelField from './GardeningLevelField';

/** The Garden card: plot count, arrangement mode, the optional space limit, and the player's Gardening level. */
export default function GardenCard() {
  const settings = useStore((s) => s.settings);
  const customPlots = useStore((s) => s.customPlots);
  const spaceLimit = useStore((s) => s.spaceLimit);
  const setPlotCount = useStore((s) => s.setPlotCount);
  const setArrangementMode = useStore((s) => s.setArrangementMode);
  const setSpaceLimit = useStore((s) => s.setSpaceLimit);

  const isSuggest = settings.arrangement.mode === 'suggest';
  const hasSpaceLimit = spaceLimit.width !== null || spaceLimit.height !== null;
  const [spaceLimitOpen, setSpaceLimitOpen] = useState(hasSpaceLimit);

  const widthField = useNumberField(spaceLimit.width, (w) => setSpaceLimit(w, spaceLimit.height), { min: 1 });
  const heightField = useNumberField(spaceLimit.height, (h) => setSpaceLimit(spaceLimit.width, h), { min: 1 });

  return (
    <section className="card" aria-label="Garden">
      <div className="card__header">
        <h2 className="card__title">Garden</h2>
      </div>

      <div className="stack">
        <div className="garden-card__top">
          {isSuggest ? (
            <div className="field">
              <span className="field-label" id="plots-label">
                Plots
              </span>
              <div className="stepper" role="group" aria-labelledby="plots-label">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Fewer plots"
                  onClick={() => setPlotCount(settings.plotCount - 1)}
                  disabled={settings.plotCount <= 1}
                >
                  <MinusIcon />
                </button>
                <span className="stepper__value">{settings.plotCount}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="More plots"
                  onClick={() => setPlotCount(settings.plotCount + 1)}
                  disabled={settings.plotCount >= RULES.maxPlots}
                >
                  <PlusIcon />
                </button>
                <span className="stepper__label muted">plots</span>
              </div>
            </div>
          ) : (
            <p className="garden-card__plot-count">
              <span className="stepper__value">{customPlots.length}</span> <span className="muted">plots</span>
            </p>
          )}

          <fieldset className="field">
            <legend className="field-label">Arrangement</legend>
            <div className="segmented">
              <label className="segmented__option">
                <input
                  type="radio"
                  name="arrangement-mode"
                  checked={isSuggest}
                  onChange={() => setArrangementMode('suggest')}
                />
                <span className="segmented__label">Suggest best</span>
              </label>
              <label className="segmented__option">
                <input
                  type="radio"
                  name="arrangement-mode"
                  checked={!isSuggest}
                  onChange={() => setArrangementMode('custom')}
                />
                <span className="segmented__label">Draw my own</span>
              </label>
            </div>
          </fieldset>
        </div>

        {isSuggest ? (
          <details
            className="garden-card__space-limit"
            open={spaceLimitOpen}
            onToggle={(e) => setSpaceLimitOpen(e.currentTarget.open)}
          >
            <summary>Space limit (optional)</summary>
            <div className="field">
              <span className="visually-hidden" id="space-limit-label">
                Space limit
              </span>
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
                <span className="garden-card__unit muted">tiles</span>
              </div>
              <p className="field-hint">Only suggest arrangements that fit this space, in either direction.</p>
            </div>
          </details>
        ) : (
          <ArrangementEditor />
        )}

        <GardeningLevelField />
      </div>
    </section>
  );
}
