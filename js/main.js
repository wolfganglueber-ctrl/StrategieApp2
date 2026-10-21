// Steuerung: Menüs, Spielablauf, Eingaben, Animationen der Ereignisse.
import { Renderer } from './render.js';
import { attachInput } from './input.js';
import {
  createGame, applyAction, cloneState, getHealTargets, healAmount, auraRadius, inAura, buildOcc, getMoves, getTargets, computeCombat, canMove, canAttack, cityOn,
  incomeOf, realmYield, boostedYield, unitCount, upkeepTotal, cityTiles, playerHasActions, unitById, cityYield, computeTerritory, STATE_VERSION, canRecruit,
  tradeRate, tradeCost, spawnSpots, statsOf, visibility, isStructure, canBuildTower, towersOfCity, techAvailable, hasTech, upgradeCostOf,
  perkOptions, flankers, canBuild, unitUpList, unitUpOptions, combatInfo, splashDamage, splashOf, castleOf, terrainDefense,
  canBoost, skillOptions, hasSkill, hasPerk, unitCap, canTerraform, canStorm, stormWait, stormArea, STORM, getFreezeTargets, getBombTargets, migrateState,
} from './game.js';
import { planAction } from './ai.js';
import { getGeo } from './hex.js';
import { generateMap } from './mapgen.js';
import {
  UNITS, UNIT_ORDER, TERRAIN, PLAYER_COLORS, NEUTRAL_COLOR, DIFFICULTIES, MAP_SIZES, BIOMES, CITY_MAX_LEVEL,
  upgradeCost, cityDefense, citySupply, canAfford, RES, BASE_RES, RES_INFO, MANA, BUILDINGS, BUILDING_ORDER, CITY_NAMES, citySlots,
  hasBuilding, TECHS, TECH_ORDER, TECH_BRANCHES, TOWER_LEVELS, TOWER_UPGRADE, TOWERS_PER_CITY, STRUCTURE_LIMIT, structureLimit,
  RANK_NAMES, RANK_XP, MAX_RANK, PERKS, PERK_CHOICES, PERK_RANKS, moveCap, TRADE_RATE, MAX_SLOTS, buildingYield, ECO_TECH, ECO_TECH_PCT, PLANT_COST, plantCost, PLANT_KINDS, ECO_BUILDINGS, slotsUsed, PLANT_ROUNDS, CLEAR_WOOD, UP_GROUPS, UNIT_UPS, UP_INDEX, unitUpCost,
  BOOST_ADD, AURA, defenseWords, BOOST_COST, BOOST_STATS, SKILLS, SKILL_COST, skillsFor, boostCost, skillCost,
} from './data.js';
import { getLevels, getWorldNames, starsFor } from './levels.js';
import { store } from './storage.js';
import { randomSeedCode, seedFromCode } from './rng.js';
import { sound } from './audio.js';

const $ = (id) => document.getElementById(id);
// Spielstände ab Version 5 lassen sich laden (ältere werden beim Laden umgestellt)
const loadable = (st) => !!st && (st.v === STATE_VERSION || st.v === 5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const canvas = $('board');
const R = new Renderer(canvas);
R.fx = store.settings().fx !== false;
let S = null;
let settings = store.settings();
if (settings.fogCampaign && settings.fog === false) { settings.fog = true; delete settings.fogCampaign; store.saveSettings(settings); }
let sel = { unitId: null, cityIdx: null, infoIdx: null };
let busy = false;
let undoStack = [];

// ---------------------------------------------------------------- Bildschirme
const SCREENS = ['scrMenu', 'scrLevels', 'scrSetup', 'scrHelp'];
let screenHistory = [];

function showScreen(id, push = true) {
  const cur = SCREENS.find((s) => !$(s).classList.contains('hidden'));
  if (push && cur && cur !== id) screenHistory.push(cur);
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.add('hidden');
  if (id === 'scrMenu') {
    screenHistory = [];
    showMenuBackdrop();
    $('btnContinue').classList.toggle('hidden', !loadable(store.savedGame()));
  }
}

function back() {
  const prev = screenHistory.pop() || 'scrMenu';
  showScreen(prev, false);
}
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', back));

let backdropShown = false;
function showMenuBackdrop() {
  if (S && !S.over) {
    R.overlay = {};
    R.viewPad = { top: 0, bottom: 0 };
    R.setState(S);
    return;
  }
  if (backdropShown) return;
  backdropShown = true;
  const demo = createGame({
    seed: Math.floor(Math.random() * 1e9), cols: 12, rows: 16, biome: 'mixed',
    players: [{ ai: 3 }, { ai: 3 }, { ai: 3 }],
  });
  R.viewPad = { top: 0, bottom: 0 };
  R.overlay = {};
  R.setState(demo);
  R.cam.z *= 1.25;
}

// ---------------------------------------------------------------- Spielstart
function levelConfig(level) {
  return {
    seed: level.seed, cols: level.cols, rows: level.rows, biome: level.biome, fog: !!settings.fog,
    players: [{ human: true }, ...level.ais.map((ai) => ({ ai }))],
  };
}

function startLevel(level) {
  S = createGame(levelConfig(level));
  S.meta = { mode: 'level', levelId: level.id };
  enterGame();
  if (level.id === 1 || !store.progress().seenIntro) showIntro();
}

// Regler „Städte auf der Karte“: Faktor auf die normale Anzahl Dörfer (Dorfdichte 18 = normal)
const CITY_MULTS = [0.33, 0.5, 0.75, 1, 1.5, 2];
const CITY_LABELS = ['sehr wenige', 'wenige', 'etwas weniger', 'normal', 'mehr', 'viele'];
function skirmishConfig(setup) {
  const size = MAP_SIZES[setup.size];
  let biome = setup.biome;
  const code = setup.code;
  if (biome === 'random') {
    const keys = Object.keys(BIOMES);
    biome = keys[seedFromCode(code) % keys.length];
  }
  return {
    seed: seedFromCode(code), cols: size.cols, rows: size.rows, biome, fog: !!settings.fog,
    villageDensity: Math.round(18 / CITY_MULTS[setup.cities ?? 3]),
    players: [{ human: true }, ...Array.from({ length: setup.enemies }, () => ({ ai: setup.diff }))],
  };
}

function startSkirmish(setup) {
  const code = setup.code;
  S = createGame(skirmishConfig(setup));
  S.meta = { mode: 'skirmish', code, setup };
  enterGame();
  if (!store.progress().seenIntro) showIntro();
}

function restartGame() {
  if (!S) return;
  const meta = S.meta;
  if (meta.mode === 'level') startLevel(getLevels().find((l) => l.id === meta.levelId));
  else startSkirmish(meta.setup);
}

function enterGame() {
  for (const s of SCREENS) $(s).classList.add('hidden');
  $('hud').classList.remove('hidden');
  backdropShown = false;
  undoStack = [];
  turnCam = null;
  clearSel();
  R.viewPad = { top: 100, bottom: 160 };
  const human = S.players.find((p) => p.human);
  const cap = S.cities.find((c) => c.owner === human?.id && c.capital) || S.cities.find((c) => c.owner === human?.id);
  R.setState(S, true, cap?.idx);
  updateHud();
  updateHudTop();
  saveGame();
  if (!S.players[S.current].human) runAI();
  else refresh();
}

function saveGame() {
  if (S && !S.over) store.saveGame(S);
}

// ---------------------------------------------------------------- Auswahl & Overlay
function clearSel() {
  sel = { unitId: null, cityIdx: null, infoIdx: null, placeTower: null, placeType: 'tower', group: null, magic: null, terraform: null, tfKind: 'forest' };
}

// ---------------------------------------------------------------- Gruppen
let shiftDown = false;
window.addEventListener('keydown', (e) => { if (e.key === 'Shift') shiftDown = true; });
window.addEventListener('keyup', (e) => { if (e.key === 'Shift') shiftDown = false; });

function groupUnits() {
  return (sel.group || []).map((id) => unitById(S, id)).filter((u) => u && u.owner === S.current);
}

function toggleGroupMember(u) {
  if (UNITS[u.type].structure) return;
  const g = sel.group || [];
  sel.group = g.includes(u.id) ? g.filter((x) => x !== u.id) : [...g, u.id];
  if (!sel.group.length) clearSel();
  refresh();
}

// Gruppe aus allen eigenen Einheiten in der Nähe bilden (optional nur gleicher Typ)
function groupNearby(u, sameType) {
  clearSel();
  sel.group = [u.id];
  addNearbyToGroup(sameType ? u.type : null);
  const n = groupUnits().length;
  if (n <= 1) toast(sameType ? `Keine weiteren ${UNITS[u.type].name} in der Nähe.` : 'Keine weiteren Einheiten in der Nähe.');
}

function addNearbyToGroup(onlyType = null) {
  const geo = getGeoOf();
  const members = groupUnits();
  // Zusammenhängender Trupp: Einheiten im Abstand ≤ 2 zueinander, höchstens 20
  const ids = new Set(sel.group);
  const front = members.slice();
  while (front.length && ids.size < 20) {
    const m = front.shift();
    for (const x of S.units) {
      if (ids.size >= 20) break;
      if (x.owner !== S.current || ids.has(x.id) || UNITS[x.type].structure || (onlyType && x.type !== onlyType)) continue;
      if (!canMove(x) && !canAttack(x)) continue;
      if (geo.dist(m.idx, x.idx) <= 2) { ids.add(x.id); front.push(x); }
    }
  }
  sel.group = [...ids];
  refresh();
}

function groupMoves(occ) {
  const all = new Set();
  for (const u of groupUnits()) if (canMove(u)) for (const j of getMoves(S, u, occ).keys()) all.add(j);
  return all;
}

// Angreifer für ein Ziel: erst Fernkämpfer, dann Nahkämpfer
// Gruppenangriff: Mitglieder rücken bei Bedarf heran (abschaltbar)
let groupApproach = true;

// Feld, von dem aus u das Ziel angreifen kann (bevorzugt das eigene), sonst null
function attackSpot(u, target, occ) {
  if (!canAttack(u)) return null;
  const geo = getGeoOf();
  const rng = statsOf(S, u).range;
  if (geo.dist(u.idx, target.idx) <= rng) return u.idx;
  if (!groupApproach || !canMove(u) || UNITS[u.type].noMoveAttack) return null;
  let best = null;
  for (const d of getMoves(S, u, occ).keys()) {
    const dd = geo.dist(d, target.idx);
    if (dd > rng) continue;
    // Fernkämpfer bleiben auf Abstand, sonst kürzester Weg
    const score = (rng > 1 ? -dd * 3 : 0) + geo.dist(u.idx, d);
    if (!best || score < best.score) best = { d, score };
  }
  return best ? best.d : null;
}

// Angreifer für ein Ziel: erst Fernkämpfer, dann wer schon steht, dann wer heranrücken muss
// Zauberer ziehen mit der Gruppe, greifen aber nicht automatisch mit an
function groupAttackers(target, occ) {
  return groupUnits()
    .filter((u) => !UNITS[u.type].healer)
    .map((u) => ({ u, spot: attackSpot(u, target, occ) }))
    .filter((x) => x.spot != null)
    .sort((a, b) => statsOf(S, b.u).range - statsOf(S, a.u).range || (a.spot !== a.u.idx) - (b.spot !== b.u.idx))
    .map((x) => x.u);
}

async function doGroupMove(target) {
  if (busy) return;
  const geo = getGeoOf();
  const snap = cloneState(S);
  const members = groupUnits().filter(canMove).sort((a, b) => geo.dist(a.idx, target) - geo.dist(b.idx, target));
  const events = [];
  for (const u of members) {
    const moves = getMoves(S, u, buildOcc(S));
    const cur = geo.dist(u.idx, target);
    let best = null;
    for (const d of moves.keys()) {
      const dd = geo.dist(d, target);
      if (dd < cur && (!best || dd < best.dd)) best = { d, dd };
    }
    if (!best) continue;
    const ev = applyAction(S, { type: 'move', unitId: u.id, to: best.d });
    if (ev) events.push(...ev);
  }
  if (!events.length) { toast('Die Gruppe kommt dort nicht näher heran.'); return; }
  undoStack.push(snap);
  busy = true;
  refresh();
  let longest = 0;
  for (const e of events) if (e.k === 'move') longest = Math.max(longest, R.animateMove(e.id, e.path, 100));
  await sleep(longest);
  busy = false;
  groupDone();
  refresh();
}

// Gruppe erst automatisch auflösen, wenn kein Mitglied mehr ziehen oder angreifen kann –
// so lassen sich mit derselben Gruppe nacheinander mehrere Ziele angreifen
function groupDone() {
  if (!sel.group) return;
  const occ = buildOcc(S);
  const busyLeft = groupUnits().some((u) => canMove(u) || (canAttack(u) && unitTargets(u, occ).length));
  if (!busyLeft) {
    clearSel();
    toast('👥 Gruppe aufgelöst.');
  }
}

async function doGroupAttack(target) {
  if (busy) return;
  const occ = buildOcc(S);
  const attackers = groupAttackers(target, occ);
  if (!attackers.length) return;
  undoStack = [];
  busy = true;
  vibrate(30);
  // Alle nacheinander, bis jeder dran war oder das Ziel fällt
  for (const u of attackers) {
    const t = unitById(S, target.id);
    if (!t) break;
    if (!unitById(S, u.id)) continue;
    const spot = attackSpot(u, t, buildOcc(S));
    if (spot == null) continue;
    if (spot !== u.idx) {
      const mv = applyAction(S, { type: 'move', unitId: u.id, to: spot });
      if (!mv) continue;
      refresh();
      await play(mv, 1, false);
    }
    const ev = applyAction(S, { type: 'attack', unitId: u.id, targetId: t.id });
    if (!ev) continue;
    refresh();
    await play(ev, 1, false);
  }
  if (!unitById(S, target.id)) toast('Ziel besiegt.');
  busy = false;
  groupDone();
  refresh();
  if (S.over) gameOver();
}

function getGeoOf() {
  return getGeo(S.cols, S.rows);
}

function humanTurn() {
  return S && !S.over && S.players[S.current].human;
}

let curVis = null; // Sichtbarkeit des Menschen bei Kartennebel

function humanId() {
  return (S.players.find((p) => p.human) || S.players[0]).id;
}

function updateVis() {
  curVis = S && S.fog ? visibility(S, humanId()) : null;
}

function unitTargets(u, occ) {
  if (!canAttack(u)) return [];
  const t = getTargets(S, u, u.idx, occ);
  return curVis ? t.filter((x) => curVis[x.idx]) : t;
}

// Gegner, die die Einheit erst nach einem Zug erreicht (bestes Angriffsfeld je Gegner)
function reachTargets(u, occ) {
  if (!canMove(u) || !canAttack(u) || UNITS[u.type].noMoveAttack || isStructure(u)) return new Map();
  const geo = getGeoOf();
  const rng = statsOf(S, u).range;
  const spots = [...getMoves(S, u, occ).keys()];
  const direct = new Set(unitTargets(u, occ));
  const res = new Map();
  for (const x of S.units) {
    if (x.owner === u.owner || direct.has(x) || (curVis && !curVis[x.idx])) continue;
    let best = null;
    for (const d of spots) {
      const dd = geo.dist(d, x.idx);
      if (dd > rng || dd < (UNITS[u.type].minRange || 1)) continue;
      // Fernkämpfer bleiben auf Abstand, sonst kürzester Weg
      const score = (rng > 1 ? -dd * 3 : 0) + geo.dist(u.idx, d);
      if (!best || score < best.score) best = { d, score };
    }
    if (best) res.set(x, best.d);
  }
  return res;
}

// Erst auf das beste Feld ziehen, dann angreifen
async function doApproachAttack(u, t, spot) {
  if (busy) return;
  undoStack = [];
  busy = true;
  vibrate(30);
  const mv = applyAction(S, { type: 'move', unitId: u.id, to: spot });
  if (mv) { refresh(); await play(mv, 1, false); }
  const ev = mv && unitById(S, t.id) ? applyAction(S, { type: 'attack', unitId: u.id, targetId: t.id }) : null;
  if (ev) { refresh(); await play(ev, 1, false); }
  busy = false;
  clearSel();
  refresh();
  if (S.over) gameOver();
}

function unitHeals(u) {
  return canAttack(u) ? getHealTargets(S, u) : [];
}

function refresh() {
  if (!S) return;
  updateVis();
  const occ = buildOcc(S);
  const o = { exhausted: new Set(), ready: new Set() };
  if (curVis) o.fog = { vis: curVis, explored: S.explored[humanId()] };
  if (humanTurn() && !busy) {
    for (const u of S.units) {
      if (u.owner !== S.current || u.type === 'barrier') continue;
      if (!canMove(u) && unitTargets(u, occ).length === 0 && !unitHeals(u).length) o.exhausted.add(u.id);
      else if (!u.sentry) {
        o.ready.add(u.id);
        if (u.moved) (o.partial ||= new Set()).add(u.id); // schon gezogen, kann aber noch angreifen
      }
      // Spezialisierung wählbar: Einheit schimmert
      if (perkOptions(u).length) (o.upgrade ||= new Set()).add(u.id);
    }
  }
  const u = sel.unitId != null ? unitById(S, sel.unitId) : null;
  if (u) {
    o.selected = u.idx;
    if (humanTurn() && u.owner === S.current) {
      if (canMove(u)) o.moves = new Set(getMoves(S, u, occ).keys());
      if (UNITS[u.type].structure) o.moves = null;
      if (UNITS[u.type].healer) {
        const geo = getGeoOf();
        o.aura = new Set(geo.within(u.idx, auraRadius(S, u.owner)));
        if (canAttack(u)) o.heals = new Set(getHealTargets(S, u).map((x) => x.idx));
      }
      const t = unitTargets(u, occ);
      // Gegner, die erst nach dem Ziehen erreichbar sind, ebenfalls rot (Vorschau vom besten Angriffsfeld)
      const reach = reachTargets(u, occ);
      if (t.length || reach.size) {
        o.targets = new Map();
        for (const [x, spot] of reach) {
          const r = computeCombat(S, u, x, spot);
          o.targets.set(x.idx, { idx: x.idx, dmg: r.dmg, counter: r.counter, kill: r.kill, die: r.die });
        }
        for (const x of t) {
          const r = computeCombat(S, u, x);
          // Mitgetroffene Gegner (Flächenschaden, Feueratem in Linie)
          const extra = (splashOf(u) || UNITS[u.type].line) ? splashDamage(S, u, x.idx, r.dmg) : [];
          o.targets.set(x.idx, { idx: x.idx, dmg: r.dmg, counter: r.counter, kill: r.kill, die: r.die, extra: extra.length, extraDmg: extra.reduce((a, h) => a + h.dmg, 0) });
        }
      }
    }
  }
  if (sel.group) {
    const members = groupUnits();
    o.selectedSet = new Set(members.map((m) => m.idx));
    o.moves = groupMoves(occ);
    const targets = new Map();
    for (const x of S.units) {
      if (x.owner === S.current || (curVis && !curVis[x.idx])) continue;
      const att = groupAttackers(x, occ);
      if (!att.length) continue;
      // Vorschau: Schaden des ersten Angreifers (Fernkämpfer zuerst)
      const r = computeCombat(S, att[0], x, attackSpot(att[0], x, occ));
      targets.set(x.idx, { idx: x.idx, dmg: r.dmg, counter: r.counter, kill: r.kill, die: r.die, n: att.length });
    }
    if (targets.size) o.targets = targets;
  }
  // Zauber des Zauberers: violett markierte Ziele (Gegner zum Vereisen, Berge zum Sprengen)
  if (sel.magic && u) {
    o.moves = null;
    o.targets = null;
    o.heals = null;
    o.special = new Set(magicTargets(u));
    // Feuersturm: gewählte Fläche rot, betroffene Gegner als Ziele
    if (sel.magic === 'storm' && sel.stormTo != null) {
      o.targets = new Map();
      for (const x of S.units) if (x.owner !== S.current && o.special.has(x.idx) && (!curVis || curVis[x.idx])) o.targets.set(x.idx, { idx: x.idx, dmg: Math.min(x.hp, stormDmgOf(u, x)), counter: 0, kill: stormDmgOf(u, x) >= x.hp, die: false });
    }
  }
  if (sel.cityIdx != null) o.cityIdx = sel.cityIdx;
  // Gelände umgestalten: helle Felder = aufforstbare Wiesen und rodbare Wälder der Stadt
  if (sel.terraform != null) {
    const terr = computeTerritory(S);
    o.moves = new Set();
    for (const i of getGeoOf().within(S.cities[sel.terraform].idx, 2)) if (terr[i] === sel.terraform && canTerraform(S, S.current, i, terr) === (sel.tfKind === 'clear' ? 'clear' : 'plant')) o.moves.add(i);
  }
  if (sel.placeTower != null) {
    const terr = computeTerritory(S);
    o.moves = new Set();
    for (const i of getGeoOf().within(S.cities[sel.placeTower].idx, 2)) if (!canBuildTower(S, S.current, i, terr, sel.placeType, sel.placeTower)) o.moves.add(i);
  }
  if (sel.infoIdx != null) o.selected = sel.infoIdx;
  R.overlay = o;
  R.invalidate();
  renderPanel();
  updateHud();
}

function onTap(sx, sy) {
  if (!S || busy || $('hud').classList.contains('hidden')) return;
  $('combatTip')?.remove();
  hoverUnit = null;
  if (!humanTurn()) return;
  const i = R.pick(sx, sy);
  if (i < 0) { clearSel(); refresh(); return; }
  if (sel.terraform != null) {
    const ci = sel.terraform;
    const terr = computeTerritory(S);
    const want = sel.tfKind === 'clear' ? 'clear' : 'plant';
    const kind = terr[i] === ci && canTerraform(S, S.current, i, terr) === want ? want : null;
    if (kind === 'plant' && !canAfford(S.players[S.current].res, plantCost(sel.tfKind))) { toast('Zu wenig Rohstoffe.'); return; }
    if (kind) { quickAct(kind === 'plant' ? { type: 'plant', idx: i, to: sel.tfKind } : { type: 'clear', idx: i }); return; } // Modus bleibt offen für weitere Felder
    clearSel();
    sel.cityIdx = S.cities[ci].idx;
    cityTab = 'build';
    refresh();
    return;
  }
  if (sel.placeTower != null) {
    const type = sel.placeType;
    const ok = !canBuildTower(S, S.current, i, undefined, type, sel.placeTower);
    const city = S.cities[sel.placeTower].idx;
    clearSel();
    if (ok) {
      // Steinwälle: nach dem Setzen gleich weiter platzieren, solange es geht
      const again = type === 'barrier' ? sel.placeTower : null;
      sel.cityIdx = city;
      cityTab = 'build';
      act({ type: 'tower', unitType: type, idx: i, city }, {
        after: () => {
          const ci = S.cityAt[city];
          if (again != null && towersOfCity(S, ci, undefined, 'barrier') < structureLimit(S.cities[ci], 'barrier') && canAfford(S.players[S.current].res, UNITS.barrier.cost)) {
            clearSel();
            sel.placeTower = ci;
            sel.placeType = 'barrier';
          }
        },
      });
    } else { toast(type === 'barrier' ? 'Wallbau beendet.' : 'Turmbau abgebrochen.'); refresh(); }
    return;
  }
  const occ = buildOcc(S);
  if (curVis) for (const x of S.units) if (x.owner !== S.current && !curVis[x.idx]) occ[x.idx] = null;
  const u = occ[i];
  if (sel.group) {
    if (u && u.owner === S.current) { toggleGroupMember(u); return; }
    if (u && groupAttackers(u, occ).length) { doGroupAttack(u); return; }
    if (!u && groupMoves(occ).has(i)) { doGroupMove(i); return; }
    // Gegner außer Reichweite: Gruppe bleibt; Tipp auf ein leeres Feld löst sie auf
    if (u) { toast('Niemand aus der Gruppe erreicht dieses Ziel.'); return; }
    clearSel();
    refresh();
    return;
  }
  // Zauber: nur markierte Ziele, sonst abbrechen
  if (sel.magic === 'storm') {
    const from = unitById(S, sel.unitId);
    if (from && sel.stormTo == null) {
      const to = getGeoOf().nb[from.idx].find((t) => stormArea(S, from.idx, t).line.includes(i));
      if (to != null) { sel.stormTo = to; refresh(); return; }
    } else if (from && magicTargets(from).includes(i)) {
      const to = sel.stormTo;
      sel.magic = null;
      sel.stormTo = null;
      act({ type: 'storm', unitId: from.id, toward: to }, { undoable: false, after: () => clearSel() });
      return;
    }
    sel.magic = null;
    sel.stormTo = null;
    toast('Feuersturm abgebrochen.');
    refresh();
    return;
  }
  if (sel.magic) {
    const from = unitById(S, sel.unitId);
    if (from && magicTargets(from).includes(i)) {
      const kind = sel.magic;
      sel.magic = null;
      if (kind === 'freeze') act({ type: 'freeze', unitId: from.id, targetId: S.units.find((x) => x.idx === i).id }, { after: () => clearSel() });
      else act({ type: 'bomb', unitId: from.id, idx: i }, { after: () => clearSel() });
      return;
    }
    sel.magic = null;
    toast('Zauber abgebrochen.');
    refresh();
    return;
  }
  const selU = sel.unitId != null ? unitById(S, sel.unitId) : null;
  // Shift + Klick (PC): Gruppe bilden
  if (shiftDown && u && u.owner === S.current && selU && selU.owner === S.current && u.id !== selU.id) {
    sel.group = [selU.id];
    sel.unitId = null;
    toggleGroupMember(u);
    return;
  }
  if (selU && selU.owner === S.current) {
    if (u && u.owner !== S.current && unitTargets(selU, occ).includes(u)) { doAttack(selU, u); return; }
    if (u && u.owner !== S.current) {
      const spot = reachTargets(selU, occ).get(u);
      if (spot != null) { doApproachAttack(selU, u, spot); return; }
    }
    if (u && u.owner === S.current && unitHeals(selU).includes(u)) { doHeal(selU, u); return; }
    if (!u && canMove(selU) && getMoves(S, selU, occ).has(i)) { doMove(selU, i); return; }
  }
  if (u && u.owner === S.current) {
    // Eigene Stadt mit Einheit: erster Tipp wählt die Einheit, zweiter öffnet das Stadtmenü
    if (selU && selU.id === u.id) {
      const c = cityOn(S, i);
      clearSel();
      if (c && c.owner === S.current) sel.cityIdx = i;
      refresh();
      return;
    }
    clearSel();
    sel.unitId = u.id;
    sound.play('select', { pan: panOf(u.idx) });
    refresh();
    return;
  }
  const c = cityOn(S, i);
  const wasCity = sel.cityIdx != null; // offenes Stadtmenü: gewählten Reiter (Einheiten/Gebäude) für die nächste Stadt behalten
  clearSel();
  if (c && c.owner === S.current && !u) { if (!wasCity) { cityTab = 'units'; buildGroup = null; } sel.cityIdx = i; }
  else sel.infoIdx = i;
  refresh();
}

// Einheiten-Info im Panel unten: Mouse-over am PC, langes Drücken auf dem Handy
function unitStatsText(u, isPreview) {
  const st = statsOf(S, u);
  const hp = isPreview ? st.hp : `${u.hp}/${st.hp}`;
  return `❤ ${hp} · ⚔ ${st.atk}${st.pen ? ` · 🗡 ${st.pen}` : ''} · 👣 ${st.move} · 🎯 ${st.range}`;
}

function unitNotes(u) {
  const notes = [UNITS[u.type].desc, defenseWords(u.type)];
  const stx = statsOf(S, u);
  if (stx.def) notes.push(`🛡 Verteidigung +${stx.def} % (Rang, Entwicklung, Verbesserung).`);
  if (stx.pen) notes.push(`🗡 Durchschlag ${stx.pen}: senkt die Verteidigung des Gegners um ${stx.pen} %.`);
  if (u.stone) notes.push('🪨 Versteinert: setzt den nächsten Zug aus und schlägt nicht zurück.');
  else if (u.stoneNow) notes.push('🪨 Versteinert: setzt diesen Zug aus.');
  if (inAura(S, u)) notes.push(`🛡 Schutzaura: +${AURA.def} % Verteidigung, Flächenschaden halbiert.`);
  if (UNITS[u.type].healer) notes.push(`Heilt ${healAmount(S, u)} Leben bis 3 Felder weit.`);
  if (!UNITS[u.type].structure) {
    const r = u.rank || 1;
    notes.push(r < MAX_RANK ? `${UNITS[u.type].healer ? 'Heilungen' : 'Besiegte Gegner'}: ${u.xp || 0}/${RANK_XP[r + 1]} bis ${RANK_NAMES[r + 1]}.` : 'Höchste Stufe erreicht.');
  }
  for (const p of u.perks || []) notes.push(`${PERKS[p].icon} ${PERKS[p].name}: ${PERKS[p].desc}.`);
  const b = BOOST_STATS.filter(([k]) => u.boost?.[k]).map(([k, name, ic]) => `${ic} ${name} ${boostText(k, u.boost[k])}`);
  if (b.length) notes.push(`⬆ Verbessert: ${b.join(', ')}.`);
  for (const k of u.skills || []) notes.push(`${SKILLS[k].icon} ${SKILLS[k].name}: ${SKILLS[k].desc}.`);
  if (u.iced || u.ice) notes.push('❄️ Vereist.');
  if (u.type === 'dragon') notes.push(stormWait(S, u) ? `🔥 Feuersturm wieder in ${stormWait(S, u)} Runden.` : '🔥 Feuersturm bereit.');
  if (u.sentry) notes.push('💤 Hält Wache.');
  return notes.join(' ');
}

let hoverUnit = null;
function setHover(u) {
  const id = u ? u.id : null;
  if (id === hoverUnit) return;
  hoverUnit = id;
  renderPanel();
}

function unitAtScreen(x, y) {
  if (!S || x < 0) return null;
  const i = R.pick(x, y);
  if (i < 0) return null;
  if (curVis && !curVis[i]) return null;
  return S.units.find((u) => u.idx === i) || null;
}

function onHover(x, y, to) {
  if (!S || $('hud').classList.contains('hidden') || sel.cityIdx != null || sel.placeTower != null) return;
  // Maus wandert auf das gerade aufgeklappte Info-Fenster: stehen lassen (sonst zappelt es auf und zu)
  if (x < 0 && to && $('hud').contains(to)) return;
  // Solange eine Einheit gewählt ist, bleibt ihr Panel stehen; über Gegnern erscheint der Kampf-Tooltip
  if (sel.unitId != null || sel.group) { if (hoverUnit != null) setHover(null); if (x >= 0) showCombatTip(x, y); else $('combatTip')?.remove(); return; }
  $('combatTip')?.remove();
  setHover(unitAtScreen(x, y));
}

let holdTimer = null;
// Kampf-Tooltip: aufgeschlüsselter Schaden gegen einen Gegner (PC: Maus darüber, Handy: lange drücken)
function combatTarget(x, y) {
  const selU = sel.unitId != null ? unitById(S, sel.unitId) : null;
  const t = unitAtScreen(x, y);
  if (!selU || !t || selU.owner !== S.current || t.owner === S.current || !R.overlay.targets?.has(t.idx)) return null;
  return { a: selU, t };
}
function showCombatTip(x, y) {
  const ct = combatTarget(x, y);
  let tip = $('combatTip');
  if (!ct) { if (tip) tip.remove(); return false; }
  const occ = buildOcc(S);
  const from = unitTargets(ct.a, occ).includes(ct.t) && getTargets(S, ct.a, ct.a.idx, occ).includes(ct.t) ? ct.a.idx : (attackSpot(ct.a, ct.t, occ) ?? ct.a.idx);
  const c = combatInfo(S, ct.a, ct.t, from);
  if (!tip) { tip = el('div', { id: 'combatTip', class: 'tip' }); document.body.append(tip); }
  tip.innerHTML = '';
  tip.append(
    el('div', { class: 'tip-title' }, `⚔ ${UNITS[ct.a.type].name} → ${UNITS[ct.t.type].name}`),
    el('div', { class: 'tip-grid' },
      el('div', {}, el('span', {}, 'Schaden'), el('b', { class: c.kill ? 'ok' : 'bad' }, c.kill ? `−${c.dmg} ✖ besiegt` : `−${c.dmg} (bleibt ${ct.t.hp - c.dmg})`)),
      el('div', {}, el('span', {}, 'Gegenschlag'), el('b', {}, c.kill ? '–' : c.lance ? '– (lange Lanze)' : c.counter ? `−${c.counter}${c.die ? ' ✖ fällt' : ''}` : '–')),
      el('div', {}, el('span', {}, 'Rechnung'), el('b', {}, `${c.atkValue} Angriff × (100 % − ${c.defPct} %) = ${c.dmg}`)),
      c.extra.length ? el('div', {}, el('span', {}, 'Mitgetroffen'), el('b', {}, c.extra.map((h) => `${UNITS[h.unit.type].name} −${h.dmg}`).join(', '))) : null),
    c.atkNotes.length ? el('div', { class: 'tip-desc' }, '⬆ ' + c.atkNotes.join(' · ')) : null,
    c.defNotes.length ? el('div', { class: 'tip-desc' }, '🛡 ' + c.defNotes.join(' · ')) : null);
  const w = 250;
  tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x + 16)) + 'px';
  tip.style.top = Math.max(8, y - 140) + 'px';
  return true;
}

function onHold(x, y) {
  if (showCombatTip(x, y)) { vibrate(15); clearTimeout(holdTimer); holdTimer = setTimeout(() => $('combatTip')?.remove(), 5000); return; }
  const u = unitAtScreen(x, y);
  if (!u || sel.cityIdx != null) return;
  vibrate(15);
  setHover(u);
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => setHover(null), 4000);
}

attachInput(canvas, R, onTap, onHold, onHover);
// Verlässt die Maus das Info-Fenster nicht zur Karte hin, verschwindet die Hover-Info
$('panel').addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && e.relatedTarget !== canvas && sel.unitId == null) setHover(null); });

// ---------------------------------------------------------------- Aktionen
function vibrate(ms) {
  if (settings.vibrate && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* egal */ }
  }
}

function pushUndo() {
  undoStack.push(cloneState(S));
  if (undoStack.length > 30) undoStack.shift();
}

async function act(action, { undoable = true, after } = {}) {
  if (busy) return;
  const snap = undoable ? cloneState(S) : null;
  const ev = applyAction(S, action);
  if (!ev) { sound.play('error'); toast('Das geht nicht.'); return; }
  if (undoable) { undoStack.push(snap); if (undoStack.length > 30) undoStack.shift(); }
  else undoStack = [];
  busy = true;
  refresh();
  await play(ev, 1, false);
  busy = false;
  if (after) after();
  refresh();
  if (S.over) gameOver();
}

function doMove(u, to) {
  act({ type: 'move', unitId: u.id, to }, {
    after: () => {
      const nu = unitById(S, u.id);
      if (!nu || unitTargets(nu, buildOcc(S)).length === 0) clearSel();
    },
  });
}

function doAttack(u, t) {
  vibrate(30);
  act({ type: 'attack', unitId: u.id, targetId: t.id }, { undoable: false, after: () => clearSel() });
}

function doHeal(u, t) {
  act({ type: 'heal', unitId: u.id, targetId: t.id }, { after: () => clearSel() });
}

async function doDemolish(idx, building) {
  const B = BUILDINGS[building];
  const ok = await confirmDialog(`${B.name} abreißen?`, `Der Bauplatz wird frei, du bekommst die Hälfte der Baukosten zurück.`, 'Abreißen', 'Behalten');
  if (ok) quickAct({ type: 'demolish', idx, building });
}

function stormDmgOf(u, t) {
  return Math.max(1, Math.ceil(computeCombat(S, u, t, u.idx).dmg * STORM.dmg - 1e-9));
}
// Ziele des gerade gewählten Zaubers (Feldnummern); Feuersturm: erst die 6 Schneisen, nach der Wahl die ganze Fläche
function magicTargets(u) {
  if (sel.magic === 'storm') {
    if (sel.stormTo != null) return stormArea(S, u.idx, sel.stormTo).area;
    return getGeoOf().nb[u.idx].flatMap((to) => stormArea(S, u.idx, to).line.filter((j) => j >= 0));
  }
  if (sel.magic === 'freeze') return getFreezeTargets(S, u).filter((x) => !curVis || curVis[x.idx]).map((x) => x.idx);
  if (sel.magic === 'bomb') return getBombTargets(S, u);
  return [];
}

// Zuschlag einer Verbesserungsstufe als Text: Angriff/Leben/Durchschlag als Zahl, Verteidigung in Prozent
function boostText(k, lvl) {
  return `+${BOOST_ADD[k][lvl]}${k === 'def' ? ' %' : ''}`;
}

// Einzel-Verbesserungen einer Einheit: Angriff, Verteidigung, Leben, Durchschlag (je 3 Stufen) und Fähigkeiten
function openBoost(u0) {
  const draw = () => {
    const u = unitById(S, u0.id);
    if (!u) { closeModal(); return; }
    const p = S.players[u.owner];
    const my = humanTurn() && u.owner === S.current;
    const st = statsOf(S, u);
    const buy = (a) => {
      const box = $('modalBox'), top = box.scrollTop;
      if (quickAct(a, false)) { draw(); $('modalBox').scrollTop = top; }
    };
    const list = el('div', { class: 'tech-list' });
    for (const [k, name, ic] of BOOST_STATS) {
      const lvl = u.boost?.[k] || 0;
      const next = { ...u, boost: { ...(u.boost || {}), [k]: lvl + 1 } };
      const now = st[k], then = lvl < 3 ? statsOf(S, next)[k] : null;
      const cost = lvl < 3 ? boostCost(u.type, lvl) : null;
      list.append(el('div', { class: 'tech-card' + (lvl >= 3 ? ' done' : '') },
        el('span', { class: 'ticon' }, ic),
        el('div', { class: 'binfo' },
          el('b', {}, `${name} ${'●'.repeat(lvl)}${'○'.repeat(3 - lvl)}`),
          el('span', {}, k === 'def' ? (lvl < 3 ? `${boostText(k, lvl + 1)} (Zuschlag ${now} % → ${then} %)` : `${boostText(k, 3)}`) : lvl < 3 ? `${boostText(k, lvl + 1)}: ${now} → ${then}` : `${boostText(k, 3)}: ${now}`)),
        lvl >= 3 ? el('span', { class: 'done' }, '✓')
          : el('button', { class: 'btn small', disabled: !my || !canAfford(p.res, cost), onclick: () => buy({ type: 'boost', unitId: u.id, stat: k }) }, costEl(cost, p.res))));
    }
    const skills = skillsFor(u.type);
    const opts = skillOptions(u);
    const sk = el('div', { class: 'tech-list' });
    for (const k of skills) {
      const S0 = SKILLS[k];
      const have = hasSkill(u, k);
      const cost = skillCost(u.type);
      sk.append(el('div', { class: 'tech-card' + (have ? ' done' : opts.includes(k) ? '' : ' locked') },
        el('span', { class: 'ticon' }, S0.icon),
        el('div', { class: 'binfo' }, el('b', {}, S0.name), el('span', {}, S0.desc), S0.req && !have ? el('span', { class: 'muted' }, `${opts.includes(k) ? '↳' : '🔒'} benötigt ${SKILLS[S0.req].name}`) : null),
        have ? el('span', { class: 'done' }, '✓')
          : el('button', { class: 'btn small', disabled: !my || !opts.includes(k) || !canAfford(p.res, cost), onclick: () => buy({ type: 'skill', unitId: u.id, skill: k }) }, costEl(cost, p.res))));
    }
    openClosable(el('h2', {}, `⬆ ${UNITS[u.type].name} verbessern`),
      unitCard(u, 'Gilt nur für diese eine Einheit'),
      el('h3', {}, 'Werte'), list,
      el('h3', {}, 'Fähigkeiten'), skills.length ? sk : el('p', { class: 'muted' }, 'Diese Einheit hat keine Fähigkeiten – nur Werte lassen sich verbessern.'),
      el('button', { class: 'btn big', onclick: closeModal }, 'Schließen'));
    $('modalBox').classList.add('wide');
  };
  draw();
}

async function doDisband(u) {
  const ok = await confirmDialog(`${UNITS[u.type].name} entlassen?`, 'Die Einheit wird aufgelöst. Rohstoffe gibt es dafür nicht zurück.', 'Entlassen', 'Behalten');
  if (ok) act({ type: 'disband', unitId: u.id }, { after: () => clearSel() });
}

async function doRaze(u) {
  const ok = await confirmDialog(`${UNITS[u.type].name} abreißen?`, 'Du bekommst die Hälfte der Baukosten zurück.', 'Abreißen', 'Behalten');
  if (ok) act({ type: 'raze', unitId: u.id }, { after: () => clearSel() });
}

const costText = (c) => RES.filter((k) => c[k]).map((k) => `${c[k]} ${RES_INFO[k].name}`).join(', ');

// Sofort-Aktionen im Stadtmenü: kein Warten auf Animationen, schnelles Klicken kommt an
function quickAct(action, undoable = true) {
  if (busy) return false;
  const snap = cloneState(S);
  const ev = applyAction(S, action);
  if (!ev) { sound.play('error'); toast('Das geht nicht.'); return false; }
  if (undoable) undoStack.push(snap);
  if (undoStack.length > 30) undoStack.shift();
  refresh();
  play(ev, 1, false); // Animation läuft nebenher
  return true;
}

function doRecruit(idx, type) {
  quickAct({ type: 'recruit', idx, unitType: type });
}

function doUpgrade(idx) {
  quickAct({ type: 'upgrade', idx });
}

function doBuild(idx, building) {
  quickAct({ type: 'build', idx, building });
}

let techBranch = 'mil';
const techList = () => TECH_ORDER;
function openTech() {
  if (!S || busy) return;
  const draw = () => {
    const pid = humanId();
    const p = S.players[pid];
    const my = humanTurn();
    const tabs = el('div', { class: 'ptabs tech-tabs' });
    for (const [k, label] of TECH_BRANCHES) {
      const done = techList().filter((t) => TECHS[t].branch === k && hasTech(S, pid, t)).length;
      const all = techList().filter((t) => TECHS[t].branch === k).length;
      tabs.append(el('button', { class: techBranch === k ? 'active' : '', onclick: () => { techBranch = k; draw(); } }, `${label} ${done}/${all}`));
    }
    // Reiter für die Einheiten-Entwicklung
    for (const [k, label, types] of UP_GROUPS) {
      const done = types.reduce((a, t) => a + unitUpList(S, pid, t).length, 0);
      tabs.append(el('button', { class: 'up-tab' + (techBranch === k ? ' active' : ''), onclick: () => { techBranch = k; draw(); } }, `${label} ${done}/${types.length * 5}`));
    }
    const group = UP_GROUPS.find((g) => g[0] === techBranch);
    if (group) {
      openClosable(el('h2', {}, '🔬 Forschung'), el('p', {}, 'Einheiten-Entwicklung: Jede Stufe gilt für alle Einheiten dieses Typs und verändert ihr Aussehen. Auf Stufe 3 wählst du eine von zwei Richtungen.'), tabs,
        unitUpView(group[2], pid, my, () => { const top = $('modalBox').scrollTop; draw(); $('modalBox').scrollTop = top; }),
        el('button', { class: 'btn big', onclick: closeModal }, 'Schließen'));
      $('modalBox').classList.add('wide');
      return;
    }
    const list = el('div', { class: 'tech-list' });
    for (const t of techList().filter((x) => TECHS[x].branch === techBranch)) {
      const T = TECHS[t];
      const done = hasTech(S, pid, t);
      const avail = techAvailable(S, pid, t);
      const reqTxt = T.req.length ? `benötigt ${T.req.map((r) => TECHS[r].name).join(' + ')}` : '';
      list.append(el('div', { class: 'tech-card' + (done ? ' done' : avail ? '' : ' locked') + (T.req.length ? ' child' : '') },
        el('span', { class: 'ticon' }, T.icon),
        el('div', { class: 'binfo' }, el('b', {}, T.name), el('span', {}, T.desc), ecoTechPreview(t, pid), reqTxt ? el('span', { class: 'muted' }, (avail || done ? '↳ ' : '🔒 ') + reqTxt) : null),
        done ? el('span', { class: 'done' }, '✓')
          : el('button', {
            class: 'btn small', disabled: !avail || !my || !canAfford(p.res, T.cost),
            // Fenster bleibt offen, nur der Inhalt wird aufgefrischt (Scroll-Position bleibt)
            onclick: () => {
              const box = $('modalBox'), top = box.scrollTop;
              if (quickAct({ type: 'research', tech: t }, false)) { draw(); $('modalBox').scrollTop = top; }
            },
          }, costEl(T.cost, p.res))));
    }
    openClosable(el('h2', {}, '🔬 Forschung'), el('p', {}, 'Erforschte Verbesserungen gelten für dein ganzes Reich.'), tabs, list,
      el('button', { class: 'btn big', onclick: closeModal }, 'Schließen'));
    $('modalBox').classList.add('wide');
  };
  draw();
}

// Einheiten-Entwicklung: Einheit wählen, darunter ihre 5 Stufen mit Vorschau des Aussehens
let upUnit = null;
function unitUpView(types, pid, my, redraw) {
  if (!types.includes(upUnit)) upUnit = types[0];
  const p = S.players[pid];
  const chips = el('div', { class: 'up-units' });
  for (const t of types) {
    chips.append(el('button', { class: 'up-unit' + (t === upUnit ? ' active' : ''), onclick: () => { upUnit = t; redraw(); } },
      iconCanvas(t, pid, 46, 1, unitUpList(S, pid, t)), el('span', {}, UNITS[t].name), el('small', {}, `${unitUpList(S, pid, t).length}/5`)));
  }
  const have = unitUpList(S, pid, upUnit);
  const box = el('div', { class: 'up-tree' });
  UNIT_UPS[upUnit].forEach((tier, i) => {
    const opts = Array.isArray(tier) ? tier : [tier];
    const row = el('div', { class: 'up-row' + (opts.length > 1 ? ' choice' : '') });
    for (const o of opts) {
      const done = have[i] === o.id;
      const lost = have.length > i && !done; // andere Richtung gewählt
      const next = have.length === i;
      const cost = unitUpCost(upUnit, i);
      const preview = [...have.slice(0, i), o.id];
      row.append(el('div', { class: 'tech-card up-card' + (done ? ' done' : lost ? ' lost' : next ? '' : ' locked') },
        iconCanvas(upUnit, pid, 52, 1, preview),
        el('div', { class: 'binfo' }, el('b', {}, `${i + 1}. ${o.name}`), el('span', {}, o.desc)),
        done ? el('span', { class: 'done' }, '✓')
          : lost ? el('span', { class: 'lock' }, '—')
          : el('button', {
            class: 'btn small', disabled: !next || !my || !canAfford(p.res, cost),
            onclick: () => { if (quickAct({ type: 'unitUp', unit: upUnit, id: o.id }, false)) redraw(); },
          }, costEl(cost, p.res))));
    }
    box.append(row);
  });
  return el('div', {}, chips, box);
}

// Knopf, der beim Gedrückthalten immer schneller wiederholt
function repeatButton(label, onStep) {
  let timer = null, t0 = 0;
  const stop = () => { clearTimeout(timer); timer = null; };
  const tick = () => {
    const held = performance.now() - t0;
    const step = held > 2500 ? 10 : held > 1200 ? 5 : held > 500 ? 2 : 1;
    onStep(step);
    timer = setTimeout(tick, held > 400 ? 70 : 350);
  };
  return el('button', {
    class: 'btn step',
    onpointerdown: (e) => { e.preventDefault(); stop(); t0 = performance.now(); tick(); },
    onpointerup: stop, onpointerleave: stop, onpointercancel: stop,
    oncontextmenu: (e) => e.preventDefault(),
  }, label);
}

function openTrade(preGet) {
  if (!S || !humanTurn() || busy) return;
  if (!tradeRate(S, S.current)) {
    sound.play('error');
    toast('⚖️ Zum Handeln brauchst du einen Markt. Baue ihn in einer Stadt (Reiter „Gebäude“).', 4000);
    return;
  }
  let give = null, get = preGet || null, n = 1;
  const draw = () => {
    const p = S.players[S.current];
    const rate = tradeRate(S, p.id);
    if (!give || give === get) give = BASE_RES.filter((k) => k !== get).sort((a, b) => p.res[b] - p.res[a])[0];
    if (!get || get === give) get = BASE_RES.find((k) => k !== give);
    const max = Math.floor(p.res[give] / rate + 1e-9);
    n = Math.max(0, Math.min(n, max));
    if (n === 0 && max > 0) n = 1;
    const row = (label, cur, onPick) => el('div', { class: 'trade-row' }, el('span', { class: 'muted' }, label),
      ...BASE_RES.map((k) => el('button', { class: 'tchip' + (cur === k ? ' active' : ''), onclick: () => { onPick(k); draw(); } }, icon(k), el('b', {}, p.res[k]))));

    const slider = el('input', { type: 'range', id: 'tradeSlider', min: 0, max: Math.max(1, max), step: 1, value: n, disabled: max === 0 });
    const amount = el('div', { class: 'trade-amount' });
    const go = el('button', { class: 'btn primary big' });
    const update = () => {
      n = Math.max(0, Math.min(max, n));
      slider.value = n;
      const pct = max ? Math.round((n / max) * 100) : 0;
      slider.style.setProperty('--pct', pct + '%');
      amount.innerHTML = '';
      amount.append(el('b', {}, tradeCost(rate, n)), icon(give), ' → ', el('b', {}, n), icon(get), el('span', { class: 'muted' }, ` (${pct} %)`));
      go.innerHTML = '';
      go.append(n ? `Tauschen: ${tradeCost(rate, n)} ` : 'Menge wählen', ...(n ? [icon(give), ` → ${n} `, icon(get)] : []));
      go.disabled = n === 0;
    };
    slider.addEventListener('input', () => { n = +slider.value; update(); });
    go.addEventListener('click', () => {
      if (!n) return;
      applyAction(S, { type: 'trade', give, get, count: n });
      undoStack = [];
      refresh();
      toast(`Getauscht: ${tradeCost(rate, n)} ${RES_INFO[give].name} → ${n} ${RES_INFO[get].name}`);
      n = 1;
      draw();
    });
    const quick = el('div', { class: 'trade-quick' },
      ...[[25, '25 %'], [50, '50 %'], [100, 'Alles']].map(([q, l]) => el('button', { class: 'btn small', onclick: () => { n = Math.max(max ? 1 : 0, Math.floor((max * q) / 100)); update(); } }, l)));

    openClosable(
      el('h2', {}, 'Handel'),
      el('p', {}, rate === TRADE_RATE ? 'Kurs 3 : 1 · mit der Handelsgilde 2 : 1' : 'Kurs 2 : 1 (Handelsgilde)'),
      row('Gib', give, (k) => { give = k; if (get === k) get = null; }),
      row('Erhalte', get, (k) => { get = k; if (give === k) give = null; }),
      amount,
      el('div', { class: 'trade-slider' }, repeatButton('−', (st) => { n -= st; update(); }), slider, repeatButton('+', (st) => { n += st; update(); })),
      quick,
      go,
      el('button', { class: 'btn big', onclick: closeModal }, 'Schließen'),
    );
    update();
  };
  draw();
}

function undo() {
  if (busy || !undoStack.length || !humanTurn()) return;
  S = undoStack.pop();
  R.setState(S, false);
  clearSel();
  refresh();
}

function nextUnit() {
  if (busy || !humanTurn()) return;
  const occ = buildOcc(S);
  const ready = S.units.filter((u) => u.owner === S.current && !u.sentry && (canMove(u) || unitTargets(u, occ).length > 0 || unitHeals(u).length > 0));
  if (!ready.length) { toast('Alle Einheiten haben gehandelt.'); return; }
  ready.sort((a, b) => a.idx - b.idx);
  const cur = ready.findIndex((u) => u.id === sel.unitId);
  const u = ready[(cur + 1) % ready.length];
  clearSel();
  sel.unitId = u.id;
  R.ensureVisible(u.idx);
  refresh();
}

async function onEndTurn() {
  if (busy || !humanTurn()) return;
  if (settings.confirmEnd && playerHasActions(S, S.current)) {
    const ok = await confirmDialog('Zug beenden?', 'Einige Einheiten können noch handeln.', 'Beenden', 'Zur nächsten Einheit');
    if (!ok) { nextUnit(); return; }
  }
  undoStack = [];
  clearSel();
  busy = true;
  turnCam = { ...R.cam }; // nach den Gegnerzügen geht die Karte wieder hierher zurück
  const ev = applyAction(S, { type: 'end', volley: settings.towerAuto !== false });
  refresh();
  let volley = false;
  for (const e of ev) {
    if (e.auto && !volley) { volley = true; showBanner('🏰 Deine Türme feuern', PLAYER_COLORS[humanId()].main); }
    if (volley && !e.auto) { volley = false; hideBanner(); }
    const pr = aiEventView(e, e.auto ? Math.max(speedFactor(), 0.8) : speedFactor());
    await playEvent(e, pr.f, true, pr.pan);
    if (e.auto && e.k === 'attack') await sleep(250);
  }
  if (volley) hideBanner();
  busy = false;
  if (S.over) return gameOver();
  if (!S.players[S.current].human) await runAI();
  else { saveGame(); refresh(); }
}

function speedFactor() {
  return settings.speed;
}

async function runAI() {
  busy = true;
  refresh();
  let guard = 0;
  while (S && !S.over && !S.players[S.current].human && guard++ < 3000) {
    const p = S.players[S.current];
    showBanner(`${p.name} ist am Zug …`, PLAYER_COLORS[p.id].main);
    const f = speedFactor();
    let a = planAction(S);
    let ev = applyAction(S, a);
    if (!ev) {
      console.warn('Ungültige KI-Aktion', a);
      a = { type: 'end' };
      ev = applyAction(S, a);
    }
    if (a.type !== 'end') updateHud();
    let shown = false;
    for (const e of ev) {
      const pr = aiEventView(e, f);
      if (pr.f > 0) shown = true;
      await playEvent(e, pr.f, true, pr.pan);
    }
    if (!shown && guard % 12 === 0) await sleep(0);
  }
  hideBanner();
  busy = false;
  if (!S) return;
  if (S.over) return gameOver();
  saveGame();
  refresh();
  // Zurück an die Stelle, an der du deinen Zug beendet hast
  if (turnCam) { Object.assign(R.cam, turnCam); R.clampCam(); R.dirty = true; }
  else { const u = S.units.find((x) => x.owner === S.current); if (u) R.ensureVisible(u.idx); }
}
let turnCam = null;

// ---------------------------------------------------------------- Ereignisse abspielen
async function play(events, f, isAI) {
  for (const ev of events) await playEvent(ev, f, isAI, true);
}

// KI-Aktionen nur animieren, wenn man sie sieht; wichtige (gegen dich) mit Kameraschwenk
function aiEventView(ev, f) {
  const hid = humanId();
  const vis = S.fog ? visibility(S, hid) : null;
  const idx = ev.k === 'move' ? ev.path[ev.path.length - 1] : ev.k === 'attack' ? ev.def.idx : ev.idx;
  if (idx == null) return { f, pan: false };
  const important = (ev.k === 'attack' && (ev.def.owner === hid || ev.att.owner === hid)) || (ev.k === 'capture' && ev.from === hid);
  const seen = !vis || vis[idx] || (ev.k === 'move' && ev.path.some((j) => vis[j]));
  if (important && seen) return { f, pan: true };
  if (seen && R.isOnScreen(idx)) return { f, pan: false };
  return { f: 0, pan: false };
}

// Kampfeffekte: Hiebe, Funken, Geschosse, Feuer, Staub (Einstellung „Kampfeffekte“)
function attackFx(ev, L, hit, ranged, f) {
  const { att, def } = ev;
  const t = att.type;
  const flight = L * 0.35, start = hit - flight;
  if (t === 'dragon') {
    R.flames(att.idx, def.idx, L * 1.1, L * 0.2, UNITS.dragon.line.length);
    R.quake(5, 300 * f, hit);
  } else if (ranged || t === 'tower') {
    const fire = hasPerk(att, 'fire') || att.skills?.includes('firearrow');
    const kind = t === 'catapult' || t === 'trebuchet' ? 'stone' : t === 'basilisk' ? 'gaze' : t === 'mage' ? 'bolt' : fire ? 'fire' : 'arrow';
    R.projectile(att.idx, def.idx, kind === 'stone' ? flight * 1.3 : flight, kind === 'stone' ? start - flight * 0.3 : start, kind);
    if (kind === 'stone') { R.explosion(def.idx, hit, t === 'trebuchet' ? 1.2 : 1); R.quake(4, 260 * f, hit); }
    else if (kind === 'fire') R.sparks(def.idx, hit, { n: 12, colors: ['#fde047', '#fb923c', '#ef4444'] });
    else if (kind === 'gaze' || kind === 'bolt') R.sparks(def.idx, hit, { n: 12, colors: kind === 'gaze' ? ['#d9f99d', '#a3e635'] : ['#f5d0fe', '#c084fc'] });
    else R.sparks(def.idx, hit, { n: 6, colors: ['#e7e5e4', '#a8a29e'], speed: 0.6 });
  } else {
    const big = t === 'troll' || t === 'griffin';
    R.slash(def.idx, att.idx, hit - 40 * f, t === 'mage' ? '#e9d5ff' : '#fff7d6', big);
    R.sparks(def.idx, hit, { n: big ? 18 : 12 });
    if (t === 'troll') { R.dust(def.idx, hit, { size: 1.2 }); R.quake(5, 260 * f, hit); }
  }
  if (ev.counter > 0 && !ranged) R.sparks(att.idx, hit + 200 * f, { n: 8 });
  if (ev.killed) R.dust(def.idx, hit + 250 * f, { n: 8 });
  if (ev.died) R.dust(att.idx, L + 250 * f, { n: 8 });
  for (const h of ev.splash || []) {
    if (t === 'dragon') R.sparks(h.idx, hit + 60 * f, { n: 8, colors: ['#fde047', '#fb923c'] });
    else R.dust(h.idx, hit + 60 * f, { n: 5, size: 0.8 });
  }
}

// ---------------------------------------------------------------- Klänge
const MOVE_SOUND = { rider: 'hooves', knight: 'hooves', catapult: 'wheels', trebuchet: 'wheels', troll: 'stomp', mage: 'glide', dragon: 'wings', basilisk: 'steps' };

// Stereo-Position eines Feldes: links/rechts am Bildschirm
function panOf(idx) {
  const c = R.center(idx);
  const p = R.worldToScreen(c.x, c.y);
  return Math.max(-0.8, Math.min(0.8, (p.x / R.w) * 2 - 1));
}

function attackSounds(ev, hitSec, ranged, vol) {
  const { att, def } = ev;
  const pa = panOf(att.idx), pd = panOf(def.idx);
  if (att.type === 'catapult' || att.type === 'trebuchet') sound.play('catapult', { pan: pa, vol });
  else if (ranged) sound.play('bow', { pan: pa, vol });
  else if (att.type === 'troll' && Math.random() < 0.6) sound.play('roar', { pan: pa, vol });
  else if (att.type === 'dragon') sound.play('breath', { pan: pa, vol });
  const hitSound = att.type === 'catapult' || att.type === 'trebuchet' ? 'boom' : ranged ? 'thunk' : att.type === 'troll' ? 'smash' : att.type === 'mage' || att.type === 'dragon' ? 'hit' : 'clash';
  sound.play(hitSound, { pan: pd, vol, delay: hitSec });
  if (ev.counter > 0 && !ranged) sound.play('clash', { pan: pa, vol: vol * 0.6, delay: hitSec + 0.2 });
  if (ev.killed || ev.splash?.some((h) => h.killed)) sound.play('fall', { pan: pd, vol, delay: hitSec + 0.15 });
  if (ev.died) sound.play('fall', { pan: pa, vol, delay: hitSec + 0.3 });
}

// Umgebungsgeräusche: Anteile von Wasser, Wald, Bergen und Städten im sichtbaren Ausschnitt
function updateAmbience() {
  const st = R.state;
  if (!st || !sound.ctx) return;
  const cnt = { water: 0, forest: 0, rock: 0, plain: 0, city: 0, n: 0 };
  const top = R.viewPad?.top || 0, bottom = R.viewPad?.bottom || 0;
  for (let gx = 0; gx < 8; gx++) {
    for (let gy = 0; gy < 8; gy++) {
      const i = R.pick(((gx + 0.5) / 8) * R.w, top + ((gy + 0.5) / 8) * (R.h - top - bottom));
      if (i < 0) continue;
      cnt.n++;
      const t = st.terrain[i];
      if (st.cityAt[i] >= 0) cnt.city += 1 + st.cities[st.cityAt[i]].level * 0.5;
      else if (t === 'water') cnt.water++;
      else if (t === 'forest') cnt.forest++;
      else if (t === 'hill' || t === 'mountain') cnt.rock++;
      else cnt.plain++;
    }
  }
  const n = Math.max(1, cnt.n), w = cnt.water / n;
  const ocean = Math.min(1, Math.max(0, (w - 0.12) / 0.3));
  // Kleine Seen zwischen Land plätschern wie ein Bach
  const brook = w > 0.01 ? Math.min(1, w * 5) * (1 - ocean) : 0;
  const zoomOut = Math.max(0, Math.min(1, (0.7 - R.cam.z) / 0.5));
  sound.setAmbience({
    ocean: Math.max(ocean, w > 0.05 ? 0.25 : 0),
    brook,
    wind: Math.min(1, (cnt.rock / n) * 2.2 + zoomOut * 0.5),
    forest: Math.min(1, (cnt.forest / n) * 2 + (cnt.plain / n) * 0.4),
    city: Math.min(1, (cnt.city / n) * 4) * (1 - zoomOut * 0.6),
  });
}
setInterval(updateAmbience, 900);

// Größe des Bedienfelds unten: automatisch nach Gerät oder fest eingestellt
function detectPanelSize() {
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  const short = Math.min(window.innerWidth, window.innerHeight);
  if (touch && short < 600) return 'small'; // Handy
  if (touch) return 'medium'; // Tablet
  return 'large'; // PC
}
function applyPanelSize() {
  const v = settings.panelSize && settings.panelSize !== 'auto' ? settings.panelSize : detectPanelSize();
  document.body.classList.remove('panel-small', 'panel-medium', 'panel-large');
  document.body.classList.add('panel-' + v);
}
applyPanelSize();
window.addEventListener('resize', applyPanelSize);

function applySoundSettings() {
  sound.setOptions({ sfx: settings.sound, ambience: settings.ambience });
}
// Audio darf erst nach einer Berührung starten
const unlockAudio = () => { sound.unlock(); applySoundSettings(); updateAmbience(); };
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

async function playEvent(ev, f, isAI, pan = true) {
  if (isAI && !pan) isAI = 'quiet';
  const pause = (ms) => (ms * f > 0 ? sleep(ms * f) : Promise.resolve());
  switch (ev.k) {
    case 'move': {
      if (isAI === true && f > 0) await sleep(R.ensureVisible(ev.path[ev.path.length - 1], 220 * f));
      const stepMs = (isAI ? 140 : 110) * f;
      const mu = unitById(S, ev.id);
      if (mu && f > 0) sound.play(MOVE_SOUND[mu.type] || 'steps', { steps: ev.path.length - 1, stepMs, pan: panOf(ev.path[0]), vol: isAI === 'quiet' ? 0.5 : 1 });
      const d = R.animateMove(ev.id, ev.path, stepMs);
      await sleep(d);
      await pause(isAI ? 60 : 0);
      break;
    }
    case 'attack': {
      const { att, def } = ev;
      const ranged = statsOf(S, att).range > 1;
      if (isAI === true && f > 0) await sleep(R.ensureVisible(def.idx, 220 * f));
      const L = 380 * f;
      if (L > 0) {
        const hit = L * 0.5;
        attackSounds(ev, hit / 1000, ranged, isAI === 'quiet' ? 0.6 : 1);
        const fall = R.center(def.idx).x >= R.center(att.idx).x ? 1 : -1;
        if (ev.died) R.ghost({ ...att }, L + 450 * f, (L + 120 * f) / (L + 450 * f), def.idx, -fall);
        else if (R.fx && !ranged && att.type !== 'tower') R.strike(att.id, att.idx, def.idx, L, ev.advance != null);
        else R.lunge(att.id, att.idx, def.idx, L, ranged, ev.advance != null, R.fx);
        if (R.fx) attackFx(ev, L, hit, ranged, f);
        if (ev.killed) R.ghost({ ...def, hp: 0 }, hit + 420 * f, hit / (hit + 420 * f), null, fall);
        else R.shake(def.id, def.idx, 300 * f, hit);
        R.floatText(def.idx, `−${ev.dmg}`, '#fecaca', 900 * f, hit);
        if (ev.stone) {
          R.floatText(def.idx, 'versteinert!', '#d6d3d1', 1200 * f, hit + 350 * f);
          sound.play('petrify', { pan: panOf(def.idx), vol: isAI === 'quiet' ? 0.6 : 1, delay: hit / 1000 + 0.1 });
        }
        if (ev.counter > 0) R.floatText(att.idx, `−${ev.counter}`, '#fecaca', 900 * f, hit + 200 * f);
        for (const h of ev.splash || []) {
          if (h.killed) R.ghost({ ...h.snap, hp: 0 }, hit + 420 * f, hit / (hit + 420 * f));
          else R.shake(h.id, h.idx, 300 * f, hit);
          R.floatText(h.idx, `−${h.dmg}`, '#fdba74', 900 * f, hit + 80 * f);
        }
        await sleep(hit);
        vibrate(ev.killed ? 40 : 15);
        await sleep(L - hit);
        if (ev.advance != null) await sleep(R.animateMove(att.id, [att.idx, ev.advance], 160 * f));
        await pause(isAI ? 140 : 60);
      }
      break;
    }
    case 'recruit':
      if (isAI === true && f > 0) await sleep(R.ensureVisible(ev.idx, 200 * f));
      if (f > 0) sound.play('drum', { pan: panOf(ev.idx), vol: isAI ? 0.5 : 0.8 });
      await sleep(R.pop(ev.id, 320 * f));
      await pause(isAI ? 60 : 0);
      break;
    case 'build':
      R.invalidate(true, ev.idx);
      R.ring(ev.idx, '#7dd3fc', 600 * f);
      if (f > 0) sound.play('hammer', { pan: panOf(ev.idx), vol: isAI ? 0.5 : 1 });
      R.floatText(ev.idx, BUILDINGS[ev.building].name, '#bae6fd', 1100 * f);
      await pause(isAI ? 250 : 120);
      break;
    case 'upgrade':
      if (!ev.tower) R.invalidate(true, ev.idx);
      R.ring(ev.idx, '#fde047', 600 * f);
      if (f > 0) sound.play(ev.tower ? 'hammer' : 'fanfare', { pan: panOf(ev.idx), vol: isAI ? 0.5 : 1 });
      R.floatText(ev.idx, ev.tower ? `Turm Stufe ${ev.level}` : CITY_NAMES[ev.level], '#fde047', 1000 * f);
      await pause(isAI ? 300 : 150);
      break;
    case 'unitUp':
      if (S.players[ev.pid].human) {
        sound.play('fanfare', { vol: 0.7 });
        toast(`⬆ ${UNITS[ev.unit].name}: ${UP_INDEX[ev.id].name}`);
        R.sprites = new Map(); // neues Aussehen
      }
      break;
    case 'research':
      if (S.players[ev.pid].human) sound.play('chime');
      if (S.players[ev.pid].human) toast(`Erforscht: ${TECHS[ev.tech].icon} ${TECHS[ev.tech].name}`);
      break;
    case 'capture': {
      R.invalidate(true, ev.idx);
      if (f > 0) {
        if (isAI === true) await sleep(R.ensureVisible(ev.idx, 220 * f));
        R.ring(ev.idx, PLAYER_COLORS[ev.pid].main, 700 * f);
        sound.play('horn', { pan: panOf(ev.idx), vol: S.players[ev.pid].human || (ev.from >= 0 && S.players[ev.from].human) ? 1 : 0.5 });
        R.floatText(ev.idx, 'Erobert!', PLAYER_COLORS[ev.pid].light, 1100 * f);
      }
      const c = cityOn(S, ev.idx);
      if (S.players[ev.pid].human) vibrate(50);
      if (ev.from >= 0 && S.players[ev.from].human) toast(`${S.players[ev.pid].name} hat ${c?.capital ? 'deine Hauptstadt' : 'eine deiner Städte'} erobert!`);
      await pause(450);
      break;
    }
    case 'heal':
      if (ev.by != null && f > 0) {
        if (isAI === true) await sleep(R.ensureVisible(ev.idx, 200 * f));
        R.ring(ev.idx, '#86efac', 500 * f);
        if (R.fx && ev.from != null) { R.projectile(ev.from, ev.idx, 200 * f, 0, 'heal'); R.glitter(ev.idx, 180 * f); }
        sound.play('heal', { pan: panOf(ev.idx), vol: isAI === 'quiet' ? 0.5 : 1 });
      }
      R.floatText(ev.idx, `+${ev.amount}`, '#86efac', 800 * Math.max(f, 0.6));
      if (ev.by != null) await pause(isAI ? 260 : 160);
      break;
    case 'rank':
      if (f > 0) R.ring(ev.idx, '#fde047', 600 * f);
      if (f > 0) sound.play('sparkle', { pan: panOf(ev.idx), vol: isAI ? 0.5 : 1, delay: 0.25 * f });
      R.floatText(ev.idx, `★ ${RANK_NAMES[ev.rank]}`, '#fde047', 1200 * Math.max(f, 0.6), 250 * f);
      if (unitById(S, ev.id)?.owner === humanId() && PERK_RANKS.includes(ev.rank)) toast(`★ ${UNITS[unitById(S, ev.id).type].name} ist jetzt ${RANK_NAMES[ev.rank]} – wähle eine Fähigkeit!`);
      await pause(isAI ? 200 : 100);
      break;
    case 'perk':
      sound.play('chime', { pan: panOf(ev.idx), vol: isAI ? 0.4 : 1 });
      R.floatText(ev.idx, `${PERKS[ev.perk].icon} ${PERKS[ev.perk].name}`, '#fde68a', 1100 * Math.max(f, 0.6));
      break;
    case 'wake':
      break;
    case 'demolish':
      R.invalidate(true, ev.idx);
      if (ev.snap) R.ghost({ ...ev.snap }, 500 * Math.max(f, 0.6), 0);
      R.floatText(ev.idx, `${ev.building ? BUILDINGS[ev.building].name : UNITS[ev.unit].name} ${ev.disband ? 'entlassen' : 'abgerissen'}`, '#fca5a5', 1000 * Math.max(f, 0.6));
      if (f > 0) sound.play('fall', { pan: panOf(ev.idx), vol: isAI ? 0.4 : 0.8 });
      break;
    case 'stone':
      if (unitById(S, ev.id)?.owner === humanId()) R.floatText(ev.idx, ev.ice ? '❄️ vereist, setzt aus' : '🪨 setzt aus', ev.ice ? '#bae6fd' : '#d6d3d1', 900);
      break;
    case 'plant':
      R.invalidate(true, ev.idx);
      if (f > 0) { R.ring(ev.idx, '#86efac', 500 * f); sound.play('hammer', { pan: panOf(ev.idx), vol: isAI ? 0.3 : 0.7 }); }
      R.floatText(ev.idx, ev.to === 'pit' ? '⛏️ Grube wird gegraben' : ev.to === 'vine' ? '🍇 Traubenhain wird angelegt' : '🌱 Schonung', '#bbf7d0', 900 * Math.max(f, 0.6));
      break;
    case 'clear':
      R.invalidate(true, ev.idx);
      if (f > 0) { R.dust(ev.idx, 0, { n: 6 }); sound.play('hammer', { pan: panOf(ev.idx), vol: isAI ? 0.3 : 0.8 }); }
      R.floatText(ev.idx, `🪓 +${ev.wood} Holz`, '#fde68a', 1000 * Math.max(f, 0.6));
      break;
    case 'grown':
      R.invalidate(true, ev.idx);
      if (S.players[ev.pid].human) R.floatText(ev.idx, ev.to === 'pit' ? '⛏️ Erzgrube fertig' : ev.to === 'vine' ? '🍇 Traubenhain fertig' : '🌲 Wald gewachsen', '#bbf7d0', 1100);
      break;
    case 'storm': {
      if (f > 0) await sleep(R.ensureVisible(ev.line[1] >= 0 ? ev.line[1] : ev.from, 220 * f));
      const ms = 2400 * f;
      if (ms > 0) {
        sound.play('wings', { pan: panOf(ev.from), vol: isAI === 'quiet' ? 0.5 : 1 });
        sound.play('roar', { pan: panOf(ev.from), vol: isAI === 'quiet' ? 0.5 : 1, delay: 0.2 });
        const { times } = R.dragonStorm(ev.id, ev.from, ev.line, ev.area, ms);
        for (const j of ev.area) sound.play('breath', { pan: panOf(j), vol: 0.35, delay: times.get(j) / 1000 });
        for (const h of ev.hits) {
          const t = times.get(h.idx) ?? ms * 0.4;
          R.floatText(h.idx, `−${h.dmg}`, '#fdba74', 1000 * f, t + 80 * f);
          if (h.killed) R.ghost({ ...h.snap, hp: 0 }, t + 600 * f, t / (t + 600 * f));
          else R.shake(h.id, h.idx, 300 * f, t);
        }
        R.floatText(ev.from, '🔥 Feuersturm!', '#fdba74', 1300 * f);
        vibrate(60);
        await sleep(ms);
      }
      if (ev.hits.length) toast(`🔥 Feuersturm: ${ev.hits.length} getroffen, ${ev.hits.filter((h) => h.killed).length} besiegt.`);
      await pause(isAI ? 200 : 80);
      break;
    }
    case 'burn':
      if (f > 0) { R.fireBurst(ev.idx, 0); sound.play('breath', { pan: panOf(ev.idx), vol: 0.4 }); }
      R.floatText(ev.idx, `🔥 −${ev.dmg}`, '#fdba74', 900 * Math.max(f, 0.6));
      if (ev.killed) R.ghost({ ...ev.snap, hp: 0 }, 700 * Math.max(f, 0.4), 0.3);
      await pause(isAI ? 200 : 120);
      break;
    case 'freeze':
      if (f > 0) { R.ring(ev.from, '#7dd3fc', 400 * f); R.ring(ev.idx, '#bae6fd', 700 * f); }
      if (f > 0 && R.fx) { R.projectile(ev.from, ev.idx, 220 * f, 0, 'ice'); R.glitter(ev.idx, 200 * f, '#bae6fd', 14); }
      sound.play('sparkle', { pan: panOf(ev.idx), vol: isAI ? 0.5 : 1 });
      R.floatText(ev.idx, '❄️ vereist', '#bae6fd', 1100 * Math.max(f, 0.6));
      await pause(isAI ? 260 : 160);
      break;
    case 'bomb':
      R.invalidate(true, ev.idx);
      if (f > 0) { R.ring(ev.from, '#fdba74', 400 * f); R.ring(ev.idx, '#f97316', 800 * f); }
      if (f > 0 && R.fx) { R.projectile(ev.from, ev.idx, 240 * f, 0, 'blast'); R.explosion(ev.idx, 240 * f, 1.5); R.quake(7, 350 * f, 240 * f); }
      sound.play('boom', { pan: panOf(ev.idx), vol: isAI ? 0.5 : 1 });
      R.floatText(ev.idx, '💣 Berg gesprengt', '#fdba74', 1200 * Math.max(f, 0.6));
      await pause(isAI ? 300 : 180);
      break;
    case 'boost':
      if (f > 0) R.ring(ev.idx, '#fde047', 500 * f);
      sound.play('chime', { pan: panOf(ev.idx), vol: isAI ? 0.3 : 1 });
      R.floatText(ev.idx, `${BOOST_STATS.find((b) => b[0] === ev.stat)[2]} ${boostText(ev.stat, ev.level)}`, '#fde68a', 1000 * Math.max(f, 0.6));
      break;
    case 'skill':
      if (f > 0) R.ring(ev.idx, '#fde047', 500 * f);
      sound.play('chime', { pan: panOf(ev.idx), vol: isAI ? 0.3 : 1 });
      R.floatText(ev.idx, `${SKILLS[ev.skill].icon} ${SKILLS[ev.skill].name}`, '#fde68a', 1100 * Math.max(f, 0.6));
      break;
    case 'defect':
      if (f > 0) R.ring(ev.idx, PLAYER_COLORS[ev.pid].main, 600 * f);
      break;
    case 'eliminated':
      toast(`${S.players[ev.pid].name} wurde besiegt!`);
      sound.play('lowhorn');
      await pause(600);
      break;
    case 'turn':
      if (S.players[ev.pid].human) { hideBanner(); sound.play('turnstart'); }
      break;
    case 'income': {
      updateHud();
      break;
    }
  }
}

// ---------------------------------------------------------------- HUD & Panel
const ICONS = {
  food: '<svg viewBox="0 0 16 16"><path d="M8 15.5V4" stroke="#a16207" stroke-width="1.4" fill="none"/><ellipse cx="8" cy="3.6" rx="1.7" ry="2.8" fill="#fcd34d"/><ellipse cx="5.4" cy="7.4" rx="1.4" ry="2.6" transform="rotate(-32 5.4 7.4)" fill="#facc15"/><ellipse cx="10.6" cy="7.4" rx="1.4" ry="2.6" transform="rotate(32 10.6 7.4)" fill="#facc15"/><ellipse cx="5.6" cy="11.2" rx="1.3" ry="2.4" transform="rotate(-32 5.6 11.2)" fill="#eab308"/><ellipse cx="10.4" cy="11.2" rx="1.3" ry="2.4" transform="rotate(32 10.4 11.2)" fill="#eab308"/></svg>',
  wood: '<svg viewBox="0 0 16 16"><rect x="0.8" y="4.5" width="12.5" height="7.5" rx="3.7" fill="#9a5b2a"/><path d="M2.5 7h7M3.5 9.6h6" stroke="#6b3a15" stroke-width="0.9"/><ellipse cx="12.4" cy="8.25" rx="2.8" ry="3.7" fill="#e8b47c" stroke="#7a451c" stroke-width="0.9"/><ellipse cx="12.4" cy="8.25" rx="1.2" ry="1.7" fill="none" stroke="#b9773d" stroke-width="0.7"/></svg>',
  ore: '<svg viewBox="0 0 16 16"><path d="M1.5 13 3.8 6.2 8 2.8 12.8 5.6 14.6 13Z" fill="#9aa1ab"/><path d="M8 2.8 12.8 5.6 14.6 13H8.8Z" fill="#6b727c"/><path d="M5 9.5 6.4 8 7.6 9.4 6.2 10.9Z" fill="#7dd3fc"/><path d="M10 7.5 11 6.6 11.8 7.8 10.8 8.6Z" fill="#7dd3fc"/></svg>',
  mana: '<svg viewBox="0 0 16 16"><path d="M8 1.2c.4 1.4 1.6 1.8 2.6 1.6" stroke="#4d7c0f" stroke-width="1.1" fill="none" stroke-linecap="round"/><circle cx="6" cy="5.6" r="2.1" fill="#a855f7"/><circle cx="10" cy="5.6" r="2.1" fill="#9333ea"/><circle cx="8" cy="8.6" r="2.2" fill="#a855f7"/><circle cx="5.4" cy="9.6" r="1.9" fill="#7e22ce"/><circle cx="10.6" cy="9.6" r="1.9" fill="#9333ea"/><circle cx="8" cy="12.6" r="2" fill="#7e22ce"/><circle cx="5.4" cy="5" r=".7" fill="#f5d0fe"/><circle cx="7.4" cy="8" r=".7" fill="#f5d0fe"/><circle cx="12.6" cy="3.2" r=".8" fill="#fde68a"/></svg>',
  atk: '<svg viewBox="0 0 16 16"><path d="M3 13 12.5 3.5" stroke="#e5e7eb" stroke-width="2.2" stroke-linecap="round"/><path d="M2 9.5 6.5 14" stroke="#d4a017" stroke-width="2" stroke-linecap="round"/></svg>',
  def: '<svg viewBox="0 0 16 16"><path d="M8 1.5 13.5 3.5V8c0 3.2-2.4 5.4-5.5 6.5C4.9 13.4 2.5 11.2 2.5 8V3.5Z" fill="#93c5fd" stroke="#1e3a8a" stroke-width="1"/></svg>',
  move: '<svg viewBox="0 0 16 16"><path d="M3 9h7l-2.5-3M10 9l-2.5 3" stroke="#e5e7eb" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 4v10" stroke="#e5e7eb" stroke-width="1.8" stroke-linecap="round"/></svg>',
  range: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="#fca5a5" stroke-width="1.5"/><circle cx="8" cy="8" r="2.6" fill="none" stroke="#fca5a5" stroke-width="1.5"/><circle cx="8" cy="8" r="0.9" fill="#fca5a5"/></svg>',
};
const icon = (k) => el('i', { class: 'ico', html: ICONS[k] });
// Dieselben Symbole als Bilder für die Ertragsanzeige über den Städten auf der Karte
R.resIcons = Object.fromEntries(RES.map((k) => {
  const img = new Image();
  img.onload = () => R.invalidate?.();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ICONS[k].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" '));
  return [k, img];
}));

function costEl(cost, have) {
  const box = el('span', { class: 'cost' });
  for (const k of RES) {
    if (!cost[k]) continue;
    box.append(el('span', { class: have && (have[k] || 0) < cost[k] ? 'short' : '' }, icon(k), cost[k]));
  }
  return box;
}

function updateHud() {
  if (!S) return;
  const human = S.players.find((p) => p.human) || S.players[0];
  const cur = S.players[S.current];
  $('turnDot').style.background = PLAYER_COLORS[cur.id].main;
  $('turnText').textContent = `Runde ${S.turn} · ${cur.human ? 'Dein Zug' : cur.name}`;
  // Ertrag jeder Stadt für die Anzeige über den Städten
  const terrY = computeTerritory(S);
  R.cityYields = S.cities.map((c, ci) => (c.owner >= 0 ? cityYield(S, ci, terrY) : null));
  R.showYields = settings.cityYields !== false;
  // Grün: Ertrag des ganzen Reichs (alle Städte inkl. Ausbau und Forschung); rot umrandet, wenn der Unterhalt mehr frisst
  const gross = realmYield(S, human.id), upk = upkeepTotal(S, human.id);
  const bar = $('resBar');
  bar.innerHTML = '';
  for (const k of RES) {
    const up = upk[k], net = gross[k] - up;
    const mana = k === 'mana';
    const info = `${RES_INFO[k].name}: Reich +${gross[k]} pro Runde (alle Städte inkl. Ausbau und Forschung), Unterhalt −${up}, bleibt ${net >= 0 ? '+' : ''}${net}`;
    bar.append(el('button', {
      class: 'pill' + (mana ? ' mana' : '') + (net < 0 ? ' short' : ''),
      title: mana ? `${info} – für Zauberer, Zauber, Feuersturm und magische Forschung, nicht handelbar` : `${info} – tippen zum Handeln`,
      onclick: () => (mana ? toast(`🍇 ${info}. Mana kommt aus Traubenhainen (Wiese bearbeiten) mit Kelterei und vom Turm der Weisen. Es lässt sich nicht handeln.`, 5000) : openTrade(k)),
    }, icon(k), el('b', {}, human.res[k] || 0), el('small', {}, `+${gross[k]}`)));
  }
  // Testmodus: Vorrat und Reichsertrag der Gegner, dazu Armee und Städte (Stufen)
  const eb = $('enemyBar');
  eb.innerHTML = '';
  const showEnemy = settings.enemyRes !== false;
  eb.classList.toggle('hidden', !showEnemy);
  if (showEnemy) {
    for (const p of S.players.filter((x) => x.id !== human.id && x.alive)) {
      const y = realmYield(S, p.id), net = incomeOf(S, p.id);
      const cs = S.cities.filter((c) => c.owner === p.id);
      eb.append(el('div', { class: 'enemy-row', title: `${p.name}: Vorrat und Ertrag pro Runde (rot: Unterhalt frisst mehr)` },
        el('span', { class: 'dot', style: `background:${PLAYER_COLORS[p.id].main}` }),
        el('b', {}, DIFFICULTIES[(p.ai || 3) - 1]?.name || p.name),
        ...RES.map((k) => el('span', { class: 'er' + (net[k] < 0 ? ' short' : '') }, icon(k), `${p.res[k] || 0}`, el('small', {}, `+${y[k]}`))),
        el('span', { class: 'er' }, `⚔ ${unitCount(S, p.id)}`),
        el('span', { class: 'er' }, `🏰 ${cs.length} (${[1, 2, 3].map((l) => cs.filter((c) => c.level === l).length).join('/')})`),
        el('span', { class: 'er' }, `🔬 ${p.tech.length}`)));
    }
  }
  updateHudTop();
  // Armee-Unterhalt pro Runde neben der Einheitenzahl
  const up = upkeepTotal(S, human.id);
  const used = unitCount(S, human.id), sup = unitCap(S, human.id);
  $('unitText').textContent = `${used}/${sup}`;
  $('unitText').classList.toggle('over', used > sup);
  $('upkeepText').textContent = `−${up.food}`;
  $('upkeepWood').textContent = up.wood ? ` −${up.wood}🪵` : '';
  const nAvail = TECH_ORDER.filter((t) => techAvailable(S, human.id, t) && canAfford(human.res, TECHS[t].cost)).length;
  $('techText').textContent = human.tech.length;
  $('techBadge').textContent = nAvail;
  $('techBadge').classList.toggle('hidden', !nAvail || !humanTurn());
  $('btnTech').classList.toggle('glow', nAvail > 0 && humanTurn());
  const my = humanTurn();
  $('btnEnd').disabled = !my || busy;
  $('btnNext').disabled = !my || busy;
  $('btnUndo').disabled = !my || busy || undoStack.length === 0;
  $('btnTip').disabled = !my || busy;
  $('btnEnd').classList.remove('pulse'); // Zug beenden blinkt nie
}

function iconCanvas(type, owner, px = 44, level, ups = S && owner >= 0 ? unitUpList(S, owner, type) : []) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(px * dpr);
  c.style.width = c.style.height = px + 'px';
  c.className = 'fig';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  R.drawPreview(ctx, type, owner, px / 2, type === 'tower' ? px * 0.8 : px * 0.62, type === 'tower' ? px * 0.8 : px, level, ups);
  return c;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}

const fmt = (n) => String(n).replace('.', ',');

function hpBar(u) {
  const max = statsOf(S, u).hp;
  const r = u.hp / max;
  const color = r > 0.6 ? '#4ade80' : r > 0.3 ? '#facc15' : '#f87171';
  return el('div', { class: 'hp' },
    el('div', { class: 'hp-track' }, el('div', { class: 'hp-fill', style: `width:${Math.max(0, r * 100)}%;background:${color}` })),
    el('span', {}, `${u.hp}/${max}`));
}

// Tatsächliche Werte inkl. Forschung, Stufe und Spezialisierungen (Verteidigung steht in Worten in der Beschreibung)
function statRow(u) {
  const T = statsOf(S, u);
  return el('div', { class: 'stats-row' },
    el('span', { title: 'Angriff (inkl. Forschung, Stufe, Verbesserung)' }, icon('atk'), T.atk),
    T.pen ? el('span', { title: 'Durchschlag: senkt die Verteidigung des Gegners' }, '🗡', T.pen) : null,
    T.move ? el('span', { title: 'Bewegung' }, icon('move'), T.move) : null,
    el('span', { title: 'Reichweite' }, icon('range'), T.range));
}

function rankText(u) {
  const r = u.rank || 1;
  return `${'★'.repeat(r - 1)}${r > 1 ? ' ' : ''}${RANK_NAMES[r]}`;
}

function unitCard(u, subtitle) {
  const name = u.type === 'tower' ? `Turm · Stufe ${u.level}` : UNITS[u.type].structure ? UNITS[u.type].name : `${UNITS[u.type].name} · ${rankText(u)}`;
  return el('div', { class: 'unit-card' },
    iconCanvas(u.type, u.owner, 48, u.level),
    el('div', { class: 'uc-main' },
      el('div', { class: 'uc-top' }, el('span', { class: 'title' }, name), hpBar(u)),
      el('div', { class: 'uc-bottom' }, el('span', { class: 'muted' }, subtitle), statRow(u))));
}

// Vorschau für Pflug/Sägewerk/Bergbau: was die Forschung beim jetzigen Reich pro Runde bringt (bzw. bringt)
function ecoTechPreview(t, pid) {
  const k = Object.keys(ECO_TECH).find((r) => ECO_TECH[r] === t);
  if (!k) return null;
  const terr = computeTerritory(S);
  let base = 0;
  const B = { food: 'farm', wood: 'lumber', ore: 'mine' }[k];
  S.cities.forEach((c, ci) => { if (c.owner === pid && hasBuilding(c, B)) base += buildingYield(cityTiles(S, ci, terr)[k], c.level); });
  const gain = S.cities.reduce((a, c, ci) => a + (c.owner === pid && hasBuilding(c, B) ? Math.ceil(buildingYield(cityTiles(S, ci, terr)[k], c.level) * ECO_TECH_PCT) : 0), 0);
  return el('span', { class: 'muted' }, `${hasTech(S, pid, t) ? 'Bringt dir' : 'Würde dir bringen'}: +${gain} ${RES_INFO[k].name} pro Runde (Reich ohne Forschung +${base})`);
}

function cityTitle(c) {
  return `${c.capital ? 'Hauptstadt' : CITY_NAMES[c.level]} · Stufe ${c.level}`;
}

function tileInfo(i) {
  const c = cityOn(S, i);
  if (c) return `${cityTitle(c)} · Verteidigung +${terrainDefense(S, i)} %`;
  if (S.grapes?.includes(i)) return '🍇 Traubenhain (Mana mit Kelterei)';
  if (S.pits?.includes(i)) return '⛏️ Erzgrube (Erz mit Mine)';
  const pl = S.plants?.find((x) => x.idx === i);
  if (pl) return `${TERRAIN[S.terrain[i]].name} · wird ${PLANT_KINDS[pl.to || 'forest'].what} (Runde ${pl.done})`;
  return TERRAIN[S.terrain[i]].name;
}

let cityTab = 'units';
let buildGroup = null; // Handy: gewählte Gebäudegruppe ('eco' oder 'mil')
const RECRUIT_BLOCK = {
  needs: (T) => `braucht ${BUILDINGS[T.needs].name}`,
  tech: (T) => `braucht ${TECHS[T.tech].name}`,
  cap: () => 'Versorgung voll',
  limit: () => 'höchstens einer pro Stadt',
  unique: (T) => T.perRealm > 1 ? `höchstens ${T.perRealm} pro Reich` : 'nur einer pro Reich',
  space: () => 'kein freies Feld',
  cost: () => null,
};

// Ratgeber: schlägt den sinnvollsten nächsten Schritt vor
function advice(occ) {
  const pid = S.current;
  const p = S.players[pid];
  const geo = getGeoOf();
  const mine = S.units.filter((u) => u.owner === pid);
  const canStill = mine.filter((u) => canMove(u) || unitTargets(u, occ).length);
  const territory = computeTerritory(S);
  // 2. Fernkämpfer zuerst
  const shooter = canStill.find((u) => !UNITS[u.type].structure && statsOf(S, u).range > 1 && canAttack(u) && (unitTargets(u, occ).length || canMove(u) && [...getMoves(S, u, occ).keys()].some((f) => getTargets(S, u, f, occ).length)));
  if (shooter) return { text: `Lass zuerst deinen ${UNITS[shooter.type].name} schießen: Fernkämpfer bekommen keinen Gegenschlag.`, unit: shooter.id };
  // 3. Dörfer besetzen
  const free = S.cities.filter((c) => c.owner !== pid && !occ[c.idx]);
  for (const u of canStill.filter(canMove)) {
    const moves = getMoves(S, u, occ);
    const c = free.find((c) => moves.has(c.idx));
    if (c) return { text: `Dein ${UNITS[u.type].name} kann ${c.owner < 0 ? 'ein Dorf' : 'eine feindliche Stadt'} besetzen – bleibt er stehen, gehört ${c.owner < 0 ? 'es' : 'sie'} dir samt Gebiet.`, unit: u.id };
  }
  // 4. Bauen / Ausbauen
  const inc = incomeOf(S, pid, territory);
  for (const c of S.cities.filter((c) => c.owner === pid)) {
    const ci = S.cityAt[c.idx];
    const t = cityTiles(S, ci, territory);
    const free = slotsUsed(c) < citySlots(c);
    const pick = !hasBuilding(c, 'mine') && t.ore && inc.ore <= inc.wood ? 'mine'
      : !hasBuilding(c, 'lumber') && t.wood > 1 ? 'lumber'
      : !hasBuilding(c, 'farm') && t.food ? 'farm'
      : !hasBuilding(c, 'press') && t.mana ? 'press'
      : free && !hasBuilding(c, 'barracks') && c.capital ? 'barracks' : null;
    if (pick && canAfford(p.res, BUILDINGS[pick].cost)) {
      return { text: `${BUILDINGS[pick].eco ? 'Wirtschaft' : 'Freier Bauplatz'}: Baue in deiner ${c.capital ? 'Hauptstadt' : CITY_NAMES[c.level]} ${BUILDINGS[pick].art} ${BUILDINGS[pick].name} (${BUILDINGS[pick].desc}).`, city: c.idx, tab: 'build' };
    }
  }
  const up = S.cities.find((c) => c.owner === pid && c.level < CITY_MAX_LEVEL && canAfford(p.res, upgradeCost(c)));
  if (up) return { text: `Du kannst eine Stadt zur ${CITY_NAMES[up.level + 1]} ausbauen: mehr Bauplätze und Rohstoffe.`, city: up.idx, tab: 'build' };
  // 5. Rekrutieren
  const rc = S.cities.find((c) => c.owner === pid && UNIT_ORDER.some((k) => !canRecruit(S, pid, S.cityAt[c.idx], k)));
  if (rc) return { text: 'Rekrutiere Einheiten: Mische Fernkämpfer (Schützen) und Nahkämpfer.', city: rc.idx, tab: 'units' };
  // 6. Handel
  const rate = tradeRate(S, pid);
  const low = BASE_RES.slice().sort((a, b) => p.res[a] - p.res[b])[0];
  const high = BASE_RES.slice().sort((a, b) => p.res[b] - p.res[a])[0];
  if (rate && p.res[low] < 4 && p.res[high] >= rate + 4) return { text: `Dir fehlt ${RES_INFO[low].name}. Tausche ${RES_INFO[high].name} – tippe oben auf die Rohstoffleiste.`, trade: low };
  if (canStill.length) return { text: `${canStill.length} Einheit${canStill.length > 1 ? 'en können' : ' kann'} noch handeln (leuchtender Ring).`, unit: canStill[0].id };
  return { text: 'Alles erledigt – beende deinen Zug.' };
}

function followAdvice(tip) {
  if (busy || !humanTurn()) return;
  clearSel();
  if (tip.unit != null) {
    sel.unitId = tip.unit;
    const u = unitById(S, tip.unit);
    if (u) R.ensureVisible(u.idx);
  } else if (tip.city != null) {
    sel.cityIdx = tip.city;
    cityTab = tip.tab || 'units';
    R.ensureVisible(tip.city);
  } else if (tip.trade) {
    openTrade(tip.trade);
  }
  refresh();
}

function renderCityPanel(panel, ci, occ) {
  const c = S.cities[ci];
  const p = S.players[S.current];
  const y = cityYield(S, ci);
  panel.append(el('div', { class: 'city-head' },
    el('span', { class: 'title' }, cityTitle(c)),
    el('span', { class: 'yield' }, ...RES.map((k) => el('span', {}, icon(k), `+${y[k]}`)))));
  const tabs = el('div', { class: 'ptabs' });
  for (const [k, label] of [['units', 'Einheiten'], ['build', `Gebäude · Plätze ${slotsUsed(c)}/${citySlots(c)}`]]) {
    tabs.append(el('button', { class: cityTab === k ? 'active' : '', onclick: () => { cityTab = k; buildGroup = null; renderPanel(); } }, label));
  }
  panel.append(tabs);
  if (cityTab === 'build') {
    const t = cityTiles(S, ci);
    panel.append(el('div', { class: 'note tiles-note' }, 'Felder-Wert im Stadtkreis: ', icon('food'), ` ${t.food} `, icon('wood'), ` ${t.wood} `, icon('ore'), ` ${t.ore} `, icon('mana'), ` ${t.mana}`));
  }
  if (cityTab === 'units') {
    const grid = el('div', { class: 'recruit-grid' });
    let note = null;
    for (const k of UNIT_ORDER) {
      const T = UNITS[k];
      const why = canRecruit(S, p.id, ci, k);
      const label = why && RECRUIT_BLOCK[why] ? RECRUIT_BLOCK[why](T) : null;
      if (why === 'cap' || why === 'space' || why === 'limit' || why === 'unique') note = label;
      const preview = { type: k, owner: p.id, hp: 1 };
      grid.append(el('button', {
        class: 'recruit', disabled: !!why, onclick: () => doRecruit(c.idx, k),
        onmouseenter: () => { const n = $('recruitNote'); if (n) { n.dataset.base ??= n.textContent; n.textContent = `${T.name}: ${unitStatsText(preview, true)} – ${T.desc}`; } },
        onmouseleave: () => { const n = $('recruitNote'); if (n && n.dataset.base != null) n.textContent = n.dataset.base; },
      },
        iconCanvas(k, p.id, 58),
        el('div', { class: 'name' }, T.name),
        why === 'needs' ? el('span', { class: 'lock' }, '🔒 ', BUILDINGS[T.needs].name) : why === 'tech' ? el('span', { class: 'lock' }, '🔬 ', TECHS[T.tech].name) : costEl(T.cost, p.res)));
    }
    panel.append(grid);
    const ready = hasBuilding(c, 'barracks') ? ' Dank Kaserne können sie sofort ziehen.' : '';
    panel.append(el('div', { class: 'note', id: 'recruitNote' }, note ? `Rekrutieren nicht möglich: ${note}.` : `Neue Einheiten erscheinen im Stadtgebiet.${ready}`));
  } else {
    // Gebäude in zwei Gruppen: Wirtschaft und Einheiten (breiter Bildschirm: nebeneinander, Handy: erst Gruppe wählen)
    const tiles = cityTiles(S, ci);
    // Vorschau je Wirtschaftsgebäude: Feldwert × Stufe, plus freigeschaltete Forschung
    const eco = (k, what) => {
      const n = tiles[k];
      if (!n) return `Kein ${what} im Stadtkreis – liefert nichts`;
      const base = buildingYield(n, c.level), v = boostedYield(S, p.id, k, base);
      return `+${v} ${RES_INFO[k].name} (Feldwert ${n} ${what} × Stufe ${c.level}${v > base ? `, +${v - base} ${TECHS[ECO_TECH[k]].name}` : ''})`;
    };
    const ecoDesc = { farm: eco('food', 'Wiese/See'), lumber: eco('wood', 'Wald'), mine: eco('ore', 'Hügel/Lehm/Grube/Gebirge'), press: eco('mana', 'Traubenhain') };
    const buildingRow = (list, b) => {
      const B = BUILDINGS[b];
      const built = hasBuilding(c, b);
      const realm = !built && canBuild(S, p.id, c, b) === 'realm';
      list.append(el('div', { class: 'build-row' + (built ? ' built' : realm ? ' realm' : '') },
        el('span', { class: 'bicon' }, B.icon),
        el('div', { class: 'binfo' }, el('b', {}, B.name), el('span', { class: 'muted' }, ecoDesc[b] || B.desc)),
        built ? el('span', { class: 'built-actions' }, el('span', { class: 'done' }, '✓'),
          el('button', { class: 'btn small raze', title: 'Abreißen (halbe Kosten zurück)', onclick: () => doDemolish(c.idx, b) }, '🗑'))
          : canBuild(S, p.id, c, b) === 'tech' ? el('span', { class: 'lock' }, `🔬 ${TECHS[B.tech].name}`)
          : canBuild(S, p.id, c, b) === 'level' ? el('span', { class: 'lock' }, `🔒 ab Stufe ${B.minLevel}`)
          : canBuild(S, p.id, c, b) === 'realm' ? el('span', { class: 'lock' }, '🔒 schon im Reich')
          : el('button', { class: 'btn small', disabled: !!canBuild(S, p.id, c, b), onclick: () => doBuild(c.idx, b) }, costEl(B.cost, p.res))));
    };
    const structRows = (list) => {
      for (const [type, text] of [['tower', 'Schießt auf Gegner, 3 Ausbaustufen'], ['barrier', 'Blockiert den Weg, bildet Mauern']]) {
        const nt = towersOfCity(S, ci, undefined, type), max = structureLimit(S.cities[ci], type);
        list.append(el('div', { class: 'build-row tower-row' },
          el('span', { class: 'bicon' }, iconCanvas(type, p.id, 34, 1)),
          el('div', { class: 'binfo' }, el('b', {}, `${UNITS[type].name} ${nt}/${max}`), el('span', { class: 'muted' }, text)),
          el('button', {
            class: 'btn small', disabled: nt >= max || !canAfford(p.res, UNITS[type].cost),
            onclick: () => { clearSel(); sel.placeTower = ci; sel.placeType = type; refresh(); },
          }, costEl(UNITS[type].cost, p.res))));
      }
    };
    // Felder bearbeiten: Wiese → Wald, Erzgrube oder Traubenhain; Wald → Wiese
    const terraRow = (list) => {
      const growing = (S.plants || []).filter((x) => x.ci === ci).length;
      const pick = (kind) => () => { clearSel(); sel.terraform = ci; sel.tfKind = kind; refresh(); };
      list.append(el('div', { class: 'build-row tower-row terra-row' },
        el('span', { class: 'bicon' }, '🌱'),
        el('div', { class: 'binfo' }, el('b', {}, 'Felder bearbeiten'),
          el('span', { class: 'muted' }, `Wiese → Wald ${costText(plantCost('forest'))}, Grube/Hain ${costText(PLANT_COST)}, fertig in ${PLANT_ROUNDS} Runden · Wald roden: +${CLEAR_WOOD} Holz${growing ? ` · ${growing} in Arbeit` : ''}`),
          el('span', { class: 'terra-btns' },
            ...Object.entries(PLANT_KINDS).map(([k, K]) => el('button', { class: 'btn small', disabled: !canAfford(p.res, plantCost(k)), onclick: pick(k) }, `${K.icon} ${K.what}`)),
            el('button', { class: 'btn small', onclick: pick('clear') }, '🪓 Roden')))));
    };
    const groups = {
      eco: { title: 'Wirtschaft', fill: (list) => { for (const b of ECO_BUILDINGS) buildingRow(list, b); terraRow(list); } },
      mil: { title: 'Einheiten', fill: (list) => { for (const b of BUILDING_ORDER.filter((x) => !ECO_BUILDINGS.includes(x))) buildingRow(list, b); structRows(list); } },
    };
    const groupList = (g) => { const list = el('div', { class: 'build-list' }); groups[g].fill(list); return list; };
    const wide = window.innerWidth >= 760;
    if (wide) {
      panel.append(el('div', { class: 'build-cols' }, ...['eco', 'mil'].map((g) => el('div', { class: 'build-col' }, el('div', { class: 'build-col-head' }, groups[g].title), groupList(g)))));
    } else if (!buildGroup) {
      const count = (g) => c.buildings.filter((b) => (g === 'eco') === ECO_BUILDINGS.includes(b)).length;
      panel.append(el('div', { class: 'build-groups' }, ...['eco', 'mil'].map((g) => el('button', { class: 'build-group', onclick: () => { buildGroup = g; renderPanel(); } },
        el('span', { class: 'bg-icon' }, g === 'eco' ? '🌾' : '🛡️'), el('b', {}, groups[g].title), el('span', { class: 'muted' }, `${count(g)} gebaut`)))));
    } else {
      panel.append(el('div', { class: 'build-col-head back' }, el('button', { class: 'btn small', onclick: () => { buildGroup = null; renderPanel(); } }, '‹ Zurück'), groups[buildGroup].title));
      panel.append(groupList(buildGroup));
    }
    if (c.level < CITY_MAX_LEVEL) {
      const cost = upgradeCostOf(S, c);
      panel.append(el('div', { class: 'upgrade-row' },
        el('span', { class: 'muted' }, (() => {
          // Zuwachs: je Feld mit passendem Gebäude (Bauernhof/Holzfäller/Mine/Kelterei) +½
          const t = cityTiles(S, ci);
          const B = { food: 'farm', wood: 'lumber', ore: 'mine', mana: 'press' };
          const gain = (k) => boostedYield(S, p.id, k, buildingYield(t[k], c.level + 1)) - boostedYield(S, p.id, k, buildingYield(t[k], c.level));
          const parts = RES.filter((k) => hasBuilding(c, B[k]) && t[k]).map((k) => `+${gain(k)} ${RES_INFO[k].name}`).join(', ') || 'kein Mehrertrag ohne Wirtschaftsgebäude';
          return `Ausbau zur ${CITY_NAMES[c.level + 1]}: +${citySlots({ level: c.level + 1 }) - citySlots(c)} Bauplätze, +${citySupply({ level: c.level + 1 }) - citySupply(c)} Versorgung, ${parts}`;
        })()),
        el('button', { class: 'btn small primary', disabled: !canAfford(p.res, cost), onclick: () => doUpgrade(c.idx) }, costEl(cost, p.res))));
    } else {
      panel.append(el('div', { class: 'note' }, 'Höchste Ausbaustufe erreicht.'));
    }
  }
}

// Scroll-Position des Panels und der Gebäudeliste über Neuaufbauten hinweg behalten
let panelScroll = { key: '', top: 0, list: 0 };
function panelKey() {
  return sel.cityIdx != null ? `city:${sel.cityIdx}:${cityTab}` : sel.unitId != null ? `unit:${sel.unitId}` : '';
}

function renderPanel() {
  const panel = $('panel');
  const key = panelKey();
  if (panelScroll.key === key && key) {
    panelScroll.top = panel.scrollTop;
    panelScroll.list = panel.querySelector('.build-list')?.scrollTop || 0;
  } else panelScroll = { key, top: 0, list: 0 };
  renderPanelContent(panel);
  // Menü unten: Höhe merken, damit man die Karte bis über das Menü hinaus scrollen kann
  if (R.w) R.overlayPad = { top: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hud-top')) || 0, bottom: Math.max(0, window.innerHeight - document.querySelector('.bottom').getBoundingClientRect().top) };
  // Schließen-Kreuz ragt oben rechts aus dem Stadt- bzw. Einheitenmenü heraus
  $('panelX').classList.toggle('hidden', !panel.childElementCount || (sel.cityIdx == null && sel.unitId == null && sel.infoIdx == null));
  if (key) {
    panel.scrollTop = panelScroll.top;
    const list = panel.querySelector('.build-list');
    if (list) list.scrollTop = panelScroll.list;
  }
}

function renderPanelContent(panel) {
  panel.innerHTML = '';
  if (!S || !humanTurn()) return;
  const occ = buildOcc(S);
  if (curVis) for (const x of S.units) if (x.owner !== S.current && !curVis[x.idx]) occ[x.idx] = null;
  if (sel.terraform != null) {
    const ci = sel.terraform;
    panel.append(el('div', { class: 'city-head' },
      el('span', { class: 'title' }, sel.tfKind === 'clear' ? '🪓 Wald roden' : `${PLANT_KINDS[sel.tfKind].icon} ${PLANT_KINDS[sel.tfKind].name}`),
      el('button', { class: 'btn small', onclick: () => { const idx = S.cities[ci].idx; clearSel(); sel.cityIdx = idx; cityTab = 'build'; refresh(); } }, 'Fertig')));
    panel.append(el('div', { class: 'note' }, sel.tfKind === 'clear' ? `Tippe helle Wälder an, um sie zu roden (je +${CLEAR_WOOD} Holz sofort, danach Wiese). Beliebig viele Felder.`
      : `Tippe helle Wiesen an (je ${costText(plantCost(sel.tfKind))}, nach ${PLANT_ROUNDS} Runden ${PLANT_KINDS[sel.tfKind].what}). Beliebig viele Felder.`));
    return;
  }
  if (sel.placeTower != null) {
    panel.append(el('div', { class: 'city-head' },
      el('span', { class: 'title' }, `${UNITS[sel.placeType].name} platzieren`),
      el('button', { class: 'btn small', onclick: () => { clearSel(); refresh(); } }, sel.placeType === 'barrier' ? 'Fertig' : 'Abbrechen')));
    panel.append(el('div', { class: 'note' }, sel.placeType === 'barrier'
      ? `Tippe helle Felder im Stadtgebiet an – Wallstück für Wallstück (${towersOfCity(S, sel.placeTower, undefined, 'barrier')}/${structureLimit(S.cities[sel.placeTower], 'barrier')}).`
      : 'Tippe ein helles Feld im Stadtgebiet an.'));
    return;
  }
  if (sel.magic === 'storm' && sel.unitId != null) {
    panel.append(el('div', { class: 'city-head' },
      el('span', { class: 'title' }, '🔥 Feuersturm'),
      el('button', { class: 'btn small', onclick: () => { sel.magic = null; sel.stormTo = null; refresh(); } }, 'Abbrechen')));
    panel.append(el('div', { class: 'note' }, sel.stormTo == null
      ? 'Tippe ein markiertes Feld an, um die Flugrichtung zu wählen (4 Felder weit, dazu die Nachbarfelder).'
      : 'Die Fläche ist markiert, rot sind die getroffenen Gegner. Tippe nochmal in die Fläche, um den Feuersturm zu starten – oder daneben zum Abbrechen.'));
    return;
  }
  if (sel.magic && sel.unitId != null) {
    const sk = SKILLS[sel.magic];
    panel.append(el('div', { class: 'city-head' },
      el('span', { class: 'title' }, `${sk.icon} ${sk.name}`),
      el('button', { class: 'btn small', onclick: () => { sel.magic = null; refresh(); } }, 'Abbrechen')));
    panel.append(el('div', { class: 'note' }, sel.magic === 'freeze' ? 'Tippe einen violett markierten Gegner an (bis 3 Felder weit): Er setzt seine nächste Runde aus.' : 'Tippe ein violett markiertes Gebirge an (bis 3 Felder weit): Es wird zu begehbarem Lehm.'));
    return;
  }
  if (sel.group) {
    // Kompakt: nur Gruppe erweitern oder auflösen, damit die Karte mit Zielfeldern sichtbar bleibt
    const members = groupUnits();
    panel.append(el('div', { class: 'group-bar' },
      el('span', { class: 'title' }, `👥 ${members.length}`),
      el('button', { class: 'btn small', title: 'Alle eigenen Einheiten in der Nähe dazunehmen', onclick: () => addNearbyToGroup() }, '+ Umgebung'),
      el('button', { class: 'btn small', title: 'Nur Einheiten vom Typ der zuerst gewählten dazunehmen', disabled: !members.length, onclick: () => addNearbyToGroup(members[0].type) }, `+ ${members.length ? UNITS[members[0].type].name : 'Gleiche'}`),
      el('button', { class: 'btn small', onclick: () => { clearSel(); refresh(); } }, 'Auflösen')));
    return;
  }
  const hu = hoverUnit != null ? unitById(S, hoverUnit) : null;
  if (hu && hu.id !== sel.unitId) {
    const who = hu.owner === S.current ? 'Deine Einheit' : S.players[hu.owner].name;
    panel.append(unitCard(hu, `${who} · ${tileInfo(hu.idx)}`));
    panel.append(el('div', { class: 'note' }, unitNotes(hu)));
    return;
  }
  const u = sel.unitId != null ? unitById(S, sel.unitId) : null;
  if (u) {
    const targets = unitTargets(u, occ);
    let status;
    if (canMove(u)) status = targets.length || reachTargets(u, occ).size ? 'Ziehen oder rotes Ziel antippen' : unitHeals(u).length ? 'Ziehen oder Grün = heilen' : 'Helles Feld = ziehen';
    else if (targets.length) status = 'Rotes Ziel = angreifen';
    else if (unitHeals(u).length) status = 'Grüne Einheit = heilen';
    else status = u.type === 'tower' ? 'Kein Ziel in Reichweite' : u.type === 'barrier' ? 'Blockiert den Weg' : 'Fertig für diese Runde';
    panel.append(unitCard(u, status));
    if (!UNITS[u.type].structure && u.owner === S.current) {
      const opts = perkOptions(u);
      if (opts.length) {
        panel.append(el('div', { class: 'note' }, `⭐ ${RANK_NAMES[u.rank]}! Wähle eine Spezialisierung:`));
        panel.append(el('div', { class: 'perk-row' }, ...opts.map((p) => el('button', { class: 'btn small perk', onclick: () => act({ type: 'perk', unitId: u.id, perk: p }) },
          el('b', {}, `${PERKS[p].icon} ${PERKS[p].name}`), el('span', { class: 'muted' }, PERKS[p].desc)))));
      }
      const actions = el('div', { class: 'unit-actions' },
        el('button', { class: 'btn small', title: 'Alle eigenen Einheiten in der Nähe ziehen und greifen gemeinsam an', onclick: () => groupNearby(u, false) }, '👥 Alle in der Nähe'),
        el('button', { class: 'btn small', title: `Alle ${UNITS[u.type].name} in der Nähe ziehen und greifen gemeinsam an`, onclick: () => groupNearby(u, true) }, `👥 Alle ${UNITS[u.type].name}`),
        el('button', { class: 'btn small' + (u.sentry ? ' active' : ''), onclick: () => act({ type: 'sentry', unitId: u.id }, { after: () => { if (unitById(S, u.id)?.sentry) clearSel(); } }) }, u.sentry ? '💤 Wache beenden' : '💤 Wache halten'));
      actions.append(el('button', { class: 'btn small raze', title: 'Einheit auflösen', onclick: () => doDisband(u) }, '🗑 Entlassen'));
      actions.append(el('button', { class: 'btn small primary', title: 'Angriff, Verteidigung, Leben und Fähigkeiten nur dieser Einheit verbessern', onclick: () => openBoost(u) }, '⬆ Verbessern'));
      if (u.type === 'dragon') {
        const w = stormWait(S, u);
        actions.append(el('button', { class: 'btn small merge', disabled: !canStorm(S, u), title: `Großangriff: überfliegt 4 Felder samt Nachbarn und setzt alles in Brand (alle 3 Runden, ${MANA.storm} Mana)`, onclick: () => { sel.magic = 'storm'; sel.stormTo = null; refresh(); } }, w ? `🔥 Feuersturm (in ${w} R.)` : `🔥 Feuersturm · ${MANA.storm}`, icon('mana')));
      }
      for (const k of ['freeze', 'bomb']) {
        if (!hasSkill(u, k) || !canAttack(u)) continue;
        const n = (k === 'freeze' ? getFreezeTargets(S, u).filter((x) => !curVis || curVis[x.idx]) : getBombTargets(S, u)).length;
        actions.append(el('button', { class: 'btn small merge', disabled: !n, onclick: () => { sel.magic = k; refresh(); } }, `${SKILLS[k].icon} ${SKILLS[k].name} · ${MANA[k]}`, icon('mana')));
      }
      panel.append(actions);
    }
    if (u.type === 'tower' && u.owner === S.current) {
      if (u.level < 3) {
        const cost = TOWER_UPGRADE[u.level];
        const nx = TOWER_LEVELS[u.level + 1];
        panel.append(el('div', { class: 'upgrade-row' },
          el('span', { class: 'muted' }, `Ausbau auf Stufe ${u.level + 1}: ${nx.hp} Leben, Angriff ${fmt(nx.atk)}, Reichweite ${nx.range}`),
          el('button', { class: 'btn small primary', disabled: !canAfford(S.players[S.current].res, cost), onclick: () => act({ type: 'towerUp', unitId: u.id }) }, costEl(cost, S.players[S.current].res))));
      } else panel.append(el('div', { class: 'note' }, 'Höchste Turmstufe erreicht.'));
    }
    if (isStructure(u) && u.owner === S.current) {
      panel.append(el('div', { class: 'upgrade-row' },
        el('span', { class: 'muted' }, `${UNITS[u.type].name} abreißen – halbe Baukosten zurück.`),
        el('button', { class: 'btn small raze', onclick: () => doRaze(u) }, '🗑 Abreißen')));
    }
    return;
  }
  if (sel.cityIdx != null) {
    renderCityPanel(panel, S.cityAt[sel.cityIdx], occ);
    return;
  }
  if (sel.infoIdx != null) {
    const i = sel.infoIdx;
    const o = occ[i];
    const c = cityOn(S, i);
    if (S.fog && !S.explored[humanId()][i]) {
      panel.append(el('div', { class: 'city-head' }, el('span', { class: 'title' }, 'Unerforscht')));
      panel.append(el('div', { class: 'note' }, 'Schicke Einheiten hierher, um das Gebiet aufzudecken.'));
    } else if (o) {
      panel.append(unitCard(o, `${S.players[o.owner].name} · ${tileInfo(i)}`));
    } else if (c) {
      const owner = c.owner >= 0 ? S.players[c.owner].name : 'Neutral';
      const y = cityYield(S, S.cityAt[i]);
      panel.append(el('div', { class: 'city-head' },
        el('span', { class: 'title' }, `${c.capital ? 'Hauptstadt' : 'Dorf'} (${owner})`),
        el('span', { class: 'yield' }, ...RES.map((k) => el('span', {}, icon(k), `+${y[k]}`)))));
      panel.append(el('div', { class: 'note' }, c.castle
        ? 'Burg: Erst wenn auf den 6 Burgfeldern kein Verteidiger mehr steht, kannst du den Bergfried betreten. Übersteht deine Einheit dort die gegnerische Runde, gehört die Burg dir.'
        : 'Stelle eine Einheit darauf. Übersteht sie die gegnerische Runde, gehört die Stadt samt Gebiet dir.'));
    } else {
      const t = TERRAIN[S.terrain[i]];
      const terr = computeTerritory(S)[i];
      const ownerTxt = terr >= 0 && S.cities[terr].owner === S.current ? 'liefert dir jede Runde' : 'liefert im Gebiet einer eigenen Stadt';
      panel.append(el('div', { class: 'city-head' },
        el('span', { class: 'title' }, t.name),
        el('span', { class: 'yield' }, icon(t.res), `${ownerTxt} 1 ${RES_INFO[t.res].name}`)));
      if (!t.pass) panel.append(el('div', { class: 'note' }, 'Unpassierbar.'));
      if (castleOf(S, i)) panel.append(el('div', { class: 'note' }, `🏰 Burgfeld: Verteidiger bekommen +${terrainDefense(S, i)} % Verteidigung.`));
    }
    return;
  }
  // Ohne Auswahl bleibt das Panel leer; Tipps gibt es über den 💡-Knopf
}

// ---------------------------------------------------------------- Banner, Toast, Dialoge
function showBanner(text, color) {
  const b = $('banner');
  b.innerHTML = '';
  b.append(el('span', { class: 'dot', style: `background:${color}` }), text);
  b.classList.remove('hidden');
}
function hideBanner() {
  $('banner').classList.add('hidden');
}
let toastTimer = null;
function showAdvice() {
  if (!S || busy || !humanTurn()) return;
  const occ = buildOcc(S);
  if (curVis) for (const x of S.units) if (x.owner !== S.current && !curVis[x.idx]) occ[x.idx] = null;
  const tip = advice(occ);
  followAdvice(tip);
  toast('💡 ' + tip.text, 5000);
}

function toast(text, ms = 2400) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

// Im Spiel bleiben Rundenanzeige und Rohstoffe oben immer sichtbar
function updateHudTop() {
  const inGame = !$('hud').classList.contains('hidden');
  const eb = $('enemyBar');
  const top = inGame ? Math.ceil(Math.max($('resBar').getBoundingClientRect().bottom, eb.classList.contains('hidden') ? 0 : eb.getBoundingClientRect().bottom)) + 6 : 0;
  document.documentElement.style.setProperty('--hud-top', top + 'px');
  $('modal').classList.toggle('ingame', inGame);
}
window.addEventListener('resize', updateHudTop);

function openModal(...children) {
  const box = $('modalBox');
  box.innerHTML = '';
  box.append(...children);
  updateHudTop();
  $('modal').classList.remove('hidden');
  $('modal').dataset.closable = '';
}

// Fenster, das man jederzeit verlassen kann: ✕ oben rechts und Tipp daneben
function openClosable(...children) {
  openModal(el('button', { class: 'modal-x', 'aria-label': 'Schließen', onclick: closeModal }, '✕'), ...children);
  $('modal').dataset.closable = '1';
}
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal') && $('modal').dataset.closable === '1') closeModal();
});
function closeModal() {
  $('modal').classList.add('hidden');
  $('modalBox').classList.remove('wide');
}

function confirmDialog(title, text, yes, no) {
  return new Promise((resolve) => {
    openModal(
      el('h2', {}, title),
      el('p', {}, text),
      el('button', { class: 'btn primary big', onclick: () => { closeModal(); resolve(true); } }, yes),
      el('button', { class: 'btn big', onclick: () => { closeModal(); resolve(false); } }, no),
    );
  });
}

function showIntro() {
  const p = store.progress();
  p.seenIntro = true;
  try { localStorage.setItem('hexkrone.progress', JSON.stringify(p)); } catch { /* egal */ }
  openModal(
    el('h2', {}, 'Willkommen!'),
    el('p', {}, 'Ziel: Erobere alle Städte deiner Gegner.'),
    el('p', {}, 'Tippe eine Einheit an und dann ein helles Feld, um zu ziehen. Rote Felder zeigen angreifbare Gegner samt Schaden – ein Tipp greift an.'),
    el('p', {}, 'Stelle eine Einheit auf ein Dorf. Steht sie zu Beginn deines nächsten Zuges noch dort, gehört es dir – samt Gebiet: Wiesen liefern Nahrung, Wälder Holz, Hügel und Berge Erz.'),
    el('p', {}, 'Tippe eine Stadt an, um Einheiten zu rekrutieren oder Gebäude zu bauen. Der 💡-Knopf unten links zeigt dir den nächsten sinnvollen Schritt.'),
    el('button', { class: 'btn primary big', onclick: closeModal }, "Los geht's"),
  );
}

function gameOver() {
  if (!S || !S.over) return;
  const human = S.players.find((p) => p.human);
  const won = human && S.over.winner === human.id;
  store.clearGame();
  sound.play(won ? 'victory' : 'defeat');
  const meta = S.meta || {};
  const children = [el('h2', {}, won ? '🏆 Sieg!' : 'Niederlage')];
  if (meta.mode === 'level') {
    const level = getLevels().find((l) => l.id === meta.levelId);
    const stars = won ? starsFor(level, S.turn) : 0;
    if (won) store.setStars(level.id, stars);
    children.push(el('div', { class: 'big-stars', html: [1, 2, 3].map((k) => (k <= stars ? '★' : '<span class="off">★</span>')).join('') }));
    children.push(el('p', {}, won ? `Level ${level.world + 1}-${level.num} in ${S.turn} Runden geschafft (3★ bis Runde ${level.par}).` : 'Versuch es noch einmal!'));
    const next = getLevels().find((l) => l.id === level.id + 1);
    if (won && next) children.push(el('button', { class: 'btn primary big', onclick: () => { closeModal(); startLevel(next); } }, 'Nächstes Level'));
  } else {
    children.push(el('p', {}, won ? `Gewonnen in ${S.turn} Runden.` : 'Dein Reich ist gefallen.'));
    children.push(el('p', {}, `Karten-Code: ${meta.code}`));
  }
  children.push(el('button', { class: 'btn big' + (won ? '' : ' primary'), onclick: () => { closeModal(); restartGame(); } }, 'Nochmal'));
  children.push(el('button', { class: 'btn big', onclick: () => { closeModal(); S = null; showScreen('scrMenu'); } }, 'Hauptmenü'));
  openModal(...children);
}

// Speicherplätze: Spielstand speichern oder laden (10 Plätze im Browser)
function gameLabel(st) {
  const meta = st.meta || {};
  if (meta.mode === 'level') {
    const l = getLevels().find((x) => x.id === meta.levelId);
    if (l) return `Level ${l.world + 1}-${l.num}`;
  }
  return `Freies Spiel${meta.setup ? ' · ' + MAP_SIZES[meta.setup.size]?.name : ''}`;
}

function openSlots(mode, back) {
  const draw = () => {
    const list = el('div', { class: 'slot-list' });
    for (let n = 1; n <= store.SLOTS; n++) {
      const d = store.slot(n);
      const ok = d && loadable(d.state);
      const info = d
        ? el('div', { class: 'binfo' }, el('b', {}, `${n}. ${d.name}`), el('span', { class: 'muted' }, `Runde ${d.turn} · ${new Date(d.date).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}${ok ? '' : ' · alte Version'}`))
        : el('div', { class: 'binfo' }, el('b', {}, `${n}. – leer –`));
      const acts = el('span', { class: 'built-actions' });
      if (mode === 'save') {
        acts.append(el('button', {
          class: 'btn small primary',
          onclick: async () => {
            if (d && !(await confirmDialog(`Platz ${n} überschreiben?`, `„${d.name}“ (Runde ${d.turn}) wird ersetzt.`, 'Überschreiben', 'Abbrechen'))) { draw(); return; }
            const data = { name: gameLabel(S), date: Date.now(), turn: S.turn, state: S };
            if (store.saveSlot(n, data)) toast(`💾 Gespeichert auf Platz ${n}`);
            else toast('Speichern fehlgeschlagen – der Browser-Speicher ist voll. Lösche einen anderen Platz.', 4000);
            draw();
          },
        }, 'Speichern'));
      } else if (d) {
        acts.append(el('button', {
          class: 'btn small primary', disabled: !ok,
          onclick: async () => {
            if (S && !(await confirmDialog('Spielstand laden?', 'Das laufende Spiel wird durch den gespeicherten Stand ersetzt (ungespeicherter Fortschritt geht verloren).', 'Laden', 'Abbrechen'))) { draw(); return; }
            closeModal();
            S = migrateState(store.slot(n).state);
            enterGame();
            toast(`📂 Platz ${n} geladen`);
          },
        }, 'Laden'));
      }
      if (d) {
        acts.append(el('button', {
          class: 'btn small raze', title: 'Platz löschen',
          onclick: async () => {
            if (await confirmDialog(`Platz ${n} löschen?`, `„${d.name}“ (Runde ${d.turn}) wird gelöscht.`, 'Löschen', 'Abbrechen')) store.clearSlot(n);
            draw();
          },
        }, '🗑'));
      }
      list.append(el('div', { class: 'build-row' + (d ? '' : ' empty') }, info, acts));
    }
    openClosable(el('h2', {}, mode === 'save' ? '💾 Speichern' : '📂 Laden'),
      el('p', {}, mode === 'save' ? 'Wähle einen Speicherplatz.' : 'Wähle einen gespeicherten Spielstand.'),
      list,
      el('button', { class: 'btn big', onclick: () => { closeModal(); if (back) back(); } }, 'Zurück'));
  };
  draw();
}

function gameMenu() {
  if (busy && humanTurn()) return;
  const meta = S.meta || {};
  const info = meta.mode === 'level'
    ? (() => { const l = getLevels().find((x) => x.id === meta.levelId); return `Level ${l.world + 1}-${l.num} · ${l.worldName}`; })()
    : `Freies Spiel · Code ${meta.code}`;
  openModal(
    el('h2', {}, 'Pause'),
    el('p', {}, info),
    el('button', { class: 'btn primary big', onclick: closeModal }, 'Weiterspielen'),
    meta.mode === 'skirmish' ? el('button', {
      class: 'btn big',
      onclick: async () => {
        const text = `KnightyKnight – spiel diese Karte: Code ${meta.code} (${MAP_SIZES[meta.setup.size].name}, ${meta.setup.enemies} Gegner, ${DIFFICULTIES[meta.setup.diff - 1].name})`;
        try {
          if (navigator.share) await navigator.share({ text, url: location.href.split('#')[0] });
          else { await navigator.clipboard.writeText(text); toast('Kopiert!'); }
        } catch { /* abgebrochen */ }
      },
    }, 'Karte teilen') : null,
    el('button', { class: 'btn big', onclick: () => openSlots('save', gameMenu) }, '💾 Speichern'),
    el('button', { class: 'btn big', onclick: () => openSlots('load', gameMenu) }, '📂 Laden'),
    el('button', { class: 'btn big', onclick: () => openSettings(gameMenu) }, 'Einstellungen'),
    el('button', { class: 'btn big', onclick: async () => { closeModal(); if (await confirmDialog('Neu starten?', 'Der aktuelle Fortschritt geht verloren.', 'Neu starten', 'Abbrechen')) restartGame(); } }, 'Neu starten'),
    el('button', { class: 'btn big', onclick: () => { closeModal(); saveGame(); S = null; showScreen('scrMenu'); } }, 'Hauptmenü'),
  );
}

function openSettings(onClose) {
  const seg = (options, value, onPick) => {
    const box = el('div', { class: 'seg' });
    for (const [v, label] of options) {
      box.append(el('button', { class: v === value ? 'active' : '', onclick: (e) => { onPick(v); [...box.children].forEach((b) => b.classList.remove('active')); e.currentTarget.classList.add('active'); } }, label));
    }
    return box;
  };
  const toggle = (key) => seg([[true, 'An'], [false, 'Aus']], settings[key], (v) => { settings[key] = v; store.saveSettings(settings); });
  openModal(
    el('h2', {}, 'Einstellungen'),
    el('label', {}, 'Tempo der Computergegner'),
    seg([[1, 'Normal'], [0.5, 'Schnell'], [0, 'Sofort']], settings.speed, (v) => { settings.speed = v; store.saveSettings(settings); }),
    el('label', {}, 'Geräusche (Kampf, Bewegung, Ereignisse)'),
    seg([[true, 'An'], [false, 'Aus']], settings.sound, (v) => { settings.sound = v; store.saveSettings(settings); applySoundSettings(); }),
    el('label', {}, 'Umgebung (Meer, Wind, Wald, Stadt)'),
    seg([[0, 'Aus'], [0.3, 'Leise'], [0.6, 'Normal'], [1, 'Laut']], settings.ambience, (v) => { settings.ambience = v; store.saveSettings(settings); applySoundSettings(); }),
    el('label', {}, 'Größe der Menüs unten (Stadt, Einheit)'),
    seg([['auto', 'Automatisch'], ['small', 'Klein'], ['medium', 'Mittel'], ['large', 'Groß']], settings.panelSize || 'auto', (v) => { settings.panelSize = v; store.saveSettings(settings); applyPanelSize(); }),
    el('label', {}, 'Vibration'),
    toggle('vibrate'),
    el('label', {}, 'Zugende bestätigen'),
    toggle('confirmEnd'),
    el('label', {}, 'Kampfeffekte (Hiebe, Funken, Pfeile, Feuer, Staub, Wackeln)'),
    seg([[true, 'An'], [false, 'Aus']], settings.fx !== false, (v) => { settings.fx = v; store.saveSettings(settings); R.fx = v; }),
    el('label', {}, 'Türme schießen am Zugende automatisch'),
    seg([[true, 'An'], [false, 'Aus']], settings.towerAuto !== false, (v) => { settings.towerAuto = v; store.saveSettings(settings); }),
    el('label', {}, 'Ertrag über den Städten anzeigen'),
    seg([[true, 'An'], [false, 'Aus']], settings.cityYields !== false, (v) => { settings.cityYields = v; store.saveSettings(settings); updateHud(); R.invalidate(); }),
    el('label', {}, 'Rohstoffe der Gegner oben anzeigen (Testmodus)'),
    seg([[true, 'An'], [false, 'Aus']], settings.enemyRes !== false, (v) => { settings.enemyRes = v; store.saveSettings(settings); updateHud(); }),
    el('label', {}, 'Alle Level freischalten (Testmodus)'),
    toggle('unlockAll'),
    el('button', { class: 'btn primary big', onclick: () => { closeModal(); if (onClose) onClose(); } }, 'Fertig'),
  );
}

// ---------------------------------------------------------------- Kampagne
let currentWorld = 0;
function isUnlocked(level, stars) {
  return settings.unlockAll || level.id === 1 || (stars[level.id - 1] || 0) > 0;
}

function renderLevels() {
  const levels = getLevels();
  const stars = store.progress().stars;
  const total = Object.values(stars).reduce((a, b) => a + b, 0);
  $('starsTotal').textContent = `★ ${total}/${levels.length * 3}`;
  const tabs = $('worldTabs');
  tabs.innerHTML = '';
  getWorldNames().forEach((name, wi) => {
    const first = levels.find((l) => l.world === wi);
    const locked = !isUnlocked(first, stars);
    tabs.append(el('button', { class: `tab ${wi === currentWorld ? 'active' : ''} ${locked ? 'locked' : ''}`, onclick: () => { currentWorld = wi; renderLevels(); } }, `${wi + 1}. ${name}`));
  });
  const grid = $('levelGrid');
  grid.innerHTML = '';
  const nextId = levels.find((l) => !stars[l.id])?.id;
  for (const l of levels.filter((x) => x.world === currentWorld)) {
    const unlocked = isUnlocked(l, stars);
    const st = stars[l.id] || 0;
    grid.append(el('button', {
      class: `level ${unlocked ? '' : 'locked'} ${l.id === nextId && unlocked ? 'next' : ''}`,
      disabled: !unlocked,
      onclick: () => startLevel(l),
    },
    el('span', { class: 'n' }, l.num),
    el('span', { class: 'st' }, '★'.repeat(st) + '☆'.repeat(3 - st)),
    el('span', { class: 'meta' }, `${MAP_SIZES[l.size].name} · ${l.ais.length} Geg.`),
    ));
  }
}

// ---------------------------------------------------------------- Freies Spiel
const setup = Object.assign({ size: 'M', biome: 'mixed', enemies: 1, diff: 3, fog: false, code: randomSeedCode() }, store.lastSetup() || {});

function renderSetup() {
  const seg = (id, options, key) => {
    const box = $(id);
    box.innerHTML = '';
    for (const [v, label] of options) {
      box.append(el('button', { class: setup[key] === v ? 'active' : '', onclick: () => { setup[key] = v; renderSetup(); } }, label));
    }
  };
  seg('segSize', Object.entries(MAP_SIZES).map(([k, v]) => [k, v.name]), 'size');
  seg('segBiome', [...Object.entries(BIOMES).map(([k, v]) => [k, v.name]), ['random', 'Zufall']], 'biome');
  seg('segEnemies', [[1, '1'], [2, '2'], [3, '3']], 'enemies');
  seg('segDiff', DIFFICULTIES.map((d) => [d.level, String(d.level)]), 'diff');
  const d = DIFFICULTIES[setup.diff - 1];
  $('diffDesc').textContent = `${d.name}: ${d.desc}`;
  $('seedInput').value = setup.code;
  $('citiesRange').value = setup.cities ?? 3;
  updateCitiesInfo();
}
// Vorschau: genaue Anzahl Städte dieser Karte (Dörfer halten immer 4 Felder Abstand, daher passen nicht beliebig viele)
function updateCitiesInfo() {
  let n = '?';
  try {
    const c = skirmishConfig({ ...setup, code: setup.code || 'A' });
    n = generateMap({ ...c, players: c.players.length }).cities.length;
  } catch { /* Karte nicht erzeugbar */ }
  $('citiesInfo').textContent = `(${CITY_LABELS[setup.cities ?? 3]}: ${n} Städte inkl. Hauptstädte)`;
}
$('citiesRange').addEventListener('input', (e) => { setup.cities = +e.target.value; updateCitiesInfo(); });
$('seedInput').addEventListener('input', (e) => { setup.code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); updateCitiesInfo(); });
$('btnDice').addEventListener('click', () => { setup.code = randomSeedCode(); renderSetup(); });
$('btnStartSkirmish').addEventListener('click', () => {
  if (!setup.code) setup.code = randomSeedCode();
  store.saveSetup(setup);
  startSkirmish({ ...setup });
});

// ---------------------------------------------------------------- Anleitung
function renderHelp() {
  const costTxt = (c) => RES.filter((k) => c[k]).map((k) => `${c[k]} ${RES_INFO[k].name}`).join(', ');
  const rows = UNIT_ORDER.map((k) => {
    const T = UNITS[k];
    return `<tr><td>${T.name}</td><td>${T.hp}</td><td>${T.atk}</td><td>${T.move}</td><td>${T.range}</td></tr><tr class="sub"><td colspan="5">${costTxt(T.cost)} · ${defenseWords(k)}</td></tr>`;
  }).join('');
  $('helpContent').innerHTML = `
    <h3>Ziel</h3>
    <p>Erobere alle Städte deiner Gegner. Wer keine Stadt mehr hat, scheidet aus.</p>
    <h3>Rohstoffe</h3>
    <p>Jede Stadt besitzt das Gebiet um sich herum (farbig umrandet). Jedes Feld darin liefert dir jede Runde einen Rohstoff:
    <b>Wiese</b> und <b>See</b> → Nahrung, <b>Wald</b> → Holz, <b>Hügel</b> und <b>Gebirge</b> → Erz.
    Das Stadtzentrum liefert zusätzlich von allem etwas. Städte mit vielen Wäldern und Hügeln im Gebiet sind deshalb besonders wertvoll.</p>
    <h3>So baust du dein Reich auf</h3>
    <p><b>1. Ausbreiten:</b> Besetze mit Reitern und Kriegern früh neutrale Dörfer – jedes bringt Gebiet und Rohstoffe.<br>
    <b>2. Wirtschaft:</b> Baue Gebäude passend zum Gebiet: eine <b>Mine</b> bei Hügeln und Bergen, einen <b>Holzfäller</b> bei Wäldern, einen <b>Bauernhof</b> sonst.<br>
    <b>3. Wachsen:</b> Baue Städte aus (bis Stufe 3): mehr Bauplätze, mehr Ertrag. Jede Stadt besitzt 2 Felder Gebiet rundherum – eroberte Nachbarstädte bilden ein zusammenhängendes Reich.<br>
    <b>4. Armee:</b> Eine <b>Kaserne</b> in Frontstädten lässt neue Einheiten sofort ziehen und ermöglicht Ritter. Fehlt ein Rohstoff, tippe oben auf die Rohstoffleiste und handle.<br>
    <b>5. Angriff:</b> Erst die Fernkämpfer schießen lassen, dann mit Nahkämpfern zuschlagen.</p>
    <h3>Ablauf einer Runde</h3>
    <p>Jede Einheit darf pro Runde einmal ziehen und einmal angreifen (erst ziehen, dann angreifen). Über eigene Einheiten springst du hinweg – das kostet keine Bewegung.
    Du kannst pro Runde beliebig viele Einheiten rekrutieren (begrenzt nur durch Rohstoffe). Sie erscheinen auf freien Feldern im Stadtgebiet und handeln ab der nächsten Runde – mit Kaserne sofort. Jede Einheit kostet aber <b>Unterhalt</b>: 2 Nahrung pro Runde (Basilisk 4, Troll und Drache 6, Katapult und Tribok 2 Nahrung + 1 Holz), über der Versorgung deiner Städte doppelt bzw. dreifach (siehe Versorgung). Oben steht in Grün der Ertrag des ganzen Reichs, daneben bei ⚔ der Unterhalt. Ist ein Rohstoff rot umrandet, frisst der Unterhalt mehr als der Ertrag – deine Vorräte schrumpfen.
    Einheiten, die noch etwas tun können, haben einen leuchtenden Ring.</p>
    <h3>Gemeinsam angreifen 👥</h3>
    <p>Wähle eine Einheit und tippe auf „👥 Alle in der Nähe“ (alle eigenen Einheiten im Umkreis) oder „👥 Alle Ritter“ usw. (nur gleiche Einheiten im Umkreis); am PC geht auch Shift + Klick. Danach ist der Gruppenmodus aktiv. Weitere eigene Einheiten fügst du per Tipp hinzu oder nimmst sie wieder heraus.
    Ein Tipp auf einen Gegner: Alle greifen nacheinander an und rücken dafür heran (Fernkämpfer zuerst), bis jeder dran war oder das Ziel fällt. Zauberer ziehen mit, greifen aber nicht automatisch an (sie heilen lieber). Die Gruppe bleibt gewählt, solange noch ein Mitglied ziehen oder angreifen kann – tippe einfach den nächsten Gegner an. Erst wenn alle fertig sind, löst sie sich automatisch auf. Ein Tipp auf ein hell markiertes Feld bewegt die Gruppe, ein Tipp auf ein anderes leeres Feld (oder „Auflösen“) beendet sie. Das Gruppenmenü unten bleibt bewusst klein: „+ Umgebung“, „+ Ritter“ usw. (nur Einheiten vom Typ der zuerst gewählten) und „Auflösen“.</p>
    <h3>Angreifen</h3>
    <p>Wählst du eine Einheit, zeigen rote Felder alle Ziele – auch solche, die sie erst nach dem Ziehen erreicht. Die Blase über dem Ziel nennt den Schaden (↩ = Gegenschlag, ✖ = Ziel wird besiegt). Ein Tipp auf das Ziel greift an; ist es noch zu weit weg, zieht die Einheit vorher auf das beste Feld (Fernkämpfer halten Abstand).
    Nahkämpfer rücken nach einem Sieg auf das Feld vor – außer sie stehen in einer Stadt, dann bleiben sie dort.<br>
    <b>Schaden:</b> Angriff × (100 % − Verteidigung des Ziels), gerundet, mindestens 1 – unabhängig vom aktuellen Leben. Beispiel: Ritter (Angriff 7) gegen Krieger (20 % gegen Nahkampf) = 7 × 0,8 = 6. Der Gegenschlag rechnet genauso mit dem Angriff des Verteidigers. Die Blase über dem Ziel zeigt das Ergebnis, langes Drücken (PC: Maus darüber) die Rechnung.<br>
    <b>Verteidigung</b> hängt von der Angriffsart ab (Nahkampf, Fernkampf, Wucht, Feuer/Magie) – in der Einheitenbeschreibung steht, wogegen eine Einheit robust oder anfällig ist (z. B. halten Katapulte und Trolle Pfeilen stand). Dazu kommen Zuschläge: Stadt +20 %, mit Mauer +40 % (Steinmetz +50 %), Burgfelder +30 % (Burgausbau +40 %) – gegen Wucht nur halb –, Schutzaura +15 %, Rang, Entwicklung und Verbesserungen. Höchstens 80 %.<br>
    <b>Durchschlag 🗡</b> senkt die Verteidigung des Ziels um so viele Prozentpunkte. Ihn gibt es nicht von Anfang an, sondern als Einzel-Verbesserung (10 / 20 / 30) und durch die Spezialisierungen Belagerer (gegen Städte und Bauwerke) und Jäger (gegen Reiterei und Titanen).</p>
    <h3>Städte</h3>
    <p>Steht deine Einheit zu Beginn deines Zuges auf einer fremden Stadt, wird sie erobert – samt Gebäuden; Türme und Steinwälle in ihrem Gebiet wechseln mit auf deine Seite.
    Stufen: ${CITY_NAMES.slice(1).join(' → ')}. Bauplätze: 2 / 4 / 6.<br>
    <b>Ertrag:</b> Felder im Stadtkreis liefern nur mit dem passenden Wirtschaftsgebäude: Bauernhof 1 Nahrung je Wiese/See, Holzfäller 1 Holz je Wald, Mine 1 Erz je Hügel, Lehm oder Erzgrube und 2 je Gebirge, Kelterei 1 Mana je Traubenhain – auf Stufe 2 das Doppelte, auf Stufe 3 das Dreifache (ein Gebirge also bis zu 6 Erz). Pflug, Sägewerk und Bergbau geben je +50 % auf die gesamte Nahrung, das Holz bzw. das Erz des Reichs. Ohne passendes Feld liefert ein Gebäude nichts, das Stadtzentrum selbst liefert nichts. Jede Hauptstadt startet mit Bauernhof, Holzfäller und Mine. Wirtschaftsgebäude und die Mauer belegen keinen Bauplatz, die Plätze sind für Einheiten-Gebäude und den Markt. Ob du zuerst baust oder ausbaust, ist egal. Jede Stufe bringt außerdem 2 Bauplätze und 2 Versorgung. Erobern lohnt sich früh, Ausbauen macht jede eroberte Stadt doppelt bzw. dreifach wertvoll.</p>
    <h3>Versorgung</h3>
    <p><b>Versorgung:</b> Oben neben ⚔ steht „Truppen/Versorgung“. Jede Stadt versorgt Truppen (${[1, 2, 3, 4, 5, 6, 7, 8].map((l) => citySupply({ level: l })).join(' / ')} je nach Stufe; Basilisk zählt 2, Troll und Drache 3). Jede Einheit isst 2 Nahrung pro Runde. Einheiten über der Versorgung kosten doppelten Unterhalt, über dem 1,5-Fachen dreifachen. Eine riesige Armee frisst also schnell den ganzen Ertrag – lieber wenige, gut verbesserte Einheiten.</p>
    <h3>Felder bearbeiten 🌱⛏️🍇🪓</h3>
    <p>Im Reiter „Gebäude“ → Wirtschaft wählst du bei „Felder bearbeiten“, was entstehen soll, und tippst helle Felder im Stadtgebiet an. Eine <b>Wiese</b> wird nach ${PLANT_ROUNDS} Runden zu <b>Wald</b> (${costText(plantCost('forest'))}, Holz mit Holzfäller), zur <b>Erzgrube</b> (${costText(PLANT_COST)}, 1 Erz mit Mine) oder zum <b>Traubenhain</b> (${costText(PLANT_COST)}, 1 Mana mit Kelterei); solange liefert das Feld nichts. Einen <b>Wald</b> rodest du sofort zur Wiese (Nahrung mit Bauernhof) und bekommst ${CLEAR_WOOD} Holz. Beliebig viele Felder. Wald bremst Angreifer, weil er 2 Bewegung kostet.</p>
    <h3>Mana 🍇</h3>
    <p>Mana ist der Rohstoff für alles Magische. Es kommt aus selbst angelegten <b>Traubenhainen</b> mit einer <b>Kelterei</b> in der Stadt und vom Turm der Weisen (+${MANA.sanctum}). Mana lässt sich nicht handeln.<br>
    Wofür: Zauberer kosten Mana und 1 Mana Unterhalt pro Runde; Vereisen ${MANA.freeze}, Bergsprengung ${MANA.bomb}, Flächenheilung ${MANA.areaheal} (sonst heilt der Zauberer nur das Ziel), Feuersturm des Drachen ${MANA.storm}; die Forschungen Erleuchtung und Segen kosten ebenfalls Mana.</p>
    <h3>Gebäude</h3>
    <p>${BUILDING_ORDER.map((b) => `${BUILDINGS[b].icon} <b>${BUILDINGS[b].name}</b>: ${BUILDINGS[b].desc}`).join('<br>')}</p>
    <h3>Abreißen 🗑</h3>
    <p>Verbaut? Im Reiter „Gebäude“ hat jedes fertige Gebäude einen 🗑-Knopf: Nach einer Rückfrage wird es abgerissen, der Bauplatz ist wieder frei, und du bekommst die Hälfte der Baukosten zurück. Eigene Türme und Steinwälle reißt du ab, indem du sie antippst. Einheiten, die du nicht mehr brauchst, löst du mit „🗑 Entlassen“ auf – Rohstoffe gibt es dafür nicht zurück.</p>
    <h3>Die Burg 🏰</h3>
    <p>Jede Hauptstadt ist von Anfang an eine große <b>Burg</b> über 7 Felder: der Bergfried in der Mitte und 6 gepflasterte Burgfelder rundherum, umgeben von einer Ringmauer mit Ecktürmen und Torhaus. Auf allen 7 Feldern bekommen Verteidiger den Burgbonus (mindestens doppelte Verteidigung, mit der Forschung Burgausbau +25 %), du kannst also 7 Einheiten in der Burg aufstellen. In der Burg dürfen bis zu 6 Türme und 12 Steinwälle stehen – genug für einen ganzen Wallring 2 Felder vor dem Bergfried.</p>
    <p>Eroberung: Der Bergfried lässt sich erst betreten, wenn auf den 6 Burgfeldern kein Verteidiger mehr steht. Die letzte Burg fällt also nur nach einer großen Schlacht.</p>
    <h3>Türme</h3>
    <p>Im Reiter „Gebäude“ einer Stadt baust du Türme auf ein freies Feld im Stadtgebiet (bis zu ${TOWERS_PER_CITY} pro Stadt, in der Burg 6). Türme bewegen sich nicht, greifen aber Gegner direkt daneben an (ab Stufe 3 bis 2 Felder weit) und lassen sich in 3 Stufen ausbauen – der Ausbau ist teuer: tippe den Turm an. Hat ein Turm in deinem Zug noch nicht geschossen, feuert er beim Zugende automatisch auf das lohnendste Ziel (sichtbar animiert; in den Einstellungen abschaltbar).</p>
    <h3>Steinwälle 🧱</h3>
    <p>Im Reiter „Gebäude“ einer Stadt setzt du Steinwälle auf freie Felder bis 2 Felder um die Stadt (bis zu 6 pro Stadt). Sie sind sehr stabil (50 Leben, Verteidigung 24), greifen nicht an, versperren aber den Weg: Gegner müssen sie umgehen oder mühsam einreißen – ideal, um Angreifer in die Reichweite deiner Türme und Schützen zu lenken. Nebeneinander gesetzte Wallstücke verbinden sich zu einer Mauer. Katapulte und Belagerer sind gegen sie besonders wirksam.</p>
    <h3>Forschung 🔬</h3>
    <p>Oben rechts öffnest du den Entwicklungsbaum. Jede Forschung gilt für dein ganzes Reich: ${TECH_ORDER.map((t) => `${TECHS[t].icon} ${TECHS[t].name} (${TECHS[t].desc})`).join(', ')}.</p>
    <h3>Kartennebel</h3>
    <p>Im Hauptmenü mit „🌫️ Nebel: An/Aus“ schaltbar (gilt für neue Spiele in Kampagne und Freiem Spiel): Du siehst nur, was deine Einheiten und Städte sehen. Bereits erkundete Gebiete bleiben sichtbar, aber gegnerische Einheiten darin nicht. Die KI unterliegt denselben Regeln.</p>
    <h3>Handel</h3>
    <p>Handeln kannst du erst mit einem <b>Markt</b> in einer deiner Städte (einer pro Reich genügt – in den anderen Städten ist er ausgegraut). Dann tippst du oben auf einen Rohstoff: 3 beliebige Rohstoffe gegen 1 anderen, mit der Forschung <b>Handelsgilde</b> 2 gegen 1.</p>
    <h3>Gelände</h3>
    <p><b>Gebirge</b> und <b>Seen</b> sind unpassierbar (nur Drache und Greifenreiter fliegen darüber; Zauberer mit Bergsprengung verwandeln Gebirge in begehbaren <b>Lehm</b>). Ein <b>Wald</b>feld zu betreten kostet 2 Bewegung statt 1 – ein einzelner Schritt in den Wald geht aber immer. Verteidigungsbonus gibt es nur in Städten.</p>
    <h3>Heilung</h3>
    <p>Einheiten heilen nicht von selbst – auch nicht in Städten. Leben zurück gibt es nur durch <b>Zauberer</b> (4 Leben, Heilkunde und Segen je +2, Großheiler +3) und durch Verbesserungen einzelner Einheiten: 💚 Selbstheilung (10 % pro Runde) und die Spezialisierung 💪 Zäh (2 pro Runde).</p>
    <h3>Einheiten</h3>
    <table><tr><th>Einheit</th><th>❤</th><th>Angr.</th><th>Bew.</th><th>Reichw.</th></tr>${rows}</table>
    <p>Ritter und Greifenreiter brauchen eine Kaserne, Katapulte und Triboks eine Werkstatt, Zauberer einen Turm der Weisen, der Basilisk ein Basiliskennest, der Schwarze Troll eine Trollhöhle, der Drache eine Drachenhöhle. Das Katapult kann nicht im selben Zug ziehen und angreifen.</p>
    <h3>Zugweite</h3>
    <p>Auch voll entwickelt ziehen Fußtruppen höchstens 4 Felder, Katapulte 3, Reiter, Ritter und Greifenreiter 6 – auch wenn sie über eigene Einheiten springen.</p>
    <h3>Ränge und Fähigkeiten ★</h3>
    <p>Einheiten steigen durch <b>Siege</b> auf – überall auf der Karte, ganz ohne Stadt oder Kaserne: Je 5 besiegte Gegner bringen eine Stufe (Zauberer zählen stattdessen ihre Heilungen), höchstens 3 Stufen: ${RANK_NAMES.slice(1).join(' → ')}. Jede Stufe gibt +2 Leben, +1 Angriff und +5 % Verteidigung, Reiter, Ritter und Greifenreiter ab Veteran +1 Bewegung, alle Helden +1 Bewegung.
    Bei jeder Stufe wählst du eine <b>Spezialisierung</b>. Einheiten, die gerade eine wählen dürfen, schimmern golden, blinken auf und tragen ein ⬆; gewählte Spezialisierungen erscheinen als kleines Abzeichen neben der Figur: ${Object.values(PERKS).map((p) => `${p.icon} ${p.name} (${p.desc})`).join(', ')}.</p>
    <h3>Zauberer 🔮</h3>
    <p>Eigene Einheiten neben einem Zauberer (blaues Schild-Symbol) bekommen +15 % Verteidigung, Flächenschaden halbiert. Statt anzugreifen heilt der Zauberer eine eigene Einheit bis 3 Felder entfernt (grün markiert antippen). Höchstens ein Zauberer pro Stadt.</p>
    <h3>Katapult und Flanke</h3>
    <p>Katapulte sind Belagerungswaffen (Wucht): Türme und Wälle haben dagegen keine Verteidigung, und Stadt- und Burgboni zählen nur halb. Sie treffen auch alle Gegner neben dem Ziel mit halbem Schaden – stelle deine Truppen nicht zu dicht. Gegenmittel: Reiter und Ritter, denn Katapulte haben keine Verteidigung und können nach einer Bewegung nicht schießen. Jede weitere eigene Einheit direkt neben dem Ziel gibt beim Angriff +1 Angriff (Schlachtordnung +2, höchstens 3 Nachbarn): Einkesseln lohnt sich.</p>
    <h3>Schwarzer Troll</h3>
    <p>Ein Titan für das späte Spiel: viel Leben und harte Schläge, kann ebenfalls Ränge sammeln. Er kostet viel und braucht eine Trollhöhle (Stadt ab Stufe 3). Höchstens 5 pro Reich.</p>
    <h3>Einheiten-Entwicklung ⬆</h3>
    <p>Im Forschungsfenster gibt es neben Militär, Wirtschaft und Verteidigung die Reiter <b>Nahkämpfer</b>, <b>Fernkämpfer</b>, <b>Zauberer</b>, <b>Katapulte</b> und <b>Titanen</b>. Dort wählst du eine Einheit und entwickelst sie in 5 Stufen weiter – das gilt sofort für alle Einheiten dieses Typs, auch für die schon aufgestellten. Auf Stufe 3 entscheidest du dich für eine von zwei Richtungen (z. B. Ritter → Chevalier mit extralanger Lanze oder Schwerer Ritter; Tribok → explosive Geschosse oder Riesenkugeln). So spezialisierst du dein Heer auf wenige starke Einheiten.</p>
    <p>Jede Stufe sieht man: goldene Steine am Sockel zählen die Stufen, neue Ausrüstung (Helm, Lanze, größerer Schild, zweites Schwert, Brandpfeile, Sprengbomben …), ab Stufe 4 schwarze Rüstung und auf Stufe 5 eine goldene Aura.</p>
    <h3>Einzel-Verbesserungen ⬆</h3>
    <p>Wähle eine eigene Einheit und tippe „⬆ Verbessern“: Diese Verbesserungen gelten nur für genau diese eine Einheit – verbesserte Einheiten erkennst du an schimmernden Sternen über dem Kopf: 1 Stern = verbessert, 2 Sterne = Angriff, Verteidigung, Leben oder Durchschlag auf Stufe 3, 3 violette Sterne = alles voll freigeschaltet. <b>Angriff</b> (+1 / +2 / +3), <b>Verteidigung</b> (+5 / +10 / +15 %), <b>Leben</b> (+3 / +6 / +10) und <b>Durchschlag</b> (10 / 20 / 30) haben je 3 Stufen; jede Stufe kostet ${BOOST_COST.join(' / ')} % des Kaufpreises der Einheit – also etwas weniger als eine neue. Dazu kommen <b>Fähigkeiten</b> (je ${SKILL_COST} % des Kaufpreises):<br>
    Nahkämpfer: 💚 Selbstheilung (10 % des Lebens pro Runde), 🪨 Stellung halten (+20 % Verteidigung, wenn sie in ihrem Zug nicht gezogen ist).<br>
    Fernkämpfer (Schütze, Basilisk): 🏹 Weitschuss (+1 Reichweite), 🎯 Fernschuss (+2), 🔥 Brandpfeile (Nachbarn des Ziels bekommen 25 % des Schadens), 💚 Selbstheilung.<br>
    Zauberer: ❄️ Vereisen (ein Gegner bis 3 Felder weit setzt eine Runde aus, Titanen sind immun), ✨ Flächenheilung (beim Heilen bekommen die eigenen Nachbarn des Ziels 25 % ihres Lebens zurück), 💣 Bergsprengung (ein Gebirge bis 3 Felder weit wird zu begehbarem Lehm).<br>
    Katapulte, Triboke und Titanen haben keine Fähigkeiten, nur Werte. Alle Werte im Spiel sind ganze Zahlen.</p>
    <h3>Greifenreiter 🦅</h3>
    <p>Ein Ritter auf einem Greifen: gleiche Kampfwerte wie der Ritter, aber er fliegt über Berge, Seen und eigene Einheiten. Er ist teurer und braucht ebenfalls eine Kaserne.</p>
    <h3>Tribok</h3>
    <p>Die schwerste Wurfmaschine: trifft aus bis zu 5 Feldern präzise ein einzelnes Feld mit vollem Schaden (kein Flächenschaden, kein Abschlag gegen Truppen), kann aber nicht auf direkte Nachbarn schießen und nicht nach einer Bewegung. Braucht eine Werkstatt und die Forschung <b>Gegengewicht</b> (nach Ballistik), ohne Mengenbegrenzung, Unterhalt 1 Nahrung + 1 Holz. Ideal, um Burgverteidiger aus sicherer Entfernung zu treffen.</p>
    <h3>Basilisk 🦎</h3>
    <p>Eine Riesenechse mit tödlichem Blick: Sie greift aus 2 Feldern an, und wer getroffen wird und überlebt, <b>versteinert</b> – er setzt seinen nächsten Zug aus und schlägt bis dahin nicht zurück (grau dargestellt). Troll, Drache, Türme und Wälle sind immun. Ideal, um einen starken Gegner festzuhalten, während deine Armee angreift. Braucht ein Basiliskennest (Stadt ab Stufe 2), höchstens 2 pro Reich.</p>
    <h3>Drache 🐉</h3>
    <p>Der mächtigste Titan: Er fliegt über Berge, Seen und eigene Einheiten hinweg (nicht über Gegner, und er landet nur auf freien Feldern), und sein Feueratem trifft auch die Gegner auf den 2 Feldern hinter dem Ziel (75 % und 50 %). Er ist ein Endgegner und kostet je 300 Nahrung, Holz und Erz – bei jeder Stufe wählst du aus drei Spezialisierungen. Schwachstelle: Schützen und Türme treffen ihn um 60 % härter. Er braucht eine Drachenhöhle (in jeder Stadt baubar, aber nur eine im Reich – ein kleiner Drache auf dem Stadtturm zeigt, wo sie steht), und es gibt nur einen Drachen pro Reich.</p>
    <h3>Feuersturm 🔥</h3>
    <p>Der Drache hat einen Großangriff: Wähle ihn, tippe „🔥 Feuersturm“ und dann ein markiertes Feld für die Flugrichtung. Er überfliegt 4 Felder in einer Linie samt den Nachbarfeldern links und rechts (3/4/3 = 10 Felder) und brennt alles nieder: Jeder Gegner dort bekommt ${Math.round(STORM.dmg * 100)} % eines normalen Drachenangriffs, ohne Gegenschlag. Danach kehrt er auf sein Feld zurück. Die Felder brennen bis zu deinem nächsten Zug weiter – wer dort seinen Zug beginnt, verliert ${STORM.burnBase} + ${Math.round(STORM.burnPct * 100)} % seines Lebens. Der Feuersturm verbraucht den ganzen Zug (der Drache darf vorher nicht ziehen) und geht nur alle ${STORM.cooldown} Runden.</p>
    <h3>Geräusche 🔊</h3>
    <p>Kampf, Bewegung und Ereignisse sind zu hören, im Hintergrund je nach Kartenausschnitt Meeresrauschen, plätschernde Seen, Wind über den Bergen, Vögel im Wald und das Treiben der Städte. Alles wird im Gerät erzeugt und funktioniert offline. Lautstärke und Umgebung stellst du im Menü unter Einstellungen ein.</p>
    <h3>Wache halten 💤</h3>
    <p>Eine Einheit auf Wache wird nicht mehr als „bereit“ angezeigt und nicht von „Nächste Einheit“ ausgewählt, bis du sie wieder bewegst oder ein Gegner auf 3 Felder herankommt.</p>
    <h3>Schwierigkeit</h3>
    <p>${DIFFICULTIES.map((d) => `<b>${d.level} ${d.name}</b>: ${d.desc}`).join('<br>')}</p>`;
}

// ---------------------------------------------------------------- Verdrahtung
$('btnCampaign').addEventListener('click', () => {
  const stars = store.progress().stars;
  const next = getLevels().find((l) => !stars[l.id]);
  currentWorld = next ? next.world : 0;
  renderLevels();
  showScreen('scrLevels');
});
$('btnSkirmish').addEventListener('click', () => { renderSetup(); showScreen('scrSetup'); });
$('btnHelp').addEventListener('click', () => { renderHelp(); showScreen('scrHelp'); });
$('btnSettings').addEventListener('click', () => openSettings(() => { if (!$('scrLevels').classList.contains('hidden')) renderLevels(); }));
$('btnLoad').addEventListener('click', () => openSlots('load'));
// Kartennebel: ein Schalter für Kampagne und Freies Spiel (gilt für neue Spiele)
function updateFogBtn() { $('btnFog').textContent = `🌫️ Nebel: ${settings.fog ? 'An' : 'Aus'}`; $('btnFog').classList.toggle('primary', !!settings.fog); }
$('btnFog').addEventListener('click', () => {
  settings.fog = !settings.fog;
  store.saveSettings(settings);
  updateFogBtn();
  toast(settings.fog ? '🌫️ Nebel an: Du siehst nur, was deine Einheiten und Städte sehen (gilt für neue Spiele).' : 'Nebel aus.', 3000);
});
updateFogBtn();
$('btnContinue').addEventListener('click', () => {
  const g = store.savedGame();
  if (!loadable(g)) { store.clearGame(); $('btnContinue').classList.add('hidden'); return; }
  S = migrateState(g);
  enterGame();
});
$('btnMenu').addEventListener('click', gameMenu);
$('panelX').addEventListener('click', () => { clearSel(); refresh(); });
$('btnTech').addEventListener('click', openTech);
$('btnUndo').addEventListener('click', undo);
$('btnTip').addEventListener('click', showAdvice);
$('btnNext').addEventListener('click', nextUnit);
$('btnEnd').addEventListener('click', onEndTurn);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') sound.suspend();
  else if (sound.ctx) sound.unlock();
  if (document.visibilityState === 'hidden' && S && !busy && humanTurn()) saveGame();
});

showScreen('scrMenu');

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.match(/^(localhost|127\.)/)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Für Tests/Debugging
window.__hex = { get state() { return S; }, get sel() { return sel; }, R };
