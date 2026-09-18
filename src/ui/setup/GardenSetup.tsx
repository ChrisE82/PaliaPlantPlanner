import { useMemo } from 'react';
import { CROPS } from '../../data/crops';
import { precheck } from '../../engine/precheck';
import GoalsBoard from '../goals/GoalsBoard';
import HelpersTray from '../goals/HelpersTray';
import { useStore } from '../state/store';
import GardenSettings from './GardenSettings';
import PlanAction from './PlanAction';

export interface GardenSetupProps {
  /** Wired up once the results panel can run the planner (see PLAN.md section 5). */
  onPlan?: () => void;
}

/**
 * The setup side: the Goals board, Helpers tray, Garden settings, then the
 * plan action (see PLAN.md sections 4 and 6, and the task spec's Goals
 * board / Garden settings). Computes the shared precheck once and wires up
 * the plan button; each piece owns its own layout and drag-and-drop.
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
      <GoalsBoard issues={issues} />
      <HelpersTray />
      <GardenSettings />
      <PlanAction onPlan={onPlan} canPlan={canPlan} isRunning={isRunning} errorCount={errorCount} />
    </>
  );
}
