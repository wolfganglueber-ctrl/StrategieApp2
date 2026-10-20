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
export const MANA = { grape: 1, press: 2, sanctum: 1, freeze: 3, bomb: 4, areaheal: 2, storm: 8 };

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

export const UNITS = {
  warrior: { name: 'Krieger', cost: { food: 5, ore: 2 }, hp: 10, atk: 8, def: 8, move: 2, range: 1, desc: 'Günstig und solide.' },
  archer: { name: 'Schütze', cost: { food: 3, wood: 5 }, hp: 10, atk: 8, def: 4, move: 2, range: 2, desc: 'Greift aus 2 Feldern Entfernung an.' },
  rider: { name: 'Reiter', cost: { food: 6, wood: 2 }, hp: 10, atk: 8, def: 4, move: 3, range: 1, desc: 'Schnell – ideal zum Erobern von Dörfern.' },
  defender: { name: 'Wächter', cost: { food: 3, ore: 5 }, hp: 15, atk: 4, def: 12, move: 2, range: 1, desc: 'Starke Verteidigung, schwacher Angriff.' },
  griffin: { name: 'Greifenreiter', cost: { food: 12, wood: 4, ore: 9 }, hp: 15, atk: 12, def: 4, move: 3, range: 1, flying: true, needs: 'barracks', desc: 'Ritter auf einem Greifen: Werte wie ein Ritter, fliegt aber über Berge, Seen und eigene Einheiten. Teurer als der Ritter, braucht eine Kaserne.' },
  knight: { name: 'Ritter', cost: { food: 8, wood: 2, ore: 6 }, hp: 15, atk: 12, def: 4, move: 3, range: 1, needs: 'barracks', desc: 'Stark und schnell. Braucht eine Kaserne.' },
  tower: { name: 'Turm', cost: { wood: 6, ore: 6 }, hp: 12, atk: 8, def: 12, move: 0, range: 1, structure: true, desc: 'Verteidigungsturm, schießt auf Gegner in Reichweite.' },
  mage: { name: 'Zauberer', cost: { food: 6, wood: 4, ore: 5, mana: 3 }, upkeep: { food: 2, mana: 1 }, hp: 10, atk: 4, def: 4, move: 2, range: 1, healer: true, needs: 'sanctum', desc: 'Schutzaura: Eigene Einheiten daneben bekommen 25 % weniger Schaden, Flächenschaden halbiert. Heilt statt anzugreifen, bis 3 Felder weit. Kostet Mana und 1 Mana Unterhalt pro Runde. Höchstens einer pro Stadt.' },
  troll: { name: 'Schwarzer Troll', cost: { food: 45, wood: 25, ore: 50 }, hp: 70, atk: 28, def: 20, move: 4, range: 1, supply: 3, regen: 3, perRealm: 5, needs: 'lair', desc: 'Ein Titan: etwa zehnmal so stark wie ein Krieger, heilt jede Runde 3 Leben. Braucht eine Trollhöhle, höchstens 5 pro Reich.' },
  dragon: { name: 'Drache', cost: { food: 150, wood: 150, ore: 150 }, hp: 300, atk: 100, def: 40, move: 5, range: 1, supply: 3, regen: 6, perRealm: 1, flying: true, line: [0.75, 0.5], arrowWeak: true, needs: 'dragonlair', desc: 'Fliegt über Berge, Seen und eigene Einheiten. Angriff 100, sein Feueratem trifft auch die Gegner auf den 2 Feldern hinter dem Ziel (75 % und 50 %). Schützen und Türme treffen ihn um 60 % härter. Nur einer pro Reich.' },
  barrier: { name: 'Steinwall', cost: { wood: 6, ore: 14 }, hp: 50, atk: 0, def: 24, move: 0, range: 0, structure: true, desc: 'Sehr stabiles Wallstück, blockiert den Weg. Im Stadtgebiet setzen; benachbarte Wallstücke verbinden sich zu einer Mauer und lenken den Gegner.' },
  basilisk: { name: 'Basilisk', cost: { food: 18, wood: 8, ore: 16 }, hp: 28, atk: 12, def: 12, move: 3, range: 2, supply: 2, perRealm: 2, petrify: true, needs: 'nest', desc: 'Versteinernder Blick aus 2 Feldern: Das Ziel setzt seinen nächsten Zug aus und schlägt nicht zurück (Troll und Drache sind immun). Höchstens 2 pro Reich.' },
  trebuchet: { name: 'Tribok', cost: { food: 4, wood: 24, ore: 16 }, hp: 14, atk: 20, def: 0, move: 1, range: 5, minRange: 2, noMoveAttack: true, upkeep: { food: 2, wood: 1 }, needs: 'workshop', tech: 'counterweight', desc: 'Schwere Wurfmaschine: trifft aus bis zu 5 Feldern präzise ein einziges Feld (kein Flächenschaden), aber nicht direkt daneben und nicht nach Bewegung. Braucht Werkstatt und die Forschung Gegengewicht.' },
  catapult: { name: 'Katapult', cost: { wood: 12, ore: 10 }, hp: 12, atk: 16, def: 0, move: 2, range: 3, noMoveAttack: true, splash: 0.5, fieldMult: 0.6, upkeep: { food: 2, wood: 1 }, needs: 'workshop', desc: 'Belagerungswaffe mit Reichweite 3, nicht nach Bewegung. Gegen Städte, Türme und Wälle voller Schaden, gegen Truppen im Feld nur 60 %. Flächenschaden: Gegner neben dem Ziel bekommen die Hälfte. Unterhalt 2 Nahrung + 1 Holz. Braucht eine Werkstatt.' },
};
// Wert einer Einheit für die KI (Rohstoffsumme / 2), danach Kaufpreise verdoppeln:
// Einheiten sollen im Verhältnis zum Ertrag teuer sein (halb so viele wie früher)
export const UNIT_PRICE = 2;
for (const k of Object.keys(UNITS)) {
  let t = 0;
  for (const v of Object.values(UNITS[k].cost)) t += v;
  UNITS[k].value = t / 2;
  if (!UNITS[k].structure) for (const r of Object.keys(UNITS[k].cost)) UNITS[k].cost[r] *= UNIT_PRICE;
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
export const RANK_BONUS = { hp: 0.2, atk: 0.15, def: 0.15 };
export const MAX_RANK = 4;
// Spezialisierungen: bei jeder Stufe eine von mehreren wählen
export const PERKS = {
  charge: { name: 'Sturmangriff', icon: '🐗', desc: '+30 % Angriff, wenn die Einheit in diesem Zug gezogen ist' },
  shieldwall: { name: 'Schildwall', icon: '🛡️', desc: '+30 % Verteidigung' },
  siege: { name: 'Belagerer', icon: '🏰', desc: '+30 % Angriff gegen Einheiten in Städten und gegen Türme' },
  tough: { name: 'Zäh', icon: '💪', desc: '+25 % Leben und heilt jede Runde 2' },
  swift: { name: 'Flink', icon: '💨', desc: '+1 Bewegung' },
  hunter: { name: 'Jäger', icon: '🎯', desc: '+40 % Angriff gegen Reiter, Ritter, Trolle und Drachen' },
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
  basilisk: [['hunter', 'tough'], ['swift', 'siege']],
  dragon: [['fire', 'tough', 'swift'], ['siege', 'charge', 'hunter']],
};
export const PERK_RANKS = [2, 3, 4];
export const FLANK_BONUS = 0.1;
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
export const AURA = { radius: 1, radius2: 2, reduce: 0.25, splash: 0.5 };
export const HEAL = { base: 4, blessing: 2, range: 3 };

// Türme: Ausbaustufen 1–3
export const TOWER_LEVELS = [null,
  { hp: 12, atk: 8, def: 12, range: 1 },
  { hp: 18, atk: 12, def: 14, range: 1 },
  { hp: 24, atk: 16, def: 16, range: 2 },
];
export const TOWER_UPGRADE = [null, { wood: 12, ore: 16 }, { wood: 16, ore: 24 }];
export const TOWERS_PER_CITY = 4;
// Bauwerke im Stadtgebiet: Höchstzahl pro Stadt
export const STRUCTURE_LIMIT = { tower: TOWERS_PER_CITY, barrier: 6 };
// Die Burg (Hauptstadt, 7 Felder) trägt mehr Türme und einen ganzen Wallring
export const CASTLE_LIMIT = { tower: 6, barrier: 12 };
export function structureLimit(city, type) {
  return (city?.castle ? CASTLE_LIMIT : STRUCTURE_LIMIT)[type];
}
// Verteidigungsbonus auf allen 7 Burgfeldern (mindestens)
export const CASTLE_DEF = 2;

// Entwicklungsbaum: einmalig erforschen, gilt für das ganze Reich
export const TECH_BRANCHES = [['mil', 'Militär'], ['eco', 'Wirtschaft'], ['def', 'Verteidigung']];
export const TECHS = {
  bow: { branch: 'mil', name: 'Langbogen', icon: '🏹', cost: { food: 12, wood: 20 }, req: [], mod: { archer: { range: 1 } }, desc: 'Schützen +1 Reichweite' },
  horse: { branch: 'mil', name: 'Hufeisen', icon: '🐎', cost: { food: 20, ore: 12 }, req: [], mod: { rider: { move: 1 }, knight: { move: 1 } }, desc: 'Reiter und Ritter +1 Bewegung' },
  smith: { branch: 'mil', name: 'Schmiedekunst', icon: '⚒️', cost: { wood: 12, ore: 24 }, req: [], mod: { melee: { atk: 2 } }, desc: 'Nahkämpfer +2 Angriff' },
  armor: { branch: 'mil', name: 'Plattenrüstung', icon: '🥋', cost: { food: 16, ore: 36 }, req: ['smith'], mod: { all: { def: 2 } }, desc: 'Alle Einheiten +2 Verteidigung' },
  oxcart: { branch: 'mil', name: 'Ochsenkarren', icon: '🐂', cost: { food: 12, wood: 24 }, req: [], mod: { catapult: { move: 1 } }, desc: 'Katapulte +1 Bewegung' },
  ballistics: { branch: 'mil', name: 'Ballistik', icon: '🎯', cost: { wood: 32, ore: 28 }, req: ['oxcart'], mod: { catapult: { range: 1, atk: 4 } }, desc: 'Katapulte +1 Reichweite, +4 Angriff' },
  counterweight: { branch: 'mil', name: 'Gegengewicht', icon: '🪨', cost: { wood: 36, ore: 30 }, req: ['ballistics'], desc: 'Ermöglicht den Tribok (Werkstatt): präziser Fernschuss bis 5 Felder' },
  siegecart: { branch: 'mil', name: 'Lafettenwagen', icon: '🛞', cost: { food: 100, wood: 100, ore: 50 }, req: ['counterweight'], mod: { trebuchet: { move: 2 } }, desc: 'Triböcke +2 Bewegung' },
  stirrups: { branch: 'mil', name: 'Steigbügel', icon: '🏇', cost: { food: 20, ore: 24 }, req: ['horse'], mod: { knight: { atk: 4 }, rider: { atk: 2 }, griffin: { atk: 4 } }, desc: 'Ritter und Greifenreiter +4 Angriff, Reiter +2 Angriff' },
  tactics: { branch: 'mil', name: 'Schlachtordnung', icon: '🚩', cost: { food: 24, wood: 12, ore: 20 }, req: ['smith'], desc: 'Flankenbonus +15 % statt +10 % je Nachbar' },
  roads: { branch: 'mil', name: 'Straßenbau', icon: '🛤️', cost: { food: 24, wood: 24, ore: 12 }, req: ['oxcart'], mod: { foot: { move: 1 } }, desc: 'Krieger, Schützen, Wächter +1 Bewegung' },
  plough: { branch: 'eco', name: 'Pflug', icon: '🌱', cost: { wood: 16 }, req: [], desc: 'Bauernhöfe +2 Nahrung' },
  saw: { branch: 'eco', name: 'Sägewerk', icon: '🪓', cost: { food: 16, ore: 8 }, req: [], desc: 'Holzfäller +2 Holz' },
  mining: { branch: 'eco', name: 'Bergbau', icon: '⛏️', cost: { food: 16, wood: 16 }, req: [], desc: 'Minen +2 Erz' },
  guild: { branch: 'eco', name: 'Handelsgilde', icon: '💰', cost: { food: 45, wood: 40, ore: 30 }, req: ['plough'], desc: 'Handel 2:1 statt 3:1 (braucht einen Markt)' },
  rotation: { branch: 'eco', name: 'Dreifelderwirtschaft', icon: '🌾', cost: { wood: 20, ore: 10 }, req: ['plough'], desc: 'Bauernhöfe weitere +2 Nahrung' },
  smelting: { branch: 'eco', name: 'Erzschmelze', icon: '🔥', cost: { food: 20, wood: 20 }, req: ['mining'], desc: 'Minen weitere +2 Erz' },
  granary: { branch: 'eco', name: 'Kornspeicher', icon: '🏚️', cost: { food: 10, wood: 26, ore: 10 }, req: ['plough'], desc: 'Unterhalt der Armee: ein Viertel weniger Nahrung' },
  masonry: { branch: 'eco', name: 'Baukunst', icon: '🏛️', cost: { wood: 24, ore: 16 }, req: ['saw', 'mining'], desc: 'Stadtausbau 25 % günstiger' },
  medic: { branch: 'def', name: 'Heilkunde', icon: '🌿', cost: { food: 28 }, req: [], desc: 'Einheiten heilen 2 mehr' },
  stonework: { branch: 'def', name: 'Steinmetz', icon: '🧱', cost: { wood: 12, ore: 20 }, req: [], desc: 'Türme +6 Leben, Mauern stärker (×2,6)' },
  enlight: { branch: 'def', name: 'Erleuchtung', icon: '✨', cost: { food: 20, ore: 18, mana: 10 }, req: ['medic'], desc: 'Schutzaura der Zauberer reicht 2 Felder weit' },
  blessing: { branch: 'def', name: 'Segen', icon: '🙏', cost: { food: 24, wood: 14, mana: 10 }, req: ['medic'], desc: 'Zauberer heilen 2 mehr und beenden die Erschütterung' },
  battlements: { branch: 'def', name: 'Wehrgang', icon: '🏯', cost: { wood: 20, ore: 30 }, req: ['stonework'], desc: 'Steinwälle +25 Leben' },
  keep: { branch: 'def', name: 'Burgausbau', icon: '🏰', cost: { food: 20, wood: 24, ore: 30 }, req: ['stonework'], desc: 'Alle 7 Burgfelder: Verteidigung +25 %' },
  towers2: { branch: 'def', name: 'Turmbaukunst', icon: '🗼', cost: { wood: 20, ore: 28 }, req: ['stonework'], mod: { tower: { range: 1, atk: 4 } }, desc: 'Türme +1 Reichweite, +4 Angriff' },
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
    U('w2', 'Eisenhelm', '+2 Verteidigung, trägt jetzt Helm', { def: 2 }),
    [U('w3a', 'Beidhändig', 'Zwei Schwerter statt Schild: +4 Angriff', { atk: 4 }), U('w3b', 'Schildkämpfer', 'Großer Schild: +4 Verteidigung, +2 Leben', { def: 4, hp: 2 })],
    U('w4', 'Kettenhemd', '+4 Leben, +2 Verteidigung', { hp: 4, def: 2 }),
    U('w5', 'Klingenmeister', 'Schwarze Rüstung: +4 Angriff, +1 Bewegung', { atk: 4, move: 1 }),
  ],
  rider: [
    U('r1', 'Sattelzeug', '+1 Bewegung', { move: 1 }),
    U('r2', 'Rundschild', '+2 Verteidigung', { def: 2 }),
    [U('r3a', 'Säbelreiter', 'Krummsäbel: +4 Angriff, Sturmangriff', { atk: 4 }, 'charge'), U('r3b', 'Plänkler', 'Wurfspeere: greift aus 2 Feldern an', { range: 1 })],
    U('r4', 'Kettenpanzer', '+4 Leben', { hp: 4 }),
    U('r5', 'Steppenfürst', 'Schwarze Rüstung: +2 Angriff, +1 Bewegung', { atk: 2, move: 1 }),
  ],
  defender: [
    U('d1', 'Pavese', 'Großer Setzschild: +2 Verteidigung', { def: 2 }),
    U('d2', 'Hellebarde', '+2 Angriff', { atk: 2 }),
    [U('d3a', 'Schildwall', '+6 Verteidigung', { def: 6 }), U('d3b', 'Pikenier', 'Lange Pike: +40 % gegen Reiter, Ritter, Trolle, Drachen', {}, 'hunter')],
    U('d4', 'Plattenrüstung', '+5 Leben', { hp: 5 }),
    U('d5', 'Turmwächter', 'Schwarze Rüstung: +4 Verteidigung, +1 Bewegung', { def: 4, move: 1 }),
  ],
  knight: [
    U('k1', 'Lanze', 'Turnierlanze statt Schwert: +4 Angriff', { atk: 4 }),
    U('k2', 'Plattenrüstung', 'Helm und Rossharnisch: +4 Verteidigung, +3 Leben', { def: 4, hp: 3 }),
    [U('k3a', 'Chevalier', 'Extralange Lanze: Nahkämpfer schlagen nicht zurück, +2 Angriff', { atk: 2 }, 'lance'), U('k3b', 'Schwerer Ritter', '+6 Leben, +2 Verteidigung', { hp: 6, def: 2 })],
    U('k4', 'Schwarzer Ritter', 'Schwarze Rüstung: +4 Angriff, +2 Verteidigung', { atk: 4, def: 2 }),
    U('k5', 'Ordensritter', '+1 Bewegung, heilt jede Runde 2', { move: 1, regen: 2 }),
  ],
  griffin: [
    U('f1', 'Sattelgurt', '+4 Leben', { hp: 4 }),
    U('f2', 'Greifenkrallen', '+4 Angriff', { atk: 4 }),
    [U('f3a', 'Sturzflug', 'Sturmangriff: +30 % Angriff nach dem Ziehen', {}, 'charge'), U('f3b', 'Gepanzerter Greif', '+4 Verteidigung, +4 Leben', { def: 4, hp: 4 })],
    U('f4', 'Weite Schwingen', '+1 Bewegung', { move: 1 }),
    U('f5', 'Greifenkönig', '+4 Angriff, +2 Verteidigung', { atk: 4, def: 2 }),
  ],
  archer: [
    U('a1', 'Eibenbogen', '+2 Angriff', { atk: 2 }),
    U('a2', 'Lederkappe', '+3 Leben', { hp: 3 }),
    [U('a3a', 'Langbogenschütze', 'Riesiger Langbogen: +1 Reichweite', { range: 1 }), U('a3b', 'Brandpfeile', '+4 Angriff, Flächenschaden 25 %', { atk: 4 }, 'fire')],
    U('a4', 'Waldläufer', '+1 Bewegung', { move: 1 }),
    U('a5', 'Meisterschütze', '+4 Angriff, +2 Verteidigung', { atk: 4, def: 2 }),
  ],
  mage: [
    U('m1', 'Kristallstab', '+3 Leben', { hp: 3 }),
    U('m2', 'Robe der Weisen', '+2 Verteidigung', { def: 2 }),
    [U('m3a', 'Kriegsmagier', 'Feuerkugel: +8 Angriff, +1 Reichweite', { atk: 8, range: 1 }), U('m3b', 'Heiliger Hüter', 'Schutzaura 1 Feld weiter', {}, 'wideaura')],
    U('m4', 'Elixier', 'Heilt 3 mehr', {}, 'greatheal'),
    U('m5', 'Erzmagier', '+4 Angriff, +4 Verteidigung', { atk: 4, def: 4 }),
  ],
  basilisk: [
    U('b1', 'Härtere Schuppen', '+2 Verteidigung', { def: 2 }),
    U('b2', 'Giftzahn', '+4 Angriff', { atk: 4 }),
    [U('b3a', 'Gorgonenblick', '+1 Reichweite', { range: 1 }), U('b3b', 'Panzerechse', '+8 Leben', { hp: 8 })],
    U('b4', 'Flinke Läufe', '+1 Bewegung', { move: 1 }),
    U('b5', 'Urbasilisk', '+4 Angriff, +6 Leben', { atk: 4, hp: 6 }),
  ],
  catapult: [
    U('c1', 'Spannwerk', '+2 Angriff', { atk: 2 }),
    U('c2', 'Eisenbeschlag', '+4 Leben', { hp: 4 }),
    [U('c3a', 'Präzisionswurf', '+6 Angriff, kein Flächenschaden', { atk: 6 }, 'precise'), U('c3b', 'Streugeschosse', 'Flächenschaden +25 Prozentpunkte', {}, 'fire')],
    U('c4', 'Feldlafette', '+1 Bewegung', { move: 1 }),
    U('c5', 'Schnellladung', '+4 Angriff, darf nach dem Ziehen schießen', { atk: 4 }, 'mobile'),
  ],
  trebuchet: [
    U('t1', 'Verstärkter Arm', '+4 Angriff', { atk: 4 }),
    U('t2', 'Schutzschirm', '+5 Leben, +2 Verteidigung', { hp: 5, def: 2 }),
    [U('t3a', 'Explosive Geschosse', 'Flächenschaden 40 % auf die Nachbarn', {}, 'blast'), U('t3b', 'Riesenkugeln', '+8 Angriff gegen das Einzelziel', { atk: 8 })],
    U('t4', 'Bleigegengewicht', '+1 Reichweite', { range: 1 }),
    U('t5', 'Belagerungsmeister', '+4 Angriff, darf nach dem Ziehen schießen', { atk: 4 }, 'mobile'),
  ],
  troll: [
    U('o1', 'Kriegsbemalung', '+4 Angriff', { atk: 4 }),
    U('o2', 'Eisenkette', '+8 Leben', { hp: 8 }),
    [U('o3a', 'Wüterich', 'Trifft auch die Nachbarn des Ziels (30 %)', {}, 'rampage'), U('o3b', 'Steinhaut', '+8 Verteidigung', { def: 8 })],
    U('o4', 'Trollblut', 'Heilt jede Runde 2 mehr', { regen: 2 }),
    U('o5', 'Trollkönig', '+8 Angriff, +1 Bewegung', { atk: 8, move: 1 }),
  ],
  dragon: [
    U('g1', 'Drachenpanzer', '+8 Verteidigung', { def: 8 }),
    U('g2', 'Glutatem', '+12 Angriff', { atk: 12 }),
    [U('g3a', 'Flammenschwall', 'Feueratem trifft auch die Nachbarn (25 %)', {}, 'fire'), U('g3b', 'Panzerdrache', '+60 Leben', { hp: 60 })],
    U('g4', 'Sturmschwingen', '+1 Bewegung', { move: 1 }),
    U('g5', 'Ahnendrache', '+16 Angriff, heilt 4 mehr', { atk: 16, regen: 4 }),
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
// Angriff, Verteidigung und Leben je 3 Stufen (+25 %, +75 %, +150 %, aufgerundet); jede Stufe kostet etwas
// weniger als eine neue Einheit dieses Typs. Dazu Fähigkeiten je Einheitenklasse.
export const BOOST_PCT = [0, 25, 75, 150];
export const BOOST_COST = [60, 75, 90]; // Prozent des Kaufpreises
export const BOOST_STATS = [['atk', 'Angriff', '⚔'], ['def', 'Verteidigung', '🛡'], ['hp', 'Leben', '❤']];
export const SKILLS = {
  regen: { name: 'Selbstheilung', icon: '💚', desc: 'Heilt jede Runde 10 % des maximalen Lebens' },
  hold: { name: 'Stellung halten', icon: '🪨', desc: '+20 % Verteidigung, wenn die Einheit in ihrem Zug nicht gezogen ist' },
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

export const CITY_MAX_LEVEL = 8;
export const CITY_NAMES = ['', 'Dorf', 'Siedlung', 'Stadt', 'Burgstadt', 'Metropole', 'Großmetropole', 'Residenzstadt', 'Kaiserstadt'];
export const START_RES = { food: 6, wood: 6, ore: 4, mana: 0 };
export const TRADE_RATE = 3;
export const TRADE_RATE_GUILD = 2;

// Gebäude: jede Stadt hat so viele Bauplätze wie ihre Stufe (höchstens 6)
export const BUILDINGS = {
  farm: { art: 'einen', name: 'Bauernhof', icon: '🌾', eco: 'food', cost: { wood: 10, ore: 10 }, desc: '1 Nahrung je Wiese/See im Stadtkreis, mit jeder weiteren Stadtstufe +½ je Feld' },
  lumber: { art: 'einen', name: 'Holzfäller', icon: '🌲', eco: 'wood', cost: { food: 10, ore: 10 }, desc: '1 Holz je Wald im Stadtkreis, mit jeder weiteren Stadtstufe +½ je Feld' },
  mine: { art: 'eine', name: 'Mine', icon: '⛏️', eco: 'ore', cost: { food: 10, wood: 10 }, desc: '1 Erz je Hügel, Lehm oder Grube im Stadtkreis, 2 je Gebirge, mit jeder weiteren Stadtstufe +½ je Feld' },
  barracks: { art: 'eine', name: 'Kaserne', icon: '🛡️', cost: { wood: 6, ore: 4 }, desc: 'Ritter möglich, neue Einheiten können sofort ziehen' },
  workshop: { art: 'eine', name: 'Werkstatt', icon: '⚙️', cost: { wood: 8, ore: 4 }, desc: 'Katapulte möglich' },
  wall: { art: 'eine', name: 'Mauer', icon: '🧱', cost: { wood: 4, ore: 6 }, desc: 'Verteidigung in der Stadt ×2,2' },
  sanctum: { art: 'einen', name: 'Turm der Weisen', icon: '🔮', cost: { wood: 6, ore: 6 }, desc: 'Zauberer möglich, +1 Mana' },
  press: { art: 'eine', name: 'Kelterei', icon: '🍇', eco: 'mana', cost: { food: 10, wood: 10 }, desc: '1 Mana je Traubenhain im Stadtkreis, mit jeder weiteren Stadtstufe +½ je Feld' },
  nest: { art: 'ein', name: 'Basiliskennest', icon: '🦎', cost: { food: 10, wood: 8, ore: 12 }, minLevel: 3, desc: 'Basilisk möglich (Stadt ab Stufe 3)' },
  lair: { art: 'eine', name: 'Trollhöhle', icon: '🦴', cost: { food: 10, wood: 12, ore: 16 }, minLevel: 4, desc: 'Schwarzer Troll möglich (Stadt ab Stufe 4)' },
  market: { art: 'einen', name: 'Markt', icon: '⚖️', cost: { food: 16, wood: 16, ore: 8 }, perRealm: 1, desc: 'Erlaubt Handel (3:1, mit Handelsgilde 2:1), einer pro Reich' },
  dragonlair: { art: 'eine', name: 'Drachenhöhle', icon: '🐉', cost: { food: 20, wood: 20, ore: 30 }, perRealm: 1, desc: 'Drache möglich (nur eine im Reich)' },
};
export const BUILDING_ORDER = ['farm', 'lumber', 'mine', 'press', 'market', 'barracks', 'workshop', 'sanctum', 'nest', 'lair', 'dragonlair', 'wall'];
// Gruppen im Bau-Menü
export const ECO_BUILDINGS = ['farm', 'lumber', 'mine', 'press', 'market'];
// Bauernhof, Holzfäller, Mine und Kelterei belegen keinen Bauplatz
export function slotsUsed(city) {
  return city.buildings.filter((b) => !BUILDINGS[b]?.eco).length;
}
// Jede Hauptstadt startet mit Bauernhof, Holzfäller und Mine
export const START_BUILDINGS = ['farm', 'lumber', 'mine'];
// Versorgung: wie viele Einheiten eine Stadt unterhält (bewusst knapp: wenige, aber wertvolle Einheiten)
export function citySupply(city) {
  return [0, 2, 2, 3, 4, 5, 6, 7, 8][city.level];
}
// Jede Stadt besitzt 2 Felder Gebiet um sich herum
export function cityRadius() {
  return 2;
}
export const MAX_SLOTS = 6;
// Gelände umgestalten im Stadtgebiet: Wiese aufforsten (Wald), Grube graben (Erz) oder Traubenhain anlegen (Mana),
// je fertig nach 3 Runden; Wald roden (sofort Holz, wird Wiese)
export const PLANT_COST = { food: 10, wood: 5 };
export const PLANT_KINDS = { forest: { name: 'Aufforsten', icon: '🌱', what: 'Wald' }, pit: { name: 'Grube graben', icon: '⛏️', what: 'Erzgrube' }, vine: { name: 'Traubenhain', icon: '🍇', what: 'Traubenhain' } };
export const PLANT_ROUNDS = 3;
export const CLEAR_WOOD = 15;
// Bauernhof/Holzfäller/Mine/Kelterei: je passendem Feld 1 auf Stufe 1 (ohne Feld nichts), mit jeder weiteren Stadtstufe +½ je Feld
// (gleichmäßiger Zuwachs, aufgerundet auf die ganze Stadt) – hohe Stufen lohnen sich in langen Partien
export function buildingYield(tiles, level) {
  return Math.ceil((tiles * (level + 1)) / 2);
}
// Versorgung: Einheiten über der Versorgung der Städte kosten doppelten, über dem 1,5-Fachen dreifachen Unterhalt
export function citySlots(city) {
  return Math.min(MAX_SLOTS, city.level);
}
export function upgradeCost(city) {
  return [null, { food: 8, wood: 8 }, { food: 14, wood: 12, ore: 6 }, { food: 26, wood: 22, ore: 16 }, { food: 44, wood: 38, ore: 32 },
    { food: 70, wood: 62, ore: 54 }, { food: 105, wood: 95, ore: 85 }, { food: 150, wood: 135, ore: 120 }][city.level];
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
  { level: 1, name: 'Anfänger', desc: 'Lässt dich etwa 16 Runden in Ruhe, holt sich Dörfer nur langsam, forscht kaum und macht viele Fehler.' },
  { level: 2, name: 'Leicht', desc: 'Etwa 11 Runden Schonfrist, gemächliche Ausbreitung, wenig Forschung.' },
  { level: 3, name: 'Normal', desc: 'Etwa 7 Runden Schonfrist, achtet auf Gefahren und Fokusfeuer, baut Wirtschaft und Forschung solide aus.' },
  { level: 4, name: 'Schwer', desc: 'Nur 3 Runden Schonfrist, breitet sich zügig aus, forscht eifrig, macht selten Fehler.' },
  { level: 5, name: 'Meister', desc: 'Keine Schonfrist, schnappt sich Dörfer früh, forscht und baut maximal, spielt fehlerfrei.' },
  { level: 6, name: 'Kaiser', desc: 'Wie Meister, mit größerer Armee und +50 % Rohstoffen.' },
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
  mixed: { name: 'Gemischt', water: 0.12, mountain: 0.07, hill: 0.12, forest: 0.18, falloff: 0.35 },
  forest: { name: 'Wälder', water: 0.08, mountain: 0.05, hill: 0.1, forest: 0.3, falloff: 0.25 },
  mountains: { name: 'Gebirge', water: 0.06, mountain: 0.16, hill: 0.18, forest: 0.14, falloff: 0.2 },
  islands: { name: 'Inseln', water: 0.3, mountain: 0.05, hill: 0.09, forest: 0.18, falloff: 0.9 },
  plains: { name: 'Steppe', water: 0.08, mountain: 0.05, hill: 0.08, forest: 0.12, falloff: 0.3 },
};
