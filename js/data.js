// Spieldaten: Gelände, Rohstoffe, Einheiten, Städte, Farben, Schwierigkeitsstufen.

export const RES = ['food', 'wood', 'ore'];
export const RES_INFO = {
  food: { name: 'Nahrung', short: 'Nahr.' },
  wood: { name: 'Holz', short: 'Holz' },
  ore: { name: 'Erz', short: 'Erz' },
};

// Gelände liefert Rohstoffe, wenn es im Gebiet einer eigenen Stadt liegt.
// Bewegung: alles passierbar außer Gebirge und Wasser.
export const TERRAIN = {
  plain: { name: 'Wiese', pass: true, res: 'food' },
  forest: { name: 'Wald', pass: true, res: 'wood' },
  hill: { name: 'Hügel', pass: true, res: 'ore' },
  mountain: { name: 'Gebirge', pass: false, res: 'ore' },
  water: { name: 'See', pass: false, res: 'food' },
};

export const UNITS = {
  warrior: { name: 'Krieger', cost: { food: 5, ore: 2 }, hp: 10, atk: 2, def: 2, move: 2, range: 1, desc: 'Günstig und solide.' },
  archer: { name: 'Schütze', cost: { food: 3, wood: 5 }, hp: 10, atk: 2, def: 1, move: 2, range: 2, desc: 'Greift aus 2 Feldern Entfernung an.' },
  rider: { name: 'Reiter', cost: { food: 6, wood: 2 }, hp: 10, atk: 2, def: 1, move: 3, range: 1, desc: 'Schnell – ideal zum Erobern von Dörfern.' },
  defender: { name: 'Wächter', cost: { food: 3, ore: 5 }, hp: 15, atk: 1, def: 3, move: 1, range: 1, desc: 'Starke Verteidigung, schwacher Angriff.' },
  knight: { name: 'Ritter', cost: { food: 8, wood: 2, ore: 6 }, hp: 15, atk: 3, def: 1, move: 3, range: 1, needs: 'barracks', desc: 'Stark und schnell. Braucht eine Kaserne.' },
  tower: { name: 'Turm', cost: { wood: 6, ore: 6 }, hp: 12, atk: 2, def: 3, move: 0, range: 2, structure: true, desc: 'Verteidigungsturm, schießt auf Gegner in Reichweite.' },
  catapult: { name: 'Katapult', cost: { wood: 8, ore: 6 }, hp: 10, atk: 4, def: 0, move: 1, range: 3, noMoveAttack: true, splash: 0.5, needs: 'workshop', desc: 'Reichweite 3, nicht nach Bewegung. Flächenschaden: Gegner neben dem Ziel bekommen die Hälfte. Braucht eine Werkstatt.' },
};
// Wert einer Einheit für die KI (Rohstoffsumme / 2)
for (const k of Object.keys(UNITS)) {
  let t = 0;
  for (const v of Object.values(UNITS[k].cost)) t += v;
  UNITS[k].value = t / 2;
}
export const UNIT_ORDER = ['warrior', 'archer', 'rider', 'defender', 'knight', 'catapult'];
// Höchste Zugweite bei voller Entwicklung (gilt auch für Sprünge über eigene Einheiten)
export const MOVE_CAP = { catapult: 3, rider: 6, knight: 6 };
export const MOVE_CAP_DEFAULT = 4;
export function moveCap(type) {
  return MOVE_CAP[type] ?? MOVE_CAP_DEFAULT;
}
export const MELEE = ['warrior', 'rider', 'defender', 'knight'];
export const FOOT = ['warrior', 'archer', 'defender'];

// Türme: Ausbaustufen 1–3
export const TOWER_LEVELS = [null,
  { hp: 12, atk: 2, def: 3, range: 2 },
  { hp: 18, atk: 3, def: 3.5, range: 2 },
  { hp: 24, atk: 4, def: 4, range: 3 },
];
export const TOWER_UPGRADE = [null, { wood: 6, ore: 8 }, { wood: 8, ore: 12 }];
export const TOWERS_PER_CITY = 2;

// Entwicklungsbaum: einmalig erforschen, gilt für das ganze Reich
export const TECH_BRANCHES = [['mil', 'Militär'], ['eco', 'Wirtschaft'], ['def', 'Verteidigung']];
export const TECHS = {
  bow: { branch: 'mil', name: 'Langbogen', icon: '🏹', cost: { food: 12, wood: 20 }, req: [], mod: { archer: { range: 1 } }, desc: 'Schützen +1 Reichweite' },
  horse: { branch: 'mil', name: 'Hufeisen', icon: '🐎', cost: { food: 20, ore: 12 }, req: [], mod: { rider: { move: 1 }, knight: { move: 1 } }, desc: 'Reiter und Ritter +1 Bewegung' },
  smith: { branch: 'mil', name: 'Schmiedekunst', icon: '⚒️', cost: { wood: 12, ore: 24 }, req: [], mod: { melee: { atk: 0.5 } }, desc: 'Nahkämpfer +0,5 Angriff' },
  armor: { branch: 'mil', name: 'Plattenrüstung', icon: '🥋', cost: { food: 16, ore: 36 }, req: ['smith'], mod: { all: { def: 0.5 } }, desc: 'Alle Einheiten +0,5 Verteidigung' },
  oxcart: { branch: 'mil', name: 'Ochsenkarren', icon: '🐂', cost: { food: 12, wood: 24 }, req: [], mod: { catapult: { move: 1 } }, desc: 'Katapulte +1 Bewegung' },
  ballistics: { branch: 'mil', name: 'Ballistik', icon: '🎯', cost: { wood: 32, ore: 28 }, req: ['oxcart'], mod: { catapult: { range: 1, atk: 1 } }, desc: 'Katapulte +1 Reichweite, +1 Angriff' },
  roads: { branch: 'mil', name: 'Straßenbau', icon: '🛤️', cost: { food: 24, wood: 24, ore: 12 }, req: ['oxcart'], mod: { foot: { move: 1 } }, desc: 'Krieger, Schützen, Wächter +1 Bewegung' },
  plough: { branch: 'eco', name: 'Pflug', icon: '🌱', cost: { wood: 16 }, req: [], desc: 'Bauernhöfe +2 Nahrung' },
  saw: { branch: 'eco', name: 'Sägewerk', icon: '🪓', cost: { food: 16, ore: 8 }, req: [], desc: 'Holzfäller +2 Holz' },
  mining: { branch: 'eco', name: 'Bergbau', icon: '⛏️', cost: { food: 16, wood: 16 }, req: [], desc: 'Minen +2 Erz' },
  guild: { branch: 'eco', name: 'Handelsgilde', icon: '💰', cost: { food: 24, wood: 20 }, req: ['plough'], desc: 'Handel überall 2:1' },
  masonry: { branch: 'eco', name: 'Baukunst', icon: '🏛️', cost: { wood: 24, ore: 16 }, req: ['saw', 'mining'], desc: 'Stadtausbau 25 % günstiger' },
  medic: { branch: 'def', name: 'Heilkunde', icon: '🌿', cost: { food: 28 }, req: [], desc: 'Einheiten heilen 2 mehr' },
  stonework: { branch: 'def', name: 'Steinmetz', icon: '🧱', cost: { wood: 12, ore: 20 }, req: [], desc: 'Türme +6 Leben, Mauern stärker (×2,6)' },
  towers2: { branch: 'def', name: 'Turmbaukunst', icon: '🗼', cost: { wood: 20, ore: 28 }, req: ['stonework'], mod: { tower: { range: 1, atk: 1 } }, desc: 'Türme +1 Reichweite, +1 Angriff' },
};
export const TECH_ORDER = Object.keys(TECHS);

export const CITY_MAX_LEVEL = 5;
export const CITY_NAMES = ['', 'Dorf', 'Siedlung', 'Stadt', 'Burgstadt', 'Metropole'];
export const START_RES = { food: 6, wood: 6, ore: 4 };
export const TRADE_RATE = 3;
export const TRADE_RATE_MARKET = 2;

// Gebäude: jede Stadt hat so viele Bauplätze wie ihre Stufe
export const BUILDINGS = {
  farm: { art: 'einen', name: 'Bauernhof', icon: '🌾', cost: { wood: 4 }, desc: '+3 Nahrung' },
  lumber: { art: 'einen', name: 'Holzfäller', icon: '🌲', cost: { food: 4 }, desc: '+1 Holz, +1 je Wald im Gebiet' },
  mine: { art: 'eine', name: 'Mine', icon: '⛏️', cost: { food: 4, wood: 4 }, desc: '+1 Erz, +2 je Hügel/Berg im Gebiet' },
  barracks: { art: 'eine', name: 'Kaserne', icon: '🛡️', cost: { wood: 6, ore: 4 }, desc: 'Ritter möglich, neue Einheiten können sofort ziehen' },
  workshop: { art: 'eine', name: 'Werkstatt', icon: '⚙️', cost: { wood: 8, ore: 4 }, desc: 'Katapulte möglich' },
  wall: { art: 'eine', name: 'Mauer', icon: '🧱', cost: { wood: 4, ore: 6 }, desc: 'Verteidigung in der Stadt ×2,2' },
  market: { art: 'einen', name: 'Markt', icon: '⚖️', cost: { food: 6, wood: 6 }, desc: 'Handel 2:1 statt 3:1' },
};
export const BUILDING_ORDER = ['farm', 'lumber', 'mine', 'barracks', 'workshop', 'wall', 'market'];

// Stadtzentrum liefert von jedem Rohstoff so viel wie die Stufe
export function cityCenterYield(city) {
  return city.level;
}
// Versorgung: wie viele Einheiten eine Stadt unterhält
export function citySupply(city) {
  return 1 + city.level;
}
export function cityRadius(city) {
  return city.level >= 4 ? 2 : 1;
}
export function citySlots(city) {
  return city.level;
}
export function upgradeCost(city) {
  return [null, { food: 8, wood: 8 }, { food: 14, wood: 12, ore: 6 }, { food: 22, wood: 18, ore: 14 }, { food: 30, wood: 26, ore: 22 }][city.level];
}
export function cityDefense(city, stonework = false) {
  return city.buildings?.includes('wall') ? (stonework ? 2.6 : 2.2) : 1.5;
}
export function hasBuilding(city, b) {
  return !!city.buildings?.includes(b);
}

export function canAfford(have, cost) {
  for (const k of RES) if ((cost[k] || 0) > (have[k] || 0)) return false;
  return true;
}
export function costTotal(cost) {
  let s = 0;
  for (const k of RES) s += cost[k] || 0;
  return s;
}

export const PLAYER_COLORS = [
  { name: 'Blau', main: '#2f6fed', dark: '#173c96', light: '#a9c6ff' },
  { name: 'Rot', main: '#e23b3b', dark: '#8a1717', light: '#ffb3b3' },
  { name: 'Gelb', main: '#f2b705', dark: '#8c6400', light: '#ffe58a' },
  { name: 'Lila', main: '#9b4dde', dark: '#561f8a', light: '#e2c4ff' },
];
export const NEUTRAL_COLOR = { name: 'Neutral', main: '#9a9286', dark: '#5b554c', light: '#e3ddd2' };

export const DIFFICULTIES = [
  { level: 1, name: 'Anfänger', desc: 'Macht viele Fehler.' },
  { level: 2, name: 'Leicht', desc: 'Spielt planlos, aber aggressiv.' },
  { level: 3, name: 'Normal', desc: 'Achtet auf Gefahren und Fokusfeuer.' },
  { level: 4, name: 'Schwer', desc: 'Spielt sauber und baut seine Wirtschaft aus.' },
  { level: 5, name: 'Meister', desc: 'Wie Schwer, aber mit +50 % Rohstoffen.' },
];

export const MAP_SIZES = {
  S: { name: 'Klein', cols: 8, rows: 10 },
  M: { name: 'Mittel', cols: 10, rows: 13 },
  L: { name: 'Groß', cols: 13, rows: 17 },
  XL: { name: 'Riesig', cols: 16, rows: 21 },
  XXL: { name: 'Gewaltig', cols: 19, rows: 25 },
  XXXL: { name: 'Kolossal', cols: 22, rows: 29 },
  EPIC: { name: 'Episch', cols: 44, rows: 58 },
};

export const BIOMES = {
  mixed: { name: 'Gemischt', water: 0.12, mountain: 0.08, hill: 0.1, forest: 0.22, falloff: 0.35 },
  forest: { name: 'Wälder', water: 0.08, mountain: 0.06, hill: 0.08, forest: 0.36, falloff: 0.25 },
  mountains: { name: 'Gebirge', water: 0.06, mountain: 0.16, hill: 0.18, forest: 0.14, falloff: 0.2 },
  islands: { name: 'Inseln', water: 0.3, mountain: 0.05, hill: 0.09, forest: 0.18, falloff: 0.9 },
  plains: { name: 'Steppe', water: 0.08, mountain: 0.05, hill: 0.08, forest: 0.12, falloff: 0.3 },
};
