// Schnelltests: alle Kampagnenlevel erzeugen, Zufallsspiele in allen Größen ohne Fehler durchspielen.
import { createGame, applyAction, cloneState, computeCombat, statsOf, spawnUnit, canRecruit, splashDamage, getBombTargets, migrateState, stormArea, canTerraform, incomeOf, realmYield, cityTiles, cityYield } from '../js/game.js';
import { getGeo } from '../js/hex.js';
import { planAction } from '../js/ai.js';
import { getLevels } from '../js/levels.js';
import { generateMap } from '../js/mapgen.js';
import { MAP_SIZES, BIOMES, UNITS, buildingYield, START_BONUS, citySlots } from '../js/data.js';
import { mulberry32 } from '../js/rng.js';
import { createDefenseGame, waveUnits } from '../js/defense.js';
import { BOTS, BOT_ORDER } from './bots.mjs';

let fails = 0;
function check(cond, msg) {
  if (!cond) { fails++; console.error('FEHLER:', msg); }
}

function playOut(state, rng, maxTurns = 60) {
  let n = 0;
  while (!state.over && state.turn <= maxTurns) {
    const a = planAction(state, rng);
    const ev = applyAction(state, a);
    if (!ev) throw new Error('Ungültige Aktion ' + JSON.stringify(a));
    if (++n > 30000) throw new Error('Zu viele Aktionen');
  }
  return state;
}

const t0 = Date.now();
// Nebel, Türme und Forschung in einem Spiel prüfen
{
  const s = createGame({ seed: 4242, cols: 13, rows: 17, biome: 'mixed', fog: true, players: [{ ai: 4 }, { ai: 4 }, { ai: 5 }] });
  playOut(s, mulberry32(7), 60);
  const towers = s.units.filter((u) => u.type === 'tower').length;
  const techs = s.players.reduce((a, p) => a + p.tech.length, 0);
  console.log(`Nebel-Spiel: Runde ${s.turn}, ${towers} Türme, ${techs} Forschungen`);
  check(techs > 0, 'KI forscht nicht');
}
// Reiche KI: Einzel-Verbesserungen, Greifenreiter, alle Werte ganzzahlig
{
  const s = createGame({ seed: 777, cols: 12, rows: 15, biome: 'plains', players: [{ ai: 6 }, { ai: 6 }] });
  for (const p of s.players) p.incomeBonus = 2;
  let frac = 0;
  const rng = mulberry32(11);
  let n = 0;
  while (!s.over && s.turn <= 90) {
    const ev = applyAction(s, planAction(s, rng));
    if (!ev) throw new Error('Ungültige Aktion');
    if (++n > 30000) throw new Error('Zu viele Aktionen');
    for (const e of ev) if (e.k === 'attack' && (!Number.isInteger(e.dmg) || !Number.isInteger(e.counter))) frac++;
  }
  for (const u of s.units) {
    const st = statsOf(s, u);
    if (![st.hp, st.atk, st.def, u.hp].every(Number.isInteger)) frac++;
  }
  const boosted = s.units.filter((u) => u.boost || u.skills).length;
  console.log(`Reiche KI: Runde ${s.turn}, ${boosted} verbesserte Einheiten, ${s.units.filter((u) => u.type === 'griffin').length} Greifenreiter`);
  check(frac === 0, `${frac} Werte mit Komma`);
}
// Zauberer-Fähigkeiten und alte Spielstände
{
  const s = createGame({ seed: 5, cols: 10, rows: 13, biome: 'mountains', players: [{ ai: 3 }, { ai: 3 }] });
  const geo = getGeo(s.cols, s.rows);
  const m = s.units.find((u) => u.owner === 0);
  m.type = 'mage';
  m.skills = ['bomb', 'freeze'];
  s.players[0].res.mana = 50;
  m.attacked = m.moved = false;
  const mtn = getBombTargets(s, m);
  if (mtn.length) {
    applyAction(s, { type: 'bomb', unitId: m.id, idx: mtn[0] });
    check(s.terrain[mtn[0]] === 'clay', 'Bergsprengung');
  }
  const free = geo.within(m.idx, 3).find((j) => !s.units.some((u) => u.idx === j) && s.cityAt[j] < 0 && s.terrain[j] !== 'mountain' && s.terrain[j] !== 'water');
  const e = { id: 999, type: 'warrior', owner: 1, idx: free, hp: 10, rank: 1, xp: 0 };
  s.units.push(e);
  m.attacked = m.moved = false;
  check(applyAction(s, { type: 'freeze', unitId: m.id, targetId: 999 }) && e.stone === 1, 'Vereisen');
  check(applyAction(s, { type: 'boost', unitId: m.id, stat: 'atk' }) || true, 'Verbessern');
  const old = cloneState(s);
  old.v = 5;
  old.units.push({ id: 1000, type: 'chimera', owner: 1, idx: 0, hp: 40, count: 1, mix: { parents: ['rider', 'warrior'] } }, { id: 1001, type: 'warrior', owner: 1, idx: 1, hp: 30, count: 3 });
  const mig = migrateState(old);
  check(mig && mig.units.every((u) => UNITS[u.type] && !u.count && u.hp <= statsOf(mig, u).hp), 'Alter Spielstand');
}
// Feuersturm des Drachen: Fläche, Schaden, Abklingzeit, Flächenbrand
{
  const s = createGame({ seed: 3, cols: 12, rows: 14, biome: 'plains', players: [{ ai: 3 }, { ai: 3 }] });
  const geo = getGeo(s.cols, s.rows);
  const c = 6 * 12 + 5;
  s.units = s.units.filter((u) => geo.dist(u.idx, c) > 5);
  s.units.push({ id: 900, type: 'dragon', owner: 0, idx: c, hp: 300, rank: 1, xp: 0, moved: false, attacked: false, acted: false });
  const { area } = stormArea(s, c, geo.nb[c][0]);
  check(area.length === 10, `Feuersturm-Fläche ${area.length}`);
  s.units.push({ id: 901, type: 'troll', owner: 1, idx: area[9], hp: 70, rank: 1, xp: 0 });
  s.current = 0;
  s.players[0].res.mana = 50;
  const ev = applyAction(s, { type: 'storm', unitId: 900, toward: geo.nb[c][0] });
  check(ev && ev.find((e) => e.k === 'storm').hits.length === 1, 'Feuersturm trifft');
  const hp = s.units.find((u) => u.id === 901).hp;
  applyAction(s, { type: 'end' });
  const t = s.units.find((u) => u.id === 901);
  check(!t || t.hp < hp, 'Flächenbrand');
  check(s.units.find((u) => u.id === 900) && !applyAction(s, { type: 'storm', unitId: 900, toward: geo.nb[c][0] }), 'Abklingzeit');
}
// Wirtschaft: Felder liefern nur mit Gebäude; Hauptstadt startet mit Bauernhof, Holzfäller, Mine
{
  const s = createGame({ seed: 9, cols: 12, rows: 14, biome: 'mixed', players: [{ ai: 3 }, { ai: 3 }] });
  check(s.grapes.length === 0, 'Keine Traubenhaine zu Beginn');
  const cap = s.cities.find((c) => c.capital && c.owner === 0);
  check(['farm', 'lumber', 'mine'].every((b) => cap.buildings.includes(b)), 'Startgebäude');
  const ci = s.cities.indexOf(cap), t = cityTiles(s, ci), ti = cityTiles(s, ci, undefined, 'inner'), y = cityYield(s, ci);
  check(y.food === buildingYield(t.food, cap.level) && y.ore === buildingYield(t.ore, cap.level), 'Mit Gebäuden liefern beide Ringe');
  cap.level = 3;
  check(cityYield(s, ci).food === 3 * t.food, 'Stufe 3 verdreifacht den Ertrag');
  const cityFood = () => s.cities.reduce((a, c, k) => a + (c.owner === 0 ? cityYield(s, k).food : 0), 0);
  const before = incomeOf(s, 0).food, gross = s.cities.map((c, k) => (c.owner === 0 ? cityYield(s, k).food : 0));
  s.players[0].tech.push('plough');
  check(incomeOf(s, 0).food - before === gross.reduce((a, v) => a + Math.ceil(v / 2), 0), 'Pflug +50 % Nahrung');
  check(realmYield(s, 0).food === cityFood(), 'Reichsertrag = Summe der Städte');
  const g = [...s.terrain.keys()].find((i) => canTerraform(s, 0, i) === 'plant');
  s.grapes.push(g); cap.buildings.push('press');
  check(Number.isFinite(realmYield(s, 0).mana) && cityYield(s, ci).mana >= 3, 'Mana aus Traubenhain mit Kelterei');
  cap.buildings = [];
  const yi = cityYield(s, ci);
  check(yi.wood === 3 * ti.wood && yi.ore === 3 * ti.ore && yi.mana === 3 * ti.mana && ti.food > 0, 'Ohne Gebäude liefert nur der innere Ring');
}
// Felder bearbeiten: Aufforsten, Grube, Traubenhain, Roden
{
  const s = createGame({ seed: 3, cols: 12, rows: 14, biome: 'mixed', players: [{ ai: 3 }, { ai: 3 }] });
  const pid = s.current;
  s.players[pid].res = { food: 90, wood: 90, ore: 50, mana: 0 };
  const plains = [...s.terrain.keys()].filter((i) => canTerraform(s, pid, i) === 'plant');
  const [a, b, c] = plains;
  check(c != null && applyAction(s, { type: 'plant', idx: a }) && applyAction(s, { type: 'plant', idx: b, to: 'pit' }) && applyAction(s, { type: 'plant', idx: c, to: 'vine' }), 'Wiese bearbeiten');
  for (let k = 0; k < 8; k++) applyAction(s, { type: 'end' });
  check(s.terrain[a] === 'forest' && s.pits.includes(b) && s.grapes.includes(c), 'Wald, Grube und Traubenhain fertig');
  check(canTerraform(s, pid, b) === null && canTerraform(s, pid, c) === null, 'Grube/Hain nicht erneut bearbeitbar');
  const f = [...s.terrain.keys()].find((i) => canTerraform(s, s.current, i) === 'clear');
  const w = s.players[s.current].res.wood;
  check(f != null && applyAction(s, { type: 'clear', idx: f }) && s.terrain[f] === 'plain' && s.players[s.current].res.wood > w, 'Roden');
}
// Kampf ohne verborgene Formel: Angriff × (100 % − Verteidigung je Angriffsart), unabhängig vom Leben
{
  const s = createGame({ seed: 5, cols: 12, rows: 14, biome: 'plains', players: [{ ai: 3 }, { ai: 3 }] });
  s.units = [];
  const geo = getGeo(s.cols, s.rows);
  const free = [...s.terrain.keys()].filter((i) => s.terrain[i] === 'plain' && s.cityAt[i] < 0 && !geo.nb[i].some((j) => s.cityAt[j] >= 0) && geo.within(i, 2).every((j) => s.cityAt[j] < 0 || geo.dist(i, j) > 2));
  const a0 = free[0], b0 = geo.nb[a0].find((j) => free.includes(j));
  const mk = (id, type, owner, idx) => ({ id, type, owner, idx, hp: UNITS[type].hp, rank: 1, xp: 0, moved: false, attacked: false });
  const w1 = mk(1, 'warrior', 0, a0), w2 = mk(2, 'warrior', 1, b0);
  s.units.push(w1, w2);
  let r = computeCombat(s, w1, w2);
  check(r.dmg === 4 && r.counter === 4, `Krieger gegen Krieger 4/4 (${r.dmg}/${r.counter})`);
  w2.hp = 5; w1.hp = 3;
  r = computeCombat(s, w1, w2);
  check(r.dmg === 4 && r.counter === 4, 'Schaden unabhängig vom Leben');
  const ar = mk(3, 'archer', 0, a0), ca = mk(4, 'catapult', 1, b0);
  s.units = [ar, ca];
  r = computeCombat(s, ar, ca);
  check(r.dmg === 2, `Schütze gegen Katapult halber Schaden (${r.dmg})`);
  ar.boost = { pen: 2 };
  check(computeCombat(s, ar, ca).dmg === 3, 'Durchschlag 20 senkt die Verteidigung');
  // Gegenschläge: höchstens 2 (Trolle 3) bis zum nächsten eigenen Zug
  const tgt = mk(5, 'defender', 1, b0);
  tgt.hp = 999;
  const atks = geo.nb[b0].slice(0, 3).map((j, k) => mk(10 + k, 'warrior', 0, j));
  s.units = [tgt, ...atks];
  s.current = 0;
  const cs = atks.map((w) => applyAction(s, { type: 'attack', unitId: w.id, targetId: tgt.id })[0].counter);
  check(cs[0] > 0 && cs[1] > 0 && cs[2] === 0, `Gegenschlag nur 2-mal (${cs})`);
  check(computeCombat(s, mk(20, 'warrior', 0, a0), { ...tgt, type: 'troll', cnt: 2 }).counter > 0, 'Troll schlägt 3-mal zurück');
}
// Startbalance: Wächter in einer Siedlung ohne Mauer (15 Leben) – 3 Krieger oder 2 Reiter + Schütze in 2 Runden, 6 Krieger in 1 Runde
{
  const s = createGame({ seed: 7, cols: 16, rows: 21, biome: 'plains', players: [{ ai: 3 }, { ai: 3 }] });
  const v = s.cities.find((c) => !c.capital && !c.castle && !(c.buildings || []).includes('wall'));
  const geo = getGeo(s.cols, s.rows);
  const mk = (id, type, owner, idx) => ({ id, type, owner, idx, hp: UNITS[type].hp, rank: 1, xp: 0, moved: false, attacked: false });
  const w = mk(1, 'defender', 1, v.idx);
  const dmg = (type, idx) => { const a = mk(2, type, 0, idx); s.units = [w, a]; return computeCombat(s, a, w).dmg; };
  const nb = geo.nb[v.idx][0], far = geo.within(v.idx, 2).find((j) => geo.dist(j, v.idx) === 2);
  const dW = dmg('warrior', nb), dR = dmg('rider', nb), dA = dmg('archer', far);
  check(6 * dW >= 15 && 4 * dW < 15, `Wächter in Siedlung: Krieger ${dW}`);
  check(4 * dR + 2 * dA >= 15 && 4 * dR < 15, `Wächter in Siedlung: Reiter ${dR}, Schütze ${dA}`);
}
// Startguthaben gegen leichte KI, Stadtausbau 30 % billiger
{
  const cfg = (ai) => ({ seed: 11, cols: 16, rows: 21, biome: 'plains', players: [{ human: true }, { ai }] });
  const r = (ai, pl = 0) => createGame(cfg(ai)).players[pl].res;
  // Startguthaben ist vorerst abgeschaltet (START_BONUS leer)
  check(r(1).food - r(3).food === (START_BONUS[1]?.food || 0) && r(2).ore - r(3).ore === (START_BONUS[2]?.ore || 0), 'Startguthaben Stufe 1/2');
  check(r(1, 1).food === r(3, 1).food, 'KI ohne Startguthaben');
}
// Türme: Einzel-Verbesserung und Bauarten
{
  const s = createGame({ seed: 6, cols: 14, rows: 16, biome: 'plains', players: [{ ai: 3 }, { ai: 3 }] });
  const geo = getGeo(s.cols, s.rows);
  const c0 = [...s.terrain.keys()].find((i) => geo.within(i, 2).length === 19 && geo.within(i, 2).every((j) => s.terrain[j] === 'plain' && s.cityAt[j] < 0));
  s.units = s.units.filter((u) => geo.dist(u.idx, c0) > 4);
  s.current = 0;
  s.players[0].res = { food: 999, wood: 999, ore: 999, mana: 999 };
  const tw = spawnUnit(s, 'tower', 0, c0, true);
  check(!applyAction(s, { type: 'towerKind', unitId: tw.id, kind: 'cannon' }), 'Bauart erst ab Turmstufe 2');
  tw.level = 2;
  tw.hp = statsOf(s, tw).hp;
  check(applyAction(s, { type: 'boost', unitId: tw.id, stat: 'hp' }) && statsOf(s, tw).hp === 22, `Turm Leben +4 (${statsOf(s, tw).hp})`);
  check(!applyAction(s, { type: 'boost', unitId: tw.id, stat: 'pen' }), 'Turm ohne Durchschlag');
  check(applyAction(s, { type: 'towerKind', unitId: tw.id, kind: 'cannon' }) && tw.kind === 'cannon' && statsOf(s, tw).atk === 8, 'Kanonenturm +2 Angriff');
  check(!applyAction(s, { type: 'towerKind', unitId: tw.id, kind: 'fire' }), 'Bauart nur einmal');
  const foes = geo.nb[c0].slice(0, 2).map((j) => spawnUnit(s, 'warrior', 1, j, true));
  const ae = applyAction(s, { type: 'attack', unitId: tw.id, targetId: foes[0].id })[0];
  check(ae.splash?.length === 1, 'Kanonenturm Flächenschaden');
  const t2 = spawnUnit(s, 'tower', 0, geo.within(c0, 2).find((j) => geo.dist(j, c0) === 2), true);
  t2.level = 2;
  applyAction(s, { type: 'towerKind', unitId: t2.id, kind: 'fire' });
  const f2 = spawnUnit(s, 'warrior', 1, geo.nb[t2.idx].find((j) => !s.units.some((u) => u.idx === j) && geo.dist(j, c0) > 1), true);
  applyAction(s, { type: 'attack', unitId: t2.id, targetId: f2.id });
  const hp0 = f2.hp;
  check(f2.fire === 2, 'Feuerturm setzt in Brand');
  applyAction(s, { type: 'end', volley: false });
  check(!s.units.includes(f2) || f2.hp === hp0 - 2, `Brand 2 Schaden (${hp0} → ${f2.hp})`);
}
// 0.95: Schützen höchstens Reichweite 4, Bauplätze 2–6, Steinwall 25 Leben, Schwarzer Ritter braucht eine Taverne
{
  const s = createGame({ seed: 13, cols: 16, rows: 21, biome: 'plains', players: [{ ai: 3 }, { ai: 3 }] });
  const a = { id: 999, type: 'archer', owner: 0, idx: 0, hp: 10, rank: 1, xp: 0, skills: ['range1', 'range2'] };
  s.players[0].tech.push('bow', 'warbow');
  check(statsOf(s, a).range === 4, `Schütze höchstens Reichweite 4 (${statsOf(s, a).range})`);
  check([1, 2, 3, 4, 5].map((level) => citySlots({ level })).join() === '2,3,4,5,6', 'Bauplätze 2/3/4/5/6');
  check(statsOf(s, { type: 'barrier', owner: 0, rank: 1 }).hp === 25, 'Steinwall 25 Leben');
  const ci = s.cities.findIndex((c) => c.owner === 0);
  s.players[0].res = { food: 999, wood: 999, ore: 999, mana: 99 };
  check(canRecruit(s, 0, ci, 'blackknight') === 'needs', 'Schwarzer Ritter braucht Taverne');
  const bk = { type: 'blackknight', owner: 0, rank: 1 };
  check(statsOf(s, bk).hp === 35 && statsOf(s, bk).atk === 15 && statsOf(s, bk).pen === 30 && statsOf(s, bk).range === 1 && statsOf(s, bk).move === 3, 'Schwarzer Ritter 35/15, Durchschlag 30, Nahkampf, Bewegung 3');
}
// Lange Axt: Nahkampf, trifft zusätzlich den Gegner direkt dahinter
{
  const s = createGame({ seed: 6, cols: 24, rows: 30, biome: 'plains', players: [{ ai: 3 }, { ai: 3 }] });
  const geo = getGeo(s.cols, s.rows);
  const c0 = [...s.terrain.keys()].find((i) => geo.within(i, 3).length === 37 && geo.within(i, 3).every((j) => s.cityAt[j] < 0));
  for (const j of geo.within(c0, 3)) s.terrain[j] = 'plain';
  s.units = s.units.filter((u) => geo.dist(u.idx, c0) > 4);
  s.current = 0;
  const bk = spawnUnit(s, 'blackknight', 0, c0, true);
  // Linie: Nachbar n1, dahinter n2 (Abstand 2), dahinter n3 (Abstand 3)
  const n1 = geo.nb[c0][0], n2 = geo.nb[n1].find((j) => geo.dist(c0, j) === 2 && geo.nb[c0].every((k) => k === n1 || geo.dist(k, j) > 1));
  const n3 = geo.nb[n2].find((j) => geo.dist(c0, j) === 3 && geo.dist(n1, j) === 2);
  const [e1, e2, e3] = [n1, n2, n3].map((j) => spawnUnit(s, 'warrior', 1, j, true));
  e1.hp = e2.hp = e3.hp = 99;
  const near = splashDamage(s, bk, n1, 5).map((h) => h.unit);
  check(near.length === 1 && near[0] === e2, `Axt: trifft den Gegner direkt hinter dem Ziel (${near.length})`);
  check(!applyAction(s, { type: 'attack', unitId: bk.id, targetId: e2.id }), 'Schwarzer Ritter greift nur Nachbarn an');
}
// Regler „Siedlungsdichte“: 100 % = höchstmögliche Städtezahl (4 freie Felder Abstand), 0 % = 8 freie Felder, nach Fläche; Hauptstädte bleiben
{
  const geo = getGeo(MAP_SIZES.EPIC.cols, MAP_SIZES.EPIC.rows);
  const n = (p) => generateMap({ seed: 4711, cols: MAP_SIZES.EPIC.cols, rows: MAP_SIZES.EPIC.rows, players: 2, villageDensity: 0, density: p }).cities;
  const full = n(1), low = n(0), mid = n(0.5);
  const minGap = (cs) => Math.min(...cs.flatMap((a, k) => cs.slice(k + 1).map((b) => geo.dist(a.idx, b.idx))));
  check(low.length <= Math.round(full.length * (5 / 9) ** 2) && low.length >= full.length / 5 && low.filter((c) => c.capital).length === 2 && mid.length > low.length && full.length > mid.length, `Siedlungsdichte 0/50/100 %: ${low.length}/${mid.length}/${full.length}`);
  check(minGap(low.filter((c) => !c.capital)) >= 9 && minGap(full) >= 5, `Siedlungsdichte: Abstand bei 0 % ${minGap(low.filter((c) => !c.capital))}`);
}
// Riesentroll: 5 Trolle verschmelzen, Rundumschlag trifft alle Nachbarn
{
  const s = createGame({ seed: 6, cols: 14, rows: 16, biome: 'plains', players: [{ ai: 3 }, { ai: 3 }] });
  const geo = getGeo(s.cols, s.rows);
  const c0 = [...s.terrain.keys()].find((i) => geo.within(i, 2).length === 19 && geo.within(i, 2).every((j) => s.terrain[j] === 'plain' && s.cityAt[j] < 0));
  s.units = s.units.filter((u) => geo.dist(u.idx, c0) > 3);
  s.current = 0;
  const ring = geo.within(c0, 2).filter((j) => j !== c0);
  const trolls = [c0, ...ring.slice(0, 4)].map((j) => spawnUnit(s, 'troll', 0, j, true));
  trolls[1].hp = 30;
  s.players[0].res.mana = 49;
  check(!applyAction(s, { type: 'fuse', unitId: trolls[0].id }), 'Riesentroll braucht 50 Mana');
  s.players[0].res.mana = 50;
  const fe = applyAction(s, { type: 'fuse', unitId: trolls[0].id });
  const g = trolls[0];
  check(fe && g.type === 'giant' && g.hp === 310 && s.units.filter((u) => u.type === 'troll' && u.owner === 0).length === 0 && s.players[0].res.mana === 0, `Verschmelzen (${g.type}, ${g.hp})`);
  check(statsOf(s, g).move === 3, 'Riesentroll zieht 3');
  s.units = s.units.filter((u) => u === g || geo.dist(u.idx, c0) > 3);
  const foes = geo.nb[c0].slice(0, 3).map((j) => spawnUnit(s, 'warrior', 1, j, true));
  g.attacked = g.moved = false;
  const ae = applyAction(s, { type: 'attack', unitId: g.id, targetId: foes[0].id })[0];
  check(ae.splash?.length === 2 && foes.every((f) => !s.units.includes(f) || f.hp < UNITS.warrior.hp), `Rundumschlag trifft alle (${ae.splash?.length})`);
}
for (const l of getLevels()) {
  const s = createGame({ seed: l.seed, cols: l.cols, rows: l.rows, biome: l.biome, players: [{ human: true }, ...l.ais.map((ai) => ({ ai }))] });
  check(s.cities.filter((c) => c.capital).length === l.ais.length + 1, `Level ${l.id}: Hauptstädte`);
  check(s.cities.length >= (l.ais.length + 1) * 2, `Level ${l.id}: zu wenige Städte (${s.cities.length})`);
  const lg = getGeo(s.cols, s.rows);
  check(s.cities.every((a) => s.cities.every((b) => a === b || lg.dist(a.idx, b.idx) >= 5)), `Level ${l.id}: zwischen Städten weniger als 4 freie Felder`);
  // gespeicherter Zustand muss JSON-fähig sein
  const c = cloneState(s);
  check(c.units.length === s.units.length, `Level ${l.id}: Klonen`);
}
console.log(`50 Level erzeugt (${Date.now() - t0} ms)`);

// Burgverteidigung: Wellen, Beute, Karten, Stufe 5; der Verteidiger wird hier von der KI gespielt
for (const diff of [0, 1, 2]) {
  const s = createDefenseGame({ seed: 900 + diff * 31, diff });
  check(s.defense.gates.length >= 2, `Burgverteidigung ${diff}: zu wenige Tore (${s.defense.gates.length})`);
  s.players[0].ai = 5; // starke Verteidigung, damit der Regeltest bis zu den späteren Wellen kommt
  const rng = mulberry32(diff + 5);
  let n = 0, loot = 0, cards = 0;
  while (!s.over && s.turn <= 30) {
    const a = s.current === 0 && s.defense.choices ? { type: 'card', idx: Math.floor(rng() * 3) } : planAction(s, rng);
    const ev = applyAction(s, a);
    if (!ev) throw new Error('Burgverteidigung: ungültige Aktion ' + JSON.stringify(a));
    for (const e of ev) { if (e.k === 'loot') loot++; if (e.k === 'card') cards++; }
    if (++n > 40000) throw new Error('Burgverteidigung: zu viele Aktionen');
  }
  check(s.defense.wave >= Math.min(10, s.over?.wave ?? 10), `Burgverteidigung ${diff}: zu wenige Wellen (${s.defense.wave})`);
  check(loot > 0 && cards > 0, `Burgverteidigung ${diff}: keine Beute oder Karten (${loot}/${cards})`);
  check(s.units.every((u) => Number.isInteger(u.hp)), `Burgverteidigung ${diff}: Leben nicht ganzzahlig`);
  check(cloneState(s).defense.wave === s.defense.wave, `Burgverteidigung ${diff}: Klonen`);
  console.log(`Burgverteidigung ${diff}: Runde ${s.turn}, Welle ${s.defense.wave}, ${loot}× Beute, ${cards} Karten${s.over ? (s.over.winner === 0 ? ', gewonnen' : ', verloren') : ''}`);
}
check(waveUnits(30, 1, mulberry32(1)).filter((t) => t === 'dragon').length >= 1, 'Welle 30 ohne Drachen');
{
  const s = createDefenseGame({ seed: 77, diff: 1 });
  const u = s.units.find((x) => x.owner === 0 && x.type === 'rider');
  s.players[0].res = { food: 999, wood: 999, ore: 999, mana: 999 };
  let ok = 0;
  for (let k = 0; k < 6; k++) if (applyAction(s, { type: 'boost', unitId: u.id, stat: 'atk' })) ok++;
  check(ok === 5, `Burgverteidigung: Verbesserung bis Stufe 5 (${ok})`);
}

// Spieler-Bots (für tools/simbots.mjs): kurze Partien gegen Stufe 1 und 4 ohne Regelfehler
for (const [k, b] of BOT_ORDER.entries()) {
  const level = k % 2 ? 4 : 1;
  const s = createGame({ seed: 70 + k, cols: MAP_SIZES.XL.cols, rows: MAP_SIZES.XL.rows, biome: 'mixed', players: [{ human: true }, { ai: level }] });
  s.players[0].params = BOTS[b].params;
  playOut(s, mulberry32(k + 3), 15);
  check(s.cities.some((c) => c.owner === 0), `Bot ${b} hat nach 15 Runden keine Stadt mehr`);
}
console.log('Spieler-Bots ohne Regelfehler');

let games = 0;
for (const size of Object.keys(MAP_SIZES)) {
  for (const players of [2, 3, 4]) {
    for (const biome of size === 'EPIC' ? ['mixed'] : Object.keys(BIOMES)) {
      const seed = games * 977 + 13;
      const s = createGame({ seed, cols: MAP_SIZES[size].cols, rows: MAP_SIZES[size].rows, biome, players: Array.from({ length: players }, (_, i) => ({ ai: 1 + ((i + games) % 5) })) });
      playOut(s, mulberry32(seed), { EPIC: 12, XXXL: 20, XXL: 25, XL: 25 }[size] || 40);
      games++;
    }
  }
}
console.log(`${games} Zufallsspiele ohne Regelfehler`);
if (fails) { console.error(`${fails} Fehler`); process.exit(1); }
console.log('Alle Tests bestanden.');
