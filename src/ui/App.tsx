import { CROP_DATA } from '../data/crops';
import ResultsPanel from './results/ResultsPanel';
import { useRunPlanner } from './results/useRunPlanner';
import GardenSetup from './setup/GardenSetup';

export default function App() {
  const { run, stop, reoptimize } = useRunPlanner();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Palia Plant Planner</h1>
        <p className="app-header__description">
          Plan a garden from goals: how many of each crop, which buffs they get, and how to arrange your plots.
        </p>
        <p className="app-header__note muted">
          <a href="#sources">Crop data checked {CROP_DATA.checkedOn}</a>
        </p>
      </header>

      <main className="app-main">
        <GardenSetup onPlan={run} />
        <ResultsPanel onStop={stop} onReoptimize={reoptimize} />
      </main>

      <footer className="sources" id="sources" tabIndex={-1}>
        <h2>Crop data sources</h2>
        <p className="muted">{CROP_DATA.note}</p>
        <ul>
          {CROP_DATA.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.label}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
}
