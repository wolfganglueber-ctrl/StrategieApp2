// Statistik über KI-Partien: welche Einheiten gebaut werden, wie oft Spezialfähigkeiten genutzt werden.
// Aufruf: node tools/stats.mjs [spiele=10] [stufe=4] [größe=L]
import { createGame, applyAction } from '../js/game.js';
import { planAction } from '../js/ai.js';
import { mulberry32 } from '../js/rng.js';
import { MAP_SIZES, UNITS } from '../js/data.js';

const games = +(process.argv[2] || 10);
const lvl = +(process.argv[3] || 4);
const size = MAP_SIZES[process.argv[4] || 'XL'];
const count = {};
const add = (k, n = 1) => (count[k] = (count[k] || 0) + n);
let turns = 0;
for (let g = 0; g < games; g++) {
  const s = createGame({ seed: 500 + g * 17, cols: size.cols, rows: size.rows, biome: 'mixed', players: [{ ai: lvl }, { ai: lvl }, { ai: lvl }] });
  const rng = mulberry32(g + 9);
  let n = 0;
  while (!s.over && s.turn <= 100 && n++ < 30000) {
    const a = planAction(s, rng);
    const ev = applyAction(s, a);
    if (!ev) throw new Error('Ungültig ' + JSON.stringify(a));
    if (a.type === 'recruit') add('rek:' + a.unitType);
    if (a.type === 'end') { add('_proben'); add('_einheiten', s.units.filter((u) => u.owner === s.current && !UNITS[u.type].structure).length); }
    for (const e of ev) {
      if (e.k === 'heal' && e.by) add('heilen');
      if (e.splash?.length) { add('flächentreffer'); add('flächenopfer', e.splash.length); }
      if (e.k === 'rank') add('rang' + e.rank);
      if (e.k === 'attack' && e.killed) add('kills');
    }
    if (a.type !== 'end' && a.type !== 'move' && a.type !== 'attack' && a.type !== 'recruit') add('akt:' + a.type);
  }
  turns += s.turn;
}
console.log(`Ø Runden ${(turns / games).toFixed(1)} · Ø Einheiten je Spieler ${(count._einheiten / count._proben).toFixed(1)}`);
delete count._einheiten; delete count._proben;
console.log(Object.entries(count).sort().map(([k, v]) => `${k} ${(v / games).toFixed(1)}`).join('\n'));
