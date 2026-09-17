// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PlannerClientProvider, usePlannerClient } from './plannerClient';
import { createFakePlannerClient } from '../testHelpers';

afterEach(() => {
  cleanup();
});

describe('usePlannerClient', () => {
  it('throws when used outside a PlannerClientProvider', () => {
    // Suppress the expected React error-boundary console noise for this case.
    const { result } = renderHook(() => {
      try {
        usePlannerClient();
        return null;
      } catch (err) {
        return err;
      }
    });
    expect(result.current).toBeInstanceOf(Error);
    expect((result.current as Error).message).toMatch(/PlannerClientProvider/);
  });

  it('returns the injected client unchanged', () => {
    const fake = createFakePlannerClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PlannerClientProvider client={fake}>{children}</PlannerClientProvider>
    );
    const { result } = renderHook(() => usePlannerClient(), { wrapper });
    expect(result.current).toBe(fake);
  });

  it('makes the same client available to every consumer in the tree', () => {
    const fake = createFakePlannerClient();
    let seen: unknown[] = [];
    function Probe() {
      seen.push(usePlannerClient());
      return <span>ok</span>;
    }
    render(
      <PlannerClientProvider client={fake}>
        <Probe />
        <Probe />
      </PlannerClientProvider>,
    );
    expect(screen.getAllByText('ok').length).toBe(2);
    expect(seen[0]).toBe(fake);
    expect(seen[1]).toBe(fake);
  });
});
