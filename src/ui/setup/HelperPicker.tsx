import { CROPS } from '../../data/crops';
import { goalCropIds } from '../../engine/goals';
import { BUFF_NAMES } from '../../engine/types';
import CropSwatch from '../CropSwatch';
import { useStore } from '../state/store';
import { visibleCrops } from './cropVisibility';

/** The Helpers card: a wrap of toggleable crop chips, plus Select all / Clear. */
export default function HelperPicker() {
  const gardeningLevel = useStore((s) => s.settings.gardeningLevel);
  const goals = useStore((s) => s.settings.goals);
  const helpers = useStore((s) => s.settings.helpers);
  const toggleHelper = useStore((s) => s.toggleHelper);
  const setHelpers = useStore((s) => s.setHelpers);

  const inGoals = goalCropIds(goals);
  const crops = visibleCrops(CROPS, gardeningLevel);

  function selectAll() {
    setHelpers(crops.filter((c) => !inGoals.has(c.id)).map((c) => c.id));
  }

  return (
    <section className="card" aria-label="Helpers">
      <div className="card__header">
        <h2 className="card__title">Helpers</h2>
        <div className="card__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={selectAll}>
            Select all
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setHelpers([])}>
            Clear
          </button>
        </div>
      </div>

      <p className="helper-picker__intro text-sm muted">
        Helpers are extra crops the planner may plant to give buffs or fill space.
      </p>

      <div className="helper-picker__wrap">
        {crops.map((crop) => {
          const usedInGoal = inGoals.has(crop.id);
          const pressed = usedInGoal || helpers.includes(crop.id);
          return (
            <button
              key={crop.id}
              type="button"
              className="chip helper-chip"
              aria-pressed={pressed}
              disabled={usedInGoal}
              onClick={() => toggleHelper(crop.id)}
            >
              <CropSwatch crop={crop} size="small" />
              <span className="helper-chip__text">
                <span>{crop.name}</span>
                {crop.buff && <span className="helper-chip__buff text-xs muted">{BUFF_NAMES[crop.buff]}</span>}
              </span>
              {usedInGoal && <span className="badge">In a goal</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
