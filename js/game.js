// Spielregeln und Spielzustand. Komplett ohne DOM, damit auch Simulationen in Node laufen.
import { getGeo } from './hex.js';
import {
  TERRAIN, UNITS, RES, START_RES, upgradeCost, cityDefense, CITY_MAX_LEVEL, PLAYER_COLORS, cityCenterYield, citySupply,
  cityRadius, canAfford, BUILDINGS, citySlots, hasBuilding, TRADE_RATE, TRADE_RATE_MARKET, TECHS, TOWER_LEVELS,
  TOWER_UPGRADE, TOWERS_PER_CITY, MELEE, FOOT,
} from './data.js';
import { generateMap } from './mapgen.js';

export const STATE_VERSION = 4;

/*
 config: { seed, cols, rows, biome, players: [{ human: bool, ai: 1..5, name? }], levelId?, villageDensity? }
*/
export function createGame(config) {
  const n = config.players.length;
  const map = generateMap({ seed: config.seed, cols: config.cols, rows: config.rows, players: n, biome: config.biome, villageDensity: config.villageDensity });
  const geo = getGeo(map.cols, map.rows);
  const state = {
    v: STATE_VERSION,
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
      res: { ...START_RES },
      incomeBonus: p.incomeBonus ?? (!p.human && p.ai >= 5 ? 0.5 : 0),
      alive: true,
      tech: [],
    })),
    units: [],
    nextUnitId: 1,
    current: 0,
    turn: 1,
    over: null,
    stats: { kills: new Array(n).fill(0), losses: new Array(n).fill(0) },
    fog: !!config.fog,
    explored: {},
  };
  if (state.fog) {
    state.players.forEach((p) => { if (p.human) state.explored[p.id] = new Array(geo.n).fill(0); });
  }
  // Hauptstädte zuweisen (Reihenfolge der Spieler gemischt durch Seed)
  const caps = state.cities.filter((c) => c.capital);
  caps.forEach((c, i) => { c.owner = i; c.level = 2; });
  for (const c of state.cities) c.buildings = [];
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
  const u = { id: state.nextUnitId++, type, owner, idx, hp: 1, moved: !ready, attacked: !ready, acted: false };
  if (type === 'tower') u.level = 1;
  u.hp = statsOf(state, u).hp;
  state.units.push(u);
  return u;
}

export function hasTech(state, pid, t) {
  return !!state.players[pid]?.tech?.includes(t);
}

// Werte einer Einheit inkl. Turmstufe und Forschung
export function statsOf(state, u) {
  const T = UNITS[u.type];
  const st = { hp: T.hp, atk: T.atk, def: T.def, move: T.move, range: T.range };
  if (u.type === 'tower') {
    Object.assign(st, TOWER_LEVELS[u.level || 1]);
    if (hasTech(state, u.owner, 'stonework')) st.hp += 6;
  }
  const techs = state.players[u.owner]?.tech;
  if (techs) {
    for (const t of techs) {
      const mod = TECHS[t].mod;
      if (!mod) continue;
      for (const [grp, m] of Object.entries(mod)) {
        const hit = grp === u.type || grp === 'all' && u.type !== 'tower' || grp === 'melee' && MELEE.includes(u.type) || grp === 'foot' && FOOT.includes(u.type);
        if (!hit) continue;
        for (const [k, v] of Object.entries(m)) st[k] += v;
      }
    }
  }
  return st;
}

export function isStructure(u) {
  return !!UNITS[u.type].structure;
}

// Sichtbarkeit für Kartennebel
export function visibility(state, pid) {
  const geo = geoOf(state);
  const vis = new Uint8Array(geo.n);
  for (const u of state.units) {
    if (u.owner !== pid) continue;
    const r = Math.max(2, statsOf(state, u).range) + (u.type === 'rider' || u.type === 'knight' ? 1 : 0);
    for (const j of geo.within(u.idx, r)) vis[j] = 1;
  }
  for (const c of state.cities) {
    if (c.owner !== pid) continue;
    for (const j of geo.within(c.idx, cityRadius(c) + 1)) vis[j] = 1;
  }
  return vis;
}

export function updateExplored(state) {
  if (!state.fog) return;
  for (const key of Object.keys(state.explored)) {
    const vis = visibility(state, +key);
    const ex = state.explored[key];
    for (let i = 0; i < vis.length; i++) if (vis[i]) ex[i] = 1;
  }
}

export function towersOfCity(state, ci, territory = computeTerritory(state)) {
  return state.units.filter((u) => u.type === 'tower' && territory[u.idx] === ci).length;
}

export function canBuildTower(state, pid, idx, territory = computeTerritory(state)) {
  const ci = territory[idx];
  if (ci < 0 || state.cities[ci].owner !== pid) return 'territory';
  if (state.cityAt[idx] >= 0 || !TERRAIN[state.terrain[idx]].pass) return 'tile';
  if (state.units.some((u) => u.idx === idx)) return 'occupied';
  if (towersOfCity(state, ci, territory) >= TOWERS_PER_CITY) return 'limit';
  if (!canAfford(state.players[pid].res, UNITS.tower.cost)) return 'cost';
  return null;
}

export function upgradeCostOf(state, city) {
  const base = upgradeCost(city);
  if (!base || !hasTech(state, city.owner, 'masonry')) return base;
  const c = {};
  for (const k of Object.keys(base)) c[k] = Math.ceil(base[k] * 0.75);
  return c;
}

export function techAvailable(state, pid, t) {
  const T = TECHS[t];
  if (!T || hasTech(state, pid, t)) return false;
  return T.req.every((r) => hasTech(state, pid, r));
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
  return !u.moved && !u.attacked && u.type !== 'tower';
}
export function canAttack(u) {
  return !u.attacked && !(UNITS[u.type].noMoveAttack && u.moved);
}
export function canAct(state, u) {
  if (canMove(u)) return true;
  if (!canAttack(u)) return false;
  return getTargets(state, u, u.idx, buildOcc(state)).length > 0;
}

export function unitRange(state, u) {
  return statsOf(state, u).range;
}

// Nur Städte geben Verteidigungsbonus, Gelände nicht
export function defenseMult(state, idx) {
  const c = cityOn(state, idx);
  return c ? cityDefense(c, c.owner >= 0 && hasTech(state, c.owner, 'stonework')) : 1;
}

// Erreichbare Zielfelder: Map ziel -> vorgänger (für Pfade).
// Eigene Einheiten können durchquert werden, gegnerische nicht.
export function getMoves(state, u, occ = buildOcc(state), moveOverride) {
  const geo = geoOf(state);
  const parent = new Map();
  if (!canMove(u) && moveOverride === undefined) return parent;
  const maxSteps = moveOverride ?? statsOf(state, u).move;
  const steps = new Map([[u.idx, 0]]);
  const q = [u.idx];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const s = steps.get(i);
    if (s >= maxSteps) continue;
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
  const rng = unitRange(state, u);
  const res = [];
  for (const j of geo.within(fromIdx, rng)) {
    const o = occ[j];
    if (o && o.owner !== u.owner && j !== fromIdx) res.push(o);
  }
  return res;
}

export function computeCombat(state, att, def, fromIdx = att.idx, attHp = att.hp) {
  const A = statsOf(state, att), D = statsOf(state, def);
  const aF = A.atk * (attHp / A.hp);
  const dF = D.def * (def.hp / D.hp) * defenseMult(state, def.idx) * (def.shaken ? 0.5 : 1);
  const tot = aF + dF;
  const dmg = Math.round((aF / tot) * A.atk * 4.5);
  const kill = dmg >= def.hp;
  let counter = 0;
  const geo = geoOf(state);
  if (!kill && !def.shaken && geo.dist(fromIdx, def.idx) <= unitRange(state, def)) {
    counter = Math.round((dF / tot) * D.def * 4.5);
  }
  return { dmg, counter, kill, die: counter >= attHp };
}

// Gebiet: jedes Feld gehört der nächstgelegenen Stadt in Reichweite (Gleichstand: höhere Stufe)
export function computeTerritory(state) {
  const geo = geoOf(state);
  const owner = new Int16Array(geo.n).fill(-1);
  const best = new Float32Array(geo.n).fill(1e9);
  state.cities.forEach((c, ci) => {
    for (const j of geo.within(c.idx, cityRadius(c))) {
      const d = geo.dist(c.idx, j) - c.level * 0.01;
      if (d < best[j]) { best[j] = d; owner[j] = ci; }
    }
  });
  return owner;
}

// Rohstoffertrag pro Runde, aufgeschlüsselt
export function incomeOf(state, pid, territory = computeTerritory(state)) {
  const inc = { food: 0, wood: 0, ore: 0 };
  state.cities.forEach((c, ci) => {
    if (c.owner !== pid) return;
    const y = cityYield(state, ci, territory);
    for (const k of RES) inc[k] += y[k];
  });
  const bonus = state.players[pid].incomeBonus || 0;
  if (bonus) for (const k of RES) inc[k] = Math.round(inc[k] * (1 + bonus));
  return inc;
}

// Ertrag einer Stadt: Gebiet + Zentrum + Gebäude
export function cityYield(state, ci, territory = computeTerritory(state)) {
  const inc = { food: 0, wood: 0, ore: 0 };
  const c = state.cities[ci];
  let forests = 0, rocks = 0;
  for (let i = 0; i < territory.length; i++) {
    if (territory[i] !== ci) continue;
    if (i === c.idx) {
      for (const k of RES) inc[k] += cityCenterYield(c);
      continue;
    }
    const t = state.terrain[i];
    inc[TERRAIN[t].res]++;
    if (t === 'forest') forests++;
    if (t === 'hill' || t === 'mountain') rocks++;
  }
  const tech = (t) => c.owner >= 0 && hasTech(state, c.owner, t);
  if (hasBuilding(c, 'farm')) inc.food += 3 + (tech('plough') ? 2 : 0);
  if (hasBuilding(c, 'lumber')) inc.wood += 1 + forests + (tech('saw') ? 2 : 0);
  if (hasBuilding(c, 'mine')) inc.ore += 1 + rocks * 2 + (tech('mining') ? 2 : 0);
  return inc;
}

// Freie Felder, auf denen eine Stadt neue Einheiten aufstellen kann (Zentrum zuerst)
export function spawnSpots(state, ci, occ = buildOcc(state), territory = computeTerritory(state)) {
  const c = state.cities[ci];
  const geo = geoOf(state);
  const spots = [];
  for (const j of geo.within(c.idx, cityRadius(c))) {
    if (territory[j] !== ci || occ[j] || !TERRAIN[state.terrain[j]].pass) continue;
    if (state.cityAt[j] >= 0 && j !== c.idx) continue;
    spots.push(j);
  }
  spots.sort((a, b) => geo.dist(c.idx, a) - geo.dist(c.idx, b) || a - b);
  return spots;
}

export function tradeRate(state, pid) {
  if (hasTech(state, pid, 'guild')) return TRADE_RATE_MARKET;
  return state.cities.some((c) => c.owner === pid && hasBuilding(c, 'market')) ? TRADE_RATE_MARKET : TRADE_RATE;
}

export function canRecruit(state, pid, ci, type) {
  const c = state.cities[ci];
  const T = UNITS[type];
  if (!T || !c || c.owner !== pid) return 'invalid';
  if (T.needs && !hasBuilding(c, T.needs)) return 'needs';
  if (unitCount(state, pid) >= unitCap(state, pid)) return 'cap';
  if (!canAfford(state.players[pid].res, T.cost)) return 'cost';
  if (!spawnSpots(state, ci).length) return 'space';
  return null;
}

// Versorgung: jede Stadt versorgt so viele Einheiten, wie sie Gold einbringt
export function unitCap(state, pid) {
  let sum = 0;
  for (const c of state.cities) if (c.owner === pid) sum += citySupply(c);
  return sum;
}

export function unitCount(state, pid) {
  let n = 0;
  for (const u of state.units) if (u.owner === pid && u.type !== 'tower') n++;
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
    const max = statsOf(state, u).hp;
    if (!u.acted && u.hp < max) {
      let inTerritory = false;
      for (const j of geo.within(u.idx, 1)) {
        const c = cityOn(state, j);
        if (c && c.owner === pid) { inTerritory = true; break; }
      }
      const h = Math.min(max - u.hp, (inTerritory ? 4 : 2) + (hasTech(state, pid, 'medic') ? 2 : 0));
      u.hp += h;
      ev.push({ k: 'heal', id: u.id, idx: u.idx, amount: h });
    }
    u.moved = false;
    u.attacked = false;
    u.acted = false;
    u.shaken = false;
  }
  const inc = incomeOf(state, pid);
  const p = state.players[pid];
  for (const k of RES) p.res[k] += inc[k];
  ev.push({ k: 'income', pid, amount: inc });
  checkOver(state);
  updateExplored(state);
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
      if (geoOf(state).dist(u.idx, t.idx) > unitRange(state, u)) return null;
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
        if (UNITS[u.type].range === 1 && u.type !== 'tower') {
          e.advance = t.idx;
          u.idx = t.idx;
        }
      } else {
        if (statsOf(state, u).range > 1 && t.type !== 'tower') { t.shaken = true; e.shaken = true; }
      }
      if (!e.killed && r.counter > 0) {
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
      const ci = state.cityAt[a.idx];
      if (ci < 0 || canRecruit(state, pid, ci, a.unitType)) return null;
      const T = UNITS[a.unitType];
      const c = state.cities[ci];
      const spot = spawnSpots(state, ci)[0];
      for (const k of RES) player.res[k] -= T.cost[k] || 0;
      const u = spawnUnit(state, a.unitType, pid, spot, hasBuilding(c, 'barracks'));
      ev.push({ k: 'recruit', id: u.id, idx: spot });
      break;
    }
    case 'build': {
      const c = cityOn(state, a.idx);
      const B = BUILDINGS[a.building];
      if (!c || !B || c.owner !== pid || hasBuilding(c, a.building)) return null;
      if (c.buildings.length >= citySlots(c) || !canAfford(player.res, B.cost)) return null;
      for (const k of RES) player.res[k] -= B.cost[k] || 0;
      c.buildings.push(a.building);
      ev.push({ k: 'build', idx: a.idx, building: a.building });
      break;
    }
    case 'trade': {
      const rate = tradeRate(state, pid);
      if (!RES.includes(a.give) || !RES.includes(a.get) || a.give === a.get || player.res[a.give] < rate) return null;
      player.res[a.give] -= rate;
      player.res[a.get] += 1;
      ev.push({ k: 'trade', give: a.give, get: a.get });
      break;
    }
    case 'upgrade': {
      const c = cityOn(state, a.idx);
      if (!c || c.owner !== pid || c.level >= CITY_MAX_LEVEL) return null;
      const cost = upgradeCostOf(state, c);
      if (!canAfford(player.res, cost)) return null;
      for (const k of RES) player.res[k] -= cost[k] || 0;
      c.level++;
      ev.push({ k: 'upgrade', idx: a.idx, level: c.level });
      break;
    }
    case 'tower': {
      if (canBuildTower(state, pid, a.idx)) return null;
      for (const k of RES) player.res[k] -= UNITS.tower.cost[k] || 0;
      const u = spawnUnit(state, 'tower', pid, a.idx, false);
      ev.push({ k: 'recruit', id: u.id, idx: a.idx });
      break;
    }
    case 'towerUp': {
      const u = unitById(state, a.unitId);
      if (!u || u.type !== 'tower' || u.owner !== pid || u.level >= 3) return null;
      const cost = TOWER_UPGRADE[u.level];
      if (!canAfford(player.res, cost)) return null;
      for (const k of RES) player.res[k] -= cost[k] || 0;
      const before = statsOf(state, u).hp;
      u.level++;
      u.hp += statsOf(state, u).hp - before;
      ev.push({ k: 'upgrade', idx: u.idx, level: u.level, tower: true });
      break;
    }
    case 'research': {
      const T = TECHS[a.tech];
      if (!techAvailable(state, pid, a.tech) || !canAfford(player.res, T.cost)) return null;
      for (const k of RES) player.res[k] -= T.cost[k] || 0;
      const hpBefore = new Map(state.units.filter((u) => u.owner === pid).map((u) => [u.id, statsOf(state, u).hp]));
      player.tech.push(a.tech);
      for (const u of state.units) if (hpBefore.has(u.id)) u.hp += statsOf(state, u).hp - hpBefore.get(u.id);
      ev.push({ k: 'research', tech: a.tech, pid });
      break;
    }
    case 'end': {
      return endTurn(state);
    }
    default:
      return null;
  }
  updateExplored(state);
  return ev;
}

export function playerHasActions(state, pid) {
  const occ = buildOcc(state);
  return state.units.some((u) => u.owner === pid && (canMove(u) || (canAttack(u) && getTargets(state, u, u.idx, occ).length > 0)));
}
