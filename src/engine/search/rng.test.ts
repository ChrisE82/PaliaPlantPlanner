import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng determinism', () => {
  it('produces the same float() sequence for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 50 }, () => a.float());
    const seqB = Array.from({ length: 50 }, () => b.float());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const seqA = Array.from({ length: 20 }, () => a.float());
    const seqB = Array.from({ length: 20 }, () => b.float());
    expect(seqA).not.toEqual(seqB);
  });

  it('float() stays in [0, 1)', () => {
    const rng = new Rng(999);
    for (let i = 0; i < 5000; i++) {
      const v = rng.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) stays in [0, n)', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('pick() only returns elements of the array', () => {
    const rng = new Rng(7);
    const arr = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 200; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('pick() throws on an empty array', () => {
    const rng = new Rng(7);
    expect(() => rng.pick([])).toThrow();
  });

  it('shuffle() is a permutation of the input and is deterministic per seed', () => {
    const original = Array.from({ length: 20 }, (_, i) => i);
    const rngA = new Rng(2024);
    const rngB = new Rng(2024);
    const shuffledA = rngA.shuffle(original.slice());
    const shuffledB = rngB.shuffle(original.slice());
    expect([...shuffledA].sort((x, y) => x - y)).toEqual(original);
    expect(shuffledA).toEqual(shuffledB);
  });

  it('seeds spanning 32-bit range all produce finite, in-range floats', () => {
    for (const seed of [0, 1, -1, 2 ** 31, 2 ** 32 - 1, -(2 ** 31)]) {
      const rng = new Rng(seed);
      const v = rng.float();
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
