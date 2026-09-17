/**
 * React context for the PlannerClient (project task spec, Task A step 1).
 * The default client is a real Web Worker pool, created lazily on first
 * render so importing this module never starts workers by itself. Tests
 * pass a fake `client` prop instead.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { PlannerClient } from '../../engine/types';
import { createWorkerPlannerClient } from '../../worker/workerClient';

const PlannerClientContext = createContext<PlannerClient | null>(null);

export interface PlannerClientProviderProps {
  /** Supply a fake client in tests; omit to use a lazily-created worker pool client. */
  client?: PlannerClient;
  children: ReactNode;
}

export function PlannerClientProvider({ client, children }: PlannerClientProviderProps) {
  const value = useMemo(() => client ?? createWorkerPlannerClient(), [client]);
  return <PlannerClientContext.Provider value={value}>{children}</PlannerClientContext.Provider>;
}

export function usePlannerClient(): PlannerClient {
  const client = useContext(PlannerClientContext);
  if (!client) throw new Error('usePlannerClient must be used within a PlannerClientProvider.');
  return client;
}
