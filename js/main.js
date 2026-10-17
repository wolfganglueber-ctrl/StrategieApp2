// Steuerung: Menüs, Spielablauf, Eingaben, Animationen der Ereignisse.
import { Renderer } from './render.js';
import { attachInput } from './input.js';
import {
  createGame, applyAction, cloneState, getHealTargets, healAmount, auraRadius, inAura, buildOcc, getMoves, getTargets, computeCombat, canMove, canAttack, cityOn,
  incomeOf, unitCount, upkeepTotal, playerHasActions, unitById, cityYield, computeTerritory, STATE_VERSION, canRecruit,
  tradeRate, tradeCost, spawnSpots, statsOf, visibility, isStructure, canBuildTower, towersOfCity, techAvailable, hasTech, upgradeCostOf,
  perkOptions, canTrain, flankers, canBuild, mergeTargets, canSplit, castleOf, defenseMult,
} from './game.js';
import { planAction } from './ai.js';
import { getGeo } from './hex.js';
import {
  UNITS, UNIT_ORDER, TERRAIN, PLAYER_COLORS, NEUTRAL_COLOR, DIFFICULTIES, MAP_SIZES, BIOMES, CITY_MAX_LEVEL,
  upgradeCost, cityDefense, citySupply, canAfford, RES, RES_INFO, BUILDINGS, BUILDING_ORDER, CITY_NAMES, citySlots,
  hasBuilding, TECHS, TECH_ORDER, TECH_BRANCHES, TOWER_LEVELS, TOWER_UPGRADE, TOWERS_PER_CITY, STRUCTURE_LIMIT, structureLimit,
  RANK_NAMES, RANK_XP, MAX_RANK, PERKS, PERK_CHOICES, PERK_RANKS, trainCost, moveCap, TRADE_RATE,
} from './data.js';
import { getLevels, getWorldNames, starsFor } from './levels.js';
import { store } from './storage.js';
import { randomSeedCode, seedFromCode } from './rng.js';
import { sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const canvas = $('board');
const R = new Renderer(canvas);
let S = null;
let settings = store.settings();
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
    $('btnContinue').classList.toggle('hidden', store.savedGame()?.v !== STATE_VERSION);
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
    seed: level.seed, cols: level.cols, rows: level.rows, biome: level.biome, fog: !!settings.fogCampaign,
    players: [{ human: true }, ...level.ais.map((ai) => ({ ai }))],
  };
}

function startLevel(level) {
  S = createGame(levelConfig(level));
  S.meta = { mode: 'level', levelId: level.id };
  enterGame();
  if (level.id === 1 || !store.progress().seenIntro) showIntro();
}

function startSkirmish(setup) {
  const size = MAP_SIZES[setup.size];
  let biome = setup.biome;
  const code = setup.code;
  if (biome === 'random') {
    const keys = Object.keys(BIOMES);
    biome = keys[seedFromCode(code) % keys.length];
  }
  S = createGame({
    seed: seedFromCode(code), cols: size.cols, rows: size.rows, biome, fog: !!setup.fog,
    players: [{ human: true }, ...Array.from({ length: setup.enemies }, () => ({ ai: setup.diff }))],
  });
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
  clearSel();
  R.viewPad = { top: 100, bottom: 160 };
  const human = S.players.find((p) => p.human);
  const cap = S.cities.find((c) => c.owner === human?.id && c.capital) || S.cities.find((c) => c.owner === human?.id);
  R.setState(S, true, cap?.idx);
  updateHud();
  saveGame();
  if (!S.players[S.current].human) runAI();
  else refresh();
}

function saveGame() {
  if (S && !S.over) store.saveGame(S);
}

// ---------------------------------------------------------------- Auswahl & Overlay
function clearSel() {
  sel = { unitId: null, cityIdx: null, infoIdx: null, placeTower: null, placeType: 'tower', group: null, merge: false };
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
  refresh();
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
      // Fähigkeit wählbar oder Ausbilden möglich: Einheit schimmert
      if (perkOptions(u).length || !canTrain(S, u)) (o.upgrade ||= new Set()).add(u.id);
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
      if (t.length) {
        o.targets = new Map();
        for (const x of t) {
          const r = computeCombat(S, u, x);
          o.targets.set(x.idx, { idx: x.idx, dmg: r.dmg, counter: r.counter, kill: r.kill, die: r.die });
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
  if (sel.merge && u) {
    o.moves = null;
    o.targets = null;
    o.merges = new Set(mergeTargets(S, u).map((x) => x.idx));
  }
  if (sel.cityIdx != null) o.cityIdx = sel.cityIdx;
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
  hoverUnit = null;
  if (!humanTurn()) return;
  const i = R.pick(sx, sy);
  if (i < 0) { clearSel(); refresh(); return; }
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
  // Verband bilden: nur violett markierte Nachbarn, mit Rückfrage
  if (sel.merge) {
    const from = unitById(S, sel.unitId);
    if (from && u && mergeTargets(S, from).includes(u)) { doMerge(from, u); return; }
    sel.merge = false;
    toast('Verband bilden abgebrochen.');
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
  clearSel();
  if (c && c.owner === S.current && !u) { if (sel.cityIdx !== i) cityTab = 'units'; sel.cityIdx = i; }
  else sel.infoIdx = i;
  refresh();
}

// Einheiten-Info im Panel unten: Mouse-over am PC, langes Drücken auf dem Handy
function unitStatsText(u, isPreview) {
  const st = statsOf(S, u);
  const hp = isPreview ? st.hp : `${u.hp}/${st.hp}`;
  return `❤ ${hp} · ⚔ ${fmt(st.atk)} · 🛡 ${fmt(st.def)} · 👣 ${st.move} · 🎯 ${st.range}`;
}

function unitNotes(u) {
  const notes = [UNITS[u.type].desc];
  if (u.shaken) notes.push('⭐ Erschüttert: halbe Verteidigung, kein Gegenschlag.');
  if (u.stone) notes.push('🪨 Versteinert: setzt den nächsten Zug aus und schlägt nicht zurück.');
  else if (u.stoneNow) notes.push('🪨 Versteinert: setzt diesen Zug aus.');
  if (inAura(S, u)) notes.push('🛡 Schutzaura: 25 % weniger Schaden, Flächenschaden halbiert.');
  if (UNITS[u.type].healer) notes.push(`Heilt ${healAmount(S, u)} Leben bis 3 Felder weit.`);
  if (!UNITS[u.type].structure) {
    const r = u.rank || 1;
    notes.push(r < MAX_RANK ? `Erfahrung ${u.xp || 0}/${RANK_XP[r + 1]} bis ${RANK_NAMES[r + 1]}.` : 'Höchster Rang.');
  }
  for (const p of u.perks || []) notes.push(`${PERKS[p].icon} ${PERKS[p].name}: ${PERKS[p].desc}.`);
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

function onHover(x, y) {
  if (!S || $('hud').classList.contains('hidden') || sel.cityIdx != null || sel.placeTower != null) return;
  // Solange eine Einheit gewählt ist, bleibt ihr Panel stehen (sonst wechselt es beim Weg zu den Knöpfen)
  if (sel.unitId != null || sel.group) { if (hoverUnit != null) setHover(null); return; }
  setHover(unitAtScreen(x, y));
}

let holdTimer = null;
function onHold(x, y) {
  const u = unitAtScreen(x, y);
  if (!u || sel.cityIdx != null) return;
  vibrate(15);
  setHover(u);
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => setHover(null), 4000);
}

attachInput(canvas, R, onTap, onHold, onHover);

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

async function doDisband(u) {
  const name = `${UNITS[u.type].name}${(u.count || 1) > 1 ? ` ×${u.count}` : ''}`;
  const ok = await confirmDialog(`${name} entlassen?`, 'Die Einheit wird aufgelöst. Rohstoffe gibt es dafür nicht zurück.', 'Entlassen', 'Behalten');
  if (ok) act({ type: 'disband', unitId: u.id }, { after: () => clearSel() });
}

async function doRaze(u) {
  const ok = await confirmDialog(`${UNITS[u.type].name} abreißen?`, 'Du bekommst die Hälfte der Baukosten zurück.', 'Abreißen', 'Behalten');
  if (ok) act({ type: 'raze', unitId: u.id }, { after: () => clearSel() });
}

async function doMerge(u, t) {
  const total = (u.count || 1) + (t.count || 1);
  const ok = await confirmDialog('Verband bilden?',
    `${UNITS[u.type].name} und ${UNITS[t.type].name} werden zu einem Verband aus ${total} Einheiten zusammengelegt. Beide haben damit diesen Zug verbraucht. Aufteilen geht in einer späteren Runde wieder.`,
    'Zusammenlegen', 'Abbrechen');
  if (!ok) { sel.merge = false; refresh(); return; }
  act({ type: 'merge', unitId: u.id, targetId: t.id }, { after: () => clearSel() });
}

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
function openTech() {
  if (!S || busy) return;
  const draw = () => {
    const pid = humanId();
    const p = S.players[pid];
    const my = humanTurn();
    const tabs = el('div', { class: 'ptabs' });
    for (const [k, label] of TECH_BRANCHES) {
      const done = TECH_ORDER.filter((t) => TECHS[t].branch === k && hasTech(S, pid, t)).length;
      const all = TECH_ORDER.filter((t) => TECHS[t].branch === k).length;
      tabs.append(el('button', { class: techBranch === k ? 'active' : '', onclick: () => { techBranch = k; draw(); } }, `${label} ${done}/${all}`));
    }
    const list = el('div', { class: 'tech-list' });
    for (const t of TECH_ORDER.filter((x) => TECHS[x].branch === techBranch)) {
      const T = TECHS[t];
      const done = hasTech(S, pid, t);
      const avail = techAvailable(S, pid, t);
      const reqTxt = T.req.length ? `benötigt ${T.req.map((r) => TECHS[r].name).join(' + ')}` : '';
      list.append(el('div', { class: 'tech-card' + (done ? ' done' : avail ? '' : ' locked') + (T.req.length ? ' child' : '') },
        el('span', { class: 'ticon' }, T.icon),
        el('div', { class: 'binfo' }, el('b', {}, T.name), el('span', {}, T.desc), reqTxt ? el('span', { class: 'muted' }, (avail || done ? '↳ ' : '🔒 ') + reqTxt) : null),
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
    if (!give || give === get) give = RES.filter((k) => k !== get).sort((a, b) => p.res[b] - p.res[a])[0];
    if (!get || get === give) get = RES.find((k) => k !== give);
    const max = Math.floor(p.res[give] / rate + 1e-9);
    n = Math.max(0, Math.min(n, max));
    if (n === 0 && max > 0) n = 1;
    const row = (label, cur, onPick) => el('div', { class: 'trade-row' }, el('span', { class: 'muted' }, label),
      ...RES.map((k) => el('button', { class: 'tchip' + (cur === k ? ' active' : ''), onclick: () => { onPick(k); draw(); } }, icon(k), el('b', {}, p.res[k]))));

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
      el('p', {}, rate === TRADE_RATE ? 'Kurs 2 : 1 · mit der Handelsgilde 3 : 2' : 'Kurs 3 : 2 (Handelsgilde)'),
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
  const u = S.units.find((x) => x.owner === S.current);
  if (u) R.ensureVisible(u.idx);
}

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
        if (ev.died) R.ghost({ ...att }, L + 450 * f, (L + 120 * f) / (L + 450 * f), def.idx);
        else R.lunge(att.id, att.idx, def.idx, L, ranged, ev.advance != null);
        if (ev.killed) R.ghost({ ...def, hp: 0 }, hit + 420 * f, hit / (hit + 420 * f));
        else R.shake(def.id, def.idx, 300 * f, hit);
        R.floatText(def.idx, `−${ev.dmg}`, '#fecaca', 900 * f, hit);
        if (ev.stone) {
          R.floatText(def.idx, 'versteinert!', '#d6d3d1', 1200 * f, hit + 350 * f);
          sound.play('petrify', { pan: panOf(def.idx), vol: isAI === 'quiet' ? 0.6 : 1, delay: hit / 1000 + 0.1 });
        } else if (ev.shaken) R.floatText(def.idx, 'erschüttert!', '#fde68a', 1100 * f, hit + 350 * f);
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
      if (unitById(S, ev.id)?.owner === humanId()) R.floatText(ev.idx, '🪨 setzt aus', '#d6d3d1', 900);
      break;
    case 'defect':
      if (f > 0) R.ring(ev.idx, PLAYER_COLORS[ev.pid].main, 600 * f);
      break;
    case 'merge':
      if (f > 0) R.ring(ev.idx, '#c084fc', 600 * f);
      R.floatText(ev.idx, `Verband ×${ev.count}`, '#e9d5ff', 1100 * Math.max(f, 0.6));
      sound.play('drum', { pan: panOf(ev.idx), vol: isAI ? 0.4 : 0.8 });
      await pause(isAI ? 200 : 120);
      break;
    case 'split':
      R.floatText(ev.idx, 'aufgeteilt', '#e9d5ff', 900 * Math.max(f, 0.6));
      await sleep(R.pop(ev.id, 300 * f));
      break;
    case 'eliminated':
      toast(`${S.players[ev.pid].name} wurde besiegt!`);
      sound.play('lowhorn');
      await pause(600);
      break;
    case 'turn':
      if (S.players[ev.pid].human) { hideBanner(); sound.play('bell'); }
      break;
    case 'income':
      updateHud();
      break;
  }
}

// ---------------------------------------------------------------- HUD & Panel
const ICONS = {
  food: '<svg viewBox="0 0 16 16"><path d="M8 15.5V4" stroke="#a16207" stroke-width="1.4" fill="none"/><ellipse cx="8" cy="3.6" rx="1.7" ry="2.8" fill="#fcd34d"/><ellipse cx="5.4" cy="7.4" rx="1.4" ry="2.6" transform="rotate(-32 5.4 7.4)" fill="#facc15"/><ellipse cx="10.6" cy="7.4" rx="1.4" ry="2.6" transform="rotate(32 10.6 7.4)" fill="#facc15"/><ellipse cx="5.6" cy="11.2" rx="1.3" ry="2.4" transform="rotate(-32 5.6 11.2)" fill="#eab308"/><ellipse cx="10.4" cy="11.2" rx="1.3" ry="2.4" transform="rotate(32 10.4 11.2)" fill="#eab308"/></svg>',
  wood: '<svg viewBox="0 0 16 16"><rect x="0.8" y="4.5" width="12.5" height="7.5" rx="3.7" fill="#9a5b2a"/><path d="M2.5 7h7M3.5 9.6h6" stroke="#6b3a15" stroke-width="0.9"/><ellipse cx="12.4" cy="8.25" rx="2.8" ry="3.7" fill="#e8b47c" stroke="#7a451c" stroke-width="0.9"/><ellipse cx="12.4" cy="8.25" rx="1.2" ry="1.7" fill="none" stroke="#b9773d" stroke-width="0.7"/></svg>',
  ore: '<svg viewBox="0 0 16 16"><path d="M1.5 13 3.8 6.2 8 2.8 12.8 5.6 14.6 13Z" fill="#9aa1ab"/><path d="M8 2.8 12.8 5.6 14.6 13H8.8Z" fill="#6b727c"/><path d="M5 9.5 6.4 8 7.6 9.4 6.2 10.9Z" fill="#7dd3fc"/><path d="M10 7.5 11 6.6 11.8 7.8 10.8 8.6Z" fill="#7dd3fc"/></svg>',
  atk: '<svg viewBox="0 0 16 16"><path d="M3 13 12.5 3.5" stroke="#e5e7eb" stroke-width="2.2" stroke-linecap="round"/><path d="M2 9.5 6.5 14" stroke="#d4a017" stroke-width="2" stroke-linecap="round"/></svg>',
  def: '<svg viewBox="0 0 16 16"><path d="M8 1.5 13.5 3.5V8c0 3.2-2.4 5.4-5.5 6.5C4.9 13.4 2.5 11.2 2.5 8V3.5Z" fill="#93c5fd" stroke="#1e3a8a" stroke-width="1"/></svg>',
  move: '<svg viewBox="0 0 16 16"><path d="M3 9h7l-2.5-3M10 9l-2.5 3" stroke="#e5e7eb" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 4v10" stroke="#e5e7eb" stroke-width="1.8" stroke-linecap="round"/></svg>',
  range: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="#fca5a5" stroke-width="1.5"/><circle cx="8" cy="8" r="2.6" fill="none" stroke="#fca5a5" stroke-width="1.5"/><circle cx="8" cy="8" r="0.9" fill="#fca5a5"/></svg>',
};
const icon = (k) => el('i', { class: 'ico', html: ICONS[k] });

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
  const inc = incomeOf(S, human.id);
  const bar = $('resBar');
  bar.innerHTML = '';
  for (const k of RES) {
    const up = upkeepTotal(S, human.id)[k];
    bar.append(el('button', { class: 'pill', title: `${RES_INFO[k].name}: Ertrag pro Runde nach Abzug von ${up} Unterhalt für die Armee – tippen zum Handeln`, onclick: () => openTrade(k) },
      icon(k), el('b', {}, human.res[k]), el('small', { class: inc[k] < 0 ? 'neg' : '' }, inc[k] < 0 ? `${inc[k]}` : `+${inc[k]}`)));
  }
  $('unitText').textContent = `${unitCount(S, human.id)}`;
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
  $('btnEnd').classList.toggle('pulse', my && !busy && !playerHasActions(S, S.current));
}

function iconCanvas(type, owner, px = 44, level) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(px * dpr);
  c.style.width = c.style.height = px + 'px';
  c.className = 'fig';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  R.drawPreview(ctx, type, owner, px / 2, type === 'tower' ? px * 0.8 : px * 0.62, type === 'tower' ? px * 0.8 : px, level);
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

function statRow(u) {
  const T = statsOf(S, u);
  return el('div', { class: 'stats-row' },
    el('span', { title: 'Angriff' }, icon('atk'), fmt(T.atk)),
    el('span', { title: 'Verteidigung' }, icon('def'), fmt(T.def)),
    T.move ? el('span', { title: 'Bewegung' }, icon('move'), T.move) : null,
    el('span', { title: 'Reichweite' }, icon('range'), T.range));
}

function rankText(u) {
  const r = u.rank || 1;
  return `${'★'.repeat(r - 1)}${r > 1 ? ' ' : ''}${RANK_NAMES[r]}`;
}

function unitCard(u, subtitle) {
  const name = u.type === 'tower' ? `Turm · Stufe ${u.level}` : UNITS[u.type].structure ? UNITS[u.type].name : `${UNITS[u.type].name}${(u.count || 1) > 1 ? ` ×${u.count}` : ''} · ${rankText(u)}`;
  return el('div', { class: 'unit-card' },
    iconCanvas(u.type, u.owner, 48, u.level),
    el('div', { class: 'uc-main' },
      el('div', { class: 'uc-top' }, el('span', { class: 'title' }, name), hpBar(u)),
      el('div', { class: 'uc-bottom' }, el('span', { class: 'muted' }, subtitle), statRow(u))));
}

function cityTitle(c) {
  return `${c.capital ? 'Hauptstadt' : CITY_NAMES[c.level]} · Stufe ${c.level}`;
}

function tileInfo(i) {
  const c = cityOn(S, i);
  if (c) return `${cityTitle(c)} · Verteidigung ×${fmt(cityDefense(c, hasTech(S, c.owner, 'stonework')))}`;
  return TERRAIN[S.terrain[i]].name;
}

let cityTab = 'units';
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
  // 1. Erschütterte Gegner angreifen
  for (const u of canStill) {
    if (UNITS[u.type].range > 1) continue;
    const reach = canMove(u) ? [u.idx, ...getMoves(S, u, occ).keys()] : [u.idx];
    for (const f of reach) {
      for (const j of geo.nb[f]) {
        const e = occ[j];
        if (e && e.owner !== pid && e.shaken && canAttack(u)) return { text: `Ein Gegner ist erschüttert ⭐ – greife ihn jetzt mit deinem ${UNITS[u.type].name} an: kein Gegenschlag!`, unit: u.id };
      }
    }
  }
  // 2. Fernkämpfer zuerst
  const shooter = canStill.find((u) => !UNITS[u.type].structure && statsOf(S, u).range > 1 && canAttack(u) && (unitTargets(u, occ).length || canMove(u) && [...getMoves(S, u, occ).keys()].some((f) => getTargets(S, u, f, occ).length)));
  if (shooter) return { text: `Lass zuerst deinen ${UNITS[shooter.type].name} schießen: Getroffene Gegner sind erschüttert und wehren sich nicht.`, unit: shooter.id };
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
    if (c.buildings.length >= citySlots(c)) continue;
    const ci = S.cityAt[c.idx];
    let rocks = 0, forests = 0;
    for (let i = 0; i < territory.length; i++) {
      if (territory[i] !== ci) continue;
      if (S.terrain[i] === 'hill' || S.terrain[i] === 'mountain') rocks++;
      if (S.terrain[i] === 'forest') forests++;
    }
    const pick = !hasBuilding(c, 'mine') && rocks && inc.ore <= inc.wood ? 'mine'
      : !hasBuilding(c, 'lumber') && forests > 1 ? 'lumber'
      : !hasBuilding(c, 'barracks') && c.capital ? 'barracks'
      : !hasBuilding(c, 'farm') ? 'farm' : null;
    if (pick && canAfford(p.res, BUILDINGS[pick].cost)) {
      return { text: `Freier Bauplatz: Baue in deiner ${c.capital ? 'Hauptstadt' : CITY_NAMES[c.level]} ${BUILDINGS[pick].art} ${BUILDINGS[pick].name} (${BUILDINGS[pick].desc}).`, city: c.idx, tab: 'build' };
    }
  }
  const up = S.cities.find((c) => c.owner === pid && c.level < CITY_MAX_LEVEL && canAfford(p.res, upgradeCost(c)));
  if (up) return { text: `Du kannst eine Stadt zur ${CITY_NAMES[up.level + 1]} ausbauen: mehr Bauplätze und Rohstoffe.`, city: up.idx, tab: 'build' };
  // 5. Rekrutieren
  const rc = S.cities.find((c) => c.owner === pid && UNIT_ORDER.some((k) => !canRecruit(S, pid, S.cityAt[c.idx], k)));
  if (rc) return { text: 'Rekrutiere Einheiten: Mische Fernkämpfer (Schützen) und Nahkämpfer.', city: rc.idx, tab: 'units' };
  // 6. Handel
  const rate = tradeRate(S, pid);
  const low = RES.slice().sort((a, b) => p.res[a] - p.res[b])[0];
  const high = RES.slice().sort((a, b) => p.res[b] - p.res[a])[0];
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
  for (const [k, label] of [['units', 'Einheiten'], ['build', `Gebäude ${c.buildings.length}/${citySlots(c)}`]]) {
    tabs.append(el('button', { class: cityTab === k ? 'active' : '', onclick: () => { cityTab = k; renderPanel(); } }, label));
  }
  panel.append(tabs);
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
    const list = el('div', { class: 'build-list' });
    for (const [type, text] of [
      ['tower', 'Auf einem Feld im Stadtgebiet, schießt auf Gegner. 3 Ausbaustufen. Belegt keinen Bauplatz.'],
      ['barrier', 'Sehr stabiles Wallstück, blockiert den Weg. Mehrere nebeneinander bilden eine Mauer, die Gegner umgehen müssen.'],
    ]) {
      const nt = towersOfCity(S, ci, undefined, type), max = structureLimit(S.cities[ci], type);
      list.append(el('div', { class: 'build-row tower-row' },
        el('span', { class: 'bicon' }, iconCanvas(type, p.id, 56, 1)),
        el('div', { class: 'binfo' }, el('b', {}, `${UNITS[type].name} (${nt}/${max})`), el('span', { class: 'muted' }, text)),
        el('button', {
          class: 'btn small', disabled: nt >= max || !canAfford(p.res, UNITS[type].cost),
          onclick: () => { clearSel(); sel.placeTower = ci; sel.placeType = type; refresh(); },
        }, costEl(UNITS[type].cost, p.res))));
    }
    for (const b of BUILDING_ORDER) {
      const B = BUILDINGS[b];
      const built = hasBuilding(c, b);
      const realm = !built && canBuild(S, p.id, c, b) === 'realm';
      list.append(el('div', { class: 'build-row' + (built ? ' built' : realm ? ' realm' : '') },
        el('span', { class: 'bicon' }, B.icon),
        el('div', { class: 'binfo' }, el('b', {}, B.name), el('span', { class: 'muted' }, B.desc)),
        built ? el('span', { class: 'built-actions' }, el('span', { class: 'done' }, '✓'),
          el('button', { class: 'btn small raze', title: 'Abreißen (halbe Kosten zurück)', onclick: () => doDemolish(c.idx, b) }, '🗑'))
          : canBuild(S, p.id, c, b) === 'level' ? el('span', { class: 'lock' }, `🔒 ab Stufe ${B.minLevel}`)
          : canBuild(S, p.id, c, b) === 'realm' ? el('span', { class: 'lock' }, '🔒 schon im Reich')
          : el('button', { class: 'btn small', disabled: !!canBuild(S, p.id, c, b), onclick: () => doBuild(c.idx, b) }, costEl(B.cost, p.res))));
    }
    panel.append(list);
    if (c.level < CITY_MAX_LEVEL) {
      const cost = upgradeCostOf(S, c);
      panel.append(el('div', { class: 'upgrade-row' },
        el('span', { class: 'muted' }, `Ausbau zur ${CITY_NAMES[c.level + 1]}: +1 Bauplatz, +1 auf alle Rohstoffe`),
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
  if (sel.placeTower != null) {
    panel.append(el('div', { class: 'city-head' },
      el('span', { class: 'title' }, `${UNITS[sel.placeType].name} platzieren`),
      el('button', { class: 'btn small', onclick: () => { clearSel(); refresh(); } }, sel.placeType === 'barrier' ? 'Fertig' : 'Abbrechen')));
    panel.append(el('div', { class: 'note' }, sel.placeType === 'barrier'
      ? `Tippe helle Felder im Stadtgebiet an – Wallstück für Wallstück (${towersOfCity(S, sel.placeTower, undefined, 'barrier')}/${structureLimit(S.cities[sel.placeTower], 'barrier')}).`
      : 'Tippe ein helles Feld im Stadtgebiet an.'));
    return;
  }
  if (sel.merge && sel.unitId != null) {
    const mu = unitById(S, sel.unitId);
    panel.append(el('div', { class: 'city-head' },
      el('span', { class: 'title' }, `🔗 Verband bilden · ${mu ? UNITS[mu.type].name : ''}`),
      el('button', { class: 'btn small', onclick: () => { sel.merge = false; refresh(); } }, 'Abbrechen')));
    panel.append(el('div', { class: 'note' }, 'Tippe eine violett markierte gleiche Einheit direkt daneben an. Vor dem Zusammenlegen fragt das Spiel noch einmal nach.'));
    return;
  }
  if (sel.group) {
    const members = groupUnits();
    const row = el('div', { class: 'group-row' });
    for (const m of members) row.append(el('button', { class: 'gm', title: UNITS[m.type].name, onclick: () => toggleGroupMember(m) }, iconCanvas(m.type, m.owner, 38)));
    panel.append(el('div', { class: 'city-head' },
      el('span', { class: 'title' }, `👥 Gruppe · ${members.length} Einheit${members.length === 1 ? '' : 'en'} · gemeinsam ziehen & angreifen`),
      el('span', { class: 'group-btns' },
        el('button', { class: 'btn small', onclick: () => addNearbyToGroup() }, '+ Umgebung'),
        el('button', { class: 'btn small' + (groupApproach ? ' active' : ''), title: 'Mitglieder rücken zum Angriff heran', onclick: () => { groupApproach = !groupApproach; refresh(); } }, groupApproach ? '⚔ Heranrücken an' : '⚔ Nur aus Stand'),
        el('button', { class: 'btn small', onclick: () => { clearSel(); refresh(); } }, 'Auflösen'))));
    panel.append(row);
    panel.append(el('div', { class: 'note' }, groupApproach
      ? 'Gegner antippen = alle greifen nacheinander an (rücken dafür heran) · helles Feld = alle ziehen · eigene Einheit = hinzufügen/entfernen · anderes leeres Feld = Gruppe auflösen'
      : 'Gegner antippen = alle, die ihn von ihrem Feld aus erreichen, greifen an · Zielfeld = alle ziehen · eigene Einheit = hinzufügen/entfernen'));
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
    if (canMove(u)) status = targets.length ? 'Ziehen oder Ziel antippen' : unitHeals(u).length ? 'Ziehen oder Grün = heilen' : 'Helles Feld = ziehen';
    else if (targets.length) status = 'Rotes Ziel = angreifen';
    else if (unitHeals(u).length) status = 'Grüne Einheit = heilen';
    else status = u.type === 'tower' ? 'Kein Ziel in Reichweite' : u.type === 'barrier' ? 'Blockiert den Weg' : 'Fertig für diese Runde';
    panel.append(unitCard(u, status));
    if (!UNITS[u.type].structure && u.owner === S.current) {
      const opts = perkOptions(u);
      if (opts.length) {
        panel.append(el('div', { class: 'note' }, `⭐ ${RANK_NAMES[u.rank]}! Wähle eine Fähigkeit:`));
        panel.append(el('div', { class: 'perk-row' }, ...opts.map((p) => el('button', { class: 'btn small perk', onclick: () => act({ type: 'perk', unitId: u.id, perk: p }) },
          el('b', {}, `${PERKS[p].icon} ${PERKS[p].name}`), el('span', { class: 'muted' }, PERKS[p].desc)))));
      }
      const why = canTrain(S, u);
      const r = u.rank || 1;
      const actions = el('div', { class: 'unit-actions' },
        el('button', { class: 'btn small', title: 'Alle eigenen Einheiten in der Nähe ziehen und greifen gemeinsam an', onclick: () => groupNearby(u, false) }, '👥 Alle in der Nähe'),
        el('button', { class: 'btn small', title: `Alle ${UNITS[u.type].name} in der Nähe ziehen und greifen gemeinsam an`, onclick: () => groupNearby(u, true) }, `👥 Alle ${UNITS[u.type].name}`),
        el('button', { class: 'btn small' + (u.sentry ? ' active' : ''), onclick: () => act({ type: 'sentry', unitId: u.id }, { after: () => { if (unitById(S, u.id)?.sentry) clearSel(); } }) }, u.sentry ? '💤 Wache beenden' : '💤 Wache halten'));
      if (r < MAX_RANK && (why === null || why === 'cost' || why === 'acted')) {
        actions.append(el('button', { class: 'btn small primary', title: `Ausbilden zum ${RANK_NAMES[r + 1]}`, disabled: !!why, onclick: () => act({ type: 'train', unitId: u.id }, { after: () => clearSel() }) },
          `🎓 ${RANK_NAMES[r + 1]} `, costEl(trainCost(u.type, r), S.players[S.current].res)));
      }
      actions.append(el('button', { class: 'btn small raze', title: 'Einheit auflösen', onclick: () => doDisband(u) }, '🗑 Entlassen'));
      if (mergeTargets(S, u).length) actions.append(el('button', { class: 'btn small merge', onclick: () => { sel.merge = true; refresh(); } }, '🔗 Verband bilden'));
      if (canSplit(S, u)) actions.append(el('button', { class: 'btn small', onclick: () => act({ type: 'split', unitId: u.id }) }, `✂ Aufteilen (${u.count} → ${u.count - 1} + 1)`));
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
      if (castleOf(S, i)) panel.append(el('div', { class: 'note' }, `🏰 Burgfeld: Verteidiger bekommen ×${fmt(defenseMult(S, i))} Verteidigung.`));
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

function openModal(...children) {
  const box = $('modalBox');
  box.innerHTML = '';
  box.append(...children);
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
      const ok = d && d.state?.v === STATE_VERSION;
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
            S = store.slot(n).state;
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
        const text = `Hexkrone – spiel diese Karte: Code ${meta.code} (${MAP_SIZES[meta.setup.size].name}, ${meta.setup.enemies} Gegner, ${DIFFICULTIES[meta.setup.diff - 1].name})`;
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
    el('label', {}, 'Vibration'),
    toggle('vibrate'),
    el('label', {}, 'Zugende bestätigen'),
    toggle('confirmEnd'),
    el('label', {}, 'Türme schießen am Zugende automatisch'),
    seg([[true, 'An'], [false, 'Aus']], settings.towerAuto !== false, (v) => { settings.towerAuto = v; store.saveSettings(settings); }),
    el('label', {}, 'Alle Level freischalten (Testmodus)'),
    toggle('unlockAll'),
    el('label', {}, 'Kartennebel in der Kampagne'),
    toggle('fogCampaign'),
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
  seg('segFog', [[false, 'Aus'], [true, 'An']], 'fog');
  const d = DIFFICULTIES[setup.diff - 1];
  $('diffDesc').textContent = `${d.name}: ${d.desc}`;
  $('seedInput').value = setup.code;
}
$('seedInput').addEventListener('input', (e) => { setup.code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
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
    return `<tr><td>${T.name}</td><td>${T.hp}</td><td>${fmt(T.atk)}</td><td>${fmt(T.def)}</td><td>${T.move}</td><td>${T.range}</td></tr><tr class="sub"><td colspan="6">${costTxt(T.cost)}</td></tr>`;
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
    <b>3. Wachsen:</b> Baue Städte aus (bis Stufe 5): mehr Bauplätze, mehr Ertrag. Jede Stadt besitzt 2 Felder Gebiet rundherum – eroberte Nachbarstädte bilden ein zusammenhängendes Reich.<br>
    <b>4. Armee:</b> Eine <b>Kaserne</b> in Frontstädten lässt neue Einheiten sofort ziehen und ermöglicht Ritter. Fehlt ein Rohstoff, tippe oben auf die Rohstoffleiste und handle.<br>
    <b>5. Angriff:</b> Erst die Fernkämpfer schießen lassen, dann mit Nahkämpfern zuschlagen.</p>
    <h3>Ablauf einer Runde</h3>
    <p>Jede Einheit darf pro Runde einmal ziehen und einmal angreifen (erst ziehen, dann angreifen). Über eigene Einheiten springst du hinweg – das kostet keine Bewegung.
    Du kannst pro Runde beliebig viele Einheiten rekrutieren (begrenzt nur durch Rohstoffe). Sie erscheinen auf freien Feldern im Stadtgebiet und handeln ab der nächsten Runde – mit Kaserne sofort. Jede Einheit kostet aber <b>Unterhalt</b>: 1 Nahrung pro Runde (Basilisk 2, Troll und Drache 3, Katapult 1 Nahrung + 1 Holz). Der Ertrag oben zeigt schon den Betrag nach Abzug – wird er rot, schrumpfen deine Vorräte.
    Einheiten, die noch etwas tun können, haben einen leuchtenden Ring.</p>
    <h3>Gemeinsam angreifen 👥</h3>
    <p>Wähle eine Einheit und tippe auf „👥 Alle in der Nähe“ (alle eigenen Einheiten im Umkreis) oder „👥 Alle Ritter“ usw. (nur gleiche Einheiten im Umkreis); am PC geht auch Shift + Klick. Danach ist der Gruppenmodus aktiv. Weitere eigene Einheiten fügst du per Tipp hinzu oder nimmst sie wieder heraus.
    Ein Tipp auf einen Gegner: Alle greifen nacheinander an und rücken dafür heran (Fernkämpfer zuerst), bis jeder dran war oder das Ziel fällt. Zauberer ziehen mit, greifen aber nicht automatisch an (sie heilen lieber). Die Gruppe bleibt danach gewählt – tippe einfach den nächsten Gegner an. Ein Tipp auf ein hell markiertes Feld bewegt die Gruppe, ein Tipp auf ein anderes leeres Feld (oder „Auflösen“) beendet sie; „Nur aus Stand“ verzichtet aufs Heranrücken.</p>
    <h3>Verbände 🔗</h3>
    <p>Bis zu 3 gleiche Einheiten (Krieger, Schützen, Reiter, Wächter, Ritter, Katapulte) lassen sich zu einem Verband zusammenlegen – dann ziehst du sie mit einem Tipp. Wähle eine Einheit, tippe „🔗 Verband bilden“ und dann eine violett markierte gleiche Einheit direkt daneben; das Spiel fragt vorher nach. Beide dürfen in dieser Runde noch nichts getan haben, das Zusammenlegen verbraucht ihren Zug.
    Ein Verband hat die Lebenspunkte aller Mitglieder und teilt entsprechend mehr Schaden aus; je angeschlagener er ist, desto weniger Figuren stehen auf dem Sockel. Er übernimmt den besten Rang. Aber Vorsicht: Katapulte, Drachenfeuer und „Wüten“ treffen Verbände härter (+25 % je weiterem Mitglied). Mit „✂ Aufteilen“ löst du eine Einheit wieder heraus.</p>
    <h3>Angreifen</h3>
    <p>Wählst du eine Einheit, zeigen rote Felder alle Ziele. Die Blase über dem Ziel nennt den Schaden (↩ = Gegenschlag, ✖ = Ziel wird besiegt). Ein Tipp auf das Ziel greift an.
    Nahkämpfer rücken nach einem Sieg auf das Feld vor.<br>
    <b>Erschüttert ⭐:</b> Wer von einem Fernkämpfer getroffen wird, hat bis zu seinem nächsten Zug nur halbe Verteidigung und schlägt nicht zurück.</p>
    <h3>Städte</h3>
    <p>Steht deine Einheit zu Beginn deines Zuges auf einer fremden Stadt, wird sie erobert – samt Gebäuden; Türme und Steinwälle in ihrem Gebiet wechseln mit auf deine Seite.
    Stufen: ${CITY_NAMES.slice(1).join(' → ')}. Jede Stufe bringt einen Bauplatz und +1 auf alle Rohstoffe.</p>
    <h3>Gebäude</h3>
    <p>${BUILDING_ORDER.map((b) => `${BUILDINGS[b].icon} <b>${BUILDINGS[b].name}</b>: ${BUILDINGS[b].desc}`).join('<br>')}</p>
    <h3>Abreißen 🗑</h3>
    <p>Verbaut? Im Reiter „Gebäude“ hat jedes fertige Gebäude einen 🗑-Knopf: Nach einer Rückfrage wird es abgerissen, der Bauplatz ist wieder frei, und du bekommst die Hälfte der Baukosten zurück. Eigene Türme und Steinwälle reißt du ab, indem du sie antippst. Einheiten, die du nicht mehr brauchst, löst du mit „🗑 Entlassen“ auf – Rohstoffe gibt es dafür nicht zurück.</p>
    <h3>Die Burg 🏰</h3>
    <p>Jede Hauptstadt ist von Anfang an eine große <b>Burg</b> über 7 Felder: der Bergfried in der Mitte und 6 gepflasterte Burgfelder rundherum, umgeben von einer Ringmauer mit Ecktürmen und Torhaus. Auf allen 7 Feldern bekommen Verteidiger den Burgbonus (mindestens doppelte Verteidigung, mit der Forschung Burgausbau +25 %), du kannst also 7 Einheiten in der Burg aufstellen. In der Burg dürfen bis zu 6 Türme und 12 Steinwälle stehen – genug für einen ganzen Wallring 2 Felder vor dem Bergfried.</p>
    <p>Eroberung: Der Bergfried lässt sich erst betreten, wenn auf den 6 Burgfeldern kein Verteidiger mehr steht. Die letzte Burg fällt also nur nach einer großen Schlacht.</p>
    <h3>Türme</h3>
    <p>Im Reiter „Gebäude“ einer Stadt baust du Türme auf ein freies Feld im Stadtgebiet (bis zu ${TOWERS_PER_CITY} pro Stadt). Türme bewegen sich nicht, greifen aber Gegner in Reichweite an und lassen sich in 3 Stufen ausbauen: tippe den Turm an. Hat ein Turm in deinem Zug noch nicht geschossen, feuert er beim Zugende automatisch auf das lohnendste Ziel (sichtbar animiert; in den Einstellungen abschaltbar).</p>
    <h3>Steinwälle 🧱</h3>
    <p>Im Reiter „Gebäude“ einer Stadt setzt du Steinwälle auf freie Felder bis 2 Felder um die Stadt (bis zu 6 pro Stadt). Sie sind sehr stabil (50 Leben, Verteidigung 6), greifen nicht an, versperren aber den Weg: Gegner müssen sie umgehen oder mühsam einreißen – ideal, um Angreifer in die Reichweite deiner Türme und Schützen zu lenken. Nebeneinander gesetzte Wallstücke verbinden sich zu einer Mauer. Katapulte und Belagerer sind gegen sie besonders wirksam.</p>
    <h3>Forschung 🔬</h3>
    <p>Oben rechts öffnest du den Entwicklungsbaum. Jede Forschung gilt für dein ganzes Reich: ${TECH_ORDER.map((t) => `${TECHS[t].icon} ${TECHS[t].name} (${TECHS[t].desc})`).join(', ')}.</p>
    <h3>Kartennebel</h3>
    <p>Optional: Du siehst nur, was deine Einheiten und Städte sehen. Bereits erkundete Gebiete bleiben sichtbar, aber gegnerische Einheiten darin nicht. Die KI unterliegt denselben Regeln.</p>
    <h3>Handel</h3>
    <p>Handeln kannst du erst mit einem <b>Markt</b> in einer deiner Städte (einer pro Reich genügt – in den anderen Städten ist er ausgegraut). Dann tippst du oben auf einen Rohstoff: 2 beliebige Rohstoffe gegen 1 anderen, mit der Forschung <b>Handelsgilde</b> 3 gegen 2.</p>
    <h3>Gelände</h3>
    <p><b>Gebirge</b> und <b>Seen</b> sind unpassierbar (nur der Drache fliegt darüber). Ein <b>Wald</b>feld zu betreten kostet 2 Bewegung statt 1 – ein einzelner Schritt in den Wald geht aber immer. Verteidigungsbonus gibt es nur in Städten.</p>
    <h3>Heilung</h3>
    <p>Einheiten, die eine Runde nichts tun, heilen 2 Lebenspunkte – in der Nähe eigener Städte 4. Zauberer heilen sofort.</p>
    <h3>Einheiten</h3>
    <table><tr><th>Einheit</th><th>❤</th><th>Angr.</th><th>Vert.</th><th>Bew.</th><th>Reichw.</th></tr>${rows}</table>
    <p>Ritter brauchen eine Kaserne, Katapulte und Triboks eine Werkstatt, Zauberer einen Turm der Weisen, der Basilisk ein Basiliskennest, der Schwarze Troll eine Trollhöhle, der Drache eine Drachenhöhle. Das Katapult kann nicht im selben Zug ziehen und angreifen.</p>
    <h3>Zugweite</h3>
    <p>Auch voll entwickelt ziehen Fußtruppen höchstens 4 Felder, Katapulte 3, Reiter und Ritter 6 – auch wenn sie über eigene Einheiten springen.</p>
    <h3>Ränge und Fähigkeiten ★</h3>
    <p>Einheiten sammeln Erfahrung: +1 pro Angriff, +1 pro Sieg, +1 wenn sie einen Angriff überleben. Ränge: ${RANK_NAMES.slice(1).join(' → ')}. Jeder Rang gibt +15 % Leben und +10 % Angriff und Verteidigung, Reiter und Ritter ab Veteran +1 Bewegung, alle Helden +1 Bewegung.
    Steht eine Einheit zu Zugbeginn in einer eigenen Stadt mit Kaserne, kannst du sie gegen Rohstoffe <b>ausbilden</b> (Rang +1). Einheiten, die ausgebildet werden können oder eine Fähigkeit wählen dürfen (bei Veteran und Held), schimmern golden, blinken auf und tragen ein ⬆; gewählte Fähigkeiten erscheinen als kleines Abzeichen neben der Figur: ${Object.values(PERKS).map((p) => `${p.icon} ${p.name} (${p.desc})`).join(', ')}.</p>
    <h3>Zauberer 🔮</h3>
    <p>Eigene Einheiten neben einem Zauberer (blaues Schild-Symbol) bekommen 25 % weniger Schaden, Flächenschaden halbiert. Statt anzugreifen heilt der Zauberer eine eigene Einheit bis 3 Felder entfernt (grün markiert antippen). Höchstens ein Zauberer pro Stadt.</p>
    <h3>Katapult und Flanke</h3>
    <p>Katapulte sind Belagerungswaffen: Gegen Städte, Türme und Wälle machen sie vollen Schaden, gegen Truppen im offenen Feld nur 60 %. Sie treffen auch alle Gegner neben dem Ziel mit halbem Schaden – stelle deine Truppen nicht zu dicht. Gegenmittel: Reiter und Ritter, denn Katapulte haben keine Verteidigung und können nach einer Bewegung nicht schießen. Jede weitere eigene Einheit direkt neben dem Ziel gibt beim Angriff +10 % (höchstens +30 %): Einkesseln lohnt sich.</p>
    <h3>Schwarzer Troll</h3>
    <p>Ein Titan für das späte Spiel: etwa zehnmal so stark wie ein Krieger, heilt jede Runde 3 Leben und kann ebenfalls Ränge sammeln. Er kostet viel und braucht eine Trollhöhle (Stadt ab Stufe 4). Höchstens 5 pro Reich.</p>
    <h3>Tribok</h3>
    <p>Die schwerste Wurfmaschine: trifft aus bis zu 5 Feldern präzise ein einzelnes Feld mit vollem Schaden (kein Flächenschaden, kein Abschlag gegen Truppen), kann aber nicht auf direkte Nachbarn schießen und nicht nach einer Bewegung. Braucht eine Werkstatt und die Forschung <b>Gegengewicht</b> (nach Ballistik), ohne Mengenbegrenzung, Unterhalt 1 Nahrung + 1 Holz. Ideal, um Burgverteidiger aus sicherer Entfernung zu treffen.</p>
    <h3>Basilisk 🦎</h3>
    <p>Eine Riesenechse mit tödlichem Blick: Sie greift aus 2 Feldern an, und wer getroffen wird und überlebt, <b>versteinert</b> – er setzt seinen nächsten Zug aus und schlägt bis dahin nicht zurück (grau dargestellt). Troll, Drache, Türme und Wälle sind immun. Ideal, um einen starken Gegner festzuhalten, während deine Armee angreift. Braucht ein Basiliskennest (Stadt ab Stufe 3), höchstens 2 pro Reich.</p>
    <h3>Drache 🐉</h3>
    <p>Der mächtigste Titan: Er fliegt über Berge, Seen und eigene Einheiten hinweg (nicht über Gegner, und er landet nur auf freien Feldern), sein Feueratem trifft auch Gegner neben dem Ziel, und er heilt jede Runde 6 Leben. Er ist ein Endgegner: etwa fünfmal so stark wie früher, aber zehnmal so teuer – bei Rang 3 und 5 wählst du jeweils aus drei Fähigkeiten. Schwachstelle: Schützen und Türme treffen ihn um 60 % härter. Er braucht eine Drachenhöhle (in jeder Stadt baubar, aber nur eine im Reich – ein kleiner Drache auf dem Stadtturm zeigt, wo sie steht), und es gibt nur einen Drachen pro Reich.</p>
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
$('btnContinue').addEventListener('click', () => {
  const g = store.savedGame();
  if (!g || g.v !== STATE_VERSION) { store.clearGame(); $('btnContinue').classList.add('hidden'); return; }
  S = g;
  enterGame();
});
$('btnMenu').addEventListener('click', gameMenu);
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
window.__hex = { get state() { return S; }, R };
