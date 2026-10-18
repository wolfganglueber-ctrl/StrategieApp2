// Spielregeln und Spielzustand. Komplett ohne DOM, damit auch Simulationen in Node laufen.
import { getGeo, hexCenter, pixelToIndex, SQRT3 } from './hex.js';
import {
  TERRAIN, UNITS, RES, START_RES, upgradeCost, cityDefense, CITY_MAX_LEVEL, PLAYER_COLORS, cityCenterYield, citySupply, upkeepOf,
  cityRadius, canAfford, BUILDINGS, citySlots, hasBuilding, TRADE_RATE, TRADE_RATE_GUILD, TECHS, TOWER_LEVELS,
  TOWER_UPGRADE, TOWERS_PER_CITY, STRUCTURE_LIMIT, structureLimit, CASTLE_DEF, MELEE, FOOT, moveCap, AURA, HEAL, RANK_XP, RANK_BONUS, MAX_RANK, PERKS, PERK_CHOICES,
  PERK_RANKS, FLANK_BONUS, FLANK_MAX, CAVALRY, REGIMENT_MAX, REGIMENT_TYPES, FUSION_COST, fusionResult, BUILDING_FLAT,
} from './data.js';
import { generateMap } from './mapgen.js';

export const STATE_VERSION = 5;

/*
 config: { seed, cols, rows, biome, players: [{ human: bool, ai: 1..6, name? }], levelId?, villageDensity?, fusion? }
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
      incomeBonus: p.incomeBonus ?? (!p.human && p.ai >= 6 ? 0.5 : 0),
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
    fusion: !!config.fusion,
    explored: {},
  };
  if (state.fog) {
    state.players.forEach((p) => { if (p.human) state.explored[p.id] = new Array(geo.n).fill(0); });
  }
  // Hauptstädte zuweisen (Reihenfolge der Spieler gemischt durch Seed)
  const caps = state.cities.filter((c) => c.capital);
  caps.forEach((c, i) => { c.owner = i; c.level = 2; c.castle = true; });
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
  const u = { id: state.nextUnitId++, type, owner, idx, hp: 1, moved: !ready, attacked: !ready, acted: false, rank: 1, xp: 0 };
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
  if (u.mix) Object.assign(st, { hp: u.mix.hp, atk: u.mix.atk, def: u.mix.def, move: u.mix.move, range: u.mix.range }); // Chimäre
  if (u.type === 'tower') {
    Object.assign(st, TOWER_LEVELS[u.level || 1]);
    if (hasTech(state, u.owner, 'stonework')) st.hp += 6;
  }
  if (u.type === 'barrier' && hasTech(state, u.owner, 'battlements')) st.hp += 25;
  const techs = state.players[u.owner]?.tech;
  if (techs) {
    for (const t of techs) {
      const mod = TECHS[t].mod;
      if (!mod) continue;
      for (const [grp, m] of Object.entries(mod)) {
        const hit = grp === u.type || grp === 'all' && !UNITS[u.type].structure || grp === 'melee' && MELEE.includes(u.type) || grp === 'foot' && FOOT.includes(u.type);
        if (!hit) continue;
        for (const [k, v] of Object.entries(m)) st[k] += v;
      }
    }
  }
  // Rang und Fähigkeiten
  const r = (u.rank || 1) - 1;
  if (r > 0) {
    st.hp = Math.round(st.hp * (1 + RANK_BONUS.hp * r));
    st.atk = Math.round(st.atk * (1 + RANK_BONUS.atk * r) * 10) / 10;
    st.def = Math.round(st.def * (1 + RANK_BONUS.def * r) * 10) / 10;
    if (r >= 1 && CAVALRY.includes(u.type)) st.move++;
    if (r >= 3) st.move++;
  }
  if (hasPerk(u, 'tough')) st.hp = Math.round(st.hp * 1.25);
  if (hasPerk(u, 'shieldwall')) st.def = Math.round(st.def * 1.3 * 10) / 10;
  if (hasPerk(u, 'swift')) st.move++;
  // Verband: Lebenspunkte aller Mitglieder
  st.hp *= u.count || 1;
  st.move = Math.min(st.move, moveCap(u.type));
  return st;
}

export function canPetrify(t) {
  return !isStructure(t) && t.type !== 'troll' && t.type !== 'dragon' && !t.stone;
}

export function hasPerk(u, p) {
  return !!u.perks?.includes(p);
}

// Angriffsfaktor aus Fähigkeiten und Flankenbonus
export function attackMult(state, att, def, fromIdx = att.idx) {
  let m = 1;
  if (hasPerk(att, 'charge') && (att.moved || fromIdx !== att.idx)) m += 0.3;
  if (hasPerk(att, 'siege') && (cityOn(state, def.idx) || isStructure(def))) m += 0.3;
  if (hasPerk(att, 'hunter') && (CAVALRY.includes(def.type) || def.type === 'troll' || def.type === 'dragon')) m += 0.4;
  // Drachen sind anfällig gegen Pfeile
  if (UNITS[def.type].arrowWeak && (att.type === 'archer' || att.type === 'tower')) m += 0.6;
  if (!isStructure(att)) m += (hasTech(state, att.owner, 'tactics') ? 0.15 : FLANK_BONUS) * flankers(state, att, def);
  if (UNITS[att.type].siegeMult && (isStructure(def) || cityOn(state, def.idx) || castleOf(state, def.idx))) m *= UNITS[att.type].siegeMult;
  // Belagerungswaffen: gegen Truppen im offenen Feld schwächer
  if (UNITS[att.type].fieldMult && !isStructure(def) && !cityOn(state, def.idx)) m *= UNITS[att.type].fieldMult;
  return m;
}

// Andere eigene Einheiten direkt neben dem Ziel
export function flankers(state, att, def) {
  const geo = geoOf(state);
  let n = 0;
  for (const x of state.units) {
    if (x.owner === att.owner && x !== att && !isStructure(x) && geo.dist(x.idx, def.idx) === 1) n++;
  }
  return Math.min(FLANK_MAX, n);
}

export function splashOf(u) {
  const base = UNITS[u.type].splash || 0;
  if (hasPerk(u, 'fire')) return base + 0.25;
  if (hasPerk(u, 'rampage')) return Math.max(base, 0.3);
  return base;
}

// Erfahrung sammeln; bei Rangaufstieg wachsen die Lebenspunkte mit
export function gainXp(state, u, n, ev) {
  if (isStructure(u) || !state.units.includes(u)) return;
  u.xp = (u.xp || 0) + n;
  while ((u.rank || 1) < MAX_RANK && u.xp >= RANK_XP[(u.rank || 1) + 1]) rankUp(state, u, ev);
}

function rankUp(state, u, ev) {
  const before = statsOf(state, u).hp;
  u.rank = (u.rank || 1) + 1;
  u.hp += statsOf(state, u).hp - before;
  if (PERK_RANKS.includes(u.rank) && PERK_CHOICES[u.type]) u.pick = u.rank;
  ev.push({ k: 'rank', id: u.id, idx: u.idx, rank: u.rank });
}

export function perkOptions(u) {
  if (!u.pick || !PERK_CHOICES[u.type]) return [];
  const tiers = PERK_CHOICES[u.type];
  // Dritte Stufe: Auswahl aus allen Spezialisierungen dieser Einheit, die sie noch nicht hat
  const opts = tiers[PERK_RANKS.indexOf(u.pick)] || [...new Set(tiers.flat())];
  return opts.filter((p) => !u.perks?.includes(p));
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

// Bauwerke einer Stadt: alle dieses Typs im Umkreis von 2 Feldern
export function towersOfCity(state, ci, territory = computeTerritory(state), type = 'tower') {
  const c = state.cities[ci], geo = geoOf(state);
  return state.units.filter((u) => u.type === type && u.owner === c.owner && geo.dist(u.idx, c.idx) <= cityRadius(c)).length;
}

// Turm oder Steinwall auf ein Feld im eigenen Stadtgebiet setzen
export function canBuildTower(state, pid, idx, territory = computeTerritory(state), type = 'tower', ci = territory[idx]) {
  // Erlaubt im ganzen Umkreis der Stadt (2 Felder), solange das Feld nicht zu einem fremden Reich gehört
  const c = state.cities[ci];
  if (!c || c.owner !== pid || geoOf(state).dist(c.idx, idx) > cityRadius(c)) return 'territory';
  if (territory[idx] >= 0 && state.cities[territory[idx]].owner !== pid) return 'territory';
  if (state.cityAt[idx] >= 0 || !TERRAIN[state.terrain[idx]].pass) return 'tile';
  if (state.units.some((u) => u.idx === idx)) return 'occupied';
  if (towersOfCity(state, ci, territory, type) >= structureLimit(c, type)) return 'limit';
  if (!canAfford(state.players[pid].res, UNITS[type].cost)) return 'cost';
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
  if (!T || hasTech(state, pid, t) || (T.fusionOnly && !state.fusion)) return false;
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
  return !u.moved && !u.attacked && !UNITS[u.type].structure;
}
export function canAttack(u) {
  return !u.attacked && !(UNITS[u.type].noMoveAttack && u.moved);
}
export function canAct(state, u) {
  if (canMove(u)) return true;
  if (!canAttack(u)) return false;
  return getTargets(state, u, u.idx, buildOcc(state)).length > 0 || getHealTargets(state, u).length > 0;
}

export function unitRange(state, u) {
  return statsOf(state, u).range;
}

// Nur Städte (und alle 7 Burgfelder) geben Verteidigungsbonus, Gelände nicht
export function defenseMult(state, idx) {
  const c = cityOn(state, idx) || castleOf(state, idx);
  if (!c) return 1;
  const d = cityDefense(c, c.owner >= 0 && hasTech(state, c.owner, 'stonework'));
  if (!c.castle) return d;
  return Math.max(d, CASTLE_DEF) * (c.owner >= 0 && hasTech(state, c.owner, 'keep') ? 1.25 : 1);
}

// Burg: die Hauptstadt belegt ihr Feld und die 6 Nachbarfelder
export function castleOf(state, idx) {
  const c = cityOn(state, idx);
  if (c) return c.castle ? c : null;
  for (const j of geoOf(state).nb[idx]) {
    const d = cityOn(state, j);
    if (d?.castle) return d;
  }
  return null;
}

// Der Burgfried lässt sich erst betreten, wenn kein Verteidiger mehr auf den Burgfeldern steht
export function castleBlocked(state, idx, pid, occ = buildOcc(state)) {
  const c = cityOn(state, idx);
  if (!c?.castle || c.owner < 0 || c.owner === pid) return false;
  return geoOf(state).nb[idx].some((j) => occ[j] && occ[j].owner === c.owner);
}

// Erreichbare Zielfelder: Map ziel -> vorgänger (für Pfade).
// Eigene Einheiten können durchquert werden, gegnerische nicht. Felder mit eigenen Einheiten kosten
// keine Bewegung (man springt darüber), zählen aber für die Zugweite (moveCap). Wald kostet 2.
export function getMoves(state, u, occ = buildOcc(state), moveOverride) {
  const geo = geoOf(state);
  const res = new Map();
  if (!canMove(u) && moveOverride === undefined) return res;
  const maxSteps = moveOverride ?? statsOf(state, u).move;
  if (UNITS[u.type].flying) return flyMoves(state, u, occ, maxSteps);
  const maxLen = Math.max(maxSteps, moveCap(u.type));
  // Breitensuche über (Feld, verbrauchte Bewegung), geordnet nach Weglänge
  const K = maxSteps + 1;
  const parent = new Map([[u.idx * K, -1]]);
  let layer = [u.idx * K];
  for (let len = 1; len <= maxLen && layer.length; len++) {
    const next = [];
    for (const key of layer) {
      const i = Math.floor(key / K), s = key % K;
      for (const j of geo.nb[i]) {
        if (j === u.idx || !TERRAIN[state.terrain[j]].pass) continue;
        const o = occ[j];
        if (o && o.owner !== u.owner) continue;
        if (!o && castleBlocked(state, j, u.owner, occ)) continue;
        // Wald kostet 1 Bewegung mehr; ein erster Schritt ist aber immer möglich
        let ns = s + (o ? 0 : state.terrain[j] === 'forest' ? 2 : 1);
        if (ns > maxSteps && s === 0 && !o) ns = maxSteps;
        if (ns > maxSteps || (o && ns >= maxSteps)) continue;
        const nk = j * K + ns;
        if (parent.has(nk)) continue;
        parent.set(nk, key);
        next.push(nk);
        if (!o && !res.has(j)) res.set(j, nk);
      }
    }
    layer = next;
  }
  // Pfad zu einem Ziel (inkl. übersprungener Felder)
  res.pathOf = (to) => {
    const path = [];
    for (let k = res.get(to); k !== -1 && k !== undefined; k = parent.get(k)) path.push(Math.floor(k / K));
    return path.reverse();
  };
  return res;
}

// Fliegende Einheiten überqueren Berge, Wasser und eigene Einheiten, aber keine Gegner; sie landen nur auf freien, begehbaren Feldern
function flyMoves(state, u, occ, maxSteps) {
  const geo = geoOf(state);
  const res = new Map();
  const parent = new Map([[u.idx, -1]]);
  let layer = [u.idx];
  for (let len = 1; len <= maxSteps && layer.length; len++) {
    const next = [];
    for (const i of layer) {
      for (const j of geo.nb[i]) {
        if (parent.has(j) || (occ[j] && occ[j].owner !== u.owner)) continue;
        parent.set(j, i);
        next.push(j);
        if (!occ[j] && TERRAIN[state.terrain[j]].pass && !castleBlocked(state, j, u.owner, occ)) res.set(j, i);
      }
    }
    layer = next;
  }
  res.pathOf = (to) => {
    const path = [];
    for (let k = to; k !== -1 && k !== undefined; k = parent.get(k)) path.push(k);
    return path.reverse();
  };
  return res;
}

export function pathTo(moves, from, to) {
  return moves.pathOf(to);
}

export function getTargets(state, u, fromIdx, occ = buildOcc(state)) {
  const geo = geoOf(state);
  const rng = unitRange(state, u);
  const minR = UNITS[u.type].minRange || 1;
  const res = [];
  for (const j of geo.within(fromIdx, rng)) {
    const o = occ[j];
    if (o && o.owner !== u.owner && j !== fromIdx && (minR <= 1 || geo.dist(fromIdx, j) >= minR)) res.push(o);
  }
  return res;
}

export function computeCombat(state, att, def, fromIdx = att.idx, attHp = att.hp) {
  const A = statsOf(state, att), D = statsOf(state, def);
  const atk = A.atk * attackMult(state, att, def, fromIdx);
  const aF = atk * (attHp / A.hp);
  const dF = D.def * (def.hp / D.hp) * (UNITS[att.type].ignoreWalls ? 1 : defenseMult(state, def.idx)) * (def.shaken ? 0.5 : 1);
  const tot = aF + dF;
  // Verbände teilen Schaden mal Mitgliederzahl aus; Flächenwaffen treffen Verbände härter
  const na = att.count || 1, nd = def.count || 1;
  const crowd = nd > 1 && splashOf(att) > 0 ? 1 + 0.25 * (nd - 1) : 1;
  const dmg = Math.round((aF / tot) * atk * 4.5 * na * crowd * (UNITS[att.type].dmgMult || 1) * (inAura(state, def) ? 1 - AURA.reduce : 1));
  const kill = dmg >= def.hp;
  let counter = 0;
  const geo = geoOf(state);
  if (!kill && !def.shaken && !def.stone && !def.stoneNow && geo.dist(fromIdx, def.idx) <= unitRange(state, def)) {
    counter = Math.round((dF / tot) * D.def * 4.5 * nd * (inAura(state, att, fromIdx) ? 1 - AURA.reduce : 1));
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
  // Unterhalt der Armee wird vom Ertrag abgezogen (kann negativ werden)
  const up = upkeepTotal(state, pid);
  for (const k of RES) inc[k] -= up[k];
  return inc;
}

export function upkeepTotal(state, pid) {
  const up = { food: 0, wood: 0, ore: 0 };
  for (const u of state.units) {
    if (u.owner !== pid) continue;
    const c = upkeepOf(u.type);
    for (const k in c) up[k] += c[k] * (u.count || 1);
  }
  if (hasTech(state, pid, 'granary')) up.food = Math.ceil(up.food * 0.75);
  return up;
}

// Ertrag einer Stadt: Gebiet + Zentrum + Gebäude
export function cityYield(state, ci, territory = computeTerritory(state)) {
  const inc = { food: 0, wood: 0, ore: 0 };
  const c = state.cities[ci];
  for (let i = 0; i < territory.length; i++) {
    if (territory[i] !== ci) continue;
    if (i === c.idx) {
      for (const k of RES) inc[k] += cityCenterYield(c);
      continue;
    }
    // Jedes Feld im Stadtkreis liefert 1; erst Bauernhof/Holzfäller/Mine lassen es mit der Stadtstufe wachsen
    const t = state.terrain[i];
    inc[TERRAIN[t].res]++;
  }
  // Bauernhof, Holzfäller, Mine: +1 je passendem Feld im Stadtkreis (Wiese/See, Wald, Hügel/Gebirge)
  const tiles = cityTiles(state, ci, territory);
  const tech = (t) => c.owner >= 0 && hasTech(state, c.owner, t);
  // Gebäude: +Stufe je passendem Feld (Reihenfolge von Bau und Ausbau egal); ohne passendes Feld pauschal 4 (+1 je weiterer Stufe)
  const per = (n) => (n ? n * c.level : BUILDING_FLAT + c.level - 1);
  if (hasBuilding(c, 'farm')) inc.food += per(tiles.food) + (tech('plough') ? 2 : 0) + (tech('rotation') ? 2 : 0);
  if (hasBuilding(c, 'lumber')) inc.wood += per(tiles.wood) + (tech('saw') ? 2 : 0);
  if (hasBuilding(c, 'mine')) inc.ore += per(tiles.ore) + (tech('mining') ? 2 : 0) + (tech('smelting') ? 2 : 0);
  return inc;
}

// Felder im Stadtkreis je Rohstoff (ohne das Stadtzentrum)
export function cityTiles(state, ci, territory = computeTerritory(state)) {
  const c = state.cities[ci];
  const n = { food: 0, wood: 0, ore: 0 };
  for (let i = 0; i < territory.length; i++) {
    if (territory[i] !== ci || i === c.idx) continue;
    n[TERRAIN[state.terrain[i]].res]++;
  }
  return n;
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

// Bauen möglich? null oder Grund: 'built', 'slots', 'level', 'realm', 'cost'
export function canBuild(state, pid, c, b) {
  const B = BUILDINGS[b];
  if (hasBuilding(c, b)) return 'built';
  if (B.fusionOnly && !state.fusion) return 'off';
  if (B.tech && !hasTech(state, pid, B.tech)) return 'tech';
  if (c.level < (B.minLevel || 0)) return 'level';
  if (B.perRealm && state.cities.filter((x) => x.owner === pid && hasBuilding(x, b)).length >= B.perRealm) return 'realm';
  if (c.buildings.length >= citySlots(c)) return 'slots';
  if (!canAfford(state.players[pid].res, B.cost)) return 'cost';
  return null;
}

// Handeln geht nur mit einem Markt (3:1); die Handelsgilde verbessert den Kurs auf 2:1. Ohne Markt: 0
// Preis für n Stück zum Kurs rate (bei 3:2 aufgerundet)
export function tradeCost(rate, n) {
  return Math.ceil(rate * n - 1e-9);
}

export function tradeRate(state, pid) {
  if (!state.cities.some((c) => c.owner === pid && hasBuilding(c, 'market'))) return 0;
  return hasTech(state, pid, 'guild') ? TRADE_RATE_GUILD : TRADE_RATE;
}

export function canRecruit(state, pid, ci, type) {
  const c = state.cities[ci];
  const T = UNITS[type];
  if (!T || !c || c.owner !== pid) return 'invalid';
  if (T.tech && !hasTech(state, pid, T.tech)) return 'tech';
  if (T.needs && !hasBuilding(c, T.needs)) return 'needs';
  if (T.perRealm && state.units.filter((u) => u.owner === pid && u.type === type).length >= T.perRealm) return 'unique';
  if (T.healer && state.units.filter((u) => u.owner === pid && u.type === type).length >= cityCount(state, pid)) return 'limit';
  if (!canAfford(state.players[pid].res, T.cost)) return 'cost';
  if (!spawnSpots(state, ci).length) return 'space';
  return null;
}

// Versorgung: kein Limit für Spieler mehr, nur Richtmaß für die Armeegröße der KI
export function unitCap(state, pid) {
  let sum = 0;
  for (const c of state.cities) if (c.owner === pid) sum += citySupply(c);
  return sum;
}

export function unitCount(state, pid) {
  let n = 0;
  for (const u of state.units) if (u.owner === pid && !UNITS[u.type].structure) n += (UNITS[u.type].supply || 1) * (u.count || 1);
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
      // Türme und Steinwälle im Gebiet der Stadt wechseln mit die Seite
      if (old >= 0) {
        const territory = computeTerritory(state), ci = state.cityAt[c.idx];
        for (const s of state.units) {
          if (s.owner === old && isStructure(s) && territory[s.idx] === ci) {
            s.owner = pid;
            s.attacked = true;
            ev.push({ k: 'defect', id: s.id, idx: s.idx, pid });
          }
        }
      }
      if (old >= 0 && cityCount(state, old) === 0) eliminate(state, old, ev);
    }
  }
  // Heilung für Einheiten, die letzte Runde geruht haben
  for (const u of state.units) {
    if (u.owner !== pid) continue;
    const max = statsOf(state, u).hp;
    // Trolle und zähe Einheiten heilen jede Runde, alle anderen nur nach einer Ruhepause
    const always = (UNITS[u.type].regen || 0) + (hasPerk(u, 'tough') ? 2 : 0);
    if ((!u.acted || always) && u.hp < max) {
      let h = always;
      if (!u.acted) {
        let inTerritory = false;
        for (const j of geo.within(u.idx, 1)) {
          const c = cityOn(state, j);
          if (c && c.owner === pid) { inTerritory = true; break; }
        }
        h += (inTerritory ? 4 : 2) + (hasTech(state, pid, 'medic') ? 2 : 0);
      }
      h = Math.min(max - u.hp, h * (u.count || 1));
      u.hp += h;
      ev.push({ k: 'heal', id: u.id, idx: u.idx, amount: h });
    }
    // Wache halten endet, sobald ein Gegner in der Nähe ist
    if (u.sentry && state.units.some((e) => e.owner !== pid && geo.dist(e.idx, u.idx) <= 3)) {
      u.sentry = false;
      ev.push({ k: 'wake', id: u.id, idx: u.idx });
    }
    u.moved = false;
    u.attacked = false;
    u.acted = false;
    u.shaken = false;
    // Versteinert: diesen Zug aussetzen, danach wieder frei
    if (u.stone) {
      u.stone = 0;
      u.moved = u.attacked = true;
      u.acted = true;
      u.stoneNow = true;
      ev.push({ k: 'stone', id: u.id, idx: u.idx });
    } else u.stoneNow = false;
  }
  const inc = incomeOf(state, pid);
  const p = state.players[pid];
  for (const k of RES) p.res[k] = Math.max(0, p.res[k] + inc[k]);
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

// Schutzaura: steht ein eigener Zauberer in der Nähe (nicht die Einheit selbst)?
export function auraRadius(state, pid) {
  return hasTech(state, pid, 'enlight') ? AURA.radius2 : AURA.radius;
}
export function inAura(state, u, idx = u.idx) {
  if (isStructure(u)) return false;
  const geo = geoOf(state);
  const r = auraRadius(state, u.owner);
  for (const m of state.units) {
    if (m.owner === u.owner && m !== u && UNITS[m.type].healer && geo.dist(m.idx, idx) <= r + (hasPerk(m, 'wideaura') ? 1 : 0)) return true;
  }
  return false;
}

// Heilen: Zauberer heilt eine eigene Einheit bis 3 Felder entfernt (statt anzugreifen)
export function healAmount(state, u) {
  return HEAL.base + (hasTech(state, u.owner, 'blessing') ? HEAL.blessing : 0) + (hasPerk(u, 'greatheal') ? 3 : 0);
}
export function needsHeal(state, healer, t) {
  return t.hp < statsOf(state, t).hp || (t.shaken && hasTech(state, healer.owner, 'blessing'));
}
export function getHealTargets(state, u, fromIdx = u.idx) {
  if (!UNITS[u.type].healer) return [];
  const geo = geoOf(state);
  return state.units.filter((t) => t.owner === u.owner && t !== u && !isStructure(t) && geo.dist(fromIdx, t.idx) <= HEAL.range && needsHeal(state, u, t));
}

// Flächenschaden (Katapult): gegnerische Einheiten neben dem Ziel bekommen einen Teil des Schadens.
// Feueratem in Linie (Drache): die Felder hinter dem Ziel in Angriffsrichtung werden mitgetroffen.
export function splashDamage(state, att, idx, dmg, from = att.idx) {
  const geo = geoOf(state);
  const res = [];
  const line = UNITS[att.type].line;
  const inLine = new Set();
  if (line && from !== idx) {
    const a = hexCenter(from, state.cols, 1), b = hexCenter(idx, state.cols, 1);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, dx = ((b.x - a.x) / len) * SQRT3, dy = ((b.y - a.y) / len) * SQRT3;
    line.forEach((f, k) => {
      const j = pixelToIndex(b.x + dx * (k + 1), b.y + dy * (k + 1), 1, state.cols, state.rows);
      if (j < 0) return;
      inLine.add(j);
      const o = state.units.find((x) => x.idx === j);
      if (o && o.owner !== att.owner) res.push({ unit: o, dmg: Math.round(dmg * f * (inAura(state, o) ? AURA.splash : 1)) });
    });
  }
  if (!splashOf(att)) return res.filter((h) => h.dmg > 0);
  for (const j of geo.nb[idx]) {
    if (inLine.has(j)) continue;
    const o = state.units.find((x) => x.idx === j);
    if (!o || o.owner === att.owner) continue;
    const d = Math.round(dmg * splashOf(att) * (inAura(state, o) ? AURA.splash : 1));
    if (d > 0) res.push({ unit: o, dmg: d });
  }
  return res;
}

function applySplash(state, att, idx, dmg, from) {
  const out = [];
  for (const { unit, dmg: d } of splashDamage(state, att, idx, dmg, from)) {
    const hit = { id: unit.id, idx: unit.idx, dmg: d, killed: false, snap: snapshotUnit(unit) };
    unit.hp -= d;
    if (unit.hp <= 0) {
      hit.killed = true;
      state.units = state.units.filter((x) => x !== unit);
      state.stats.kills[att.owner]++;
      state.stats.losses[unit.owner] += unit.count || 1;
    }
    out.push(hit);
  }
  return out;
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
      u.sentry = false;
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
        state.stats.losses[t.owner] += t.count || 1;
        if (UNITS[u.type].range === 1 && !isStructure(u) && !castleBlocked(state, t.idx, pid)) {
          e.advance = t.idx;
          u.idx = t.idx;
        }
      } else {
        if (statsOf(state, u).range > 1 && !isStructure(t)) { t.shaken = true; e.shaken = true; }
        // Basilisk versteinert: das Ziel setzt seinen nächsten Zug aus (Titanen und Bauwerke sind immun)
        if (UNITS[u.type].petrify && canPetrify(t)) { t.stone = 1; e.stone = true; }
      }
      if (!e.killed && r.counter > 0) {
        u.hp -= r.counter;
        e.counter = r.counter;
        if (u.hp <= 0) {
          e.died = true;
          state.units = state.units.filter((x) => x !== u);
          state.stats.kills[t.owner]++;
          state.stats.losses[pid] += u.count || 1;
        }
      }
      if (splashOf(u) || UNITS[u.type].line) e.splash = applySplash(state, u, defSnap.idx, r.dmg, attSnap.idx);
      ev.push(e);
      // Erfahrung: Angreifer +1 (+1 für einen Sieg), überlebender Verteidiger +1
      // Erfahrung = besiegte Gegner (auch durch Flächenschaden oder Gegenschlag)
      const kills = (e.killed ? 1 : 0) + (e.splash || []).filter((h) => h.killed).length;
      if (!e.died && kills) gainXp(state, u, kills, ev);
      if (e.died && !e.killed) gainXp(state, t, 1, ev);
      break;
    }
    case 'heal': {
      const u = unitById(state, a.unitId);
      const t = unitById(state, a.targetId);
      if (!u || !t || u.owner !== pid || !canAttack(u) || !getHealTargets(state, u).includes(t)) return null;
      const h = Math.min(statsOf(state, t).hp - t.hp, healAmount(state, u) * (t.count || 1));
      t.hp += h;
      if (hasTech(state, pid, 'blessing')) t.shaken = false;
      u.attacked = true;
      u.moved = true;
      u.acted = true;
      ev.push({ k: 'heal', id: t.id, idx: t.idx, amount: h, by: u.id, from: u.idx });
      if (h > 0) gainXp(state, u, 1, ev); // Zauberer steigen durch Heilen auf
      break;
    }
    case 'perk': {
      const u = unitById(state, a.unitId);
      if (!u || u.owner !== pid || !perkOptions(u).includes(a.perk)) return null;
      const before = statsOf(state, u).hp;
      u.perks = [...(u.perks || []), a.perk];
      u.pick = 0;
      u.hp += statsOf(state, u).hp - before;
      ev.push({ k: 'perk', id: u.id, idx: u.idx, perk: a.perk });
      break;
    }
    case 'sentry': {
      const u = unitById(state, a.unitId);
      if (!u || u.owner !== pid || isStructure(u)) return null;
      u.sentry = !u.sentry;
      ev.push({ k: 'sentry', id: u.id, on: u.sentry });
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
      if (!c || !B || c.owner !== pid || canBuild(state, pid, c, a.building)) return null;
      for (const k of RES) player.res[k] -= B.cost[k] || 0;
      c.buildings.push(a.building);
      ev.push({ k: 'build', idx: a.idx, building: a.building });
      break;
    }
    case 'trade': {
      const rate = tradeRate(state, pid);
      const n = Math.max(1, Math.floor(a.count || 1));
      if (!rate || !RES.includes(a.give) || !RES.includes(a.get) || a.give === a.get || player.res[a.give] < tradeCost(rate, n)) return null;
      player.res[a.give] -= tradeCost(rate, n);
      player.res[a.get] += n;
      ev.push({ k: 'trade', give: a.give, get: a.get, count: n });
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
      const type = a.unitType === 'barrier' ? 'barrier' : 'tower';
      const territory = computeTerritory(state);
      const ci = a.city != null ? state.cityAt[a.city] : territory[a.idx];
      if (ci == null || ci < 0 || canBuildTower(state, pid, a.idx, territory, type, ci)) return null;
      for (const k of RES) player.res[k] -= UNITS[type].cost[k] || 0;
      const u = spawnUnit(state, type, pid, a.idx, false);
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
    case 'demolish': {
      // Gebäude abreißen: Bauplatz wird frei, halbe Kosten zurück
      const c = cityOn(state, a.idx);
      const B = BUILDINGS[a.building];
      if (!c || !B || c.owner !== pid || !hasBuilding(c, a.building)) return null;
      c.buildings = c.buildings.filter((b) => b !== a.building);
      for (const k of RES) player.res[k] += Math.floor((B.cost[k] || 0) / 2);
      ev.push({ k: 'demolish', idx: a.idx, building: a.building });
      break;
    }
    case 'raze': {
      // Eigenen Turm oder Steinwall abreißen
      const u = unitById(state, a.unitId);
      if (!u || u.owner !== pid || !isStructure(u)) return null;
      state.units = state.units.filter((x) => x !== u);
      for (const k of RES) player.res[k] += Math.floor((UNITS[u.type].cost[k] || 0) / 2);
      ev.push({ k: 'demolish', idx: u.idx, unit: u.type, snap: snapshotUnit(u) });
      break;
    }
    case 'disband': {
      // Eigene Einheit entlassen: keine Rückerstattung
      const u = unitById(state, a.unitId);
      if (!u || u.owner !== pid || isStructure(u)) return null;
      state.units = state.units.filter((x) => x !== u);
      ev.push({ k: 'demolish', idx: u.idx, unit: u.type, snap: snapshotUnit(u), disband: true });
      break;
    }
    case 'merge': {
      const u = unitById(state, a.unitId), t = unitById(state, a.targetId);
      if (!u || !t || u.owner !== pid || !canMerge(state, u, t)) return null;
      const before = statsOf(state, t).hp;
      if ((u.rank || 1) > (t.rank || 1)) { t.rank = u.rank; t.xp = u.xp; t.perks = u.perks; t.pick = u.pick; }
      t.count = (t.count || 1) + (u.count || 1);
      t.hp = Math.min(statsOf(state, t).hp, t.hp + u.hp + (statsOf(state, t).hp - before - statsOf(state, u).hp));
      t.moved = t.attacked = t.acted = true;
      state.units = state.units.filter((x) => x !== u);
      ev.push({ k: 'merge', id: t.id, from: u.idx, idx: t.idx, count: t.count });
      break;
    }
    case 'fuse': {
      const u = unitById(state, a.unitId), t = unitById(state, a.targetId);
      if (!u || !t || u.owner !== pid || !canFuse(state, u, t)) return null;
      for (const k of RES) player.res[k] -= FUSION_COST[k] || 0;
      player.fusedTurn = state.turn;
      const type = fusionResult(u.type, t.type);
      const nu = { id: state.nextUnitId++, type, owner: pid, idx: t.idx, hp: 1, moved: true, attacked: true, acted: true, rank: 1, xp: 0 };
      if (type === 'chimera') {
        // Wilde Fusion: beste Bewegung und Reichweite, Kampfwerte gemittelt plus 20 %
        const A = statsOf(state, { ...u, rank: 1, perks: [] }), B = statsOf(state, { ...t, rank: 1, perks: [] });
        nu.mix = {
          parents: [u.type, t.type],
          hp: Math.round(((A.hp + B.hp) / 2) * 1.2), atk: Math.round(((A.atk + B.atk) / 2) * 1.2 * 10) / 10, def: Math.round(((A.def + B.def) / 2) * 1.2 * 10) / 10,
          move: Math.max(A.move, B.move), range: Math.max(A.range, B.range),
        };
      }
      const frac = (u.hp / statsOf(state, u).hp + t.hp / statsOf(state, t).hp) / 2;
      nu.hp = Math.max(1, Math.round(statsOf(state, nu).hp * frac));
      state.units = state.units.filter((x) => x !== u && x !== t);
      state.units.push(nu);
      ev.push({ k: 'fuse', id: nu.id, idx: nu.idx, from: u.idx, type, parents: [u.type, t.type] });
      break;
    }
    case 'split': {
      const u = unitById(state, a.unitId);
      if (!u || u.owner !== pid || !canSplit(state, u)) return null;
      const spot = splitSpot(state, u);
      const per = Math.max(1, Math.round(u.hp / u.count));
      const nu = { ...u, id: state.nextUnitId++, idx: spot, count: 1, hp: per, perks: [...(u.perks || [])], sentry: false };
      u.count--;
      u.hp = Math.max(1, Math.min(statsOf(state, u).hp, u.hp - per));
      state.units.push(nu);
      ev.push({ k: 'split', id: nu.id, idx: spot, from: u.idx });
      break;
    }
    case 'end': {
      // Türme, die noch nicht geschossen haben, feuern am Zugende selbst
      const pre = a.volley === false ? [] : towerVolley(state, pid);
      // Ausgesetzter Zug ist vorbei: die Versteinerung löst sich
      for (const u of state.units) if (u.owner === pid) u.stoneNow = false;
      return pre.concat(endTurn(state));
    }
    default:
      return null;
  }
  updateExplored(state);
  return ev;
}

// Verbände: zusammenlegen (gleicher Typ, benachbart, beide noch unbewegt) und aufteilen
export function canMerge(state, u, t) {
  if (!u || !t || u === t || u.owner !== t.owner || u.type !== t.type || !REGIMENT_TYPES.includes(u.type)) return false;
  if ((u.count || 1) + (t.count || 1) > REGIMENT_MAX) return false;
  if (u.acted || u.moved || u.attacked || t.acted || t.moved || t.attacked) return false;
  return geoOf(state).dist(u.idx, t.idx) === 1;
}
// Fusion: zwei verschiedene eigene Einheiten nebeneinander, beide noch unbewegt – überall auf der Karte, sobald das
// Reich eine Fusionsschmiede hat; einmal pro Runde, kostet Rohstoffe. Fusionseinheiten lassen sich nicht weiter verschmelzen.
export function canFuse(state, u, t) {
  if (!state.fusion || !u || !t || u === t || u.owner !== t.owner || u.type === t.type) return false;
  for (const x of [u, t]) if (isStructure(x) || UNITS[x.type].fused || (x.count || 1) > 1 || x.moved || x.attacked || x.acted) return false;
  const p = state.players[u.owner];
  if (p.fusedTurn === state.turn || !canAfford(p.res, FUSION_COST)) return false;
  const geo = geoOf(state);
  if (geo.dist(u.idx, t.idx) !== 1) return false;
  return state.cities.some((c) => c.owner === u.owner && hasBuilding(c, 'forge'));
}
export function fuseTargets(state, u) {
  return state.units.filter((t) => canFuse(state, u, t));
}

export function mergeTargets(state, u) {
  return state.units.filter((t) => canMerge(state, u, t));
}
function splitSpot(state, u) {
  const occ = buildOcc(state);
  return geoOf(state).nb[u.idx].find((j) => !occ[j] && TERRAIN[state.terrain[j]].pass && state.cityAt[j] < 0)
    ?? geoOf(state).nb[u.idx].find((j) => !occ[j] && TERRAIN[state.terrain[j]].pass);
}
export function canSplit(state, u) {
  return (u.count || 1) > 1 && !u.acted && !u.moved && !u.attacked && splitSpot(state, u) != null;
}

// Automatisches Turmfeuer am Zugende: lohnendstes Ziel (erst Siege, dann meister Schaden)
function towerVolley(state, pid) {
  const ev = [];
  for (const tw of state.units.filter((u) => u.owner === pid && u.type === 'tower')) {
    if (!state.units.includes(tw) || !canAttack(tw)) continue;
    const vis = state.fog ? visibility(state, pid) : null;
    let best = null;
    for (const t of getTargets(state, tw, tw.idx)) {
      if (vis && !vis[t.idx]) continue;
      const r = computeCombat(state, tw, t);
      const score = (r.kill ? 1000 : 0) + (Math.min(r.dmg, t.hp) / statsOf(state, t).hp) * (UNITS[t.type].value || 1) * (t.count || 1);
      if (!best || score > best.score) best = { t, score };
    }
    if (!best) continue;
    const e = applyAction(state, { type: 'attack', unitId: tw.id, targetId: best.t.id });
    if (e) { for (const x of e) x.auto = true; ev.push(...e); }
    if (state.over) break;
  }
  return ev;
}

export function playerHasActions(state, pid) {
  const occ = buildOcc(state);
  return state.units.some((u) => u.owner === pid && !u.sentry && (canMove(u) || (canAttack(u) && (getTargets(state, u, u.idx, occ).length > 0 || getHealTargets(state, u).length > 0))));
}
