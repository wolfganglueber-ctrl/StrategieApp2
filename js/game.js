// Spielregeln und Spielzustand. Komplett ohne DOM, damit auch Simulationen in Node laufen.
import { getGeo, hexCenter, pixelToIndex, SQRT3 } from './hex.js';
import {
  TERRAIN, UNITS, RES, START_RES, upgradeCost, cityDefense, CITY_MAX_LEVEL, PLAYER_COLORS, citySupply, upkeepOf,
  cityRadius, canAfford, BUILDINGS, citySlots, hasBuilding, TRADE_RATE, TRADE_RATE_GUILD, TECHS, TOWER_LEVELS,
  TOWER_UPGRADE, TOWERS_PER_CITY, STRUCTURE_LIMIT, structureLimit, CASTLE_DEF, MELEE, FOOT, moveCap, AURA, HEAL, RANK_XP, RANK_BONUS, MAX_RANK, PERKS, PERK_CHOICES,
  PERK_RANKS, FLANK_BONUS, FLANK_MAX, CAVALRY, buildingYield, PLANT_COST, START_BUILDINGS, slotsUsed, PLANT_KINDS, PLANT_ROUNDS, CLEAR_WOOD, UNIT_UPS, UP_INDEX, unitUpCost, BOOST_PCT, SKILLS, skillsFor, boostCost, skillCost,
  BASE_RES, MANA, ECO_TECH, ECO_TECH_PCT,
} from './data.js';
import { generateMap } from './mapgen.js';

export const STATE_VERSION = 6;

/*
 config: { seed, cols, rows, biome, players: [{ human: bool, ai: 1..6, name? }], levelId?, villageDensity?, fog? }
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
    explored: {},
  };
  if (state.fog) {
    state.players.forEach((p) => { if (p.human) state.explored[p.id] = new Array(geo.n).fill(0); });
  }
  // Hauptstädte zuweisen (Reihenfolge der Spieler gemischt durch Seed)
  const caps = state.cities.filter((c) => c.capital);
  caps.forEach((c, i) => { c.owner = i; c.level = 1; c.castle = true; });
  for (const c of state.cities) c.buildings = c.capital ? [...START_BUILDINGS] : [];
  state.cities.forEach((c, i) => (state.cityAt[c.idx] = i));
  state.grapes = []; // Traubenhaine (angelegt von den Spielern)
  state.pits = []; // Erzgruben (gegraben von den Spielern)
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
  const ups = upPerks(state, owner, type);
  if (ups.length) u.ups = ups;
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
  // Einheiten-Entwicklung des Reichs (vor dem Rang, damit Ränge sie mit verstärken)
  for (const id of unitUpList(state, u.owner, u.type)) {
    for (const [k, v] of Object.entries(UP_INDEX[id]?.mod || {})) if (k in st) st[k] += v;
  }
  // Rang und Fähigkeiten
  // Alle Werte sind ganze Zahlen: Zuschläge werden aufgerundet
  const r = (u.rank || 1) - 1;
  if (r > 0) {
    st.hp = ceilMul(st.hp, 1 + RANK_BONUS.hp * r);
    st.atk = ceilMul(st.atk, 1 + RANK_BONUS.atk * r);
    st.def = ceilMul(st.def, 1 + RANK_BONUS.def * r);
    if (r >= 1 && CAVALRY.includes(u.type)) st.move++;
    if (r >= 3) st.move++;
  }
  if (hasPerk(u, 'tough')) st.hp = ceilMul(st.hp, 1.25);
  if (hasPerk(u, 'shieldwall')) st.def = ceilMul(st.def, 1.3);
  if (hasPerk(u, 'swift')) st.move++;
  st.move = Math.min(st.move, moveCap(u.type));
  // Einzel-Verbesserungen dieser einen Einheit
  if (u.boost) for (const k of ['atk', 'def', 'hp']) if (u.boost[k]) st[k] = ceilMul(st[k], 1 + BOOST_PCT[u.boost[k]] / 100);
  if (hasSkill(u, 'range1')) st.range++;
  if (hasSkill(u, 'range2')) st.range++;
  // Stellung halten: nicht gezogen → +20 % Verteidigung
  if (hasSkill(u, 'hold') && !u.walked) st.def = ceilMul(st.def, 1.2);
  st.atk = Math.ceil(st.atk - 1e-9);
  st.def = Math.ceil(st.def - 1e-9);
  st.hp = Math.ceil(st.hp - 1e-9);
  return st;
}

function ceilMul(v, f) {
  return Math.ceil(v * f - 1e-9);
}

export function hasSkill(u, k) {
  return !!u.skills?.includes(k);
}

// Erschüttern: Titanen und Bauwerke nie; Katapulte/Triböke nach einem Angriff, alle anderen nach zwei Angreifern pro Runde
export function canShake(t) {
  return !isStructure(t) && t.type !== 'troll' && t.type !== 'dragon';
}
export function shakeNeed(t) {
  return t.type === 'catapult' || t.type === 'trebuchet' ? 1 : 2;
}
// Wie viele verschiedene Gegner das Ziel in dieser Runde schon angegriffen haben
export function shakeHits(state, t) {
  return t.hitKey === state.turn * 10 + state.current ? t.hitBy.length : 0;
}
// Würde dieser Angriff das Ziel erschüttern (falls es überlebt)?
export function wouldShake(state, att, t) {
  if (!canShake(t) || t.shaken) return false;
  const hits = shakeHits(state, t) - (t.hitKey === state.turn * 10 + state.current && t.hitBy.includes(att.id) ? 1 : 0);
  return hits + 1 >= shakeNeed(t);
}

export function canPetrify(t) {
  return !isStructure(t) && t.type !== 'troll' && t.type !== 'dragon' && !t.stone;
}

export function hasPerk(u, p) {
  return !!u.perks?.includes(p) || !!u.ups?.includes(p);
}

// Einheiten-Entwicklung: gewählte Stufen eines Spielers für einen Einheitentyp
export function unitUpList(state, pid, type) {
  return state.players[pid]?.unitUps?.[type] || [];
}
// Mögliche nächste Stufe (eine oder zwei Optionen)
export function unitUpOptions(state, pid, type) {
  const tiers = UNIT_UPS[type];
  if (!tiers) return [];
  const n = unitUpList(state, pid, type).length;
  if (n >= tiers.length) return [];
  return Array.isArray(tiers[n]) ? tiers[n] : [tiers[n]];
}
// Sonderfähigkeiten aus der Entwicklung, die alle Einheiten dieses Typs tragen
function upPerks(state, pid, type) {
  return unitUpList(state, pid, type).map((id) => UP_INDEX[id]?.perk).filter(Boolean);
}
function upMod(state, u, k) {
  let v = 0;
  for (const id of unitUpList(state, u.owner, u.type)) v += UP_INDEX[id]?.mod?.[k] || 0;
  return v;
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
  // Belagerungswaffen: gegen Truppen im offenen Feld schwächer
  if (UNITS[att.type].fieldMult && !isStructure(def) && !cityOn(state, def.idx)) m *= UNITS[att.type].fieldMult;
  return m;
}

// Aufschlüsselung eines Angriffs für die Anzeige (gleiche Regeln wie computeCombat/attackMult)
export function combatInfo(state, att, def, fromIdx = att.idx) {
  const r = computeCombat(state, att, def, fromIdx);
  const A = statsOf(state, att), D = statsOf(state, def);
  const atkNotes = [], defNotes = [];
  if (hasPerk(att, 'charge') && (att.moved || fromIdx !== att.idx)) atkNotes.push('Sturmangriff +30 %');
  if (hasPerk(att, 'siege') && (cityOn(state, def.idx) || isStructure(def))) atkNotes.push('Belagerer +30 %');
  if (hasPerk(att, 'hunter') && (CAVALRY.includes(def.type) || def.type === 'troll' || def.type === 'dragon')) atkNotes.push('Jäger +40 %');
  if (UNITS[def.type].arrowWeak && (att.type === 'archer' || att.type === 'tower')) atkNotes.push('Pfeile gegen Drachen +60 %');
  const fl = isStructure(att) ? 0 : flankers(state, att, def);
  if (fl) atkNotes.push(`Flanke ${fl}× +${Math.round((hasTech(state, att.owner, 'tactics') ? 0.15 : FLANK_BONUS) * 100 * fl)} %`);
  if (UNITS[att.type].fieldMult && !isStructure(def) && !cityOn(state, def.idx)) atkNotes.push(`im Feld ×${UNITS[att.type].fieldMult}`);
  const dm = defenseMult(state, def.idx);
  if (hasSkill(def, 'hold') && !def.walked) defNotes.push('Stellung gehalten +20 %');
  if (dm > 1) defNotes.push(`${castleOf(state, def.idx) && !cityOn(state, def.idx) ? 'Burgfeld' : 'Stadt/Burg'} ×${Math.round(dm * 100) / 100}`);
  if (def.shaken) defNotes.push('erschüttert ×0,5');
  else if (wouldShake(state, att, def)) atkNotes.push('erschüttert das Ziel ⭐');
  if (inAura(state, def)) defNotes.push('Schutzaura −25 % Schaden');
  if (def.hp < D.hp) defNotes.push(`angeschlagen ${def.hp}/${D.hp}`);
  if (att.hp < A.hp) atkNotes.push(`angeschlagen ${att.hp}/${A.hp}`);
  const extra = (splashOf(att) || UNITS[att.type].line) ? splashDamage(state, att, def.idx, r.dmg, fromIdx) : [];
  return { ...r, atk: A.atk, atkMult: attackMult(state, att, def, fromIdx), atkNotes, def: D.def, defMult: dm, defNotes, extra, lance: hasPerk(att, 'lance') && unitRange(state, def) <= 1 };
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
  if (hasPerk(u, 'precise')) return 0;
  const base = Math.max(UNITS[u.type].splash || 0, hasPerk(u, 'blast') ? 0.4 : 0);
  const fire = (hasPerk(u, 'fire') ? 0.25 : 0) + (hasSkill(u, 'firearrow') ? 0.25 : 0);
  if (fire) return base + fire;
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
    const r = Math.max(2, statsOf(state, u).range) + (u.type === 'rider' || u.type === 'knight' || u.type === 'griffin' ? 1 : 0);
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
  return !u.moved && !u.attacked && !UNITS[u.type].structure;
}
export function canAttack(u) {
  return !u.attacked && !(UNITS[u.type].noMoveAttack && u.moved && !hasPerk(u, 'mobile'));
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

// Schadensfaktor (Angriff/Verteidigung sind seit 0.57 viermal so groß wie früher, damit alles ganzzahlig ist)
export const DMG_K = 1.125;

export function computeCombat(state, att, def, fromIdx = att.idx, attHp = att.hp) {
  const A = statsOf(state, att), D = statsOf(state, def);
  const atk = A.atk * attackMult(state, att, def, fromIdx);
  const aF = atk * (attHp / A.hp);
  const dF = D.def * (def.hp / D.hp) * defenseMult(state, def.idx) * (def.shaken ? 0.5 : 1);
  const tot = aF + dF;
  // Schaden in ganzen Zahlen (aufgerundet)
  const dmg = Math.ceil((aF / tot) * atk * DMG_K * (inAura(state, def) ? 1 - AURA.reduce : 1) - 1e-9);
  const kill = dmg >= def.hp;
  let counter = 0;
  const geo = geoOf(state);
  // Chevalier mit langer Lanze: Nahkämpfer kommen nicht zum Gegenschlag
  const lance = hasPerk(att, 'lance') && unitRange(state, def) <= 1;
  if (!kill && !lance && !def.shaken && !def.stone && !def.stoneNow && geo.dist(fromIdx, def.idx) <= unitRange(state, def)) {
    counter = Math.ceil((dF / tot) * D.def * DMG_K * (inAura(state, att, fromIdx) ? 1 - AURA.reduce : 1) - 1e-9);
  }
  return { dmg, counter, kill, die: counter >= attHp };
}

// Gebiet: jedes Feld gehört der nächstgelegenen Stadt in Reichweite (Gleichstand: höhere Stufe).
// Hauptstädte haben Vorrang: ihre beiden Ringe gehören immer ganz ihnen; das Stadtfeld selbst gehört immer der Stadt.
export function computeTerritory(state) {
  const geo = geoOf(state);
  const owner = new Int16Array(geo.n).fill(-1);
  const best = new Float32Array(geo.n).fill(1e9);
  state.cities.forEach((c, ci) => {
    for (const j of geo.within(c.idx, cityRadius(c))) {
      const d = j === c.idx ? -10 : geo.dist(c.idx, j) - c.level * 0.01 - (c.capital ? 3 : 0);
      if (d < best[j]) { best[j] = d; owner[j] = ci; }
    }
  });
  return owner;
}

// Ertrag eines Wirtschaftsgebäudes inklusive Forschung (Pflug, Sägewerk, Bergbau: +50 %, aufgerundet)
export function boostedYield(state, pid, k, base) {
  return pid >= 0 && ECO_TECH[k] && hasTech(state, pid, ECO_TECH[k]) ? base + Math.ceil(base * ECO_TECH_PCT) : base;
}

// Ertrag des ganzen Reichs pro Runde vor Unterhalt: Summe aller Städte (inkl. Forschung), Kaiser-KI +50 %
export function realmYield(state, pid, territory = computeTerritory(state)) {
  const inc = { food: 0, wood: 0, ore: 0, mana: 0 };
  state.cities.forEach((c, ci) => {
    if (c.owner !== pid) return;
    const y = cityYield(state, ci, territory);
    for (const k of RES) inc[k] += y[k];
  });
  const bonus = state.players[pid].incomeBonus || 0;
  if (bonus) for (const k of RES) inc[k] = Math.round(inc[k] * (1 + bonus));
  return inc;
}

// Rohstoffertrag pro Runde nach Abzug des Unterhalts
export function incomeOf(state, pid, territory = computeTerritory(state)) {
  const inc = realmYield(state, pid, territory);
  // Unterhalt der Armee wird vom Ertrag abgezogen (kann negativ werden)
  const up = upkeepTotal(state, pid);
  for (const k of RES) inc[k] -= up[k];
  return inc;
}

// Unterhalt: bis zur Versorgung der Städte einfach, darüber doppelt, über dem 1,5-Fachen dreifach
// (älteste Einheiten zuerst, Versorgungspunkte wie beim Truppenzähler)
export function upkeepTotal(state, pid) {
  const up = { food: 0, wood: 0, ore: 0, mana: 0 };
  const cap = unitCap(state, pid);
  let used = 0;
  for (const u of state.units) {
    if (u.owner !== pid || isStructure(u)) continue;
    used += UNITS[u.type].supply || 1;
    const mult = used <= cap ? 1 : used <= cap * 1.5 ? 2 : 3;
    const c = upkeepOf(u.type);
    for (const k in c) up[k] += k === 'mana' ? c[k] : c[k] * mult; // Mana-Unterhalt steigt nicht mit
  }
  if (hasTech(state, pid, 'granary')) up.food = Math.ceil(up.food * 0.75);
  return up;
}

// Ertrag einer Stadt: Gebiet + Zentrum + Gebäude
export function cityYield(state, ci, territory = computeTerritory(state)) {
  const inc = { food: 0, wood: 0, ore: 0, mana: 0 };
  const c = state.cities[ci];
  // Felder liefern nur mit passendem Gebäude: Bauernhof (Wiese/See), Holzfäller (Wald), Mine (Hügel, Lehm, Grube, Gebirge ×2), Kelterei (Traubenhain)
  const tiles = cityTiles(state, ci, territory);
  // Gebäude: je passendem Feld so viel wie die Stadtstufe; ohne passendes Feld nichts; Pflug/Sägewerk/Bergbau +50 %
  const per = (k, n) => boostedYield(state, c.owner, k, buildingYield(n, c.level));
  if (hasBuilding(c, 'farm')) inc.food += per('food', tiles.food);
  if (hasBuilding(c, 'lumber')) inc.wood += per('wood', tiles.wood);
  if (hasBuilding(c, 'mine')) inc.ore += per('ore', tiles.ore);
  if (hasBuilding(c, 'press')) inc.mana += per('mana', tiles.mana);
  if (hasBuilding(c, 'sanctum')) inc.mana += MANA.sanctum;
  return inc;
}

// Rohstoff eines Feldes: Traubenhain → Mana, Grube → Erz, Schonung/Baustelle → nichts, sonst das Gelände (Gebirge zählt 2)
export function tileRes(state, i) {
  if (state.grapes?.includes(i)) return { res: 'mana', n: 1 };
  if (state.pits?.includes(i)) return { res: 'ore', n: 1 };
  if (state.plants?.some((p) => p.idx === i)) return null;
  const T = TERRAIN[state.terrain[i]];
  return { res: T.res, n: T.n || 1 };
}

// Felder im Stadtkreis je Rohstoff (ohne das Stadtzentrum, Gebirge zählt doppelt)
export function cityTiles(state, ci, territory = computeTerritory(state)) {
  const c = state.cities[ci];
  const n = { food: 0, wood: 0, ore: 0, mana: 0 };
  for (let i = 0; i < territory.length; i++) {
    if (territory[i] !== ci || i === c.idx) continue;
    const t = tileRes(state, i);
    if (t) n[t.res] += t.n;
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
  if (B.tech && !hasTech(state, pid, B.tech)) return 'tech';
  if (c.level < (B.minLevel || 0)) return 'level';
  if (B.perRealm && state.cities.filter((x) => x.owner === pid && hasBuilding(x, b)).length >= B.perRealm) return 'realm';
  if (!B.eco && slotsUsed(c) >= citySlots(c)) return 'slots';
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
  for (const u of state.units) if (u.owner === pid && !UNITS[u.type].structure) n += UNITS[u.type].supply || 1;
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
  // Aufforstung: Schonungen dieses Spielers werden zu Wald
  if (state.plants?.length) {
    for (const p of state.plants.filter((x) => x.pid === pid && x.done <= state.turn)) {
      const to = p.to || 'forest';
      if (to === 'forest') state.terrain[p.idx] = 'forest';
      else if (to === 'pit') state.pits = [...(state.pits || []), p.idx];
      else state.grapes = [...(state.grapes || []), p.idx];
      ev.push({ k: 'grown', idx: p.idx, pid, to });
    }
    state.plants = state.plants.filter((x) => !(x.pid === pid && x.done <= state.turn));
  }
  // Flächenbrand: der eigene Brand erlischt, fremde Brände verletzen eigene Einheiten darin
  if (state.burns?.length) {
    state.burns = state.burns.filter((b) => b.owner !== pid);
    for (const b of state.burns) {
      for (const u of state.units.filter((x) => x.owner === pid && b.tiles.includes(x.idx))) {
        const dmg = STORM.burnBase + Math.ceil(statsOf(state, u).hp * STORM.burnPct);
        const snap = snapshotUnit(u);
        u.hp -= dmg;
        const killed = u.hp <= 0;
        if (killed) {
          state.units = state.units.filter((x) => x !== u);
          state.stats.kills[b.owner]++;
          state.stats.losses[pid]++;
        }
        ev.push({ k: 'burn', id: u.id, idx: u.idx, dmg, killed, snap });
      }
    }
  }
  // Heilung für Einheiten, die letzte Runde geruht haben
  for (const u of state.units) {
    if (u.owner !== pid) continue;
    const max = statsOf(state, u).hp;
    // Trolle und zähe Einheiten heilen jede Runde, alle anderen nur nach einer Ruhepause
    const always = (UNITS[u.type].regen || 0) + (hasPerk(u, 'tough') ? 2 : 0) + upMod(state, u, 'regen') + (hasSkill(u, 'regen') ? Math.ceil(max / 10) : 0);
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
      h = Math.min(max - u.hp, h);
      u.hp += h;
      ev.push({ k: 'heal', id: u.id, idx: u.idx, amount: h });
    }
    // Wache halten endet, sobald ein Gegner in der Nähe ist
    if (u.sentry && state.units.some((e) => e.owner !== pid && geo.dist(e.idx, u.idx) <= 3)) {
      u.sentry = false;
      ev.push({ k: 'wake', id: u.id, idx: u.idx });
    }
    u.moved = false;
    u.walked = false;
    u.attacked = false;
    u.acted = false;
    u.shaken = false;
    u.ice = false;
    // Versteinert: diesen Zug aussetzen, danach wieder frei
    if (u.stone) {
      u.stone = 0;
      u.moved = u.attacked = true;
      u.acted = true;
      u.stoneNow = true;
      if (u.iced) { u.ice = true; delete u.iced; }
      ev.push({ k: 'stone', id: u.id, idx: u.idx, ice: u.ice });
    } else u.stoneNow = false;
  }
  const inc = incomeOf(state, pid);
  const p = state.players[pid];
  for (const k of RES) p.res[k] = Math.max(0, (p.res[k] || 0) + inc[k]);
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
      if (o && o.owner !== att.owner) res.push({ unit: o, dmg: Math.ceil(dmg * f * (inAura(state, o) ? AURA.splash : 1) - 1e-9) });
    });
  }
  if (!splashOf(att)) return res.filter((h) => h.dmg > 0);
  for (const j of geo.nb[idx]) {
    if (inLine.has(j)) continue;
    const o = state.units.find((x) => x.idx === j);
    if (!o || o.owner === att.owner) continue;
    const d = Math.ceil(dmg * splashOf(att) * (inAura(state, o) ? AURA.splash : 1) - 1e-9);
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
      state.stats.losses[unit.owner]++;
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
      u.walked = true;
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
        state.stats.losses[t.owner]++;
        if (UNITS[u.type].range === 1 && !isStructure(u) && !castleBlocked(state, t.idx, pid)) {
          e.advance = t.idx;
          u.idx = t.idx;
          u.walked = true;
        }
      } else {
        // Erschüttert: erst wenn mindestens zwei verschiedene Gegner das Ziel in dieser Runde angegriffen haben
        // (Katapult und Tribok schon nach einem Angriff, Titanen nie)
        if (canShake(t)) {
          const key = state.turn * 10 + state.current;
          if (t.hitKey !== key) { t.hitKey = key; t.hitBy = []; }
          if (!t.hitBy.includes(u.id)) t.hitBy.push(u.id);
          if (canShake(t) && t.hitBy.length >= shakeNeed(t)) { t.shaken = true; e.shaken = true; }
        }
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
          state.stats.losses[pid]++;
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
      const h = Math.min(statsOf(state, t).hp - t.hp, healAmount(state, u));
      t.hp += h;
      if (hasTech(state, pid, 'blessing')) t.shaken = false;
      u.attacked = true;
      u.moved = true;
      u.acted = true;
      ev.push({ k: 'heal', id: t.id, idx: t.idx, amount: h, by: u.id, from: u.idx });
      // Flächenheilung: eigene Nachbarn des Ziels bekommen 25 % ihres Lebens zurück
      if (hasSkill(u, 'areaheal') && (player.res.mana || 0) >= MANA.areaheal) {
        player.res.mana -= MANA.areaheal;
        const geo = geoOf(state);
        for (const o of state.units) {
          if (o === t || o.owner !== pid || isStructure(o) || geo.dist(o.idx, t.idx) !== 1) continue;
          const max = statsOf(state, o).hp, hh = Math.min(max - o.hp, Math.ceil(max / 4));
          if (hh > 0) { o.hp += hh; ev.push({ k: 'heal', id: o.id, idx: o.idx, amount: hh }); }
        }
      }
      if (h > 0) gainXp(state, u, 1, ev); // Zauberer steigen durch Heilen auf
      break;
    }
    case 'freeze': {
      // Zauberer mit „Vereisen“: Gegner bis 3 Felder weit setzt seinen nächsten Zug aus
      const u = unitById(state, a.unitId);
      const t = unitById(state, a.targetId);
      if (!u || !t || u.owner !== pid || !canAttack(u) || !getFreezeTargets(state, u).includes(t)) return null;
      player.res.mana -= MANA.freeze;
      t.stone = 1;
      t.iced = true;
      u.attacked = u.moved = u.acted = true;
      ev.push({ k: 'freeze', id: t.id, idx: t.idx, by: u.id, from: u.idx });
      break;
    }
    case 'bomb': {
      // Zauberer mit „Bergsprengung“: Gebirge bis 3 Felder weit wird zu Lehm
      const u = unitById(state, a.unitId);
      if (!u || u.owner !== pid || !canAttack(u) || !getBombTargets(state, u).includes(a.idx)) return null;
      player.res.mana -= MANA.bomb;
      state.terrain[a.idx] = 'clay';
      u.attacked = u.moved = u.acted = true;
      ev.push({ k: 'bomb', idx: a.idx, by: u.id, from: u.idx });
      break;
    }
    case 'boost': {
      // Einzel-Verbesserung (Angriff, Verteidigung, Leben) für genau diese Einheit
      const u = unitById(state, a.unitId);
      if (!u || u.owner !== pid || !canBoost(u) || !['atk', 'def', 'hp'].includes(a.stat)) return null;
      const lvl = u.boost?.[a.stat] || 0;
      if (lvl >= 3) return null;
      const cost = boostCost(u.type, lvl);
      if (!canAfford(player.res, cost)) return null;
      for (const k of RES) player.res[k] -= cost[k] || 0;
      const before = statsOf(state, u).hp;
      u.boost = { ...(u.boost || {}), [a.stat]: lvl + 1 };
      u.hp += statsOf(state, u).hp - before;
      ev.push({ k: 'boost', id: u.id, idx: u.idx, stat: a.stat, level: lvl + 1 });
      break;
    }
    case 'skill': {
      const u = unitById(state, a.unitId);
      if (!u || u.owner !== pid || !skillOptions(u).includes(a.skill)) return null;
      const cost = skillCost(u.type);
      if (!canAfford(player.res, cost)) return null;
      for (const k of RES) player.res[k] -= cost[k] || 0;
      u.skills = [...(u.skills || []), a.skill];
      ev.push({ k: 'skill', id: u.id, idx: u.idx, skill: a.skill });
      break;
    }
    case 'unitUp': {
      // Entwicklung eines Einheitentyps erforschen (gilt sofort für alle Einheiten dieses Typs)
      const opt = unitUpOptions(state, pid, a.unit).find((o) => o.id === a.id);
      if (!opt) return null;
      const tier = unitUpList(state, pid, a.unit).length;
      const cost = unitUpCost(a.unit, tier);
      if (!canAfford(player.res, cost)) return null;
      for (const k of RES) player.res[k] -= cost[k] || 0;
      const mine = state.units.filter((u) => u.owner === pid && u.type === a.unit);
      const before = new Map(mine.map((u) => [u, statsOf(state, u).hp]));
      player.unitUps = { ...(player.unitUps || {}), [a.unit]: [...unitUpList(state, pid, a.unit), opt.id] };
      const ups = upPerks(state, pid, a.unit);
      for (const u of mine) {
        u.ups = ups;
        // Mehr Lebenspunkte kommen sofort dazu
        u.hp = Math.min(statsOf(state, u).hp, u.hp + Math.max(0, statsOf(state, u).hp - before.get(u)));
      }
      ev.push({ k: 'unitUp', pid, unit: a.unit, id: opt.id });
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
      if (!rate || !BASE_RES.includes(a.give) || !BASE_RES.includes(a.get) || a.give === a.get || player.res[a.give] < tradeCost(rate, n)) return null;
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
    case 'plant': {
      // Wiese im eigenen Stadtgebiet bearbeiten: aufforsten (Wald), Grube graben (Erz) oder Traubenhain anlegen (Mana)
      const to = a.to || 'forest';
      if (!PLANT_KINDS[to] || canTerraform(state, pid, a.idx) !== 'plant' || !canAfford(player.res, PLANT_COST)) return null;
      for (const k of RES) player.res[k] -= PLANT_COST[k] || 0;
      state.plants = [...(state.plants || []), { idx: a.idx, pid, ci: computeTerritory(state)[a.idx], done: state.turn + PLANT_ROUNDS, to }];
      ev.push({ k: 'plant', idx: a.idx, to });
      break;
    }
    case 'clear': {
      // Wald im eigenen Stadtgebiet roden: sofort Holz, das Feld wird Wiese
      if (canTerraform(state, pid, a.idx) !== 'clear') return null;
      state.terrain[a.idx] = 'plain';
      player.res.wood += CLEAR_WOOD;
      ev.push({ k: 'clear', idx: a.idx, wood: CLEAR_WOOD });
      break;
    }
    case 'storm': {
      const u = unitById(state, a.unitId);
      if (!u || u.owner !== pid || !canStorm(state, u) || geoOf(state).dist(u.idx, a.toward) !== 1) return null;
      const { line, area } = stormArea(state, u.idx, a.toward);
      const hits = [];
      for (const t of state.units.filter((x) => x.owner !== pid && area.includes(x.idx))) {
        const dmg = stormDamage(state, u, t);
        const hit = { id: t.id, idx: t.idx, dmg, killed: false, snap: snapshotUnit(t) };
        t.hp -= dmg;
        if (t.hp <= 0) {
          hit.killed = true;
          state.units = state.units.filter((x) => x !== t);
          state.stats.kills[pid]++;
          state.stats.losses[t.owner]++;
        }
        hits.push(hit);
      }
      player.res.mana -= MANA.storm;
      u.moved = u.attacked = u.acted = true;
      u.stormTurn = state.turn;
      // Flächenbrand bis zum nächsten eigenen Zug
      state.burns = [...(state.burns || []).filter((b) => b.owner !== pid), { owner: pid, tiles: area }];
      ev.push({ k: 'storm', id: u.id, from: u.idx, line, area, hits });
      const kills = hits.filter((h) => h.killed).length;
      if (kills) gainXp(state, u, kills, ev);
      break;
    }
    case 'end': {
      // Türme, die noch nicht geschossen haben, feuern am Zugende selbst
      const pre = a.volley === false ? [] : towerVolley(state, pid);
      // Ausgesetzter Zug ist vorbei: die Versteinerung löst sich
      for (const u of state.units) if (u.owner === pid) { u.stoneNow = false; u.ice = false; }
      return pre.concat(endTurn(state));
    }
    default:
      return null;
  }
  updateExplored(state);
  return ev;
}

// Feuersturm des Drachen: er überfliegt eine Schneise von 4 Feldern samt Nachbarn (3/4/3 = 10 Felder),
// verbrennt alle Gegner darin und kehrt auf sein Feld zurück. Alle 3 Runden, verbraucht den ganzen Zug.
export const STORM = { cooldown: 3, len: 4, dmg: 0.6, burnBase: 2, burnPct: 0.1 };
export function canStorm(state, u) {
  return !!u && u.type === 'dragon' && canMove(u) && canAttack(u) && stormWait(state, u) === 0 && hasMana(state, u.owner, MANA.storm);
}
// Runden bis zum nächsten Feuersturm
export function stormWait(state, u) {
  return u.stormTurn == null ? 0 : Math.max(0, u.stormTurn + STORM.cooldown - state.turn);
}
// Fläche in Richtung des Nachbarfelds toward: line = die 4 überflogenen Felder, area = alle 10 Felder
export function stormArea(state, from, toward) {
  const geo = geoOf(state);
  const dq = geo.cq[toward] - geo.cq[from], dr = geo.cr[toward] - geo.cr[from];
  const at = (q, r) => {
    if (r < 0 || r >= state.rows) return -1;
    const c = q + ((r - (r & 1)) >> 1);
    return c < 0 || c >= state.cols ? -1 : r * state.cols + c;
  };
  const q0 = geo.cq[from], r0 = geo.cr[from];
  const line = [], area = [];
  for (let k = 1; k <= STORM.len; k++) {
    const q = q0 + k * dq, r = r0 + k * dr;
    const j = at(q, r);
    line.push(j);
    if (j >= 0) area.push(j);
    if (k < STORM.len) {
      // Seitenfelder zwischen zwei Schneisenfeldern (60° gedreht nach links und rechts)
      for (const [sq, sr] of [[-dr, dq + dr], [dq + dr, -dq]]) {
        const s2 = at(q + sq, r + sr);
        if (s2 >= 0) area.push(s2);
      }
    }
  }
  return { line, area };
}
// Schaden des Feuersturms an einem Ziel
export function stormDamage(state, u, t) {
  return Math.max(1, Math.ceil(computeCombat(state, u, t, u.idx).dmg * STORM.dmg - 1e-9));
}

// Genug Mana für einen Zauber?
export function hasMana(state, pid, n) {
  return (state.players[pid]?.res.mana || 0) >= n;
}

// Gelände umgestalten: 'plant' (Wiese bearbeiten: Wald, Grube oder Traubenhain), 'clear' (Wald roden) oder null.
// Nur im eigenen Stadtgebiet, nicht auf Städten, Burgfeldern, Gruben oder Traubenhainen; ohne Begrenzung je Stadt.
export function canTerraform(state, pid, idx, territory = computeTerritory(state)) {
  const c = state.cities[territory[idx]];
  if (!c || c.owner !== pid || state.cityAt[idx] >= 0 || castleOf(state, idx)) return null;
  if (state.plants?.some((p) => p.idx === idx) || state.grapes?.includes(idx) || state.pits?.includes(idx)) return null;
  const t = state.terrain[idx];
  if (t === 'plain') return 'plant';
  if (t === 'forest') return 'clear';
  return null;
}

// Einzel-Verbesserungen: alle Einheiten außer Bauwerken
export function canBoost(u) {
  return !!u && !isStructure(u);
}
// Fähigkeiten, die diese Einheit noch lernen kann
export function skillOptions(u) {
  if (!canBoost(u)) return [];
  return skillsFor(u.type).filter((k) => !hasSkill(u, k) && (!SKILLS[k].req || hasSkill(u, SKILLS[k].req)));
}
// Zauberer: vereisbare Gegner und sprengbare Berge im Heilradius
export function getFreezeTargets(state, u, fromIdx = u.idx) {
  if (!hasSkill(u, 'freeze') || !hasMana(state, u.owner, MANA.freeze)) return [];
  const geo = geoOf(state);
  return state.units.filter((t) => t.owner !== u.owner && canPetrify(t) && !t.stoneNow && geo.dist(fromIdx, t.idx) <= HEAL.range);
}
export function getBombTargets(state, u, fromIdx = u.idx) {
  if (!hasSkill(u, 'bomb') || !hasMana(state, u.owner, MANA.bomb)) return [];
  return geoOf(state).within(fromIdx, HEAL.range).filter((j) => state.terrain[j] === 'mountain' && state.cityAt[j] < 0);
}

// Alte Spielstände (bis 0.56) übernehmen: Fusionseinheiten und Verbände gibt es nicht mehr
const LEGACY_TYPES = { horsearcher: 'knight', shieldbreaker: 'warrior', firemage: 'mage', gorgon: 'basilisk', rocktroll: 'troll', stormdragon: 'dragon', ram: 'knight', chimera: 'warrior' };
export function migrateState(s) {
  if (!s || (s.v !== STATE_VERSION && s.v !== 5)) return null;
  if (s.v === 5) {
    for (const u of s.units) {
      if (u.mix) { u.type = u.mix.parents?.[0] || 'warrior'; delete u.mix; }
      if (!UNITS[u.type]) u.type = LEGACY_TYPES[u.type] || 'warrior';
      delete u.count;
    }
    for (const c of s.cities) c.buildings = (c.buildings || []).filter((b) => BUILDINGS[b]);
    for (const p of s.players) { p.tech = (p.tech || []).filter((t) => TECHS[t]); delete p.fusedTurn; }
    delete s.fusion;
    s.v = STATE_VERSION;
    for (const u of s.units) u.hp = Math.max(1, Math.min(u.hp, statsOf(s, u).hp));
  }
  // 0.73: nur noch 3 Stadtstufen, Dreifelderwirtschaft und Erzschmelze entfallen
  for (const c of s.cities) c.level = Math.min(c.level, CITY_MAX_LEVEL);
  for (const p of s.players) p.tech = (p.tech || []).filter((t) => TECHS[t]);
  return s;
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
      const score = (r.kill ? 1000 : 0) + (Math.min(r.dmg, t.hp) / statsOf(state, t).hp) * (UNITS[t.type].value || 1);
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
