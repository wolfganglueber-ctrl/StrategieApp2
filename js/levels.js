// Kampagne: 5 Welten × 10 Level. Karten sind über feste Seeds reproduzierbar.
import { MAP_SIZES } from './data.js';

const WORLDS = [
  {
    name: 'Grünland', biomes: ['plains', 'mixed'],
    sizes: 'S S S M M M M L L L', ai: ['1', '1', '1', '1', '2', '1', '2', '2', '1,1', '2,2'],
  },
  {
    name: 'Tiefe Wälder', biomes: ['forest', 'forest', 'mixed'],
    sizes: 'M L L L L XL XL XL XL XL', ai: ['2', '2', '3', '2,2', '3', '3', '2,3', '3', '3,3', '2,2,3'],
  },
  {
    name: 'Gebirgspässe', biomes: ['mountains', 'mountains', 'mixed'],
    sizes: 'L XL XL XL XL XXL XXL XXL XXL XXL', ai: ['3', '3', '3,3', '3', '4', '3,3', '4', '3,3,3', '4,3', '4'],
  },
  {
    name: 'Inselreich', biomes: ['islands', 'islands', 'mixed'],
    sizes: 'XL XXL XXL XXL XXL XXL XXXL XXXL XXXL XXXL', ai: ['3', '4', '3,3', '4', '4,3', '3,3,3', '4,4', '4', '4,4,3', '5'],
  },
  {
    name: 'Kronland', biomes: ['mixed', 'forest', 'mountains', 'plains', 'islands'],
    sizes: 'XXL XXL XXXL XXXL XXXL XXXL XXXL XXXL XXXL XXXL', ai: ['4', '4,4', '5', '4,4,4', '5,4', '5', '5,5', '4,4,5', '5,5,4', '5,5,5'],
  },
];

const PAR_BASE = { S: 14, M: 20, L: 26, XL: 32, XXL: 38, XXXL: 44 };

let cache = null;
export function getLevels() {
  if (cache) return cache;
  cache = [];
  WORLDS.forEach((w, wi) => {
    const sizes = w.sizes.split(' ');
    for (let i = 0; i < 10; i++) {
      const ais = w.ai[i].split(',').map(Number);
      const size = sizes[i];
      const id = wi * 10 + i + 1;
      cache.push({
        id,
        world: wi,
        worldName: w.name,
        num: i + 1,
        seed: 70001 + id * 104729,
        size,
        cols: MAP_SIZES[size].cols,
        rows: MAP_SIZES[size].rows,
        biome: w.biomes[i % w.biomes.length],
        ais,
        par: PAR_BASE[size] + (ais.length - 1) * 8,
      });
    }
  });
  return cache;
}

export function getWorldNames() {
  return WORLDS.map((w) => w.name);
}

export function starsFor(level, turns) {
  if (turns <= level.par) return 3;
  if (turns <= Math.round(level.par * 1.5)) return 2;
  return 1;
}
