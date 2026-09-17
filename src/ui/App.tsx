import { CROP_DATA } from '../data/crops';
import { SproutIcon } from './icons';
import ResultsPanel from './results/ResultsPanel';
import { useRunPlanner } from './results/useRunPlanner';
import GardenSetup from './setup/GardenSetup';
import ThemeToggle from './ThemeToggle';

export default function App() {
  const { run, stop, reoptimize } = useRunPlanner();

  return (
    <div className="app">
      <header className="app-bar">
        <div className="app-bar__inner">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">
              <SproutIcon />
            </span>
            <span className="brand__text">
              <h1 className="brand__title">Palia Plant Planner</h1>
              <span className="brand__subtitle">
                Plan a garden from goals: how many of each crop, which buffs they get, and how to arrange your plots.
              </span>
            </span>
          </div>
          <div className="app-bar__actions">
            <a className="btn btn--ghost btn--sm app-bar__data" href="#sources">
              Crop data {CROP_DATA.checkedOn}
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="rail">
          <GardenSetup onPlan={run} />
        </div>
        <div className="canvas">
          <ResultsPanel onStop={stop} onReoptimize={reoptimize} />
        </div>
      </main>

      <footer className="sources" id="sources" tabIndex={-1}>
        <h2>Crop data sources</h2>
        <p className="muted">
          Unofficial fan tool. Not affiliated with, endorsed by or sponsored by Singularity 6 or Daybreak Game Company.
          Palia, its crop names and the crop icons shown here are their property.
        </p>
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
