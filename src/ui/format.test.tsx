// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { formatInt, joinWithOr, readableTextColor } from './format';

describe('readableTextColor', () => {
  it('picks white text on dark backgrounds', () => {
    expect(readableTextColor('#000000')).toBe('#ffffff');
    expect(readableTextColor('#1f2a24')).toBe('#ffffff');
    expect(readableTextColor('#4a67c9')).toBe('#ffffff'); // blueberry blue
  });

  it('picks black text on light backgrounds', () => {
    expect(readableTextColor('#ffffff')).toBe('#000000');
    expect(readableTextColor('#eee4c4')).toBe('#000000'); // rice cream
    expect(readableTextColor('#f3d53f')).toBe('#000000'); // corn yellow
  });

  it('accepts hex without a leading #', () => {
    expect(readableTextColor('ffffff')).toBe('#000000');
  });
});

describe('joinWithOr', () => {
  it('handles zero, one and two items', () => {
    expect(joinWithOr([])).toBe('');
    expect(joinWithOr(['Cotton'])).toBe('Cotton');
    expect(joinWithOr(['Cotton', 'Spicy Pepper'])).toBe('Cotton or Spicy Pepper');
  });

  it('joins three or more items with commas and a final "or"', () => {
    expect(joinWithOr(['Cotton', 'Spicy Pepper', 'Rockhopper Pumpkin'])).toBe(
      'Cotton, Spicy Pepper or Rockhopper Pumpkin',
    );
    expect(joinWithOr(['a', 'b', 'c', 'd'])).toBe('a, b, c or d');
  });
});

describe('formatInt', () => {
  it('adds no separator under 1000', () => {
    expect(formatInt(0)).toBe('0');
    expect(formatInt(280)).toBe('280');
  });

  it('adds thousands separators', () => {
    expect(formatInt(1285)).toBe('1,285');
    expect(formatInt(1160)).toBe('1,160');
    expect(formatInt(1000000)).toBe('1,000,000');
  });

  it('rounds and handles negative numbers', () => {
    expect(formatInt(1234.6)).toBe('1,235');
    expect(formatInt(-1500)).toBe('-1,500');
  });
});
