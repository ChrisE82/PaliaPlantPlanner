/**
 * Small seeded PRNG (sfc32, seeded via xmur3) used by every part of the
 * search so runs are reproducible from a single numeric seed.
 *
 * Not cryptographic. Deterministic: the same seed always produces the same
 * sequence of float()/int()/pick()/shuffle() results.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    const nextSeed = xmur3(seed >>> 0);
    this.a = nextSeed();
    this.b = nextSeed();
    this.c = nextSeed();
    this.d = nextSeed();
    // Warm up so the low-entropy seed words mix before the first real use.
    for (let i = 0; i < 15; i++) this.float();
  }

  /** Next float in [0, 1). */
  float(): number {
    let a = this.a >>> 0;
    let b = this.b >>> 0;
    let c = this.c >>> 0;
    let d = this.d >>> 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    return (t >>> 0) / 4294967296;
  }

  /** Random integer in [0, n). n must be a positive integer. */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  /** Random element of a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array');
    return arr[this.int(arr.length)];
  }

  /** Fisher-Yates shuffle, in place. Returns the same array for convenience. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }
}

/** xmur3 string/number hash, used only to spread a small seed into 4 state words. */
function xmur3(seed: number): () => number {
  let h = 1779033703 ^ seed;
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
