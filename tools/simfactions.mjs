// Abstimmung der Völker: KI gegen KI (gleiche Stufe), jede Paarung mit wechselnden Startplätzen.
// Aufruf: node tools/simfactions.mjs [Partien je Paarung=10] [KI-Stufe=4] [Größe=XL]
import { createGame, applyAction } from '../js/game.js';
import { planAction } from '../js/ai.js';
import { MAP_SIZES, FACTION_ORDER, FACTIONS } from '../js/data.js';
import { mulberry32 } from '../js/rng.js';

const games = +(process.argv[2] || 10);
const level = +(process.argv[3] || 4);
const size = MAP_SIZES[process.argv[4] || 'XL'];
const biomes = ['mixed', 'forest', 'mountains', 'islands', 'plains'];
const MAX_TURNS = 120;
const t0 = Date.now();
const total = Object.fromEntries(FACTION_ORDER.map((f) => [f, { win: 0, loss: 0, open: 0 }]));
const rows = [];
for (let a = 0; a < FACTION_ORDER.length; a++) {
  for (let b = a + 1; b < FACTION_ORDER.length; b++) {
    const fa = FACTION_ORDER[a], fb = FACTION_ORDER[b];
    const r = { a: 0, b: 0, open: 0, turns: 0 };
    for (let g = 0; g < games; g++) {
      const seat = g % 2 ? [fb, fa] : [fa, fb];
      const s = createGame({ seed: 9000 + g * 131 + a * 17 + b * 7, cols: size.cols, rows: size.rows, biome: biomes[g % biomes.length], players: seat.map((f) => ({ ai: level, faction: f })) });
      const rng = mulberry32(g * 31 + a * 5 + b + 1);
      let n = 0;
      while (!s.over && s.turn <= MAX_TURNS) {
        if (!applyAction(s, planAction(s, rng))) throw new Error('Ungültige Aktion');
        if (++n > 100000) throw new Error('Zu viele Aktionen');
      }
      if (!s.over) { r.open++; total[fa].open++; total[fb].open++; continue; }
      const w = s.players[s.over.winner].faction;
      if (w === fa) { r.a++; total[fa].win++; total[fb].loss++; } else { r.b++; total[fb].win++; total[fa].loss++; }
      r.turns += s.turn;
    }
    rows.push(`${FACTIONS[fa].name} : ${FACTIONS[fb].name} = ${r.a}:${r.b}${r.open ? ` (${r.open} offen)` : ''} · Ø ${(r.turns / Math.max(1, r.a + r.b)).toFixed(0)} Runden`);
    process.stderr.write(rows[rows.length - 1] + '\n');
  }
}
console.log(`\nVölker gegeneinander (KI-Stufe ${level}, je ${games} Partien, ${((Date.now() - t0) / 60000).toFixed(1)} Min.)`);
for (const r of rows) console.log(r);
console.log('\nGesamt (Siege:Niederlagen):');
for (const f of FACTION_ORDER) console.log(`${FACTIONS[f].icon} ${FACTIONS[f].name}: ${total[f].win}:${total[f].loss}${total[f].open ? ` (${total[f].open} offen)` : ''}`);
