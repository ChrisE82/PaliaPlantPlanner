// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { joinWithOr, readableTextColor } from './format';

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
