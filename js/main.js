// Steuerung: Menüs, Spielablauf, Eingaben, Animationen der Ereignisse.
import { Renderer } from './render.js';
import { attachInput } from './input.js';
import {
  createGame, applyAction, cloneState, buildOcc, getMoves, getTargets, computeCombat, canMove, canAttack, cityOn,
  incomeOf, unitCap, unitCount, playerHasActions, unitById, cityYield, computeTerritory, STATE_VERSION,
} from './game.js';
import { planAction } from './ai.js';
import {
  UNITS, UNIT_ORDER, TERRAIN, PLAYER_COLORS, NEUTRAL_COLOR, DIFFICULTIES, MAP_SIZES, BIOMES, CITY_MAX_LEVEL,
  upgradeCost, cityDefense, citySupply, canAfford, RES, RES_INFO,
} from './data.js';
import { getLevels, getWorldNames, starsFor } from './levels.js';
import { store } from './storage.js';
import { randomSeedCode, seedFromCode } from './rng.js';

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
    seed: level.seed, cols: level.cols, rows: level.rows, biome: level.biome,
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
    seed: seedFromCode(code), cols: size.cols, rows: size.rows, biome,
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
  sel = { unitId: null, cityIdx: null, infoIdx: null };
}

function humanTurn() {
  return S && !S.over && S.players[S.current].human;
}

function unitTargets(u, occ) {
  return canAttack(u) ? getTargets(S, u, u.idx, occ) : [];
}

function refresh() {
  if (!S) return;
  const occ = buildOcc(S);
  const o = { exhausted: new Set(), ready: new Set() };
  if (humanTurn() && !busy) {
    for (const u of S.units) {
      if (u.owner !== S.current) continue;
      if (!canMove(u) && unitTargets(u, occ).length === 0) o.exhausted.add(u.id);
      else o.ready.add(u.id);
    }
  }
  const u = sel.unitId != null ? unitById(S, sel.unitId) : null;
  if (u) {
    o.selected = u.idx;
    if (humanTurn() && u.owner === S.current) {
      if (canMove(u)) o.moves = new Set(getMoves(S, u, occ).keys());
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
  if (sel.cityIdx != null) o.cityIdx = sel.cityIdx;
  if (sel.infoIdx != null) o.selected = sel.infoIdx;
  R.overlay = o;
  R.invalidate();
  renderPanel();
  updateHud();
}

function onTap(sx, sy) {
  if (!S || busy || $('hud').classList.contains('hidden')) return;
  if (!humanTurn()) return;
  const i = R.pick(sx, sy);
  if (i < 0) { clearSel(); refresh(); return; }
  const occ = buildOcc(S);
  const u = occ[i];
  const selU = sel.unitId != null ? unitById(S, sel.unitId) : null;
  if (selU && selU.owner === S.current) {
    if (u && u.owner !== S.current && unitTargets(selU, occ).includes(u)) { doAttack(selU, u); return; }
    if (!u && canMove(selU) && getMoves(S, selU, occ).has(i)) { doMove(selU, i); return; }
  }
  if (u && u.owner === S.current) {
    if (selU && selU.id === u.id) {
      const c = cityOn(S, i);
      clearSel();
      if (c && c.owner === S.current) sel.cityIdx = i;
      refresh();
      return;
    }
    clearSel();
    sel.unitId = u.id;
    refresh();
    return;
  }
  const c = cityOn(S, i);
  clearSel();
  if (c && c.owner === S.current && !u) sel.cityIdx = i;
  else sel.infoIdx = i;
  refresh();
}

attachInput(canvas, R, onTap);

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
  if (!ev) { toast('Das geht nicht.'); return; }
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

function doRecruit(idx, type) {
  act({ type: 'recruit', idx, unitType: type });
}

function doUpgrade(idx) {
  act({ type: 'upgrade', idx });
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
  const ready = S.units.filter((u) => u.owner === S.current && (canMove(u) || unitTargets(u, occ).length > 0));
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
  const ev = applyAction(S, { type: 'end' });
  refresh();
  await play(ev, speedFactor(), true);
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
    await play(ev, f, true);
    if (f === 0 && guard % 8 === 0) await sleep(0);
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
  for (const ev of events) await playEvent(ev, f, isAI);
}

async function playEvent(ev, f, isAI) {
  const pause = (ms) => (ms * f > 0 ? sleep(ms * f) : Promise.resolve());
  switch (ev.k) {
    case 'move': {
      if (isAI && f > 0) await sleep(R.ensureVisible(ev.path[ev.path.length - 1], 220 * f));
      const d = R.animateMove(ev.id, ev.path, (isAI ? 140 : 110) * f);
      await sleep(d);
      await pause(isAI ? 60 : 0);
      break;
    }
    case 'attack': {
      const { att, def } = ev;
      const ranged = UNITS[att.type].range > 1;
      if (isAI && f > 0) await sleep(R.ensureVisible(def.idx, 220 * f));
      const L = 380 * f;
      if (L > 0) {
        const hit = L * 0.5;
        if (ev.died) R.ghost({ ...att }, L + 450 * f, (L + 120 * f) / (L + 450 * f), def.idx);
        else R.lunge(att.id, att.idx, def.idx, L, ranged, ev.advance != null);
        if (ev.killed) R.ghost({ ...def, hp: 0 }, hit + 420 * f, hit / (hit + 420 * f));
        else R.shake(def.id, def.idx, 300 * f, hit);
        R.floatText(def.idx, `−${ev.dmg}`, '#fecaca', 900 * f, hit);
        if (ev.counter > 0) R.floatText(att.idx, `−${ev.counter}`, '#fecaca', 900 * f, hit + 200 * f);
        await sleep(hit);
        vibrate(ev.killed ? 40 : 15);
        await sleep(L - hit);
        if (ev.advance != null) await sleep(R.animateMove(att.id, [att.idx, ev.advance], 160 * f));
        await pause(isAI ? 140 : 60);
      }
      break;
    }
    case 'recruit':
      if (isAI && f > 0) await sleep(R.ensureVisible(ev.idx, 200 * f));
      await sleep(R.pop(ev.id, 320 * f));
      await pause(isAI ? 60 : 0);
      break;
    case 'upgrade':
      R.invalidate(true);
      R.ring(ev.idx, '#fde047', 600 * f);
      R.floatText(ev.idx, `Stufe ${ev.level}`, '#fde047', 1000 * f);
      await pause(isAI ? 300 : 150);
      break;
    case 'capture': {
      R.invalidate(true);
      if (f > 0) {
        await sleep(R.ensureVisible(ev.idx, 220 * f));
        R.ring(ev.idx, PLAYER_COLORS[ev.pid].main, 700 * f);
        R.floatText(ev.idx, 'Erobert!', PLAYER_COLORS[ev.pid].light, 1100 * f);
      }
      const c = cityOn(S, ev.idx);
      if (S.players[ev.pid].human) vibrate(50);
      if (ev.from >= 0 && S.players[ev.from].human) toast(`${S.players[ev.pid].name} hat ${c?.capital ? 'deine Hauptstadt' : 'eine deiner Städte'} erobert!`);
      await pause(450);
      break;
    }
    case 'heal':
      R.floatText(ev.idx, `+${ev.amount}`, '#86efac', 800 * Math.max(f, 0.6));
      break;
    case 'eliminated':
      toast(`${S.players[ev.pid].name} wurde besiegt!`);
      await pause(600);
      break;
    case 'turn':
      if (S.players[ev.pid].human) hideBanner();
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
    bar.append(el('span', { class: 'pill', title: RES_INFO[k].name }, icon(k), el('b', {}, human.res[k]), el('small', {}, `+${inc[k]}`)));
  }
  $('unitText').textContent = `${unitCount(S, human.id)}/${unitCap(S, human.id)}`;
  const my = humanTurn();
  $('btnEnd').disabled = !my || busy;
  $('btnNext').disabled = !my || busy;
  $('btnUndo').disabled = !my || busy || undoStack.length === 0;
  $('btnEnd').classList.toggle('pulse', my && !busy && !playerHasActions(S, S.current));
}

function iconCanvas(type, owner, px = 44) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(px * dpr);
  c.style.width = c.style.height = px + 'px';
  c.className = 'fig';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  R.drawPreview(ctx, type, owner, px / 2, px * 0.62, px);
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
  const max = UNITS[u.type].hp;
  const r = u.hp / max;
  const color = r > 0.6 ? '#4ade80' : r > 0.3 ? '#facc15' : '#f87171';
  return el('div', { class: 'hp' },
    el('div', { class: 'hp-track' }, el('div', { class: 'hp-fill', style: `width:${Math.max(0, r * 100)}%;background:${color}` })),
    el('span', {}, `${u.hp}/${max}`));
}

function statRow(type) {
  const T = UNITS[type];
  return el('div', { class: 'stats-row' },
    el('span', { title: 'Angriff' }, icon('atk'), fmt(T.atk)),
    el('span', { title: 'Verteidigung' }, icon('def'), fmt(T.def)),
    el('span', { title: 'Bewegung' }, icon('move'), T.move),
    el('span', { title: 'Reichweite' }, icon('range'), T.range));
}

function unitCard(u, subtitle) {
  return el('div', { class: 'unit-card' },
    iconCanvas(u.type, u.owner),
    el('div', { class: 'uc-main' },
      el('div', { class: 'uc-top' }, el('span', { class: 'title' }, UNITS[u.type].name), hpBar(u)),
      el('div', { class: 'uc-bottom' }, el('span', { class: 'muted' }, subtitle), statRow(u.type))));
}

function tileInfo(i) {
  const c = cityOn(S, i);
  if (c) return `${c.capital ? 'Hauptstadt' : 'Dorf'} · Verteidigung ×${fmt(cityDefense(c))}`;
  return TERRAIN[S.terrain[i]].name;
}

function renderPanel() {
  const panel = $('panel');
  panel.innerHTML = '';
  if (!S || !humanTurn()) return;
  const occ = buildOcc(S);
  const u = sel.unitId != null ? unitById(S, sel.unitId) : null;
  if (u) {
    const targets = unitTargets(u, occ);
    let status;
    if (canMove(u)) status = targets.length ? 'Ziehen oder Ziel antippen' : 'Helles Feld = ziehen';
    else if (targets.length) status = 'Rotes Ziel = angreifen';
    else status = 'Fertig für diese Runde';
    panel.append(unitCard(u, status));
    return;
  }
  if (sel.cityIdx != null) {
    const ci = S.cityAt[sel.cityIdx];
    const c = S.cities[ci];
    const p = S.players[S.current];
    const occupied = !!occ[c.idx];
    const capped = unitCount(S, p.id) >= unitCap(S, p.id);
    const y = cityYield(S, ci);
    panel.append(el('div', { class: 'city-head' },
      el('span', { class: 'title' }, `${c.capital ? 'Hauptstadt' : 'Dorf'} · Stufe ${c.level}`),
      el('span', { class: 'yield' }, ...RES.map((k) => el('span', {}, icon(k), `+${y[k]}`)))));
    const grid = el('div', { class: 'recruit-grid' });
    for (const k of UNIT_ORDER) {
      const T = UNITS[k];
      const dis = occupied || capped || !canAfford(p.res, T.cost);
      grid.append(el('button', { class: 'recruit', disabled: dis, onclick: () => doRecruit(c.idx, k), title: T.desc },
        iconCanvas(k, p.id, 34),
        el('div', { class: 'name' }, T.name),
        costEl(T.cost, p.res)));
    }
    panel.append(grid);
    if (occupied) panel.append(el('div', { class: 'note' }, 'Feld besetzt – zum Rekrutieren muss die Stadt frei sein.'));
    else if (capped) panel.append(el('div', { class: 'note' }, 'Versorgung erschöpft – erobere oder baue Städte aus.'));
    if (c.level < CITY_MAX_LEVEL) {
      const cost = upgradeCost(c);
      panel.append(el('div', { class: 'upgrade-row' },
        el('span', { class: 'muted' }, `Ausbau → Stufe ${c.level + 1}: +1 auf alle Rohstoffe, +1 Versorgung${c.level + 1 >= 3 ? ', Mauern' : ''}`),
        el('button', { class: 'btn small', disabled: !canAfford(p.res, cost), onclick: () => doUpgrade(c.idx) }, costEl(cost))));
    }
    return;
  }
  if (sel.infoIdx != null) {
    const i = sel.infoIdx;
    const o = occ[i];
    const c = cityOn(S, i);
    if (o) {
      panel.append(unitCard(o, `${S.players[o.owner].name} · ${tileInfo(i)}`));
    } else if (c) {
      const owner = c.owner >= 0 ? S.players[c.owner].name : 'Neutral';
      const y = cityYield(S, S.cityAt[i]);
      panel.append(el('div', { class: 'city-head' },
        el('span', { class: 'title' }, `${c.capital ? 'Hauptstadt' : 'Dorf'} (${owner})`),
        el('span', { class: 'yield' }, ...RES.map((k) => el('span', {}, icon(k), `+${y[k]}`)))));
      panel.append(el('div', { class: 'note' }, 'Stelle eine Einheit darauf. Übersteht sie die gegnerische Runde, gehört die Stadt samt Gebiet dir.'));
    } else {
      const t = TERRAIN[S.terrain[i]];
      const terr = computeTerritory(S)[i];
      const ownerTxt = terr >= 0 && S.cities[terr].owner === S.current ? 'liefert dir jede Runde' : 'liefert im Gebiet einer eigenen Stadt';
      panel.append(el('div', { class: 'city-head' },
        el('span', { class: 'title' }, t.name),
        el('span', { class: 'yield' }, icon(t.res), `${ownerTxt} 1 ${RES_INFO[t.res].name}`)));
      if (!t.pass) panel.append(el('div', { class: 'note' }, 'Unpassierbar.'));
    }
    return;
  }
  panel.append(el('div', { class: 'muted hint-line' }, 'Tippe eine Einheit oder eine eigene Stadt an.'));
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
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2400);
}

function openModal(...children) {
  const box = $('modalBox');
  box.innerHTML = '';
  box.append(...children);
  $('modal').classList.remove('hidden');
}
function closeModal() {
  $('modal').classList.add('hidden');
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
    el('p', {}, 'Stelle eine Einheit auf ein Dorf. Steht sie zu Beginn deines nächsten Zuges noch dort, gehört es dir – samt Gebiet: Wiesen liefern Nahrung, Wälder Holz, Hügel und Berge Erz. Damit rekrutierst du in deinen Städten neue Einheiten.'),
    el('button', { class: 'btn primary big', onclick: closeModal }, "Los geht's"),
  );
}

function gameOver() {
  if (!S || !S.over) return;
  const human = S.players.find((p) => p.human);
  const won = human && S.over.winner === human.id;
  store.clearGame();
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
    el('label', {}, 'Vibration'),
    toggle('vibrate'),
    el('label', {}, 'Zugende bestätigen'),
    toggle('confirmEnd'),
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
const setup = Object.assign({ size: 'M', biome: 'mixed', enemies: 1, diff: 3, code: randomSeedCode() }, store.lastSetup() || {});

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
    <h3>Ablauf einer Runde</h3>
    <p>Jede Einheit darf pro Runde einmal ziehen und einmal angreifen (erst ziehen, dann angreifen). Durch eigene Einheiten kannst du hindurchziehen.
    Neue Einheiten erscheinen in einer freien eigenen Stadt und handeln ab der nächsten Runde. Einheiten, die noch etwas tun können, haben einen leuchtenden Ring.</p>
    <h3>Angreifen</h3>
    <p>Wählst du eine Einheit, zeigen rote Felder alle Ziele. Die Blase über dem Ziel nennt den Schaden (↩ = Gegenschlag, ✖ = Ziel wird besiegt). Ein Tipp auf das Ziel greift an.
    Nahkämpfer rücken nach einem Sieg auf das Feld vor.</p>
    <h3>Städte</h3>
    <p>Steht deine Einheit zu Beginn deines Zuges auf einer fremden Stadt, wird sie erobert. Ausbau (Holz + Erz) bringt mehr Rohstoffe und Versorgung;
    auf Stufe 3 bekommt die Stadt Mauern. Die Versorgung begrenzt, wie viele Einheiten du haben kannst.</p>
    <h3>Gelände</h3>
    <p>Alle Felder sind gleich gut begehbar – nur <b>Gebirge</b> und <b>Seen</b> sind unpassierbar. Verteidigungsbonus gibt es nur in Städten.</p>
    <h3>Heilung</h3>
    <p>Einheiten, die eine Runde nichts tun, heilen 2 Lebenspunkte – in der Nähe eigener Städte 4.</p>
    <h3>Einheiten</h3>
    <table><tr><th>Einheit</th><th>❤</th><th>Angr.</th><th>Vert.</th><th>Bew.</th><th>Reichw.</th></tr>${rows}</table>
    <p>Das Katapult kann nicht im selben Zug ziehen und angreifen.</p>
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
$('btnContinue').addEventListener('click', () => {
  const g = store.savedGame();
  if (!g || g.v !== STATE_VERSION) { store.clearGame(); $('btnContinue').classList.add('hidden'); return; }
  S = g;
  enterGame();
});
$('btnMenu').addEventListener('click', gameMenu);
$('btnUndo').addEventListener('click', undo);
$('btnNext').addEventListener('click', nextUnit);
$('btnEnd').addEventListener('click', onEndTurn);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && S && !busy && humanTurn()) saveGame();
});

showScreen('scrMenu');

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.match(/^(localhost|127\.)/)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Für Tests/Debugging
window.__hex = { get state() { return S; }, R };
