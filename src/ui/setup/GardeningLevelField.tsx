import { useStore } from '../state/store';

/** Optional field that hides crops above the player's Gardening level. */
export default function GardeningLevelField() {
  const gardeningLevel = useStore((s) => s.settings.gardeningLevel);
  const setGardeningLevel = useStore((s) => s.setGardeningLevel);

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
          value={gardeningLevel ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            setGardeningLevel(raw === '' ? null : Number(raw));
          }}
        />
      </div>
      <p className="field-hint">Blank shows every crop, including ones you may not be able to plant yet.</p>
    </div>
  );
}
