import { describe, expect, it } from 'vitest';
import { CROPS, CROP_DATA, getCrop } from './crops';
import { BUFF_IDS } from '../engine/types';
import { RULES } from '../engine/rules';

// Sizes and buffs confirmed against the Palia wiki, both open-source planners,
// and the project owner (2026-09-17).
const CONFIRMED: Record<string, [size: number, buff: string]> = {
  tomato: [1, 'waterRetain'],
  potato: [1, 'waterRetain'],
  'napa-cabbage': [1, 'waterRetain'],
  rice: [1, 'harvestBoost'],
  wheat: [1, 'harvestBoost'],
  corn: [1, 'harvestBoost'],
  carrot: [1, 'weedBlock'],
  onion: [1, 'weedBlock'],
  'bok-choy': [1, 'weedBlock'],
  cotton: [1, 'qualityBoost'],
  blueberry: [2, 'harvestBoost'],
  'batterfly-bean': [2, 'harvestBoost'],
  'spicy-pepper': [2, 'qualityBoost'],
  'rockhopper-pumpkin': [2, 'qualityBoost'],
  apple: [3, 'harvestBoost'],
};

describe('crop data', () => {
  it('has exactly the confirmed crops with confirmed sizes and buffs', () => {
    expect(CROPS.map((c) => c.id).sort()).toEqual(Object.keys(CONFIRMED).sort());
    for (const crop of CROPS) {
      const [size, buff] = CONFIRMED[crop.id];
      expect([crop.id, crop.size, crop.buff]).toEqual([crop.id, size, buff]);
    }
  });

  it('has unique ids, names and tile labels', () => {
    for (const key of ['id', 'name', 'abbr'] as const) {
      const values = CROPS.map((c) => c[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('uses only known buffs, and no crop gives Growth Boost', () => {
    for (const crop of CROPS) {
      if (crop.buff !== null) expect(BUFF_IDS).toContain(crop.buff);
      expect(crop.buff).not.toBe('growthBoost');
    }
  });

  it('has well-formed display and seed fields', () => {
    for (const crop of CROPS) {
      expect(crop.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(crop.abbr.length).toBeGreaterThanOrEqual(2);
      expect(crop.abbr.length).toBeLessThanOrEqual(3);
      expect(crop.seed.source.length).toBeGreaterThan(0);
      // A price needs a currency and vice versa.
      expect(crop.seed.price === null).toBe(crop.seed.currency === null);
      if (crop.seed.price !== null) expect(crop.seed.price).toBeGreaterThan(0);
      if (crop.unlock.gardeningLevel !== null) {
        expect(Number.isInteger(crop.unlock.gardeningLevel)).toBe(true);
        expect(crop.unlock.gardeningLevel).toBeGreaterThan(0);
      }
    }
  });

  it('records when and where the data was checked', () => {
    expect(CROP_DATA.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CROP_DATA.sources.length).toBeGreaterThan(0);
  });

  it('looks up crops by id and rejects unknown ids', () => {
    expect(getCrop('apple').name).toBe('Apple');
    expect(() => getCrop('lettuce')).toThrow();
  });
});

describe('rules', () => {
  it('matches the confirmed game rules', () => {
    expect(RULES.maxPlots).toBe(9);
    expect(RULES.plotSize).toBe(3);
    expect(RULES.receiveThreshold).toEqual({ 1: 1, 2: 2, 3: 3 });
    expect(RULES.sameTypeGivesBuffs).toBe(false);
    expect(RULES.cropsCrossPlotBorders).toBe(true);
  });
});
