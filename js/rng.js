// Deterministischer Zufallsgenerator (mulberry32) – gleiche Seeds ergeben gleiche Karten.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.f = mulberry32(seed);
  }
  float() {
    return this.f();
  }
  int(n) {
    return Math.floor(this.f() * n);
  }
  range(a, b) {
    return a + this.f() * (b - a);
  }
  pick(arr) {
    return arr[Math.floor(this.f() * arr.length)];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.f() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// Seeds als kurze, teilbare Codes (z. B. "K7QX2M")
const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomSeedCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += SEED_ALPHABET[Math.floor(Math.random() * SEED_ALPHABET.length)];
  return s;
}
export function seedFromCode(code) {
  return hashString(String(code).trim().toUpperCase());
}
