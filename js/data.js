// Spieldaten: Gelände, Rohstoffe, Einheiten, Städte, Farben, Schwierigkeitsstufen.

// Grundrohstoffe (Gelände, Handel) und Mana für alles Magische
export const BASE_RES = ['food', 'wood', 'ore'];
export const RES = [...BASE_RES, 'mana'];
export const RES_INFO = {
  food: { name: 'Nahrung', short: 'Nahr.' },
  wood: { name: 'Holz', short: 'Holz' },
  ore: { name: 'Erz', short: 'Erz' },
  mana: { name: 'Mana', short: 'Mana' },
};
// Mana: Traubenhaine mit Kelterei und Turm der Weisen (+1); Zauberkosten je Einsatz
export const MANA = { grape: 1, press: 2, sanctum: 1, freeze: 3, bomb: 4, areaheal: 2, storm: 8, fuse: 50 };

// Gelände liefert Rohstoffe, wenn es im Gebiet einer eigenen Stadt liegt und dort das passende Gebäude steht (n: Felder-Wert, Gebirge 2).
// Bewegung: alles passierbar außer Gebirge und Wasser.
export const TERRAIN = {
  plain: { name: 'Wiese', pass: true, res: 'food' },
  forest: { name: 'Wald', pass: true, res: 'wood' },
  hill: { name: 'Hügel', pass: true, res: 'ore' },
  mountain: { name: 'Gebirge', pass: false, res: 'ore', n: 2 },
  water: { name: 'See', pass: false, res: 'food' },
  clay: { name: 'Lehm', pass: true, res: 'ore' }, // gesprengtes Gebirge
};

// Angriffsarten: Nahkampf, Fernkampf, Wucht (Belagerung, Keule), Feuer/Magie
export const ATK_TYPES = { melee: 'Nahkampf', ranged: 'Fernkampf', siege: 'Wucht', magic: 'Feuer/Magie' };
export const ATK_TYPE = {
  warrior: 'melee', rider: 'melee', defender: 'melee', knight: 'melee', griffin: 'melee',
  archer: 'ranged', tower: 'ranged',
  catapult: 'siege', trebuchet: 'siege', troll: 'siege', giant: 'siege',
  dragon: 'magic', mage: 'magic', basilisk: 'magic', barrier: 'melee',
};
// Verteidigung in Prozent je Angriffsart des Angreifers: Schaden = Angriff × (100 % − Verteidigung)
export const DEF_TABLE = {
  warrior: { melee: 20, ranged: 20, siege: 10, magic: 10 },
  archer: { melee: 10, ranged: 10, siege: 0, magic: 0 },
  rider: { melee: 10, ranged: 0, siege: 0, magic: 0 },
  defender: { melee: 30, ranged: 40, siege: 20, magic: 20 },
  knight: { melee: 20, ranged: 30, siege: 10, magic: 10 },
  griffin: { melee: 15, ranged: 0, siege: 40, magic: 10 },
  catapult: { melee: 0, ranged: 50, siege: 0, magic: 0 },
  trebuchet: { melee: 0, ranged: 50, siege: 0, magic: 0 },
  mage: { melee: 10, ranged: 10, siege: 0, magic: 40 },
  basilisk: { melee: 30, ranged: 40, siege: 20, magic: 20 },
  troll: { melee: 30, ranged: 50, siege: 10, magic: 20 },
  giant: { melee: 30, ranged: 50, siege: 10, magic: 20 },
  dragon: { melee: 50, ranged: 0, siege: 30, magic: 60 },
  tower: { melee: 30, ranged: 50, siege: 0, magic: 30 },
  barrier: { melee: 60, ranged: 70, siege: 0, magic: 50 },
};
export const DEF_MAX = 80; // Verteidigung höchstens 80 %, niemand ist unverwundbar
// Robust gegen / anfällig für (für Beschreibungen): ab 40 % robust, bis 10 % anfällig
export function defenseWords(type) {
  const d = DEF_TABLE[type];
  if (!d) return '';
  const strong = Object.keys(ATK_TYPES).filter((k) => d[k] >= 40).map((k) => ATK_TYPES[k]);
  const weak = Object.keys(ATK_TYPES).filter((k) => d[k] <= 10).map((k) => ATK_TYPES[k]);
  return [`Greift mit ${ATK_TYPES[ATK_TYPE[type]]} an.`, strong.length ? `Robust gegen ${strong.join(', ')}.` : '', weak.length ? `Anfällig für ${weak.join(', ')}.` : ''].filter(Boolean).join(' ');
}

export const UNITS = {
  warrior: { name: 'Krieger', cost: { food: 5, ore: 2 }, hp: 10, atk: 5, def: 0, move: 2, range: 1, desc: 'Günstig und solide.' },
  archer: { name: 'Schütze', cost: { food: 3, wood: 5 }, hp: 10, atk: 4, def: 0, move: 2, range: 2, desc: 'Greift aus 2 Feldern Entfernung an.' },
  rider: { name: 'Reiter', cost: { food: 6, wood: 2 }, hp: 10, atk: 5, def: 0, move: 3, range: 1, desc: 'Schnell – ideal zum Erobern von Dörfern, stark gegen Schützen, anfällig für Pfeile.' },
  defender: { name: 'Wächter', cost: { food: 3, ore: 5 }, hp: 15, atk: 2, def: 0, move: 2, range: 1, desc: 'Hält Siedlungen gegen einzelne Angreifer, schwacher Angriff. Robuster gegen Pfeile als gegen Nahkampf.' },
  griffin: { name: 'Greifenreiter', cost: { food: 12, wood: 4, ore: 9 }, hp: 15, atk: 7, def: 0, move: 3, range: 1, flying: true, needs: 'barracks', desc: 'Ritter auf einem Greifen: Werte wie ein Ritter, fliegt aber über Berge, Seen und eigene Einheiten. Teurer als der Ritter, braucht eine Kaserne.' },
  knight: { name: 'Ritter', cost: { food: 8, wood: 2, ore: 6 }, hp: 15, atk: 7, def: 0, move: 3, range: 1, needs: 'barracks', desc: 'Stark und schnell. Braucht eine Kaserne.' },
  tower: { name: 'Turm', cost: { wood: 6, ore: 6 }, hp: 12, atk: 4, def: 0, move: 0, range: 1, structure: true, desc: 'Verteidigungsturm, schießt auf Gegner in Reichweite.' },
  mage: { name: 'Zauberer', cost: { food: 6, wood: 4, ore: 5, mana: 3 }, upkeep: { food: 2, mana: 1 }, hp: 10, atk: 2, def: 0, move: 2, range: 1, healer: true, needs: 'sanctum', desc: 'Schutzaura: Eigene Einheiten daneben +15 % Verteidigung, Flächenschaden halbiert. Heilt statt anzugreifen, bis 3 Felder weit. Kostet Mana und 1 Mana Unterhalt pro Runde. Höchstens einer pro Stadt.' },
  troll: { name: 'Schwarzer Troll', cost: { food: 45, wood: 25, ore: 50 }, hp: 70, atk: 12, def: 0, move: 4, range: 1, supply: 3, perRealm: 5, counters: 3, needs: 'lair', desc: 'Ein Titan: viel Leben und harte Schläge. Braucht eine Trollhöhle, höchstens 5 pro Reich.' },
  giant: { name: 'Riesentroll', cost: { food: 90, wood: 50, ore: 100 }, hp: 350, atk: 20, def: 0, move: 3, range: 1, supply: 3, sweep: true, counters: 3, fused: true, desc: 'Aus 5 Trollen verschmolzen (50 Mana): Leben aller fünf zusammen. Sein Rundumschlag trifft alle Gegner auf den 6 Nachbarfeldern auf einmal. Zieht 1 Feld weniger als ein Troll.' },
  dragon: { name: 'Drache', cost: { food: 150, wood: 150, ore: 150 }, hp: 120, atk: 25, def: 0, move: 5, range: 1, supply: 3, perRealm: 1, flying: true, line: [0.75, 0.5], needs: 'dragonlair', desc: 'Fliegt über Berge, Seen und eigene Einheiten. Sein Feueratem trifft auch die Gegner auf den 2 Feldern hinter dem Ziel (75 % und 50 %). Nur einer pro Reich.' },
  barrier: { name: 'Steinwall', cost: { wood: 6, ore: 14 }, hp: 50, atk: 0, def: 0, move: 0, range: 0, structure: true, desc: 'Sehr stabiles Wallstück, blockiert den Weg. Im Stadtgebiet setzen; benachbarte Wallstücke verbinden sich zu einer Mauer und lenken den Gegner.' },
  basilisk: { name: 'Basilisk', cost: { food: 18, wood: 8, ore: 16 }, hp: 28, atk: 6, def: 0, move: 3, range: 2, supply: 2, perRealm: 2, petrify: true, needs: 'nest', desc: 'Versteinernder Blick aus 2 Feldern: Das Ziel setzt seinen nächsten Zug aus und schlägt nicht zurück (Troll und Drache sind immun). Höchstens 2 pro Reich.' },
  trebuchet: { name: 'Tribok', cost: { food: 4, wood: 24, ore: 16 }, hp: 14, atk: 10, def: 0, move: 1, range: 5, minRange: 2, noMoveAttack: true, upkeep: { food: 2, wood: 1 }, needs: 'workshop', tech: 'counterweight', desc: 'Schwere Wurfmaschine: trifft aus bis zu 5 Feldern präzise ein einziges Feld (kein Flächenschaden), aber nicht direkt daneben und nicht nach Bewegung. Braucht Werkstatt und die Forschung Gegengewicht.' },
  catapult: { name: 'Katapult', cost: { wood: 12, ore: 10 }, hp: 12, atk: 8, def: 0, move: 2, range: 3, noMoveAttack: true, splash: 0.5, upkeep: { food: 2, wood: 1 }, needs: 'workshop', desc: 'Belagerungswaffe mit Reichweite 3, nicht nach Bewegung. Flächenschaden: Gegner neben dem Ziel bekommen die Hälfte. Unterhalt 2 Nahrung + 1 Holz. Braucht eine Werkstatt.' },
};
// Wert einer Einheit für die KI (Rohstoffsumme / 2), danach Kaufpreise verdoppeln:
// Einheiten sollen im Verhältnis zum Ertrag teuer sein (halb so viele wie früher)
export const UNIT_PRICE = 2;
// Feste Endpreise (Nahrung, Holz, Erz), werden nicht verdoppelt
export const UNIT_COST_FIXED = {
  defender: { food: 8, ore: 8 },
  rider: { food: 12, wood: 6 },
  knight: { food: 20, wood: 10, ore: 12 },
  griffin: { food: 25, wood: 12, ore: 15 },
  catapult: { wood: 25, ore: 25 },
  giant: { food: 180, wood: 100, ore: 200 }, // nur für Wert und Verbesserungskosten, entsteht durch Verschmelzen
};
for (const k of Object.keys(UNITS)) {
  if (UNIT_COST_FIXED[k]) UNITS[k].cost = { ...UNIT_COST_FIXED[k] };
  else if (!UNITS[k].structure) for (const r of Object.keys(UNITS[k].cost)) UNITS[k].cost[r] *= UNIT_PRICE;
  let t = 0;
  for (const v of Object.values(UNITS[k].cost)) t += v;
  UNITS[k].value = (UNITS[k].structure ? t : t / UNIT_PRICE) / 2;
}
export const UNIT_ORDER = ['warrior', 'archer', 'rider', 'defender', 'knight', 'griffin', 'catapult', 'trebuchet', 'mage', 'basilisk', 'troll', 'dragon'];
// Höchste Zugweite bei voller Entwicklung (gilt auch für Sprünge über eigene Einheiten)
export const MOVE_CAP = { catapult: 3, trebuchet: 3, rider: 6, knight: 6, griffin: 6, dragon: 6 };
export const MOVE_CAP_DEFAULT = 4;
export function moveCap(type) {
  return MOVE_CAP[type] ?? MOVE_CAP_DEFAULT;
}
export const MELEE = ['warrior', 'rider', 'defender', 'knight', 'griffin'];
export const FOOT = ['warrior', 'archer', 'defender', 'mage'];
// Ränge: je 5 besiegte Gegner eine Stufe (höchstens 3), jede Stufe bringt eine Spezialisierung – überall, für alle Einheiten
export const RANK_NAMES = ['', 'Rekrut', 'Veteran', 'Elite', 'Held'];
export const RANK_XP = [0, 0, 5, 10, 15]; // Siege bis zur Stufe
export const RANK_BONUS = { hp: 2, atk: 1, def: 5 }; // je Rangstufe: +2 Leben, +1 Angriff, +5 % Verteidigung
export const MAX_RANK = 4;
// Spezialisierungen: bei jeder Stufe eine von mehreren wählen
export const PERKS = {
  charge: { name: 'Sturmangriff', icon: '🐗', desc: '+2 Angriff, wenn die Einheit in diesem Zug gezogen ist' },
  shieldwall: { name: 'Schildwall', icon: '🛡️', desc: '+15 % Verteidigung' },
  siege: { name: 'Belagerer', icon: '🏰', desc: 'Durchschlag +20 gegen Einheiten in Städten und auf Burgfeldern sowie gegen Türme und Wälle' },
  tough: { name: 'Zäh', icon: '💪', desc: '+25 % Leben (aufgerundet) und heilt jede Runde 2' },
  swift: { name: 'Flink', icon: '💨', desc: '+1 Bewegung' },
  hunter: { name: 'Jäger', icon: '🎯', desc: 'Durchschlag +20 gegen Reiter, Ritter, Greifenreiter, Trolle und Drachen' },
  fire: { name: 'Brandgeschosse', icon: '🔥', desc: 'Flächenschaden +25 Prozentpunkte (Katapult 75 %; beim Drachen trifft der Atem zusätzlich die Nachbarn mit 25 %)' },
  greatheal: { name: 'Großheiler', icon: '💚', desc: 'Heilt 3 Leben mehr' },
  wideaura: { name: 'Weite Aura', icon: '🌀', desc: 'Schutzaura reicht 1 Feld weiter' },
  rampage: { name: 'Wüten', icon: '💥', desc: 'Trifft auch Gegner neben dem Ziel mit 30 % Schaden' },
  lance: { name: 'Lange Lanze', icon: '🗡️', desc: 'Nahkämpfer schlagen nicht zurück' },
  precise: { name: 'Präzision', icon: '🎯', desc: 'Kein Flächenschaden' },
  blast: { name: 'Sprengladung', icon: '💣', desc: 'Flächenschaden 40 %' },
  mobile: { name: 'Schnellladung', icon: '⚙️', desc: 'Schießt auch nach dem Ziehen' },
};
export const PERK_CHOICES = {
  warrior: [['charge', 'shieldwall'], ['siege', 'tough']],
  archer: [['hunter', 'siege'], ['swift', 'tough']],
  rider: [['charge', 'hunter'], ['swift', 'tough']],
  defender: [['shieldwall', 'hunter'], ['tough', 'siege']],
  knight: [['charge', 'shieldwall'], ['siege', 'tough']],
  griffin: [['charge', 'hunter'], ['swift', 'tough']],
  catapult: [['fire', 'siege'], ['tough', 'swift']],
  trebuchet: [['siege', 'hunter'], ['tough', 'swift']],
  mage: [['greatheal', 'wideaura'], ['tough', 'swift']],
  troll: [['rampage', 'tough'], ['siege', 'charge']],
  giant: [['rampage', 'tough'], ['siege', 'charge']],
  basilisk: [['hunter', 'tough'], ['swift', 'siege']],
  dragon: [['fire', 'tough', 'swift'], ['siege', 'charge', 'hunter']],
};
// Gegenschläge: jede Einheit schlägt bis zu ihrem nächsten eigenen Zug nur so oft zurück (Titanen 3-mal)
export const COUNTERS = 2;
export function counterMax(type) {
  return UNITS[type]?.counters ?? COUNTERS;
}
// Riesentroll: 5 Trolle verschmelzen, die anderen 4 stehen höchstens so weit weg
export const FUSE = { count: 5, dist: 2 };
export const PERK_RANKS = [2, 3, 4];
export const FLANK_BONUS = 1; // +1 Angriff je weiterem eigenen Nachbarn am Ziel (Schlachtordnung: +2)
export const FLANK_MAX = 3;
export const CAVALRY = ['rider', 'knight', 'griffin'];

// Zauberer: Schutzaura und Heilen
// Unterhalt pro Runde: jede Einheit isst (Nahrung je Versorgungspunkt), Katapulte brauchen zusätzlich Holz
export function upkeepOf(type) {
  const T = UNITS[type];
  if (T.structure) return {};
  // 2 Nahrung je Versorgungspunkt (Katapulte: 2 Nahrung + 1 Holz)
  return T.upkeep || { food: 2 * (T.supply || 1) };
}
export const AURA = { radius: 1, radius2: 2, def: 15, splash: 0.5 };
export const HEAL = { base: 4, blessing: 2, range: 3 };

// Türme: Ausbaustufen 1–3
export const TOWER_LEVELS = [null,
  { hp: 12, atk: 4, def: 0, range: 1 },
  { hp: 18, atk: 6, def: 10, range: 1 },
  { hp: 24, atk: 8, def: 20, range: 2 },
];
export const TOWER_UPGRADE = [null, { wood: 12, ore: 16 }, { wood: 16, ore: 24 }];
export const TOWERS_PER_CITY = 4;
// Bauwerke im Stadtgebiet: Höchstzahl pro Stadt
export const STRUCTURE_LIMIT = { tower: TOWERS_PER_CITY, barrier: 6 };
// Die Burg (Hauptstadt, 7 Felder) trägt mehr Türme und einen ganzen Wallring
export const CASTLE_LIMIT = { tower: 6, barrier: 12 };
export function structureLimit(city, type) {
  // Burgverteidigung: die Burg trägt deutlich mehr Türme und Wälle
  if (city?.bigCastle) return { tower: 10, barrier: 18 }[type];
  return (city?.castle ? CASTLE_LIMIT : STRUCTURE_LIMIT)[type];
}
// Verteidigungsbonus auf allen 7 Burgfeldern (mindestens)
export const CASTLE_DEF = 30; // Prozentpunkte auf allen 7 Burgfeldern

// Entwicklungsbaum: einmalig erforschen, gilt für das ganze Reich
export const TECH_BRANCHES = [['mil', 'Militär'], ['eco', 'Wirtschaft'], ['def', 'Verteidigung']];
export const TECHS = {
  bow: { branch: 'mil', name: 'Langbogen', icon: '🏹', cost: { food: 12, wood: 20 }, req: [], mod: { archer: { range: 1 } }, desc: 'Schützen +1 Reichweite' },
  horse: { branch: 'mil', name: 'Hufeisen', icon: '🐎', cost: { food: 20, ore: 12 }, req: [], mod: { rider: { move: 1 }, knight: { move: 1 } }, desc: 'Reiter und Ritter +1 Bewegung' },
  smith: { branch: 'mil', name: 'Schmiedekunst', icon: '⚒️', cost: { wood: 12, ore: 24 }, req: [], mod: { melee: { atk: 1 } }, desc: 'Nahkämpfer +1 Angriff' },
  armor: { branch: 'mil', name: 'Plattenrüstung', icon: '🥋', cost: { food: 16, ore: 36 }, req: ['smith'], mod: { all: { def: 5 } }, desc: 'Alle Einheiten +5 % Verteidigung' },
  oxcart: { branch: 'mil', name: 'Ochsenkarren', icon: '🐂', cost: { food: 12, wood: 24 }, req: [], mod: { catapult: { move: 1 } }, desc: 'Katapulte +1 Bewegung' },
  ballistics: { branch: 'mil', name: 'Ballistik', icon: '🎯', cost: { wood: 32, ore: 28 }, req: ['oxcart'], mod: { catapult: { range: 1, atk: 2 } }, desc: 'Katapulte +1 Reichweite, +2 Angriff' },
  counterweight: { branch: 'mil', name: 'Gegengewicht', icon: '🪨', cost: { wood: 36, ore: 30 }, req: ['ballistics'], desc: 'Ermöglicht den Tribok (Werkstatt): präziser Fernschuss bis 5 Felder' },
  siegecart: { branch: 'mil', name: 'Lafettenwagen', icon: '🛞', cost: { food: 100, wood: 100, ore: 50 }, req: ['counterweight'], mod: { trebuchet: { move: 2 } }, desc: 'Triböcke +2 Bewegung' },
  stirrups: { branch: 'mil', name: 'Steigbügel', icon: '🏇', cost: { food: 20, ore: 24 }, req: ['horse'], mod: { knight: { atk: 2 }, rider: { atk: 1 }, griffin: { atk: 2 } }, desc: 'Ritter und Greifenreiter +2 Angriff, Reiter +1 Angriff' },
  tactics: { branch: 'mil', name: 'Schlachtordnung', icon: '🚩', cost: { food: 24, wood: 12, ore: 20 }, req: ['smith'], desc: 'Flankenbonus +2 statt +1 Angriff je Nachbar' },
  roads: { branch: 'mil', name: 'Straßenbau', icon: '🛤️', cost: { food: 24, wood: 24, ore: 12 }, req: ['oxcart'], mod: { foot: { move: 1 } }, desc: 'Krieger, Schützen, Wächter +1 Bewegung' },
  plough: { branch: 'eco', name: 'Pflug', icon: '🌱', cost: { food: 40, wood: 50, ore: 40 }, req: [], desc: '+50 % Nahrung im ganzen Reich' },
  saw: { branch: 'eco', name: 'Sägewerk', icon: '🪓', cost: { food: 45, ore: 20 }, req: [], desc: '+50 % Holz im ganzen Reich' },
  mining: { branch: 'eco', name: 'Bergbau', icon: '⛏️', cost: { food: 55, wood: 40 }, req: [], desc: '+50 % Erz im ganzen Reich' },
  guild: { branch: 'eco', name: 'Handelsgilde', icon: '💰', cost: { food: 45, wood: 40, ore: 30 }, req: ['plough'], desc: 'Handel 2:1 statt 3:1 (braucht einen Markt)' },
  granary: { branch: 'eco', name: 'Kornspeicher', icon: '🏚️', cost: { food: 10, wood: 26, ore: 10 }, req: ['plough'], desc: 'Unterhalt der Armee: ein Viertel weniger Nahrung' },
  masonry: { branch: 'eco', name: 'Baukunst', icon: '🏛️', cost: { wood: 24, ore: 16 }, req: ['saw', 'mining'], desc: 'Stadtausbau 25 % günstiger' },
  medic: { branch: 'def', name: 'Heilkunde', icon: '🌿', cost: { food: 28 }, req: [], desc: 'Zauberer heilen 2 mehr' },
  stonework: { branch: 'def', name: 'Steinmetz', icon: '🧱', cost: { wood: 12, ore: 20 }, req: [], desc: 'Türme +6 Leben, Mauer +10 % Verteidigung mehr (50 % statt 40 %)' },
  enlight: { branch: 'def', name: 'Erleuchtung', icon: '✨', cost: { food: 20, ore: 18, mana: 10 }, req: ['medic'], desc: 'Schutzaura der Zauberer reicht 2 Felder weit' },
  blessing: { branch: 'def', name: 'Segen', icon: '🙏', cost: { food: 24, wood: 14, mana: 10 }, req: ['medic'], desc: 'Zauberer heilen 2 mehr' },
  battlements: { branch: 'def', name: 'Wehrgang', icon: '🏯', cost: { wood: 20, ore: 30 }, req: ['stonework'], desc: 'Steinwälle +25 Leben' },
  keep: { branch: 'def', name: 'Burgausbau', icon: '🏰', cost: { food: 20, wood: 24, ore: 30 }, req: ['stonework'], desc: 'Alle 7 Burgfelder: +10 % Verteidigung (40 % statt 30 %)' },
  towers2: { branch: 'def', name: 'Turmbaukunst', icon: '🗼', cost: { wood: 20, ore: 28 }, req: ['stonework'], mod: { tower: { range: 1, atk: 2 } }, desc: 'Türme +1 Reichweite, +2 Angriff' },
};
export const TECH_ORDER = Object.keys(TECHS);

// Einheiten-Entwicklung: für jede Einheit 5 Stufen, die 3. Stufe ist eine Wahl zwischen zwei Richtungen.
// mod: Werte (hp, atk, def, move, range, regen) · perk: Sonderfähigkeit wie bei den Rängen (siehe PERKS)
// Jede Stufe verändert auch das Aussehen der Einheit.
export const UP_GROUPS = [
  ['melee', 'Nahkämpfer', ['warrior', 'rider', 'defender', 'knight', 'griffin']],
  ['ranged', 'Fernkämpfer', ['archer', 'basilisk']],
  ['mage', 'Zauberer', ['mage']],
  ['siege', 'Katapulte', ['catapult', 'trebuchet']],
  ['titan', 'Titanen', ['troll', 'dragon']],
];
const U = (id, name, desc, mod = {}, perk = null) => ({ id, name, desc, mod, perk });
export const UNIT_UPS = {
  warrior: [
    U('w1', 'Gesteppter Waffenrock', '+3 Leben', { hp: 3 }),
    U('w2', 'Eisenhelm', '+5 % Verteidigung, trägt jetzt Helm', { def: 5 }),
    [U('w3a', 'Beidhändig', 'Zwei Schwerter statt Schild: +2 Angriff', { atk: 2 }), U('w3b', 'Schildkämpfer', 'Großer Schild: +10 % Verteidigung, +2 Leben', { def: 10, hp: 2 })],
    U('w4', 'Kettenhemd', '+4 Leben, +5 % Verteidigung', { hp: 4, def: 5 }),
    U('w5', 'Klingenmeister', 'Schwarze Rüstung: +2 Angriff, +1 Bewegung', { atk: 2, move: 1 }),
  ],
  rider: [
    U('r1', 'Sattelzeug', '+1 Bewegung', { move: 1 }),
    U('r2', 'Rundschild', '+5 % Verteidigung', { def: 5 }),
    [U('r3a', 'Säbelreiter', 'Krummsäbel: +2 Angriff, Sturmangriff', { atk: 2 }, 'charge'), U('r3b', 'Plänkler', 'Wurfspeere: greift aus 2 Feldern an', { range: 1 })],
    U('r4', 'Kettenpanzer', '+4 Leben', { hp: 4 }),
    U('r5', 'Steppenfürst', 'Schwarze Rüstung: +1 Angriff, +1 Bewegung', { atk: 1, move: 1 }),
  ],
  defender: [
    U('d1', 'Pavese', 'Großer Setzschild: +5 % Verteidigung', { def: 5 }),
    U('d2', 'Hellebarde', '+1 Angriff', { atk: 1 }),
    [U('d3a', 'Schildwall', '+15 % Verteidigung', { def: 15 }), U('d3b', 'Pikenier', 'Lange Pike: Durchschlag +20 gegen Reiter, Ritter, Greifenreiter, Trolle, Drachen', {}, 'hunter')],
    U('d4', 'Plattenrüstung', '+5 Leben', { hp: 5 }),
    U('d5', 'Turmwächter', 'Schwarze Rüstung: +10 % Verteidigung, +1 Bewegung', { def: 10, move: 1 }),
  ],
  knight: [
    U('k1', 'Lanze', 'Turnierlanze statt Schwert: +2 Angriff', { atk: 2 }),
    U('k2', 'Plattenrüstung', 'Helm und Rossharnisch: +10 % Verteidigung, +3 Leben', { def: 10, hp: 3 }),
    [U('k3a', 'Chevalier', 'Extralange Lanze: Nahkämpfer schlagen nicht zurück, +1 Angriff', { atk: 1 }, 'lance'), U('k3b', 'Schwerer Ritter', '+6 Leben, +5 % Verteidigung', { hp: 6, def: 5 })],
    U('k4', 'Schwarzer Ritter', 'Schwarze Rüstung: +2 Angriff, +5 % Verteidigung', { atk: 2, def: 5 }),
    U('k5', 'Ordensritter', '+1 Bewegung, +3 Leben', { move: 1, hp: 3 }),
  ],
  griffin: [
    U('f1', 'Sattelgurt', '+4 Leben', { hp: 4 }),
    U('f2', 'Greifenkrallen', '+2 Angriff', { atk: 2 }),
    [U('f3a', 'Sturzflug', 'Sturmangriff: +2 Angriff nach dem Ziehen', {}, 'charge'), U('f3b', 'Gepanzerter Greif', '+10 % Verteidigung, +4 Leben', { def: 10, hp: 4 })],
    U('f4', 'Weite Schwingen', '+1 Bewegung', { move: 1 }),
    U('f5', 'Greifenkönig', '+2 Angriff, +5 % Verteidigung', { atk: 2, def: 5 }),
  ],
  archer: [
    U('a1', 'Eibenbogen', '+1 Angriff', { atk: 1 }),
    U('a2', 'Lederkappe', '+3 Leben', { hp: 3 }),
    [U('a3a', 'Langbogenschütze', 'Riesiger Langbogen: +1 Reichweite', { range: 1 }), U('a3b', 'Brandpfeile', '+2 Angriff, Flächenschaden 25 %', { atk: 2 }, 'fire')],
    U('a4', 'Waldläufer', '+1 Bewegung', { move: 1 }),
    U('a5', 'Meisterschütze', '+2 Angriff, +5 % Verteidigung', { atk: 2, def: 5 }),
  ],
  mage: [
    U('m1', 'Kristallstab', '+3 Leben', { hp: 3 }),
    U('m2', 'Robe der Weisen', '+5 % Verteidigung', { def: 5 }),
    [U('m3a', 'Kriegsmagier', 'Feuerkugel: +4 Angriff, +1 Reichweite', { atk: 4, range: 1 }), U('m3b', 'Heiliger Hüter', 'Schutzaura 1 Feld weiter', {}, 'wideaura')],
    U('m4', 'Elixier', 'Heilt 3 mehr', {}, 'greatheal'),
    U('m5', 'Erzmagier', '+2 Angriff, +10 % Verteidigung', { atk: 2, def: 10 }),
  ],
  basilisk: [
    U('b1', 'Härtere Schuppen', '+5 % Verteidigung', { def: 5 }),
    U('b2', 'Giftzahn', '+2 Angriff', { atk: 2 }),
    [U('b3a', 'Gorgonenblick', '+1 Reichweite', { range: 1 }), U('b3b', 'Panzerechse', '+8 Leben', { hp: 8 })],
    U('b4', 'Flinke Läufe', '+1 Bewegung', { move: 1 }),
    U('b5', 'Urbasilisk', '+2 Angriff, +6 Leben', { atk: 2, hp: 6 }),
  ],
  catapult: [
    U('c1', 'Spannwerk', '+1 Angriff', { atk: 1 }),
    U('c2', 'Eisenbeschlag', '+4 Leben', { hp: 4 }),
    [U('c3a', 'Präzisionswurf', '+3 Angriff, kein Flächenschaden', { atk: 3 }, 'precise'), U('c3b', 'Streugeschosse', 'Flächenschaden +25 Prozentpunkte', {}, 'fire')],
    U('c4', 'Feldlafette', '+1 Bewegung', { move: 1 }),
    U('c5', 'Schnellladung', '+2 Angriff, darf nach dem Ziehen schießen', { atk: 2 }, 'mobile'),
  ],
  trebuchet: [
    U('t1', 'Verstärkter Arm', '+2 Angriff', { atk: 2 }),
    U('t2', 'Schutzschirm', '+5 Leben, +5 % Verteidigung', { hp: 5, def: 5 }),
    [U('t3a', 'Explosive Geschosse', 'Flächenschaden 40 % auf die Nachbarn', {}, 'blast'), U('t3b', 'Riesenkugeln', '+4 Angriff gegen das Einzelziel', { atk: 4 })],
    U('t4', 'Bleigegengewicht', '+1 Reichweite', { range: 1 }),
    U('t5', 'Belagerungsmeister', '+2 Angriff, darf nach dem Ziehen schießen', { atk: 2 }, 'mobile'),
  ],
  troll: [
    U('o1', 'Kriegsbemalung', '+2 Angriff', { atk: 2 }),
    U('o2', 'Eisenkette', '+8 Leben', { hp: 8 }),
    [U('o3a', 'Wüterich', 'Trifft auch die Nachbarn des Ziels (30 %)', {}, 'rampage'), U('o3b', 'Steinhaut', '+20 % Verteidigung', { def: 20 })],
    U('o4', 'Trollblut', '+10 Leben', { hp: 10 }),
    U('o5', 'Trollkönig', '+4 Angriff, +1 Bewegung', { atk: 4, move: 1 }),
  ],
  dragon: [
    U('g1', 'Drachenpanzer', '+10 % Verteidigung', { def: 10 }),
    U('g2', 'Glutatem', '+3 Angriff', { atk: 3 }),
    [U('g3a', 'Flammenschwall', 'Feueratem trifft auch die Nachbarn (25 %)', {}, 'fire'), U('g3b', 'Panzerdrache', '+25 Leben', { hp: 25 })],
    U('g4', 'Sturmschwingen', '+1 Bewegung', { move: 1 }),
    U('g5', 'Ahnendrache', '+4 Angriff, +10 Leben', { atk: 4, hp: 10 }),
  ],
};
export const UP_INDEX = {};
for (const [type, tiers] of Object.entries(UNIT_UPS)) tiers.forEach((t, i) => (Array.isArray(t) ? t : [t]).forEach((o) => (UP_INDEX[o.id] = { ...o, type, tier: i })));
// Kosten je Stufe (Titanen teurer)
const UP_COST = [[20, 15, 20], [30, 25, 30], [45, 35, 45], [60, 50, 60], [85, 70, 85]];
export function unitUpCost(type, tier) {
  const w = type === 'dragon' ? 2.5 : type === 'troll' || type === 'basilisk' ? 1.5 : 1;
  const [f, wd, o] = UP_COST[tier];
  return { food: Math.round(f * w), wood: Math.round(wd * w), ore: Math.round(o * w) };
}

// Einzel-Verbesserungen: gelten nur für die eine ausgewählte Einheit (Kauf im Einheiten-Fenster).
// Angriff, Verteidigung, Leben und Durchschlag je 3 Stufen mit festen Zuschlägen; jede Stufe kostet etwas
// weniger als eine neue Einheit dieses Typs. Dazu Fähigkeiten je Einheitenklasse.
// Stufen 4 und 5 gibt es nur in der Burgverteidigung
export const BOOST_ADD = { atk: [0, 1, 2, 3, 4, 5], def: [0, 5, 10, 15, 20, 25], hp: [0, 3, 6, 10, 15, 20], pen: [0, 10, 20, 30, 40, 50] };
export const BOOST_MAX = 3;
export const BOOST_COST = [60, 75, 90, 105, 120]; // Prozent des Kaufpreises
export const BOOST_STATS = [['atk', 'Angriff', '⚔'], ['def', 'Verteidigung', '🛡'], ['hp', 'Leben', '❤'], ['pen', 'Durchschlag', '🗡']];
export const SKILLS = {
  regen: { name: 'Selbstheilung', icon: '💚', desc: 'Heilt jede Runde 10 % des maximalen Lebens' },
  hold: { name: 'Stellung halten', icon: '🪨', desc: '+10 % Verteidigung, wenn die Einheit in ihrem Zug nicht gezogen ist' },
  range1: { name: 'Weitschuss', icon: '🏹', desc: '+1 Reichweite' },
  range2: { name: 'Fernschuss', icon: '🎯', desc: '+2 Reichweite (statt +1)', req: 'range1' },
  firearrow: { name: 'Brandpfeile', icon: '🔥', desc: 'Flächenschaden: Gegner neben dem Ziel bekommen 25 % des Schadens' },
  freeze: { name: 'Vereisen', icon: '❄️', desc: 'Statt zu heilen einen Gegner bis 3 Felder weit vereisen: er setzt eine Runde aus (Titanen sind immun)' },
  areaheal: { name: 'Flächenheilung', icon: '✨', desc: 'Beim Heilen bekommen auch die eigenen Einheiten neben dem Ziel 25 % ihres Lebens zurück' },
  bomb: { name: 'Bergsprengung', icon: '💣', desc: 'Statt zu heilen ein Gebirge bis 3 Felder weit sprengen: es wird zu begehbarem Lehm' },
};
export const SKILL_COST = 80; // Prozent des Kaufpreises
// Klassen: Nahkämpfer, Fernkämpfer, Zauberer haben Fähigkeiten; Katapulte und Titanen nur Werte
export function unitClass(type) {
  if (MELEE.includes(type)) return 'melee';
  if (type === 'archer' || type === 'basilisk') return 'ranged';
  if (type === 'mage') return 'mage';
  if (type === 'catapult' || type === 'trebuchet') return 'siege';
  return 'titan';
}
const CLASS_SKILLS = { melee: ['regen', 'hold'], ranged: ['range1', 'range2', 'firearrow', 'regen'], mage: ['freeze', 'areaheal', 'bomb'] };
export function skillsFor(type) {
  return CLASS_SKILLS[unitClass(type)] || [];
}
function pctCost(type, pct) {
  const c = {};
  for (const [k, v] of Object.entries(UNITS[type].cost)) c[k] = Math.ceil((v * pct) / 100);
  return c;
}
// Kosten der nächsten Stufe (lvl = 0..2) bzw. einer Fähigkeit
export function boostCost(type, lvl) {
  return pctCost(type, BOOST_COST[lvl]);
}
export function skillCost(type) {
  return pctCost(type, SKILL_COST);
}

// Fünf Stadtstufen: jede Stufe +1 Rohstoff je Feld (Stufe 5 = fünffach)
export const CITY_MAX_LEVEL = 5;
export const CITY_NAMES = ['', 'Dorf', 'Stadt', 'Metropole', 'Residenzstadt', 'Kaiserstadt'];
// Wirtschaftsforschung: +50 % auf den gesamten Ertrag des Reichs (aufgerundet)
export const ECO_TECH = { food: 'plough', wood: 'saw', ore: 'mining' };
export const ECO_TECH_PCT = 0.5;
export const START_RES = { food: 6, wood: 36, ore: 4, mana: 0 };
export const TRADE_RATE = 3;
export const TRADE_RATE_GUILD = 2;

// Gebäude: jede Stadt hat so viele Bauplätze wie ihre Stufe (höchstens 6)
export const BUILDINGS = {
  farm: { art: 'einen', name: 'Bauernhof', icon: '🌾', eco: 'food', cost: { wood: 10, ore: 10 }, desc: 'Erschließt die Nahrung des äußeren Rings (Wiese/See)' },
  lumber: { art: 'einen', name: 'Holzfäller', icon: '🌲', eco: 'wood', cost: { food: 10, ore: 10 }, desc: 'Erschließt das Holz des äußeren Rings (Wald)' },
  mine: { art: 'eine', name: 'Mine', icon: '⛏️', eco: 'ore', cost: { food: 10, wood: 10 }, desc: 'Erschließt das Erz des äußeren Rings (Hügel, Lehm, Grube; Gebirge doppelt)' },
  barracks: { art: 'eine', name: 'Kaserne', icon: '🛡️', cost: { wood: 6, ore: 4 }, desc: 'Ritter möglich, neue Einheiten können sofort ziehen' },
  workshop: { art: 'eine', name: 'Werkstatt', icon: '⚙️', cost: { wood: 8, ore: 4 }, desc: 'Katapulte möglich' },
  wall: { art: 'eine', name: 'Mauer', icon: '🧱', noSlot: true, cost: { wood: 4, ore: 6 }, desc: 'Verteidigung in der Stadt +40 % statt +20 %, belegt keinen Bauplatz' },
  sanctum: { art: 'einen', name: 'Turm der Weisen', icon: '🔮', cost: { wood: 6, ore: 6 }, desc: 'Zauberer möglich, +1 Mana' },
  press: { art: 'eine', name: 'Kelterei', icon: '🍇', eco: 'mana', cost: { food: 10, wood: 10 }, desc: 'Erschließt das Mana des äußeren Rings (Traubenhain)' },
  nest: { art: 'ein', name: 'Basiliskennest', icon: '🦎', cost: { food: 10, wood: 8, ore: 12 }, minLevel: 2, desc: 'Basilisk möglich (Stadt ab Stufe 2)' },
  lair: { art: 'eine', name: 'Trollhöhle', icon: '🦴', cost: { food: 10, wood: 12, ore: 16 }, minLevel: 3, desc: 'Schwarzer Troll möglich (Stadt ab Stufe 3)' },
  market: { art: 'einen', name: 'Markt', icon: '⚖️', cost: { food: 16, wood: 16, ore: 8 }, perRealm: 1, desc: 'Erlaubt Handel (3:1, mit Handelsgilde 2:1), einer pro Reich' },
  dragonlair: { art: 'eine', name: 'Drachenhöhle', icon: '🐉', cost: { food: 20, wood: 20, ore: 30 }, perRealm: 1, desc: 'Drache möglich (nur eine im Reich)' },
};
export const BUILDING_ORDER = ['farm', 'lumber', 'mine', 'press', 'market', 'barracks', 'workshop', 'sanctum', 'nest', 'lair', 'dragonlair', 'wall'];
// Gruppen im Bau-Menü
export const ECO_BUILDINGS = ['farm', 'lumber', 'mine', 'press', 'market'];
// Bauernhof, Holzfäller, Mine, Kelterei und Mauer belegen keinen Bauplatz
export function usesSlot(b) {
  return !!BUILDINGS[b] && !BUILDINGS[b].eco && !BUILDINGS[b].noSlot;
}
export function slotsUsed(city) {
  return city.buildings.filter(usesSlot).length;
}
// Jede Hauptstadt startet mit Bauernhof, Holzfäller und Mine
export const START_BUILDINGS = ['farm', 'lumber', 'mine'];
// Versorgung: wie viele Einheiten eine Stadt unterhält (bewusst knapp: wenige, aber wertvolle Einheiten)
export function citySupply(city) {
  return [0, 3, 5, 7, 9, 11][city.level] ?? 11;
}
// Jede Stadt besitzt 2 Felder Gebiet um sich herum
export function cityRadius() {
  return 2;
}
export const MAX_SLOTS = 10;
// Gelände umgestalten im Stadtgebiet: Wiese aufforsten (Wald), Grube graben (Erz) oder Traubenhain anlegen (Mana),
// je fertig nach 3 Runden; Wald roden (sofort Holz, wird Wiese)
export const PLANT_COST = { food: 10, wood: 5 }; // Erzgrube, Traubenhain
// Kosten je Umwandlung: Aufforsten ist billig (5 Nahrung), damit genug Wald entsteht
export function plantCost(to = 'forest') {
  return to === 'forest' ? { food: 5 } : PLANT_COST;
}
export const PLANT_KINDS = { forest: { name: 'Aufforsten', icon: '🌱', what: 'Wald' }, pit: { name: 'Grube graben', icon: '⛏️', what: 'Erzgrube' }, vine: { name: 'Traubenhain', icon: '🍇', what: 'Traubenhain' } };
export const PLANT_ROUNDS = 3;
export const CLEAR_WOOD = 15;
// Bauernhof/Holzfäller/Mine/Kelterei: je passendem Feld so viel wie die Stadtstufe (1, 2, 3; ohne Feld nichts)
export function buildingYield(tiles, level) {
  return tiles * level;
}
// Versorgung: Einheiten über der Versorgung der Städte kosten doppelten, über dem 1,5-Fachen dreifachen Unterhalt
export function citySlots(city) {
  return Math.min(MAX_SLOTS, city.level * 2);
}
export function upgradeCost(city) {
  return [null, { food: 45, wood: 12, ore: 12 }, { food: 65, wood: 22, ore: 22 }, { food: 85, wood: 32, ore: 32 }, { food: 105, wood: 42, ore: 42 }][city.level];
}
export function cityDefense(city, stonework = false) {
  // Verteidigungszuschlag in Prozentpunkten: Stadt 20, mit Mauer 40 (Steinmetz 50)
  return city.buildings?.includes('wall') ? (stonework ? 50 : 40) : 20;
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
  { level: 1, name: 'Anfänger', desc: 'Lässt dich etwa 16 Runden in Ruhe, erobert höchstens 3 Städte, forscht kaum und macht viele Fehler.' },
  { level: 2, name: 'Leicht', desc: 'Etwa 11 Runden Schonfrist, erobert höchstens 5 Städte, wenig Forschung.' },
  { level: 3, name: 'Normal', desc: 'Etwa 7 Runden Schonfrist, achtet auf Gefahren und Fokusfeuer, baut Wirtschaft und Forschung solide aus.' },
  { level: 4, name: 'Schwer', desc: 'Nur 3 Runden Schonfrist, breitet sich zügig aus, baut aus und forscht eifrig, macht selten Fehler, +15 % Rohstoffe.' },
  { level: 5, name: 'Meister', desc: 'Keine Schonfrist, schnappt sich Dörfer früh, forscht und baut maximal, spielt fehlerfrei, +30 % Rohstoffe.' },
  { level: 6, name: 'Kaiser', desc: 'Wie Meister, mit größerer Armee und +50 % Rohstoffen.' },
];

// Kleinste Karte ist „Riesig“ (Klein, Mittel, Groß gibt es nicht mehr)
export const MAP_SIZES = {
  XL: { name: 'Riesig', cols: 16, rows: 21 },
  XXL: { name: 'Gewaltig', cols: 19, rows: 25 },
  XXXL: { name: 'Kolossal', cols: 22, rows: 29 },
  EPIC: { name: 'Episch', cols: 44, rows: 58 },
};

export const BIOMES = {
  mixed: { name: 'Gemischt', water: 0.12, mountain: 0.07, hill: 0.12, forest: 0.18, falloff: 0.35 },
  forest: { name: 'Wälder', water: 0.08, mountain: 0.05, hill: 0.1, forest: 0.3, falloff: 0.25 },
  mountains: { name: 'Gebirge', water: 0.06, mountain: 0.16, hill: 0.18, forest: 0.14, falloff: 0.2 },
  islands: { name: 'Inseln', water: 0.3, mountain: 0.05, hill: 0.09, forest: 0.18, falloff: 0.9 },
  plains: { name: 'Steppe', water: 0.08, mountain: 0.05, hill: 0.08, forest: 0.12, falloff: 0.3 },
};
