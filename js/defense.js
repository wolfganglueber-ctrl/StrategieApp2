// Spielmodus „Burgverteidigung“: Gegnerwellen kommen alle 2 Runden aus Toren am Kartenrand und wollen die Burg.
// Wirtschaft: fester Ertrag + Beute für besiegte Gegner. Nach jeder Welle eine von 3 Karten (gilt für diese Partie).
import { UNITS, MAP_SIZES, TERRAIN, RES } from './data.js';
import { createGame, modeHooks, spawnUnit, geoOf, buildOcc, cityOn, isStructure, statsOf } from './game.js';
import { bfsDistances } from './mapgen.js';
import { mulberry32 } from './rng.js';

export const DEFENSE = {
  waves: 30,
  every: 2, // Runden zwischen zwei Wellen
  firstWave: 2,
  income: { food: 10, wood: 8, ore: 8, mana: 2 },
  start: { food: 60, wood: 80, ore: 60, mana: 10 },
  loot: 1 / 3, // Anteil vom Kaufpreis eines besiegten Gegners
};
export const DEFENSE_DIFFS = [
  { name: 'Leicht', ai: 3, budget: 0.6, desc: 'Kleine Wellen – zum Kennenlernen.' },
  { name: 'Normal', ai: 3, budget: 1, desc: 'Ausgewogen.' },
  { name: 'Schwer', ai: 4, budget: 1.15, desc: 'Größere Wellen und klügere Angreifer.' },
];
// Gegner je Welle: ab welcher Welle eine Einheit mitkommt
const WAVE_UNITS = [['warrior', 1], ['archer', 2], ['rider', 4], ['knight', 8], ['catapult', 10], ['griffin', 13], ['basilisk', 16], ['trebuchet', 18], ['troll', 22]];
const BOSSES = { 10: ['troll'], 20: ['dragon'], 30: ['dragon', 'troll', 'troll'] };

export function createDefenseGame({ seed, diff = 1 }) {
  const size = MAP_SIZES.XL;
  const D = DEFENSE_DIFFS[diff] || DEFENSE_DIFFS[1];
  const state = createGame({
    seed, cols: size.cols, rows: size.rows, biome: 'mixed', villageDensity: 30, mapPlayers: 1,
    players: [{ human: true }, { ai: D.ai, name: 'Angreifer' }],
  });
  state.players[0].res = { ...DEFENSE.start };
  state.cities.find((c) => c.capital).bigCastle = true;
  state.players[1].res = { food: 0, wood: 0, ore: 0, mana: 0 };
  state.defense = {
    diff, wave: 0, nextWave: DEFENSE.firstWave, gates: findGates(state, seed),
    known: {}, mods: {}, lootMult: 1, income: { ...DEFENSE.income }, choices: null, picked: [], queue: [], loot: { food: 0, wood: 0, ore: 0, mana: 0 },
  };
  return state;
}

// 2–3 Tore am Kartenrand, weit weg von der Burg und auf dem Landweg erreichbar, möglichst weit auseinander
function findGates(state, seed) {
  const geo = geoOf(state);
  const cap = state.cities.find((c) => c.capital);
  const dist = bfsDistances(geo, state.terrain, [cap.idx]);
  const edge = [];
  for (let i = 0; i < geo.n; i++) {
    const c = geo.col(i), r = geo.row(i);
    if (c > 0 && r > 0 && c < geo.cols - 1 && r < geo.rows - 1) continue;
    if (!TERRAIN[state.terrain[i]].pass || state.cityAt[i] >= 0 || dist[i] < 8) continue;
    edge.push(i);
  }
  edge.sort((a, b) => dist[b] - dist[a]);
  const gates = [];
  const rng = mulberry32((seed ^ 0x6a09e667) >>> 0);
  if (edge.length) gates.push(edge[Math.floor(rng() * Math.min(4, edge.length))]);
  while (gates.length < 3) {
    let best = null, bd = -1;
    for (const i of edge) {
      const d = Math.min(...gates.map((g) => geo.dist(g, i)));
      if (d > bd) { bd = d; best = i; }
    }
    if (best == null || bd < 6) break;
    gates.push(best);
  }
  return gates;
}

// Zusammensetzung einer Welle: Punktebudget wächst mit der Welle, dazu Bosse auf Welle 10, 20, 30
export function waveUnits(wave, diff = 1, rng = Math.random) {
  const D = DEFENSE_DIFFS[diff] || DEFENSE_DIFFS[1];
  let budget = (4 + wave * 3 + wave * wave * 0.07) * D.budget;
  const list = [...(BOSSES[wave] || [])];
  const pool = WAVE_UNITS.filter(([, w]) => w <= wave).map(([t]) => t);
  const val = (t) => UNITS[t].value;
  for (let guard = 0; guard < 80; guard++) {
    const ok = pool.filter((t) => val(t) <= budget);
    if (!ok.length) break;
    // neuere Einheiten etwas bevorzugen
    const t = ok[Math.floor(Math.pow(rng(), 0.7) * ok.length)];
    list.push(t);
    budget -= val(t);
  }
  return list;
}

function spawnWave(state, ev) {
  const d = state.defense;
  d.wave++;
  d.nextWave = state.turn + DEFENSE.every;
  const rng = mulberry32((state.config.seed * 31 + d.wave * 977) >>> 0);
  const types = waveUnits(d.wave, d.diff, rng);
  d.queue.push(...types.map((t) => ({ t, rank: d.wave >= 22 ? 3 : d.wave >= 12 ? 2 : 1 })));
  ev.push({ k: 'wave', wave: d.wave, count: types.length });
  placeQueued(state, ev);
}

// Wartende Angreifer an den Toren aufstellen (was keinen Platz findet, kommt nächste Runde)
function placeQueued(state, ev) {
  const d = state.defense;
  const geo = geoOf(state);
  const occ = buildOcc(state);
  const rest = [];
  let g = 0;
  for (const q of d.queue) {
    let spot = null;
    for (let k = 0; k < d.gates.length && spot == null; k++) {
      const gate = d.gates[(g + k) % d.gates.length];
      const flying = UNITS[q.t].flying;
      spot = geo.within(gate, 2).filter((j) => !occ[j] && state.cityAt[j] < 0 && (flying || TERRAIN[state.terrain[j]].pass))
        .sort((a, b) => geo.dist(a, gate) - geo.dist(b, gate))[0] ?? null;
    }
    g++;
    if (spot == null) { rest.push(q); continue; }
    const u = spawnUnit(state, q.t, 1, spot, true);
    if (q.rank > 1) { u.rank = q.rank; u.hp = statsOf(state, u).hp; }
    occ[spot] = u;
    d.known[u.id] = { type: u.type, idx: spot };
    ev.push({ k: 'spawn', id: u.id, idx: spot });
  }
  d.queue = rest;
}

// ---------------------------------------------------------------- Karten (gelten für diese Partie)
const CARD_TYPES = {
  warrior: 'Krieger', archer: 'Schützen', rider: 'Reiter', defender: 'Wächter', knight: 'Ritter', griffin: 'Greifenreiter',
  catapult: 'Katapulte', trebuchet: 'Triböcke', mage: 'Zauberer', basilisk: 'Basilisken', tower: 'Türme', barrier: 'Steinwälle',
};
function cardPool(state) {
  const d = state.defense;
  const m = (t) => d.mods[t] || {};
  const cards = [];
  for (const [t, name] of Object.entries(CARD_TYPES)) {
    if (t !== 'barrier' && t !== 'mage') cards.push({ kind: 'mod', type: t, stat: 'atk', val: 1, title: `${name} +1 Angriff`, w: 3 });
    cards.push({ kind: 'mod', type: t, stat: 'def', val: 10, title: `${name} +10 % Verteidigung`, w: 2 });
    cards.push({ kind: 'mod', type: t, stat: 'hp', val: t === 'barrier' ? 15 : UNITS[t].hp >= 15 ? 4 : 3, title: `${name} +${t === 'barrier' ? 15 : UNITS[t].hp >= 15 ? 4 : 3} Leben`, w: 2 });
    if (t !== 'barrier' && t !== 'mage' && t !== 'tower') cards.push({ kind: 'mod', type: t, stat: 'pen', val: 10, title: `${name} Durchschlag +10`, w: 1.5 });
    if (['archer', 'tower', 'catapult'].includes(t) && !m(t).range) cards.push({ kind: 'mod', type: t, stat: 'range', val: 1, title: `${name} +1 Reichweite`, w: 1 });
    if (['rider', 'knight', 'griffin', 'warrior'].includes(t) && !m(t).move) cards.push({ kind: 'mod', type: t, stat: 'move', val: 1, title: `${name} +1 Bewegung`, w: 1 });
  }
  for (const k of ['food', 'wood', 'ore']) cards.push({ kind: 'income', res: k, val: 3, title: `+3 ${{ food: 'Nahrung', wood: 'Holz', ore: 'Erz' }[k]} pro Runde`, w: 2 });
  cards.push({ kind: 'income', res: 'mana', val: 2, title: '+2 Mana pro Runde', w: 1.5 });
  cards.push({ kind: 'loot', val: 0.25, title: 'Beute +25 %', w: 1.5 });
  cards.push({ kind: 'res', val: { wood: 40, ore: 40 }, title: 'Sofort +40 Holz und +40 Erz', w: 1.5 });
  cards.push({ kind: 'res', val: { food: 60 }, title: 'Sofort +60 Nahrung', w: 1.2 });
  cards.push({ kind: 'heal', title: 'Alle Einheiten sofort voll geheilt', w: 1 });
  cards.push({ kind: 'mod', type: 'all', stat: 'atk', val: 1, title: '★ Alle Einheiten +1 Angriff', w: 0.4, rare: true });
  cards.push({ kind: 'mod', type: 'all', stat: 'hp', val: 3, title: '★ Alle Einheiten +3 Leben', w: 0.4, rare: true });
  return cards;
}
function drawCards(state) {
  const rng = mulberry32((state.config.seed * 7 + state.defense.wave * 131) >>> 0);
  const pool = cardPool(state);
  const out = [];
  while (out.length < 3 && pool.length) {
    let tot = pool.reduce((a, c) => a + c.w, 0), r = rng() * tot, i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
    out.push(pool.splice(i, 1)[0]);
  }
  return out.map(({ w, ...c }) => c);
}

function applyCard(state, c, ev) {
  const d = state.defense;
  const p = state.players[0];
  if (c.kind === 'mod') {
    const before = state.units.filter((u) => u.owner === 0).map((u) => [u, statsOf(state, u).hp]);
    d.mods[c.type] = { ...(d.mods[c.type] || {}) };
    d.mods[c.type][c.stat] = (d.mods[c.type][c.stat] || 0) + c.val;
    if (c.stat === 'hp') for (const [u, hp] of before) u.hp += statsOf(state, u).hp - hp; // mehr Leben gleich mit auffüllen
  } else if (c.kind === 'income') d.income[c.res] += c.val;
  else if (c.kind === 'loot') d.lootMult += c.val;
  else if (c.kind === 'res') for (const [k, v] of Object.entries(c.val)) p.res[k] += v;
  else if (c.kind === 'heal') for (const u of state.units) if (u.owner === 0) u.hp = statsOf(state, u).hp;
  d.picked.push(c.title);
  ev.push({ k: 'card', title: c.title });
}

// ---------------------------------------------------------------- Einhängen in die Spielregeln
modeHooks.income = (state, pid) => (pid === 0 ? { ...state.defense.income } : { food: 0, wood: 0, ore: 0, mana: 0 });

modeHooks.mods = (state, u, st) => {
  if (u.owner !== 0) return;
  const m = state.defense.mods;
  for (const src of [m.all, m[u.type]]) {
    if (!src || (src === m.all && isStructure(u))) continue;
    for (const [k, v] of Object.entries(src)) if (k in st) st[k] += v;
  }
};

modeHooks.turnStart = (state, pid) => {
  const ev = [];
  const d = state.defense;
  if (pid === 1) {
    if (d.queue.length) placeQueued(state, ev);
    if (d.wave < DEFENSE.waves && state.turn >= d.nextWave) spawnWave(state, ev);
  } else if (pid === 0 && d.wave > d.picked.length && !d.choices) {
    d.choices = drawCards(state); // nach jeder Welle eine Kartenwahl
  }
  return ev;
};

// Angreifer erobern keine Städte, sie plündern sie (die Stadt wird neutral); fällt die Burg, ist die Partie verloren
modeHooks.capture = (state, c, pid, ev) => {
  if (pid !== 1) return false;
  if (c.capital) {
    ev.push({ k: 'capture', idx: c.idx, pid, from: c.owner });
    c.owner = 1;
    state.over = { winner: 1, humanLost: true, wave: state.defense.wave };
    return true;
  }
  if (c.owner === -1) return true;
  ev.push({ k: 'capture', idx: c.idx, pid: -1, from: c.owner });
  c.owner = -1;
  return true;
};

modeHooks.card = (state, a) => {
  const d = state.defense;
  if (state.current !== 0 || !d.choices || !d.choices[a.idx]) return null;
  const ev = [];
  applyCard(state, d.choices[a.idx], ev);
  d.choices = null;
  return ev;
};

// Nach jeder Aktion: Beute für besiegte Angreifer, Sieg nach der letzten Welle
modeHooks.afterAction = (state) => {
  const d = state.defense;
  const ev = [];
  const alive = new Set(state.units.filter((u) => u.owner === 1).map((u) => u.id));
  for (const [id, k] of Object.entries(d.known)) {
    if (alive.has(+id)) continue;
    delete d.known[id];
    const type = k.type;
    const got = {};
    for (const [k, v] of Object.entries(UNITS[type].cost)) {
      if (!RES.includes(k)) continue;
      got[k] = Math.ceil(v * DEFENSE.loot * d.lootMult);
      state.players[0].res[k] += got[k];
      d.loot[k] = (d.loot[k] || 0) + got[k];
    }
    ev.push({ k: 'loot', type, got, idx: k.idx });
  }
  for (const u of state.units) if (u.owner === 1) d.known[u.id] = { type: u.type, idx: u.idx };
  if (!state.over && d.wave >= DEFENSE.waves && !d.queue.length && !alive.size) state.over = { winner: 0, wave: d.wave };
  return ev;
};

// Runden bis zur nächsten Welle (0 = kommt im nächsten Zug der Angreifer)
export function wavesInfo(state) {
  const d = state.defense;
  return { wave: d.wave, waves: DEFENSE.waves, next: d.wave >= DEFENSE.waves ? null : Math.max(0, d.nextWave - state.turn), enemies: state.units.filter((u) => u.owner === 1).length + d.queue.length };
}
