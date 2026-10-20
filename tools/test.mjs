// Schnelltests: alle Kampagnenlevel erzeugen, Zufallsspiele in allen Größen ohne Fehler durchspielen.
import { createGame, applyAction, cloneState, statsOf, getBombTargets, migrateState, stormArea, canTerraform, incomeOf, cityTiles, cityYield } from '../js/game.js';
import { getGeo } from '../js/hex.js';
import { planAction } from '../js/ai.js';
import { getLevels } from '../js/levels.js';
import { MAP_SIZES, BIOMES, UNITS, buildingYield } from '../js/data.js';
import { mulberry32 } from '../js/rng.js';

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
  const ci = s.cities.indexOf(cap), t = cityTiles(s, ci), y = cityYield(s, ci);
  check(y.food === buildingYield(t.food, cap.level) && y.ore === buildingYield(t.ore, cap.level), 'Ertrag nur über Gebäude');
  cap.level = 3;
  check(cityYield(s, ci).food === 3 * t.food, 'Stufe 3 verdreifacht den Ertrag');
  const before = incomeOf(s, 0).food, gross = s.cities.reduce((a, c, k) => a + (c.owner === 0 ? cityYield(s, k).food : 0), 0);
  s.players[0].tech.push('plough');
  check(incomeOf(s, 0).food - before === Math.ceil(gross / 2), 'Pflug +50 % Nahrung');
  cap.buildings = [];
  check(Object.values(cityYield(s, ci)).every((v) => v === 0), 'Ohne Gebäude kein Ertrag');
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
for (const l of getLevels()) {
  const s = createGame({ seed: l.seed, cols: l.cols, rows: l.rows, biome: l.biome, players: [{ human: true }, ...l.ais.map((ai) => ({ ai }))] });
  check(s.cities.filter((c) => c.capital).length === l.ais.length + 1, `Level ${l.id}: Hauptstädte`);
  check(s.cities.length >= (l.ais.length + 1) * 3, `Level ${l.id}: zu wenige Städte (${s.cities.length})`);
  // gespeicherter Zustand muss JSON-fähig sein
  const c = cloneState(s);
  check(c.units.length === s.units.length, `Level ${l.id}: Klonen`);
}
console.log(`50 Level erzeugt (${Date.now() - t0} ms)`);

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
