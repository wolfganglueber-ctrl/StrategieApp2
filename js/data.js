// Spieldaten: Gelände, Einheiten, Städte, Farben, Schwierigkeitsstufen.

export const TERRAIN = {
  plain: { name: 'Wiese', pass: true, stop: false, def: 1 },
  forest: { name: 'Wald', pass: true, stop: true, def: 1.5, info: 'Beendet die Bewegung, Verteidigung ×1,5' },
  hill: { name: 'Hügel', pass: true, stop: true, def: 1.5, info: 'Beendet die Bewegung, Verteidigung ×1,5, Fernkämpfer +1 Reichweite' },
  mountain: { name: 'Gebirge', pass: false, info: 'Unpassierbar' },
  water: { name: 'Wasser', pass: false, info: 'Unpassierbar' },
};

export const UNITS = {
  warrior: { name: 'Krieger', cost: 2, hp: 10, atk: 2, def: 2, move: 1, range: 1, desc: 'Günstig und solide.' },
  archer: { name: 'Schütze', cost: 3, hp: 10, atk: 2, def: 1, move: 1, range: 2, desc: 'Greift aus 2 Feldern Entfernung an.' },
  rider: { name: 'Reiter', cost: 3, hp: 10, atk: 2, def: 1, move: 2, range: 1, desc: 'Schnell – ideal zum Erobern von Dörfern.' },
  defender: { name: 'Wächter', cost: 3, hp: 15, atk: 1, def: 3, move: 1, range: 1, desc: 'Starke Verteidigung, schwacher Angriff.' },
  knight: { name: 'Ritter', cost: 7, hp: 15, atk: 3, def: 1, move: 3, range: 1, desc: 'Stark und sehr schnell, aber teuer.' },
  catapult: { name: 'Katapult', cost: 7, hp: 10, atk: 4, def: 0, move: 1, range: 3, noMoveAttack: true, desc: 'Reichweite 3, kann nach Bewegung nicht angreifen.' },
};
export const UNIT_ORDER = ['warrior', 'archer', 'rider', 'defender', 'knight', 'catapult'];

export const CITY_MAX_LEVEL = 3;
export function cityIncome(city) {
  return 1 + city.level + (city.capital ? 1 : 0);
}
export function upgradeCost(city) {
  return city.level === 1 ? 5 : 8;
}
export function cityDefense(city) {
  return city.level >= 3 ? 2 : 1.5;
}

export const PLAYER_COLORS = [
  { name: 'Blau', main: '#3b82f6', dark: '#1e40af', light: '#bfdbfe' },
  { name: 'Rot', main: '#ef4444', dark: '#991b1b', light: '#fecaca' },
  { name: 'Gelb', main: '#eab308', dark: '#854d0e', light: '#fef08a' },
  { name: 'Lila', main: '#a855f7', dark: '#6b21a8', light: '#e9d5ff' },
];
export const NEUTRAL_COLOR = { name: 'Neutral', main: '#9ca3af', dark: '#4b5563', light: '#e5e7eb' };

export const DIFFICULTIES = [
  { level: 1, name: 'Anfänger', desc: 'Macht viele Fehler.' },
  { level: 2, name: 'Leicht', desc: 'Spielt planlos, aber aggressiv.' },
  { level: 3, name: 'Normal', desc: 'Achtet auf Gefahren und Fokusfeuer.' },
  { level: 4, name: 'Schwer', desc: 'Spielt sauber und baut seine Wirtschaft aus.' },
  { level: 5, name: 'Meister', desc: 'Wie Schwer, aber mit +50 % Einkommen.' },
];

export const MAP_SIZES = {
  S: { name: 'Klein', cols: 8, rows: 10 },
  M: { name: 'Mittel', cols: 10, rows: 13 },
  L: { name: 'Groß', cols: 12, rows: 16 },
  XL: { name: 'Riesig', cols: 14, rows: 19 },
};

export const BIOMES = {
  mixed: { name: 'Gemischt', water: 0.14, mountain: 0.08, hill: 0.1, forest: 0.2, falloff: 0.35 },
  forest: { name: 'Wälder', water: 0.08, mountain: 0.05, hill: 0.08, forest: 0.38, falloff: 0.25 },
  mountains: { name: 'Gebirge', water: 0.06, mountain: 0.17, hill: 0.2, forest: 0.12, falloff: 0.2 },
  islands: { name: 'Inseln', water: 0.32, mountain: 0.05, hill: 0.08, forest: 0.18, falloff: 0.9 },
  plains: { name: 'Steppe', water: 0.08, mountain: 0.04, hill: 0.06, forest: 0.08, falloff: 0.3 },
};
