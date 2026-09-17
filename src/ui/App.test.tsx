// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App';
import { useStore } from './state/store';
import { CROP_DATA } from '../data/crops';

beforeEach(() => {
  useStore.getState().resetToExample();
});

afterEach(() => {
  cleanup();
});

describe('App', () => {
  it('renders the header, setup panel and results placeholder', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Palia Plant Planner' })).toBeTruthy();
    expect(
      screen.getByText(
        'Plan a garden from goals: how many of each crop, which buffs they get, and how to arrange your plots.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(`Crop data checked ${CROP_DATA.checkedOn}`)).toBeTruthy();
    expect(screen.getByText('Set your goals, then plan your garden.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Plan my garden' })).toBeTruthy();
  });

  it('links the crop-data note to the sources list', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: `Crop data checked ${CROP_DATA.checkedOn}` });
    expect(link.getAttribute('href')).toBe('#sources');
    expect(screen.getByRole('heading', { name: 'Crop data sources' })).toBeTruthy();
    expect(screen.getAllByRole('link').length).toBeGreaterThan(CROP_DATA.sources.length);
  });
});
