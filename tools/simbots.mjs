// Abstimmung der KI-Stufen mit Spieler-Bots: jeder Bot spielt 1 gegen 1 gegen jede KI-Stufe.
// Aufruf: node tools/simbots.mjs [Partien je Paarung=20] [Stufen=1-6] [Bots=beginner,casual,pro] [Größe=XL]
// Beispiel: node tools/simbots.mjs 10 1-3 beginner
import { createGame, applyAction } from '../js/game.js';
import { planAction } from '../js/ai.js';
import { MAP_SIZES, UNIT_ORDER } from '../js/data.js';
import { mulberry32 } from '../js/rng.js';
import { BOTS, BOT_ORDER } from './bots.mjs';

const games = +(process.argv[2] || 20);
const [l0, l1] = (process.argv[3] || '1-6').split('-').map(Number);
const levels = Array.from({ length: (l1 || l0) - l0 + 1 }, (_, i) => l0 + i);
const bots = (process.argv[4] || BOT_ORDER.join(',')).split(',');
const size = MAP_SIZES[process.argv[5] || 'XL'];
const biomes = ['mixed', 'forest', 'mountains', 'islands', 'plains'];
const MAX_TURNS = 100;

function play(botKey, level, g) {
  const state = createGame({
    seed: 5000 + g * 37 + level * 7,
    cols: size.cols,
    rows: size.rows,
    biome: biomes[g % biomes.length],
    players: [{ human: true, name: BOTS[botKey].name }, { ai: level }],
  });
  state.players[0].params = BOTS[botKey].params;
  const rng = mulberry32(g * 13 + level + 1);
  const m = { lost: 0, tier: 0, ups: 0, boosts: 0, peak: 0 };
  let n = 0;
  while (!state.over && state.turn <= MAX_TURNS) {
    const ev = applyAction(state, planAction(state, rng));
    if (!ev) throw new Error('Ungültige Aktion');
    for (const e of ev) {
      if (e.k === 'capture' && e.from === 0) m.lost++;
      if (e.k === 'recruit') {
        const u = state.units.find((x) => x.id === e.id);
        if (u?.owner === 1) m.tier = Math.max(m.tier, UNIT_ORDER.indexOf(u.type));
      }
      if (e.k === 'unitUp' && e.pid === 1) m.ups++;
      if ((e.k === 'boost' || e.k === 'skill' || e.k === 'towerKind') && state.units.find((x) => x.id === e.id)?.owner === 1) m.boosts++;
    }
    m.peak = Math.max(m.peak, state.cities.filter((c) => c.owner === 0).length);
    if (++n > 60000) throw new Error('Zu viele Aktionen');
  }
  const win = state.over ? (state.over.winner === 0 ? 1 : 0) : null;
  return { win, turns: state.turn, ...m };
}

const t0 = Date.now();
const rows = [];
for (const level of levels) {
  const row = { level };
  for (const b of bots) {
    const rs = Array.from({ length: games }, (_, g) => play(b, level, g));
    const done = rs.filter((r) => r.win !== null);
    const avg = (k, list = rs) => (list.reduce((a, r) => a + r[k], 0) / Math.max(1, list.length));
    row[b] = {
      win: rs.filter((r) => r.win === 1).length, loss: rs.filter((r) => r.win === 0).length, open: rs.length - done.length,
      turns: avg('turns', done), lost: avg('lost'), tier: Math.max(...rs.map((r) => r.tier)), ups: avg('ups'), boosts: avg('boosts'),
    };
    process.stderr.write(`Stufe ${level} gegen ${BOTS[b].name}: ${row[b].win}:${row[b].loss} (${row[b].open} offen)\n`);
  }
  rows.push(row);
}

console.log(`\nSpieler-Bots gegen KI-Stufen (je ${games} Partien 1 gegen 1, ${process.argv[5] || 'XL'}, höchstens ${MAX_TURNS} Runden, ${((Date.now() - t0) / 60000).toFixed(1)} Min.)`);
console.log('Je Feld: Siege des Bots:Niederlagen (offen) · Ø Runden · Ø verlorene Städte des Bots');
console.log(['KI-Stufe', ...bots.map((b) => BOTS[b].name)].join(' | '));
for (const r of rows) console.log([r.level, ...bots.map((b) => { const x = r[b]; return `${x.win}:${x.loss} (${x.open}) · ${x.turns.toFixed(0)} R · ${x.lost.toFixed(1)} St.`; })].join(' | '));
console.log('\nWas die KI nutzt (gegen alle Bots): höchste Einheit · Ø Entwicklungen · Ø Einzel-Verbesserungen');
for (const r of rows) {
  const tier = Math.max(...bots.map((b) => r[b].tier));
  const ups = bots.reduce((a, b) => a + r[b].ups, 0) / bots.length, boosts = bots.reduce((a, b) => a + r[b].boosts, 0) / bots.length;
  console.log(`Stufe ${r.level}: ${UNIT_ORDER[tier]} · ${ups.toFixed(1)} · ${boosts.toFixed(1)}`);
}
