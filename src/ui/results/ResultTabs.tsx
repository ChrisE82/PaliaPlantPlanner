/**
 * A segmented tab control switching the detail panel under the grid between
 * the goal summary, the comparison table and the seed list, so the results
 * column stays shorter (project task spec, results redesign). Compare is
 * left out when there's nothing to compare (a single solution).
 */
export type ResultTab = 'goals' | 'compare' | 'seeds';

const TAB_LABELS: Record<ResultTab, string> = {
  goals: 'Goals',
  compare: 'Compare',
  seeds: 'Seeds',
};

export interface ResultTabsProps {
  tab: ResultTab;
  onChange: (tab: ResultTab) => void;
  /** False hides the Compare tab: comparing needs at least two solutions. */
  showCompare: boolean;
}

export default function ResultTabs({ tab, onChange, showCompare }: ResultTabsProps) {
  const tabs: ResultTab[] = showCompare ? ['goals', 'compare', 'seeds'] : ['goals', 'seeds'];

  return (
    <div className="segmented result-tabs" role="tablist" aria-label="Result details">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          id={`result-tab-${t}`}
          aria-selected={tab === t}
          aria-controls={`result-tabpanel-${t}`}
          className={`result-tabs__tab${tab === t ? ' result-tabs__tab--selected' : ''}`}
          onClick={() => onChange(t)}
        >
          {TAB_LABELS[t]}
        </button>
      ))}
    </div>
  );
}
