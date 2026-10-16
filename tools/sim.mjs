// KI-gegen-KI-Simulation: prüft Regeln auf Fehler und misst die Stärke der Schwierigkeitsstufen.
// Aufruf: node tools/sim.mjs [spiele=20] [stufeA=3] [stufeB=2] [größe=M]
import { createGame, applyAction } from '../js/game.js';
import { planAction } from '../js/ai.js';
import { mulberry32 } from '../js/rng.js';
import { MAP_SIZES } from '../js/data.js';

const games = +(process.argv[2] || 20);
const A = +(process.argv[3] || 3);
const B = +(process.argv[4] || 2);
const size = MAP_SIZES[process.argv[5] || 'M'];
const biomes = ['mixed', 'forest', 'mountains', 'islands', 'plains'];

let winsA = 0, winsB = 0, draws = 0, totalTurns = 0, totalActions = 0;
const t0 = Date.now();
for (let g = 0; g < games; g++) {
  const swap = g % 2 === 1;
  const levels = swap ? [B, A] : [A, B];
  const state = createGame({
    seed: 1000 + g * 31,
    cols: size.cols,
    rows: size.rows,
    biome: biomes[g % biomes.length],
    players: levels.map((ai) => ({ human: false, ai })),
  });
  const rng = mulberry32(g + 1);
  let actions = 0;
  while (!state.over && state.turn <= 100) {
    const a = planAction(state, rng);
    const ev = applyAction(state, a);
    if (!ev) throw new Error('Ungültige KI-Aktion: ' + JSON.stringify(a));
    actions++;
    if (actions > 20000) throw new Error('Endlosschleife?');
  }
  totalActions += actions;
  totalTurns += state.turn;
  if (!state.over) draws++;
  else {
    const w = state.over.winner;
    const winnerIsA = swap ? w === 1 : w === 0;
    if (winnerIsA) winsA++; else winsB++;
  }
}
const ms = Date.now() - t0;
console.log(`Stufe ${A} vs ${B} (${games} Spiele, ${size.name}): A ${winsA} | B ${winsB} | Unentschieden ${draws} | Ø Runden ${(totalTurns / games).toFixed(1)} | ${(ms / totalActions).toFixed(2)} ms/Aktion`);
