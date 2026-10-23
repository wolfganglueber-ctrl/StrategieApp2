// Spieler-Bots für die Abstimmung der KI-Stufen: sie ahmen drei Arten menschlicher Spieler nach.
// Sie spielen mit derselben KI (planAction), aber mit eigenen Werten (state.players[pid].params) und gelten als Mensch,
// damit Schonfrist und Startguthaben wie im echten Spiel greifen.
import { AI_PARAMS } from '../js/ai.js';

const BASIC = ['warrior', 'archer', 'rider', 'defender'];

export const BOTS = {
  // Lernt das Spiel gerade: einfache Einheiten, erobert Dörfer, baut kaum aus, keine Türme/Wälle/Verbesserungen, macht Fehler
  beginner: {
    name: 'Anfänger',
    params: { noise: 4, mistake: 0.3, risk: 0.2, lossW: 0.5, smart: false, upgrade: 0.2, cityMax: 2, guard: 0.5, idle: 0.2, calm: 0, expand: 0.8, tech: 0.1, maxTech: 1, armyCap: 0.8, aggr: 0.8, commit: 0.8, units: BASIC, unitUp: 0, boost: 0, noTowers: true },
  },
  // Spielt regelmäßig: alle Einheiten, Stadtausbau, etwas Forschung – aber keine Türme, Wälle, Entwicklungen oder Einzel-Verbesserungen
  casual: {
    name: 'Gelegenheitsspieler',
    params: { noise: 2, mistake: 0.1, risk: 0.6, lossW: 0.9, smart: true, upgrade: 0.6, guard: 0.8, idle: 0.05, calm: 0, expand: 1, tech: 0.5, maxTech: 8, armyCap: 1, aggr: 1, commit: 1, unitUp: 0, boost: 0, noTowers: true },
  },
  // Holt alles raus: spielt wie Stufe 6 (maximaler Ausbau, Forschung, Entwicklung, Türme und Wälle), verbessert etwas
  // zurückhaltender, aber ohne Rohstoffbonus
  pro: {
    name: 'Profi',
    params: { ...AI_PARAMS[6], boost: 0.5 },
  },
};
export const BOT_ORDER = ['beginner', 'casual', 'pro'];
