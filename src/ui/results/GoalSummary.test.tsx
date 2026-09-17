// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { Goal, GoalReport } from '../../engine/types';
import GoalSummary from './GoalSummary';

afterEach(() => {
  cleanup();
});

const GOALS: Goal[] = [
  { id: 'g-met', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 }, importance: 'must' },
  { id: 'g-partial', crop: 'apple', measure: 'harvestBoost', amount: { kind: 'all' }, importance: 'high' },
  { id: 'g-unmet', crop: 'cotton', measure: 'qualityBoost', amount: { kind: 'all' }, importance: 'low' },
  { id: 'g-max', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'medium' },
];

const REPORTS: GoalReport[] = [
  { goalId: 'g-met', label: 'Apple · Quantity · At least 4', score: 1, status: 'met', value: '4 of 4 plants', reason: null },
  {
    goalId: 'g-partial',
    label: 'Apple · Harvest Boost · All plants',
    score: 0.5,
    status: 'partial',
    value: '2 of 4 Apple plants have Harvest Boost',
    reason: 'Shares space with other goals of the same importance.',
  },
  { goalId: 'g-unmet', label: 'Cotton · Quality Boost · All plants', score: 0, status: 'unmet', value: 'No Cotton plants', reason: 'There are no Cotton plants in the layout.' },
  { goalId: 'g-max', label: 'Wheat · Quantity · Maximize', score: 0.2, status: 'info', value: '5 plants', reason: null },
];

describe('GoalSummary', () => {
  it('shows one row per goal with status text, label, importance, value and reason', () => {
    const goalsById = new Map(GOALS.map((g) => [g.id, g]));
    render(<GoalSummary reports={REPORTS} goalsById={goalsById} />);

    const rows = screen.getAllByRole('row').slice(1); // skip the header row
    expect(rows.length).toBe(4);

    expect(within(rows[0]).getByText('Met')).toBeTruthy();
    expect(within(rows[0]).getByText('Apple · Quantity · At least 4')).toBeTruthy();
    expect(within(rows[0]).getByText('Must')).toBeTruthy();
    expect(within(rows[0]).getByText('4 of 4 plants')).toBeTruthy();

    expect(within(rows[1]).getByText('Partly met')).toBeTruthy();
    expect(within(rows[1]).getByText('Shares space with other goals of the same importance.')).toBeTruthy();

    expect(within(rows[2]).getByText('Not met')).toBeTruthy();

    expect(within(rows[3]).getByText('Result')).toBeTruthy();
    expect(within(rows[3]).getByText('Medium')).toBeTruthy();
  });

  it('shows a blank reason cell when there is none', () => {
    const goalsById = new Map(GOALS.map((g) => [g.id, g]));
    render(<GoalSummary reports={[REPORTS[0]]} goalsById={goalsById} />);
    const row = screen.getAllByRole('row')[1];
    const cells = within(row).getAllByRole('cell');
    expect(cells[cells.length - 1].textContent).toBe('');
  });
});
