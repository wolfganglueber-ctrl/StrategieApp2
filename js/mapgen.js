// Prozeduraler Kartengenerator: Rauschen → Gelände, faire Startpositionen, Dörfer.
import { Rng } from './rng.js';
import { getGeo } from './hex.js';
import { TERRAIN, BIOMES } from './data.js';

function makeNoise(rng, w, h, scale) {
  const gw = Math.ceil(w / scale) + 3, gh = Math.ceil(h / scale) + 3;
  const v = new Float32Array(gw * gh);
  for (let i = 0; i < v.length; i++) v[i] = rng.float();
  const ox = rng.float(), oy = rng.float();
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / scale + ox, fy = y / scale + oy;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = sm(fx - x0), ty = sm(fy - y0);
    const a = v[y0 * gw + x0], b = v[y0 * gw + x0 + 1];
    const c = v[(y0 + 1) * gw + x0], d = v[(y0 + 1) * gw + x0 + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}

function quantile(values, q) {
  const s = Array.from(values).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))];
}

export function passable(t) {
  return TERRAIN[t].pass;
}

// Breitensuche über passierbares Gelände; liefert Distanzen (−1 = unerreichbar)
export function bfsDistances(geo, terrain, sources) {
  const dist = new Int16Array(geo.n).fill(-1);
  const q = [];
  for (const s of sources) {
    if (dist[s] === -1) { dist[s] = 0; q.push(s); }
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    for (const j of geo.nb[i]) {
      if (dist[j] === -1 && passable(terrain[j])) { dist[j] = dist[i] + 1; q.push(j); }
    }
  }
  return dist;
}

function generateTerrain(rng, cols, rows, biome) {
  const geo = getGeo(cols, rows);
  const n1 = makeNoise(rng, cols + 2, rows + 2, 3.2);
  const n2 = makeNoise(rng, cols + 2, rows + 2, 1.6);
  const m1 = makeNoise(rng, cols + 2, rows + 2, 2.6);
  const m2 = makeNoise(rng, cols + 2, rows + 2, 1.3);
  const elev = new Float32Array(geo.n), moist = new Float32Array(geo.n);
  for (let i = 0; i < geo.n; i++) {
    const c = i % cols, r = (i / cols) | 0;
    const x = c + 0.5 * (r & 1), y = r * 0.866;
    let e = n1(x, y) * 0.7 + n2(x, y) * 0.3;
    const nx = (c + 0.5) / cols * 2 - 1, ny = (r + 0.5) / rows * 2 - 1;
    const edge = Math.max(Math.abs(nx), Math.abs(ny));
    e -= biome.falloff * Math.pow(edge, 3);
    elev[i] = e;
    moist[i] = m1(x, y) * 0.65 + m2(x, y) * 0.35;
  }
  const terrain = new Array(geo.n).fill('plain');
  const waterT = quantile(elev, biome.water);
  const land = [];
  for (let i = 0; i < geo.n; i++) {
    if (elev[i] < waterT) terrain[i] = 'water';
    else land.push(i);
  }
  const landElev = land.map((i) => elev[i]);
  const landFrac = land.length / geo.n;
  const mT = quantile(landElev, 1 - biome.mountain / landFrac);
  const hT = quantile(landElev, 1 - (biome.mountain + biome.hill) / landFrac);
  const rest = [];
  for (const i of land) {
    if (elev[i] >= mT) terrain[i] = 'mountain';
    else if (elev[i] >= hT) terrain[i] = 'hill';
    else rest.push(i);
  }
  const fT = quantile(rest.map((i) => moist[i]), 1 - biome.forest / Math.max(0.01, rest.length / geo.n));
  for (const i of rest) if (moist[i] >= fT) terrain[i] = 'forest';

  // Nur die größte zusammenhängende Landmasse behalten
  const comp = new Int32Array(geo.n).fill(-1);
  let best = -1, bestSize = 0, cid = 0;
  for (let i = 0; i < geo.n; i++) {
    if (comp[i] !== -1 || !passable(terrain[i])) continue;
    const q = [i];
    comp[i] = cid;
    for (let h = 0; h < q.length; h++) {
      for (const j of geo.nb[q[h]]) {
        if (comp[j] === -1 && passable(terrain[j])) { comp[j] = cid; q.push(j); }
      }
    }
    if (q.length > bestSize) { bestSize = q.length; best = cid; }
    cid++;
  }
  for (let i = 0; i < geo.n; i++) {
    if (passable(terrain[i]) && comp[i] !== best) terrain[i] = 'water';
  }
  return { terrain, landCount: bestSize };
}

function placeCities(rng, geo, terrain, players, villageDensity) {
  const land = [];
  for (let i = 0; i < geo.n; i++) {
    if (!passable(terrain[i])) continue;
    const c = geo.col(i), r = geo.row(i);
    let pn = 0;
    for (const j of geo.nb[i]) if (passable(terrain[j])) pn++;
    if (pn >= 3 && c > 0 && r > 0 && c < geo.cols - 1 && r < geo.rows - 1) land.push(i);
  }
  if (land.length < players * 4) return null;

  // Hauptstädte: möglichst großer Mindestabstand
  let caps = null, capScore = -1;
  for (let t = 0; t < 250; t++) {
    const pick = [];
    for (let k = 0; k < players; k++) pick.push(rng.pick(land));
    let md = Infinity;
    for (let a = 0; a < players; a++) for (let b = a + 1; b < players; b++) md = Math.min(md, geo.dist(pick[a], pick[b]));
    const s = md + rng.float() * 0.5;
    if (s > capScore) { capScore = s; caps = pick; }
  }
  const minCapDist = Math.max(4, Math.floor(Math.sqrt(geo.n) * (players === 2 ? 0.75 : 0.55)));
  if (capScore < minCapDist) return null;

  const cities = caps.map((idx) => ({ idx, owner: -1, level: 1, capital: true }));
  const capDist = caps.map((c) => bfsDistances(geo, terrain, [c]));

  const target = Math.max(players * 2, Math.round(land.length / villageDensity));
  const cand = rng.shuffle(land.slice());
  for (const minD of [3, 2]) {
    for (const i of cand) {
      if (cities.length >= target + players) break;
      if (cities.some((c) => geo.dist(c.idx, i) < minD)) continue;
      // nicht direkt neben eine Hauptstadt quetschen
      if (caps.some((c) => geo.dist(c, i) < 2)) continue;
      cities.push({ idx: i, owner: -1, level: 1, capital: false });
    }
  }

  // Fairness: Dörfer pro Spieler nach Wegdistanz zur Hauptstadt
  const share = new Array(players).fill(0);
  const near = new Array(players).fill(0);
  for (const c of cities) {
    if (c.capital) continue;
    const ds = capDist.map((d) => d[c.idx]);
    if (ds.some((d) => d < 0)) return null;
    const m = Math.min(...ds);
    const winners = ds.map((d, k) => (d === m ? k : -1)).filter((k) => k >= 0);
    for (const k of winners) {
      share[k] += 1 / winners.length;
      if (m <= 4) near[k] += 1 / winners.length;
    }
  }
  const imbalance = Math.max(...share) - Math.min(...share) + (Math.max(...near) - Math.min(...near)) * 1.5;
  return { cities, imbalance };
}

export function generateMap({ seed, cols, rows, players, biome = 'mixed', villageDensity = 10 }) {
  const bio = BIOMES[biome] || BIOMES.mixed;
  const geo = getGeo(cols, rows);
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = new Rng((seed + attempt * 7919) >>> 0);
    const { terrain, landCount } = generateTerrain(rng, cols, rows, bio);
    if (landCount < geo.n * 0.45) continue;
    const placed = placeCities(rng, geo, terrain, players, villageDensity);
    if (!placed) continue;
    if (!best || placed.imbalance < best.imbalance) best = { terrain, cities: placed.cities, imbalance: placed.imbalance };
    if (placed.imbalance <= 1) break;
  }
  if (!best) throw new Error('Karte konnte nicht erzeugt werden');
  for (const c of best.cities) best.terrain[c.idx] = 'plain';
  // Jede Hauptstadt bekommt einen fairen Rohstoff-Mix in ihrem Gebiet
  const isCity = new Set(best.cities.map((c) => c.idx));
  const rng = new Rng(seed ^ 0x5bd1e995);
  for (const c of best.cities.filter((x) => x.capital)) {
    const nb = geo.nb[c.idx].filter((j) => !isCity.has(j));
    const count = (t) => nb.filter((j) => best.terrain[j] === t).length;
    const want = [['forest', 1], ['hill', 1], ['plain', 2]];
    for (const [t, n] of want) {
      let have = count(t) + (t === 'hill' ? count('mountain') : 0);
      const pool = rng.shuffle(nb.filter((j) => best.terrain[j] === 'plain' || best.terrain[j] === 'water'));
      for (const j of pool) {
        if (have >= n) break;
        if (best.terrain[j] === t) continue;
        if (t !== 'plain' && best.terrain[j] === 'plain' && count('plain') <= 2) continue;
        best.terrain[j] = t;
        have++;
      }
    }
  }
  return { cols, rows, terrain: best.terrain, cities: best.cities };
}
