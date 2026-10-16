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
  knight: { name: 'Ritter', cost: { food: 8, wood: 2, ore: 6 }, hp: 15, atk: 3, def: 1, move: 3, range: 1, desc: 'Stark und schnell, aber teuer.' },
  catapult: { name: 'Katapult', cost: { wood: 8, ore: 6 }, hp: 10, atk: 4, def: 0, move: 1, range: 3, noMoveAttack: true, desc: 'Reichweite 3, kann nach Bewegung nicht angreifen.' },
};
// Wert einer Einheit für die KI (Rohstoffsumme / 2)
for (const k of Object.keys(UNITS)) {
  let t = 0;
  for (const v of Object.values(UNITS[k].cost)) t += v;
  UNITS[k].value = t / 2;
}
export const UNIT_ORDER = ['warrior', 'archer', 'rider', 'defender', 'knight', 'catapult'];

export const CITY_MAX_LEVEL = 3;
export const START_RES = { food: 5, wood: 3, ore: 3 };

// Stadtzentrum liefert von jedem Rohstoff (Stufe + 1 bei Hauptstadt)
export function cityCenterYield(city) {
  return city.level + (city.capital ? 1 : 0);
}
// Versorgung: wie viele Einheiten eine Stadt unterhält
export function citySupply(city) {
  return 1 + city.level + (city.capital ? 1 : 0);
}
export function cityRadius(city) {
  return 1;
}
export function upgradeCost(city) {
  return city.level === 1 ? { wood: 8, ore: 6 } : { wood: 12, ore: 10 };
}
export function cityDefense(city) {
  return city.level >= 3 ? 2 : 1.5;
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
  XXXL: { name: 'Episch', cols: 22, rows: 29 },
};

export const BIOMES = {
  mixed: { name: 'Gemischt', water: 0.12, mountain: 0.08, hill: 0.1, forest: 0.22, falloff: 0.35 },
  forest: { name: 'Wälder', water: 0.08, mountain: 0.06, hill: 0.08, forest: 0.36, falloff: 0.25 },
  mountains: { name: 'Gebirge', water: 0.06, mountain: 0.16, hill: 0.18, forest: 0.14, falloff: 0.2 },
  islands: { name: 'Inseln', water: 0.3, mountain: 0.05, hill: 0.09, forest: 0.18, falloff: 0.9 },
  plains: { name: 'Steppe', water: 0.08, mountain: 0.05, hill: 0.08, forest: 0.12, falloff: 0.3 },
};
