import { useMemo } from 'react';
import { CROPS } from '../../data/crops';
import { precheck } from '../../engine/precheck';
import { useStore } from '../state/store';
import GardenCard from './GardenCard';
import GoalBoard from './GoalBoard';
import HelperPicker from './HelperPicker';
import PlanAction from './PlanAction';

export interface GardenSetupProps {
  /** Wired up once the results panel can run the planner (see PLAN.md section 5). */
  onPlan?: () => void;
}

/**
 * The rail: the Garden, Goals and Helpers cards, then the plan action (see
 * PLAN.md sections 4 and 6). Each card owns its own layout; this component
 * just computes the shared precheck once and wires up the plan button.
 */
export default function GardenSetup({ onPlan }: GardenSetupProps) {
  const settings = useStore((s) => s.settings);
  const status = useStore((s) => s.status);

  const issues = useMemo(() => precheck(settings, CROPS), [settings]);
  const errorCount = useMemo(() => issues.filter((i) => i.severity === 'error').length, [issues]);
  const isRunning = status === 'running';
  const canPlan = errorCount === 0 && !isRunning;

  return (
    <>
      <GardenCard />
      <GoalBoard issues={issues} />
      <HelperPicker />
      <PlanAction onPlan={onPlan} canPlan={canPlan} isRunning={isRunning} errorCount={errorCount} />
    </>
  );
}
