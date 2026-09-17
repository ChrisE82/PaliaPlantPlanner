/**
 * Placeholder for the results panel: garden grid, goal summary, alternatives,
 * shopping list and planner progress (PLAN.md section 6, right panel).
 *
 * The agent building results should replace this component's contents.
 * GardenSetup's `onPlan` prop (see src/ui/setup/GardenSetup.tsx and where
 * it's wired in src/ui/App.tsx) is the hook for starting a planner run;
 * the zustand store at src/ui/state/store.ts is where run/progress/result
 * state should live alongside the existing settings state.
 */
export default function ResultsPanel() {
  return (
    <section className="panel results-panel" aria-label="Results">
      <p>Set your goals, then plan your garden.</p>
    </section>
  );
}
