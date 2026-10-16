// Spielregeln und Spielzustand. Komplett ohne DOM, damit auch Simulationen in Node laufen.
import { getGeo } from './hex.js';
import { TERRAIN, UNITS, cityIncome, upgradeCost, cityDefense, CITY_MAX_LEVEL, PLAYER_COLORS } from './data.js';
import { generateMap } from './mapgen.js';

export const START_GOLD = 2;

/*
 config: { seed, cols, rows, biome, players: [{ human: bool, ai: 1..5, name? }], levelId?, villageDensity? }
*/
export function createGame(config) {
  const n = config.players.length;
  const map = generateMap({ seed: config.seed, cols: config.cols, rows: config.rows, players: n, biome: config.biome, villageDensity: config.villageDensity });
  const geo = getGeo(map.cols, map.rows);
  const state = {
    v: 1,
    gameId: Math.floor(Math.random() * 1e9),
    config,
    cols: map.cols,
    rows: map.rows,
    terrain: map.terrain,
    cities: map.cities,
    cityAt: new Array(geo.n).fill(-1),
    players: config.players.map((p, i) => ({
      id: i,
      name: p.name || (p.human ? 'Du' : PLAYER_COLORS[i].name),
      human: !!p.human,
      ai: p.ai || 3,
      gold: START_GOLD + (p.startGold || 0),
      incomeBonus: p.incomeBonus ?? (!p.human && p.ai >= 5 ? 0.5 : 0),
      alive: true,
    })),
    units: [],
    nextUnitId: 1,
    current: 0,
    turn: 1,
    over: null,
    stats: { kills: new Array(n).fill(0), losses: new Array(n).fill(0) },
  };
  // Hauptstädte zuweisen (Reihenfolge der Spieler gemischt durch Seed)
  const caps = state.cities.filter((c) => c.capital);
  caps.forEach((c, i) => (c.owner = i));
  state.cities.forEach((c, i) => (state.cityAt[c.idx] = i));
  // Startkrieger neben der Hauptstadt
  for (const c of caps) {
    const free = geo.nb[c.idx].filter((j) => TERRAIN[state.terrain[j]].pass && state.cityAt[j] === -1);
    const spot = free.find((j) => state.terrain[j] === 'plain') ?? free[0] ?? c.idx;
    spawnUnit(state, 'warrior', c.owner, spot, true);
  }
  startTurn(state);
  return state;
}

export function cloneState(s) {
  return JSON.parse(JSON.stringify(s));
}

export function geoOf(state) {
  return getGeo(state.cols, state.rows);
}

function spawnUnit(state, type, owner, idx, ready) {
  const u = { id: state.nextUnitId++, type, owner, idx, hp: UNITS[type].hp, moved: !ready, attacked: !ready, acted: false };
  state.units.push(u);
  return u;
}

export function unitById(state, id) {
  return state.units.find((u) => u.id === id) || null;
}

export function buildOcc(state) {
  const occ = new Array(state.cols * state.rows).fill(null);
  for (const u of state.units) occ[u.idx] = u;
  return occ;
}

export function cityOn(state, idx) {
  const ci = state.cityAt[idx];
  return ci >= 0 ? state.cities[ci] : null;
}

export function canMove(u) {
  return !u.moved && !u.attacked;
}
export function canAttack(u) {
  return !u.attacked && !(UNITS[u.type].noMoveAttack && u.moved);
}
export function canAct(state, u) {
  if (canMove(u)) return true;
  if (!canAttack(u)) return false;
  return getTargets(state, u, u.idx, buildOcc(state)).length > 0;
}

export function unitRange(state, u, fromIdx) {
  const T = UNITS[u.type];
  return T.range + (T.range > 1 && state.terrain[fromIdx] === 'hill' ? 1 : 0);
}

export function defenseMult(state, idx) {
  const c = cityOn(state, idx);
  if (c) return cityDefense(c);
  return TERRAIN[state.terrain[idx]].def || 1;
}

// Felder neben gegnerischen Einheiten (Zone of Control)
function zocMap(state, owner) {
  const geo = geoOf(state);
  const z = new Uint8Array(geo.n);
  for (const e of state.units) {
    if (e.owner === owner) continue;
    for (const j of geo.nb[e.idx]) z[j] = 1;
  }
  return z;
}

// Erreichbare Zielfelder: Map ziel -> vorgänger (für Pfade)
export function getMoves(state, u, occ = buildOcc(state), zoc = zocMap(state, u.owner), moveOverride) {
  const geo = geoOf(state);
  const parent = new Map();
  if (!canMove(u) && moveOverride === undefined) return parent;
  const maxSteps = moveOverride ?? UNITS[u.type].move;
  const steps = new Map([[u.idx, 0]]);
  const q = [u.idx];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const s = steps.get(i);
    if (s >= maxSteps) continue;
    if (i !== u.idx && (TERRAIN[state.terrain[i]].stop || zoc[i])) continue;
    for (const j of geo.nb[i]) {
      if (steps.has(j)) continue;
      if (!TERRAIN[state.terrain[j]].pass) continue;
      const o = occ[j];
      if (o && o.owner !== u.owner) continue;
      steps.set(j, s + 1);
      parent.set(j, i);
      q.push(j);
    }
  }
  const res = new Map();
  for (const [j, p] of parent) if (!occ[j]) res.set(j, p);
  // Vorgänger auch für durchquerte (besetzte) Felder behalten, für Pfadrekonstruktion
  res.parents = parent;
  return res;
}

export function pathTo(moves, from, to) {
  const par = moves.parents || moves;
  const path = [to];
  let c = to;
  while (c !== from && par.has(c)) {
    c = par.get(c);
    path.push(c);
  }
  return path.reverse();
}

export function getTargets(state, u, fromIdx, occ = buildOcc(state)) {
  const geo = geoOf(state);
  const rng = unitRange(state, u, fromIdx);
  const res = [];
  for (const j of geo.within(fromIdx, rng)) {
    const o = occ[j];
    if (o && o.owner !== u.owner && j !== fromIdx) res.push(o);
  }
  return res;
}

export function computeCombat(state, att, def, fromIdx = att.idx, attHp = att.hp) {
  const A = UNITS[att.type], D = UNITS[def.type];
  const aF = A.atk * (attHp / A.hp);
  const dF = D.def * (def.hp / D.hp) * defenseMult(state, def.idx);
  const tot = aF + dF;
  const dmg = Math.round((aF / tot) * A.atk * 4.5);
  const kill = dmg >= def.hp;
  let counter = 0;
  const geo = geoOf(state);
  if (!kill && geo.dist(fromIdx, def.idx) <= unitRange(state, def, def.idx)) {
    counter = Math.round((dF / tot) * D.def * 4.5);
  }
  return { dmg, counter, kill, die: counter >= attHp };
}

export function incomeOf(state, pid) {
  let sum = 0;
  for (const c of state.cities) if (c.owner === pid) sum += cityIncome(c);
  const p = state.players[pid];
  return Math.round(sum * (1 + (p.incomeBonus || 0)));
}

// Versorgung: jede Stadt versorgt so viele Einheiten, wie sie Gold einbringt
export function unitCap(state, pid) {
  let sum = 0;
  for (const c of state.cities) if (c.owner === pid) sum += cityIncome(c);
  return sum;
}

export function unitCount(state, pid) {
  let n = 0;
  for (const u of state.units) if (u.owner === pid) n++;
  return n;
}

export function cityCount(state, pid) {
  let n = 0;
  for (const c of state.cities) if (c.owner === pid) n++;
  return n;
}

function eliminate(state, pid, ev) {
  const p = state.players[pid];
  if (!p.alive) return;
  p.alive = false;
  state.units = state.units.filter((u) => u.owner !== pid);
  ev.push({ k: 'eliminated', pid });
}

function checkOver(state) {
  const alive = state.players.filter((p) => p.alive);
  const humans = state.players.filter((p) => p.human);
  if (alive.length === 1) {
    state.over = { winner: alive[0].id };
  } else if (humans.length > 0 && humans.every((p) => !p.alive)) {
    state.over = { winner: -1, humanLost: true };
  }
}

export function startTurn(state) {
  const ev = [];
  const pid = state.current;
  const geo = geoOf(state);
  // Eroberung: Einheiten, die eine gegnerische Runde auf fremden Städten überstanden haben
  for (const u of state.units) {
    if (u.owner !== pid) continue;
    const c = cityOn(state, u.idx);
    if (c && c.owner !== pid) {
      const old = c.owner;
      c.owner = pid;
      ev.push({ k: 'capture', idx: c.idx, pid, from: old });
      if (old >= 0 && cityCount(state, old) === 0) eliminate(state, old, ev);
    }
  }
  // Heilung für Einheiten, die letzte Runde geruht haben
  for (const u of state.units) {
    if (u.owner !== pid) continue;
    const max = UNITS[u.type].hp;
    if (!u.acted && u.hp < max) {
      let inTerritory = false;
      for (const j of geo.within(u.idx, 1)) {
        const c = cityOn(state, j);
        if (c && c.owner === pid) { inTerritory = true; break; }
      }
      const h = Math.min(max - u.hp, inTerritory ? 4 : 2);
      u.hp += h;
      ev.push({ k: 'heal', id: u.id, idx: u.idx, amount: h });
    }
    u.moved = false;
    u.attacked = false;
    u.acted = false;
  }
  const inc = incomeOf(state, pid);
  state.players[pid].gold += inc;
  ev.push({ k: 'income', pid, amount: inc });
  checkOver(state);
  return ev;
}

export function endTurn(state) {
  const n = state.players.length;
  let guard = 0;
  do {
    state.current = (state.current + 1) % n;
    if (state.current === 0) state.turn++;
  } while (!state.players[state.current].alive && guard++ < n);
  const ev = [{ k: 'turn', pid: state.current }];
  return ev.concat(startTurn(state));
}

export function snapshotUnit(u) {
  return { ...u };
}

// Führt eine Aktion aus und gibt Ereignisse für Animationen zurück. Ungültige Aktionen → null.
export function applyAction(state, a) {
  if (state.over) return null;
  const pid = state.current;
  const player = state.players[pid];
  const ev = [];
  switch (a.type) {
    case 'move': {
      const u = unitById(state, a.unitId);
      if (!u || u.owner !== pid || !canMove(u)) return null;
      const moves = getMoves(state, u);
      if (!moves.has(a.to)) return null;
      const path = pathTo(moves, u.idx, a.to);
      u.idx = a.to;
      u.moved = true;
      u.acted = true;
      ev.push({ k: 'move', id: u.id, path });
      break;
    }
    case 'attack': {
      const u = unitById(state, a.unitId);
      const t = unitById(state, a.targetId);
      if (!u || !t || u.owner !== pid || t.owner === pid || !canAttack(u)) return null;
      if (geoOf(state).dist(u.idx, t.idx) > unitRange(state, u, u.idx)) return null;
      const r = computeCombat(state, u, t);
      const attSnap = snapshotUnit(u), defSnap = snapshotUnit(t);
      t.hp -= r.dmg;
      u.attacked = true;
      u.moved = true;
      u.acted = true;
      const e = { k: 'attack', att: attSnap, def: defSnap, dmg: r.dmg, counter: 0, killed: false, died: false, advance: null };
      if (t.hp <= 0) {
        e.killed = true;
        state.units = state.units.filter((x) => x !== t);
        state.stats.kills[pid]++;
        state.stats.losses[t.owner]++;
        if (UNITS[u.type].range === 1) {
          e.advance = t.idx;
          u.idx = t.idx;
        }
      } else if (r.counter > 0) {
        u.hp -= r.counter;
        e.counter = r.counter;
        if (u.hp <= 0) {
          e.died = true;
          state.units = state.units.filter((x) => x !== u);
          state.stats.kills[t.owner]++;
          state.stats.losses[pid]++;
        }
      }
      ev.push(e);
      break;
    }
    case 'recruit': {
      const T = UNITS[a.unitType];
      const c = cityOn(state, a.idx);
      if (!T || !c || c.owner !== pid || player.gold < T.cost) return null;
      if (state.units.some((u) => u.idx === a.idx)) return null;
      if (unitCount(state, pid) >= unitCap(state, pid)) return null;
      player.gold -= T.cost;
      const u = spawnUnit(state, a.unitType, pid, a.idx, false);
      ev.push({ k: 'recruit', id: u.id, idx: a.idx });
      break;
    }
    case 'upgrade': {
      const c = cityOn(state, a.idx);
      if (!c || c.owner !== pid || c.level >= CITY_MAX_LEVEL) return null;
      const cost = upgradeCost(c);
      if (player.gold < cost) return null;
      player.gold -= cost;
      c.level++;
      ev.push({ k: 'upgrade', idx: a.idx, level: c.level });
      break;
    }
    case 'end': {
      return endTurn(state);
    }
    default:
      return null;
  }
  return ev;
}

export function playerHasActions(state, pid) {
  const occ = buildOcc(state);
  return state.units.some((u) => u.owner === pid && (canMove(u) || (canAttack(u) && getTargets(state, u, u.idx, occ).length > 0)));
}
