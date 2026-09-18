/**
 * Collapsed-by-default extras: the space limit (Suggest-best mode only) and
 * the player's Gardening level, each a range slider with the value shown as
 * text (no number inputs).
 */
import { useState } from 'react';
import { useStore } from '../state/store';

const SPACE_MIN_TILES = 3;
const SPACE_MAX_TILES = 30;
/** Slider value one below the smallest real limit: reads as "Off". */
const SPACE_OFF = SPACE_MIN_TILES - 1;

const LEVEL_MAX = 30;
/** Slider value below the smallest real level: reads as "Any". */
const LEVEL_ANY = 0;

function spaceLabel(tiles: number | null): string {
  return tiles === null ? 'Off' : `${tiles} tiles`;
}

function levelLabel(level: number | null): string {
  return level === null ? 'Any' : `Level ${level}`;
}

export default function GardenOptions() {
  const isSuggest = useStore((s) => s.settings.arrangement.mode === 'suggest');
  const spaceLimit = useStore((s) => s.spaceLimit);
  const setSpaceLimit = useStore((s) => s.setSpaceLimit);
  const gardeningLevel = useStore((s) => s.settings.gardeningLevel);
  const setGardeningLevel = useStore((s) => s.setGardeningLevel);
  const [open, setOpen] = useState(false);

  return (
    <details className="garden-options" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Options</summary>
      <div className="garden-options__body stack">
        {isSuggest && (
          <div className="range-field">
            <div className="range-field__row">
              <label htmlFor="space-width" className="field-label">
                Width limit
              </label>
              <span className="range-field__value">{spaceLabel(spaceLimit.width)}</span>
            </div>
            <input
              id="space-width"
              type="range"
              min={SPACE_OFF}
              max={SPACE_MAX_TILES}
              step={1}
              value={spaceLimit.width ?? SPACE_OFF}
              aria-valuetext={spaceLabel(spaceLimit.width)}
              onChange={(e) => {
                const raw = Number(e.target.value);
                setSpaceLimit(raw <= SPACE_OFF ? null : raw, spaceLimit.height);
              }}
            />
          </div>
        )}

        {isSuggest && (
          <div className="range-field">
            <div className="range-field__row">
              <label htmlFor="space-height" className="field-label">
                Height limit
              </label>
              <span className="range-field__value">{spaceLabel(spaceLimit.height)}</span>
            </div>
            <input
              id="space-height"
              type="range"
              min={SPACE_OFF}
              max={SPACE_MAX_TILES}
              step={1}
              value={spaceLimit.height ?? SPACE_OFF}
              aria-valuetext={spaceLabel(spaceLimit.height)}
              onChange={(e) => {
                const raw = Number(e.target.value);
                setSpaceLimit(spaceLimit.width, raw <= SPACE_OFF ? null : raw);
              }}
            />
            <p className="field-hint">Only suggest arrangements that fit this space, in either direction.</p>
          </div>
        )}

        <div className="range-field">
          <div className="range-field__row">
            <label htmlFor="gardening-level" className="field-label">
              Your Gardening level
            </label>
            <span className="range-field__value">{levelLabel(gardeningLevel)}</span>
          </div>
          <input
            id="gardening-level"
            type="range"
            min={LEVEL_ANY}
            max={LEVEL_MAX}
            step={1}
            value={gardeningLevel ?? LEVEL_ANY}
            aria-valuetext={levelLabel(gardeningLevel)}
            onChange={(e) => {
              const raw = Number(e.target.value);
              setGardeningLevel(raw <= LEVEL_ANY ? null : raw);
            }}
          />
          <p className="field-hint">Hides crops you may not be able to plant yet.</p>
        </div>
      </div>
    </details>
  );
}
