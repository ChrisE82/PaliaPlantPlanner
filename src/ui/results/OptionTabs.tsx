/**
 * Tabs for switching between solutions: "Best" / "Option 2" / "Option 3",
 * each with the arrangement label and a small plot-shape thumbnail (project
 * task spec, Task A step 5).
 */
import { RULES } from '../../engine/rules';
import type { LayoutSolution, PlotPos } from '../../engine/types';

const TAB_NAMES = ['Best', 'Option 2', 'Option 3'];

export interface OptionTabsProps {
  solutions: readonly LayoutSolution[];
  /** Parallel to solutions: true once a tab's displayed layout has been edited. */
  editedFlags: readonly boolean[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export default function OptionTabs({ solutions, editedFlags, selectedIndex, onSelect }: OptionTabsProps) {
  if (solutions.length <= 1) return null;

  return (
    <div className="option-tabs" role="tablist" aria-label="Layout options">
      {solutions.map((s, i) => {
        const name = TAB_NAMES[i] ?? `Option ${i + 1}`;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === selectedIndex}
            className={`option-tabs__tab${i === selectedIndex ? ' option-tabs__tab--selected' : ''}`}
            onClick={() => onSelect(i)}
          >
            <PlotShapeThumbnail plots={s.plots} />
            <span className="option-tabs__text">
              <span className="option-tabs__name">{editedFlags[i] ? `${name} (edited)` : name}</span>
              <span className="option-tabs__arrangement muted">{s.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PlotShapeThumbnail({ plots }: { plots: readonly PlotPos[] }) {
  const size = RULES.plotSize;
  const maxX = Math.max(...plots.map((p) => p.x)) + size;
  const maxY = Math.max(...plots.map((p) => p.y)) + size;
  return (
    <svg className="option-tabs__thumb" viewBox={`0 0 ${maxX} ${maxY}`} aria-hidden="true">
      {plots.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={size} height={size} />
      ))}
    </svg>
  );
}
