// Steuerung: Menüs, Spielablauf, Eingaben, Animationen der Ereignisse.
import { Renderer } from './render.js';
import { attachInput } from './input.js';
import {
  createGame, applyAction, cloneState, buildOcc, getMoves, getTargets, computeCombat, canMove, canAttack, cityOn,
  incomeOf, unitCap, unitCount, playerHasActions, unitById, defenseMult,
} from './game.js';
import { planAction } from './ai.js';
import {
  UNITS, UNIT_ORDER, TERRAIN, PLAYER_COLORS, NEUTRAL_COLOR, DIFFICULTIES, MAP_SIZES, BIOMES, CITY_MAX_LEVEL,
  upgradeCost, cityIncome, cityDefense,
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
let sel = { unitId: null, cityIdx: null, pendingTarget: null, infoIdx: null };
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
    $('btnContinue').classList.toggle('hidden', !store.savedGame());
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
  R.viewPad = { top: 70, bottom: 200 };
  R.setState(S);
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
  sel = { unitId: null, cityIdx: null, pendingTarget: null, infoIdx: null };
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
  const o = { exhausted: new Set() };
  if (humanTurn()) {
    for (const u of S.units) {
      if (u.owner !== S.current) continue;
      if (!canMove(u) && unitTargets(u, occ).length === 0) o.exhausted.add(u.id);
    }
  }
  const u = sel.unitId != null ? unitById(S, sel.unitId) : null;
  if (u) {
    o.selected = u.idx;
    if (humanTurn() && u.owner === S.current) {
      if (canMove(u)) o.moves = new Set(getMoves(S, u, occ).keys());
      const t = unitTargets(u, occ);
      if (t.length) o.targets = new Set(t.map((x) => x.idx));
      if (sel.pendingTarget != null) {
        const tgt = unitById(S, sel.pendingTarget);
        if (tgt) {
          const r = computeCombat(S, u, tgt);
          o.forecast = { targetIdx: tgt.idx, fromIdx: u.idx, dmg: r.dmg, counter: r.counter, kill: r.kill };
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
    if (u && u.owner !== S.current && unitTargets(selU, occ).includes(u)) {
      if (sel.pendingTarget === u.id) { doAttack(selU, u); return; }
      sel.pendingTarget = u.id;
      refresh();
      return;
    }
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
  sel.pendingTarget = null;
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
    const ok = await confirmDialog('Zug beenden?', 'Einige Einheiten können noch handeln.', 'Beenden', 'Weiterspielen');
    if (!ok) return;
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
      const ranged = UNITS[att.type].range > 1 && R.center(att.idx) && ev.advance == null && distOf(att.idx, def.idx) > 1;
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

function distOf(a, b) {
  const ca = R.center(a), cb = R.center(b);
  return Math.round(Math.hypot(ca.x - cb.x, ca.y - cb.y) / (40 * Math.sqrt(3)));
}

// ---------------------------------------------------------------- HUD & Panel
function updateHud() {
  if (!S) return;
  const human = S.players.find((p) => p.human) || S.players[0];
  const cur = S.players[S.current];
  $('turnDot').style.background = PLAYER_COLORS[cur.id].main;
  $('turnText').textContent = `Runde ${S.turn} · ${cur.human ? 'Dein Zug' : cur.name}`;
  $('goldText').textContent = human.gold;
  $('incomeText').textContent = `+${incomeOf(S, human.id)}`;
  $('unitText').textContent = `${unitCount(S, human.id)}/${unitCap(S, human.id)}`;
  const my = humanTurn();
  $('btnEnd').disabled = !my || busy;
  $('btnNext').disabled = !my || busy;
  $('btnUndo').disabled = !my || busy || undoStack.length === 0;
  $('btnEnd').classList.toggle('pulse', my && !busy && !playerHasActions(S, S.current));
}

function iconCanvas(type, owner, px = 34) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = c.height = px * dpr;
  c.style.width = c.style.height = px + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const col = PLAYER_COLORS[owner] || NEUTRAL_COLOR;
  const g = ctx.createLinearGradient(0, 0, 0, px);
  g.addColorStop(0, col.light);
  g.addColorStop(0.35, col.main);
  g.addColorStop(1, col.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(px / 2, px / 2, px / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  R.drawIcon(ctx, type, px / 2, px / 2, px * 0.25, col);
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

function unitChips(u) {
  const T = UNITS[u.type];
  return el('div', { class: 'chips' },
    el('span', { class: 'chip' }, '❤ ', el('b', {}, `${u.hp}/${T.hp}`)),
    el('span', { class: 'chip' }, 'Angriff ', el('b', {}, fmt(T.atk))),
    el('span', { class: 'chip' }, 'Verteid. ', el('b', {}, fmt(T.def))),
    el('span', { class: 'chip' }, 'Bewegung ', el('b', {}, T.move)),
    el('span', { class: 'chip' }, 'Reichweite ', el('b', {}, T.range)),
  );
}

function terrainLabel(i) {
  const c = cityOn(S, i);
  if (c) return `${c.capital ? 'Hauptstadt' : 'Dorf'} (Verteidigung ×${fmt(cityDefense(c))})`;
  const t = TERRAIN[S.terrain[i]];
  return t.def && t.def > 1 ? `${t.name} (Verteidigung ×${fmt(t.def)})` : t.name;
}

function renderPanel() {
  const panel = $('panel');
  panel.innerHTML = '';
  if (!S) return;
  if (!humanTurn()) return;
  const occ = buildOcc(S);
  const u = sel.unitId != null ? unitById(S, sel.unitId) : null;
  if (u) {
    const T = UNITS[u.type];
    let status;
    const targets = unitTargets(u, occ);
    if (canMove(u)) status = targets.length ? 'Kann ziehen oder angreifen' : 'Kann ziehen';
    else if (targets.length) status = 'Kann noch angreifen';
    else status = 'Fertig für diese Runde';
    panel.append(el('div', { class: 'row' },
      iconCanvas(u.type, u.owner),
      el('div', {}, el('div', { class: 'title' }, T.name), el('div', { class: 'muted' }, `${status} · ${terrainLabel(u.idx)}`)),
    ));
    const tgt = sel.pendingTarget != null ? unitById(S, sel.pendingTarget) : null;
    if (tgt) {
      const r = computeCombat(S, u, tgt);
      const txt = r.kill
        ? `${UNITS[tgt.type].name} wird besiegt!`
        : `${UNITS[tgt.type].name}: −${r.dmg} ❤` + (r.counter ? ` · Gegenschlag −${r.counter} ❤${r.die ? ' (deine Einheit fällt!)' : ''}` : ' · kein Gegenschlag');
      panel.append(el('div', { class: 'upgrade-row' },
        el('div', { class: 'muted' }, txt),
        el('button', { class: 'btn primary', onclick: () => doAttack(u, tgt) }, 'Angreifen'),
      ));
    } else {
      panel.append(unitChips(u));
      if (targets.length && !canMove(u)) panel.append(el('div', { class: 'muted', style: 'margin-top:6px' }, 'Tippe ein rot markiertes Ziel an (zweimal = Angriff).'));
    }
    return;
  }
  if (sel.cityIdx != null) {
    const c = cityOn(S, sel.cityIdx);
    const p = S.players[S.current];
    const occupied = !!occ[c.idx];
    const capped = unitCount(S, p.id) >= unitCap(S, p.id);
    panel.append(el('div', { class: 'row' },
      el('div', {},
        el('div', { class: 'title' }, `${c.capital ? 'Hauptstadt' : 'Dorf'} · Stufe ${c.level}`),
        el('div', { class: 'muted' }, `+${cityIncome(c)} Gold/Runde · versorgt ${cityIncome(c)} Einheiten`),
      ),
    ));
    const grid = el('div', { class: 'recruit-grid' });
    for (const k of UNIT_ORDER) {
      const T = UNITS[k];
      const dis = occupied || capped || p.gold < T.cost;
      grid.append(el('button', { class: 'recruit', disabled: dis, onclick: () => doRecruit(c.idx, k), title: T.desc },
        iconCanvas(k, p.id, 28),
        el('div', { class: 'name' }, T.name),
        el('div', { class: 'cost' }, el('i', { class: 'coin' }), T.cost),
      ));
    }
    panel.append(grid);
    if (occupied) panel.append(el('div', { class: 'muted', style: 'margin-top:6px' }, 'Das Feld ist besetzt – zum Rekrutieren muss es frei sein.'));
    else if (capped) panel.append(el('div', { class: 'muted', style: 'margin-top:6px' }, 'Versorgung erschöpft – erobere oder baue Städte aus.'));
    if (c.level < CITY_MAX_LEVEL) {
      const cost = upgradeCost(c);
      panel.append(el('div', { class: 'upgrade-row' },
        el('div', { class: 'muted' }, `Ausbau auf Stufe ${c.level + 1}: +1 Gold, +1 Versorgung${c.level + 1 >= 3 ? ', Verteidigung ×2' : ''}`),
        el('button', { class: 'btn', disabled: p.gold < cost, onclick: () => doUpgrade(c.idx) }, el('i', { class: 'coin' }), ` ${cost}`),
      ));
    }
    return;
  }
  if (sel.infoIdx != null) {
    const i = sel.infoIdx;
    const o = occ[i];
    const c = cityOn(S, i);
    if (o) {
      const T = UNITS[o.type];
      panel.append(el('div', { class: 'row' },
        iconCanvas(o.type, o.owner),
        el('div', {}, el('div', { class: 'title' }, `${T.name} (${S.players[o.owner].name})`), el('div', { class: 'muted' }, terrainLabel(i))),
      ));
      panel.append(unitChips(o));
    } else {
      const owner = c ? (c.owner >= 0 ? S.players[c.owner].name : 'Neutral') : null;
      panel.append(el('div', { class: 'title' }, terrainLabel(i)));
      const t = TERRAIN[S.terrain[i]];
      panel.append(el('div', { class: 'muted' }, c
        ? `Besitzer: ${owner} · +${cityIncome(c)} Gold. Stelle eine Einheit darauf – übersteht sie die gegnerische Runde, gehört die Stadt dir.`
        : t.info || 'Offenes Gelände.'));
    }
    return;
  }
  panel.append(el('div', { class: 'muted' }, 'Tippe eine Einheit oder eine eigene Stadt an.'));
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
    el('p', {}, 'Tippe eine Einheit an und dann ein helles Feld, um zu ziehen. Rote Felder kannst du angreifen – einmal tippen zeigt die Vorschau, zweimal greift an.'),
    el('p', {}, 'Stelle eine Einheit auf ein Dorf. Überlebt sie bis zu deinem nächsten Zug, gehört es dir. Städte bringen Gold, damit rekrutierst du neue Einheiten.'),
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
  const rows = UNIT_ORDER.map((k) => {
    const T = UNITS[k];
    return `<tr><td>${T.name}</td><td>${T.cost}</td><td>${T.hp}</td><td>${fmt(T.atk)}</td><td>${fmt(T.def)}</td><td>${T.move}</td><td>${T.range}</td></tr>`;
  }).join('');
  $('helpContent').innerHTML = `
    <h3>Ziel</h3>
    <p>Erobere alle Städte deiner Gegner. Wer keine Stadt mehr hat, scheidet aus.</p>
    <h3>Ablauf einer Runde</h3>
    <p>Jede Einheit darf pro Runde einmal ziehen und einmal angreifen (erst ziehen, dann angreifen). Nach einem Angriff ist die Einheit fertig.
    Neue Einheiten erscheinen in einer freien eigenen Stadt und handeln ab der nächsten Runde.</p>
    <h3>Städte</h3>
    <p>Stellt sich eine Einheit auf eine fremde Stadt und steht dort zu Beginn deines nächsten Zuges noch, wird die Stadt erobert.
    Jede Stadt bringt Gold und versorgt Einheiten. Durch Ausbau steigen Einkommen und Versorgung; auf Stufe 3 bekommt die Stadt starke Mauern.</p>
    <h3>Kampf</h3>
    <p>Der Schaden hängt von Angriff, Verteidigung, Lebenspunkten und Gelände ab – und ist immer vorhersehbar: Tippe ein Ziel einmal an, um die Vorschau zu sehen.
    Überlebt der Verteidiger und ist der Angreifer in seiner Reichweite, schlägt er zurück. Nahkämpfer rücken nach einem Sieg auf das Feld vor.</p>
    <h3>Gelände</h3>
    <p><b>Wald</b> und <b>Hügel</b> beenden die Bewegung und geben Verteidigung ×1,5. Fernkämpfer auf Hügeln haben +1 Reichweite.
    <b>Gebirge</b> und <b>Wasser</b> sind unpassierbar. Felder neben Gegnern stoppen die Bewegung (Kontrollzone).</p>
    <h3>Heilung</h3>
    <p>Einheiten, die eine Runde nichts tun, heilen 2 Lebenspunkte – im eigenen Gebiet 4.</p>
    <h3>Einheiten</h3>
    <table><tr><th>Einheit</th><th>Gold</th><th>❤</th><th>Angr.</th><th>Vert.</th><th>Bew.</th><th>Reichw.</th></tr>${rows}</table>
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
  if (!g) return;
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
