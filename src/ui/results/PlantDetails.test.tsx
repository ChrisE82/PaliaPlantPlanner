// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CROP_BY_ID, getCrop } from '../../data/crops';
import type { BuffDetail, Goal } from '../../engine/types';
import PlantDetails from './PlantDetails';

afterEach(() => {
  cleanup();
});

describe('PlantDetails', () => {
  it('shows the crop name and size, and each buff with contacts, givers and Yes/No', () => {
    const details: BuffDetail[] = [
      { buff: 'harvestBoost', contacts: 3, needed: 3, received: true, givers: ['corn', 'wheat'] },
      { buff: 'waterRetain', contacts: 0, needed: 3, received: false, givers: [] },
    ];
    render(
      <PlantDetails
        crop={getCrop('apple')}
        x={1}
        y={0}
        details={details}
        cropsById={CROP_BY_ID}
        goalsForCrop={[]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Apple, 3x3, column 2, row 1' })).toBeTruthy();
    expect(screen.getByText('Harvest Boost: 3 of 3 touching tiles (Corn, Wheat) — Yes')).toBeTruthy();
    expect(screen.getByText('Water Retain: 0 of 3 touching tiles — No')).toBeTruthy();
  });

  it('lists the goals the plant counts toward by label', () => {
    const goals: Goal[] = [{ id: 'g1', crop: 'apple', measure: 'quantity', amount: { kind: 'count', n: 4 }, importance: 'must' }];
    render(
      <PlantDetails crop={getCrop('apple')} x={0} y={0} details={[]} cropsById={CROP_BY_ID} goalsForCrop={goals} />,
    );
    expect(screen.getByText('Apple · Quantity · At least 4')).toBeTruthy();
  });

  it('shows a plain message when there are no buffs or no goals', () => {
    render(<PlantDetails crop={getCrop('apple')} x={0} y={0} details={[]} cropsById={CROP_BY_ID} goalsForCrop={[]} />);
    expect(screen.getByText('No crop in this garden gives a buff.')).toBeTruthy();
    expect(screen.getByText('No goal.')).toBeTruthy();
  });
});
