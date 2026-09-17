// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { Goal } from '../../engine/types';
import CompareTable, { type CompareOption } from './CompareTable';

afterEach(() => {
  cleanup();
});

const GOALS: Goal[] = [
  { id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 }, importance: 'must' },
  { id: 'g2', crop: 'wheat', measure: 'quantity', amount: { kind: 'max' }, importance: 'medium' },
];
const LABELS = new Map([
  ['g1', 'Apple · Quantity · At least 4'],
  ['g2', 'Wheat · Quantity · Maximize'],
]);

describe('CompareTable', () => {
  it('renders nothing for a single option', () => {
    const options: CompareOption[] = [{ label: '3x3 block', goalValues: new Map(), filledTiles: 10 }];
    const { container } = render(<CompareTable goals={GOALS} goalLabels={LABELS} options={options} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows one row per goal plus Filled tiles, and one column per option', () => {
    const options: CompareOption[] = [
      { label: '3x3 block', goalValues: new Map([['g1', '4 of 4 plants'], ['g2', '5 plants']]), filledTiles: 40 },
      { label: 'Row of 9', goalValues: new Map([['g1', '3 of 4 plants'], ['g2', '8 plants']]), filledTiles: 45 },
    ];
    render(<CompareTable goals={GOALS} goalLabels={LABELS} options={options} />);

    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(4); // header + 2 goals + filled tiles

    const appleRow = screen.getByRole('row', { name: /Apple · Quantity · At least 4/ });
    expect(within(appleRow).getByText('4 of 4 plants')).toBeTruthy();
    expect(within(appleRow).getByText('3 of 4 plants')).toBeTruthy();

    const filledRow = screen.getByRole('row', { name: /Filled tiles/ });
    expect(within(filledRow).getByText('40')).toBeTruthy();
    expect(within(filledRow).getByText('45')).toBeTruthy();

    expect(screen.getByRole('columnheader', { name: 'Best' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Option 2' })).toBeTruthy();
  });
});
