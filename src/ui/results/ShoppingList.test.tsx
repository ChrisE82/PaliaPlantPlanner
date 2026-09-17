// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ShoppingList as ShoppingListData } from '../../engine/types';
import ShoppingList from './ShoppingList';

afterEach(() => {
  cleanup();
});

describe('ShoppingList', () => {
  it('shows crop, seed count, price each, total and source, and the gold total', () => {
    const list: ShoppingListData = {
      lines: [
        { cropId: 'apple', name: 'Apple', count: 4, unitPrice: 280, currency: 'medals', total: 1120, source: 'Gardening Guild Store; also Seed Collector' },
        { cropId: 'wheat', name: 'Wheat', count: 40, unitPrice: 25, currency: 'gold', total: 1000, source: "Zeki's" },
      ],
      totalGold: 1000,
      totalMedals: 1120,
    };
    render(<ShoppingList list={list} />);

    expect(screen.getByText('Apple')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('280 Gardening Medals')).toBeTruthy();
    expect(screen.getByText('1,120 Gardening Medals')).toBeTruthy();
    expect(screen.getByText('Gardening Guild Store; also Seed Collector')).toBeTruthy();

    expect(screen.getByText('1,000 gold')).toBeTruthy();
    expect(screen.getByText("Zeki's")).toBeTruthy();

    expect(screen.getByText('Total: 1,000 gold and 1,120 Gardening Medals')).toBeTruthy();
  });

  it('omits the medals clause when nothing costs medals', () => {
    const list: ShoppingListData = {
      lines: [{ cropId: 'wheat', name: 'Wheat', count: 4, unitPrice: 25, currency: 'gold', total: 100, source: "Zeki's" }],
      totalGold: 100,
      totalMedals: 0,
    };
    render(<ShoppingList list={list} />);
    expect(screen.getByText('Total: 100 gold')).toBeTruthy();
  });

  it('shows "No gold price" and the source for a crop without a price', () => {
    const list: ShoppingListData = {
      lines: [
        { cropId: 'blueberry', name: 'Blueberry', count: 6, unitPrice: null, currency: null, total: null, source: 'Seed Collector or Gardening Guild Store' },
      ],
      totalGold: 0,
      totalMedals: 0,
    };
    render(<ShoppingList list={list} />);
    expect(screen.getByText('No gold price')).toBeTruthy();
    expect(screen.getByText('Seed Collector or Gardening Guild Store')).toBeTruthy();
  });
});
