// Schnelltests: alle Kampagnenlevel erzeugen, Zufallsspiele in allen Größen ohne Fehler durchspielen.
import { createGame, applyAction, cloneState } from '../js/game.js';
import { planAction } from '../js/ai.js';
import { getLevels } from '../js/levels.js';
import { MAP_SIZES, BIOMES } from '../js/data.js';
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
    for (const biome of Object.keys(BIOMES)) {
      const seed = games * 977 + 13;
      const s = createGame({ seed, cols: MAP_SIZES[size].cols, rows: MAP_SIZES[size].rows, biome, players: Array.from({ length: players }, (_, i) => ({ ai: 1 + ((i + games) % 5) })) });
      playOut(s, mulberry32(seed), size === 'XL' ? 25 : 40);
      games++;
    }
  }
}
console.log(`${games} Zufallsspiele ohne Regelfehler`);
if (fails) { console.error(`${fails} Fehler`); process.exit(1); }
console.log('Alle Tests bestanden.');
