import { useStore } from '../state/store';
import { useNumberField } from '../useNumberField';

/** Optional field that hides crops above the player's Gardening level. */
export default function GardeningLevelField() {
  const gardeningLevel = useStore((s) => s.settings.gardeningLevel);
  const setGardeningLevel = useStore((s) => s.setGardeningLevel);
  const field = useNumberField(gardeningLevel, setGardeningLevel, { min: 1 });

  return (
    <div className="field">
      <label htmlFor="gardening-level">Your Gardening level</label>
      <div>
        <input
          id="gardening-level"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      </div>
      <p className="field-hint">Blank shows every crop, including ones you may not be able to plant yet.</p>
    </div>
  );
}
