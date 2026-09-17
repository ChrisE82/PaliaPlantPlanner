import { CROPS } from '../../data/crops';
import { goalCropIds } from '../../engine/goals';
import { BUFF_NAMES } from '../../engine/types';
import CropSwatch from '../CropSwatch';
import { useStore } from '../state/store';
import { visibleCrops } from './cropVisibility';

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
    <div className="helper-picker">
      <p className="helper-picker__intro muted">
        Helpers are extra crops the planner may plant to give buffs or fill space.
      </p>
      <div className="helper-picker__toolbar">
        <button type="button" onClick={selectAll}>
          Select all
        </button>
        <button type="button" onClick={() => setHelpers([])}>
          Clear
        </button>
      </div>
      <div className="helper-picker__wrap">
        {crops.map((crop) => {
          const usedInGoal = inGoals.has(crop.id);
          const pressed = usedInGoal || helpers.includes(crop.id);
          return (
            <button
              key={crop.id}
              type="button"
              className="helper-chip"
              aria-pressed={pressed}
              disabled={usedInGoal}
              onClick={() => toggleHelper(crop.id)}
            >
              <CropSwatch crop={crop} />
              <span className="helper-chip__text">
                <span>{crop.name}</span>
                {crop.buff && <span className="helper-chip__buff">{BUFF_NAMES[crop.buff]}</span>}
                {usedInGoal && <span className="helper-chip__note">In a goal</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
