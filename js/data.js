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
  defender: { name: 'Wächter', cost: { food: 3, ore: 5 }, hp: 15, atk: 1, def: 3, move: 2, range: 1, desc: 'Starke Verteidigung, schwacher Angriff.' },
  knight: { name: 'Ritter', cost: { food: 8, wood: 2, ore: 6 }, hp: 15, atk: 3, def: 1, move: 3, range: 1, needs: 'barracks', desc: 'Stark und schnell. Braucht eine Kaserne.' },
  tower: { name: 'Turm', cost: { wood: 6, ore: 6 }, hp: 12, atk: 2, def: 3, move: 0, range: 1, structure: true, desc: 'Verteidigungsturm, schießt auf Gegner in Reichweite.' },
  mage: { name: 'Zauberer', cost: { food: 6, wood: 4, ore: 5 }, hp: 10, atk: 1, def: 1, move: 2, range: 1, healer: true, needs: 'sanctum', desc: 'Schutzaura: Eigene Einheiten daneben bekommen 25 % weniger Schaden, Flächenschaden halbiert. Heilt statt anzugreifen, bis 3 Felder weit. Höchstens einer pro Stadt.' },
  troll: { name: 'Schwarzer Troll', cost: { food: 45, wood: 25, ore: 50 }, hp: 70, atk: 7, def: 5, move: 2, range: 1, supply: 3, regen: 3, perRealm: 5, needs: 'lair', desc: 'Ein Titan: etwa zehnmal so stark wie ein Krieger, heilt jede Runde 3 Leben. Braucht eine Trollhöhle, höchstens 5 pro Reich.' },
  dragon: { name: 'Drache', cost: { food: 150, wood: 150, ore: 150 }, hp: 300, atk: 12, def: 10, move: 5, range: 1, supply: 3, regen: 6, perRealm: 1, flying: true, line: [0.75, 0.5], dmgMult: 2, arrowWeak: true, needs: 'dragonlair', desc: 'Fliegt über Berge, Seen und eigene Einheiten. Doppelter Schaden, und sein Feueratem trifft auch die Gegner auf den 2 Feldern hinter dem Ziel (75 % und 50 %). Schützen und Türme treffen ihn um 60 % härter. Nur einer pro Reich.' },
  barrier: { name: 'Steinwall', cost: { wood: 6, ore: 14 }, hp: 50, atk: 0, def: 6, move: 0, range: 0, structure: true, desc: 'Sehr stabiles Wallstück, blockiert den Weg. Im Stadtgebiet setzen; benachbarte Wallstücke verbinden sich zu einer Mauer und lenken den Gegner.' },
  basilisk: { name: 'Basilisk', cost: { food: 18, wood: 8, ore: 16 }, hp: 28, atk: 3, def: 3, move: 3, range: 2, supply: 2, perRealm: 2, petrify: true, needs: 'nest', desc: 'Versteinernder Blick aus 2 Feldern: Das Ziel setzt seinen nächsten Zug aus und schlägt nicht zurück (Troll und Drache sind immun). Höchstens 2 pro Reich.' },
  trebuchet: { name: 'Tribok', cost: { food: 4, wood: 24, ore: 16 }, hp: 14, atk: 5, def: 0, move: 1, range: 5, minRange: 2, noMoveAttack: true, upkeep: { food: 1, wood: 1 }, needs: 'workshop', tech: 'counterweight', desc: 'Schwere Wurfmaschine: trifft aus bis zu 5 Feldern präzise ein einziges Feld (kein Flächenschaden), aber nicht direkt daneben und nicht nach Bewegung. Braucht Werkstatt und die Forschung Gegengewicht.' },
  // Fusionseinheiten (nur im Fusionsmodus, entstehen durch Verschmelzen in der Fusionsschmiede)
  horsearcher: { name: 'Berittener Bogenschütze', fused: true, parents: ['knight', 'archer'], cost: { food: 11, wood: 7, ore: 6 }, hp: 24, atk: 3.5, def: 2, move: 5, range: 2, upkeep: { food: 2 }, desc: 'Fusion aus Ritter und Schütze: schnell und schießt aus 2 Feldern.' },
  shieldbreaker: { name: 'Schildbrecher', fused: true, parents: ['warrior', 'defender'], cost: { food: 8, ore: 7 }, hp: 30, atk: 3.5, def: 4, move: 2, range: 1, ignoreWalls: true, upkeep: { food: 2 }, desc: 'Fusion aus Krieger und Wächter: sehr zäh, Stadtmauern und Burgbonus schützen den Gegner nicht.' },
  firemage: { name: 'Feuermagier', fused: true, parents: ['mage', 'catapult'], cost: { food: 6, wood: 16, ore: 15 }, hp: 18, atk: 4.5, def: 1, move: 2, range: 2, splash: 0.5, upkeep: { food: 2, wood: 1 }, desc: 'Fusion aus Zauberer und Katapult: Feuerzauber aus 2 Feldern, trifft auch die Nachbarn des Ziels.' },
  gorgon: { name: 'Gorgonenreiter', fused: true, parents: ['basilisk', 'rider'], cost: { food: 24, wood: 10, ore: 16 }, hp: 36, atk: 4, def: 3, move: 4, range: 1, petrify: true, upkeep: { food: 4 }, desc: 'Fusion aus Basilisk und Reiter: schnell, sein Blick versteinert im Nahkampf.' },
  rocktroll: { name: 'Felsenwerfer-Troll', fused: true, parents: ['troll', 'catapult'], cost: { food: 45, wood: 37, ore: 60 }, hp: 90, atk: 8, def: 5, move: 2, range: 3, splash: 0.35, regen: 3, noMoveAttack: true, upkeep: { food: 6, wood: 1 }, desc: 'Fusion aus Troll und Katapult: schleudert Felsen 3 Felder weit mit Flächenschaden (nicht nach Bewegung).' },
  stormdragon: { name: 'Sturmdrache', fused: true, parents: ['dragon', 'mage'], cost: { food: 156, wood: 154, ore: 155 }, hp: 340, atk: 13, def: 11, move: 5, range: 1, regen: 8, flying: true, splash: 0.4, arrowWeak: true, healer: true, upkeep: { food: 6 }, desc: 'Fusion aus Drache und Zauberer: fliegt, Feueratem mit Flächenschaden und heilt eigene Einheiten.' },
  ram: { name: 'Rammbock-Ritter', fused: true, parents: ['trebuchet', 'knight'], cost: { food: 12, wood: 26, ore: 22 }, hp: 34, atk: 5, def: 3, move: 3, range: 1, siegeMult: 2, upkeep: { food: 2, wood: 2 }, desc: 'Fusion aus Tribok und Ritter: doppelter Schaden gegen Städte, Burgen, Türme und Wälle.' },
  chimera: { name: 'Chimäre', fused: true, cost: { food: 10, wood: 5, ore: 10 }, hp: 20, atk: 3, def: 2, move: 2, range: 1, upkeep: { food: 3 }, desc: 'Wilde Fusion zweier Einheiten ohne festes Rezept: beste Bewegung und Reichweite, gemischte Kampfwerte mit Bonus.' },
  catapult: { name: 'Katapult', cost: { wood: 12, ore: 10 }, hp: 12, atk: 4, def: 0, move: 2, range: 3, noMoveAttack: true, splash: 0.5, fieldMult: 0.6, upkeep: { food: 1, wood: 1 }, needs: 'workshop', desc: 'Belagerungswaffe mit Reichweite 3, nicht nach Bewegung. Gegen Städte, Türme und Wälle voller Schaden, gegen Truppen im Feld nur 60 %. Flächenschaden: Gegner neben dem Ziel bekommen die Hälfte. Unterhalt 1 Nahrung + 1 Holz. Braucht eine Werkstatt.' },
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
export const UNIT_ORDER = ['warrior', 'archer', 'rider', 'defender', 'knight', 'catapult', 'trebuchet', 'mage', 'basilisk', 'troll', 'dragon'];
// Höchste Zugweite bei voller Entwicklung (gilt auch für Sprünge über eigene Einheiten)
export const MOVE_CAP = { catapult: 3, trebuchet: 2, rider: 6, knight: 6, dragon: 6, horsearcher: 6, gorgon: 6, stormdragon: 6, ram: 5 };
export const MOVE_CAP_DEFAULT = 4;
export function moveCap(type) {
  return MOVE_CAP[type] ?? MOVE_CAP_DEFAULT;
}
export const MELEE = ['warrior', 'rider', 'defender', 'knight'];
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
};
export const PERK_CHOICES = {
  warrior: [['charge', 'shieldwall'], ['siege', 'tough']],
  archer: [['hunter', 'siege'], ['swift', 'tough']],
  rider: [['charge', 'hunter'], ['swift', 'tough']],
  defender: [['shieldwall', 'hunter'], ['tough', 'siege']],
  knight: [['charge', 'shieldwall'], ['siege', 'tough']],
  catapult: [['fire', 'siege'], ['tough', 'swift']],
  trebuchet: [['siege', 'hunter'], ['tough', 'swift']],
  mage: [['greatheal', 'wideaura'], ['tough', 'swift']],
  troll: [['rampage', 'tough'], ['siege', 'charge']],
  basilisk: [['hunter', 'tough'], ['swift', 'siege']],
  dragon: [['fire', 'tough', 'swift'], ['siege', 'charge', 'hunter']],
  horsearcher: [['hunter', 'swift'], ['tough', 'siege']],
  shieldbreaker: [['shieldwall', 'charge'], ['tough', 'siege']],
  firemage: [['fire', 'tough'], ['swift', 'siege']],
  gorgon: [['charge', 'hunter'], ['tough', 'swift']],
  rocktroll: [['fire', 'tough'], ['siege', 'rampage']],
  stormdragon: [['fire', 'tough', 'swift'], ['siege', 'greatheal', 'hunter']],
  ram: [['charge', 'siege'], ['tough', 'swift']],
  chimera: [['tough', 'swift'], ['charge', 'hunter']],
};
export const PERK_RANKS = [2, 3, 4];
export const FLANK_BONUS = 0.1;
export const FLANK_MAX = 3;
export const CAVALRY = ['rider', 'knight'];
// Verbände: bis zu 3 gleiche Einheiten auf einem Feld (Titanen, Zauberer und Bauwerke nicht)
export const REGIMENT_MAX = 3;
export const REGIMENT_TYPES = ['warrior', 'archer', 'rider', 'defender', 'knight', 'catapult'];

// Zauberer: Schutzaura und Heilen
// Unterhalt pro Runde: jede Einheit isst (Nahrung je Versorgungspunkt), Katapulte brauchen zusätzlich Holz
export function upkeepOf(type) {
  const T = UNITS[type];
  if (T.structure) return {};
  return T.upkeep || { food: T.supply || 1 };
}
export const AURA = { radius: 1, radius2: 2, reduce: 0.25, splash: 0.5 };
export const HEAL = { base: 4, blessing: 2, range: 3 };

// Türme: Ausbaustufen 1–3
export const TOWER_LEVELS = [null,
  { hp: 12, atk: 2, def: 3, range: 1 },
  { hp: 18, atk: 3, def: 3.5, range: 1 },
  { hp: 24, atk: 4, def: 4, range: 2 },
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
  smith: { branch: 'mil', name: 'Schmiedekunst', icon: '⚒️', cost: { wood: 12, ore: 24 }, req: [], mod: { melee: { atk: 0.5 } }, desc: 'Nahkämpfer +0,5 Angriff' },
  armor: { branch: 'mil', name: 'Plattenrüstung', icon: '🥋', cost: { food: 16, ore: 36 }, req: ['smith'], mod: { all: { def: 0.5 } }, desc: 'Alle Einheiten +0,5 Verteidigung' },
  oxcart: { branch: 'mil', name: 'Ochsenkarren', icon: '🐂', cost: { food: 12, wood: 24 }, req: [], mod: { catapult: { move: 1 } }, desc: 'Katapulte +1 Bewegung' },
  ballistics: { branch: 'mil', name: 'Ballistik', icon: '🎯', cost: { wood: 32, ore: 28 }, req: ['oxcart'], mod: { catapult: { range: 1, atk: 1 } }, desc: 'Katapulte +1 Reichweite, +1 Angriff' },
  counterweight: { branch: 'mil', name: 'Gegengewicht', icon: '🪨', cost: { wood: 36, ore: 30 }, req: ['ballistics'], desc: 'Ermöglicht den Tribok (Werkstatt): präziser Fernschuss bis 5 Felder' },
  stirrups: { branch: 'mil', name: 'Steigbügel', icon: '🏇', cost: { food: 20, ore: 24 }, req: ['horse'], mod: { knight: { atk: 1 }, rider: { atk: 0.5 } }, desc: 'Ritter +1 Angriff, Reiter +0,5 Angriff' },
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
  enlight: { branch: 'def', name: 'Erleuchtung', icon: '✨', cost: { food: 20, ore: 18 }, req: ['medic'], desc: 'Schutzaura der Zauberer reicht 2 Felder weit' },
  blessing: { branch: 'def', name: 'Segen', icon: '🙏', cost: { food: 24, wood: 14 }, req: ['medic'], desc: 'Zauberer heilen 2 mehr und beenden die Erschütterung' },
  battlements: { branch: 'def', name: 'Wehrgang', icon: '🏯', cost: { wood: 20, ore: 30 }, req: ['stonework'], desc: 'Steinwälle +25 Leben' },
  keep: { branch: 'def', name: 'Burgausbau', icon: '🏰', cost: { food: 20, wood: 24, ore: 30 }, req: ['stonework'], desc: 'Alle 7 Burgfelder: Verteidigung +25 %' },
  alchemy: { branch: 'eco', name: 'Alchemie', icon: '🧪', cost: { food: 40, wood: 30, ore: 45 }, req: ['masonry', 'armor'], fusionOnly: true, desc: 'Grundlage der Fusion (nur im Fusionsmodus)' },
  fusion: { branch: 'eco', name: 'Fusionskunst', icon: '⚗️', cost: { food: 60, wood: 60, ore: 80 }, req: ['alchemy', 'counterweight'], fusionOnly: true, desc: 'Ermöglicht die Fusionsschmiede' },
  towers2: { branch: 'def', name: 'Turmbaukunst', icon: '🗼', cost: { wood: 20, ore: 28 }, req: ['stonework'], mod: { tower: { range: 1, atk: 1 } }, desc: 'Türme +1 Reichweite, +1 Angriff' },
};
export const TECH_ORDER = Object.keys(TECHS);

// Fusionsmodus: zwei verschiedene Einheiten in der Fusionsschmiede verschmelzen
export const FUSION_COST = { wood: 20, ore: 30 };
export const FUSION_RECIPES = {
  'archer+knight': 'horsearcher', 'defender+warrior': 'shieldbreaker', 'catapult+mage': 'firemage', 'basilisk+rider': 'gorgon',
  'catapult+troll': 'rocktroll', 'dragon+mage': 'stormdragon', 'knight+trebuchet': 'ram',
};
export function fusionResult(a, b) {
  return FUSION_RECIPES[[a, b].sort().join('+')] || 'chimera';
}

export const CITY_MAX_LEVEL = 8;
export const CITY_NAMES = ['', 'Dorf', 'Siedlung', 'Stadt', 'Burgstadt', 'Metropole', 'Großmetropole', 'Residenzstadt', 'Kaiserstadt'];
export const START_RES = { food: 6, wood: 6, ore: 4 };
export const TRADE_RATE = 3;
export const TRADE_RATE_GUILD = 2;

// Gebäude: jede Stadt hat so viele Bauplätze wie ihre Stufe (höchstens 6)
export const BUILDINGS = {
  farm: { art: 'einen', name: 'Bauernhof', icon: '🌾', cost: { wood: 4 }, desc: '+1 Nahrung je Wiese/See im Stadtkreis (ohne: +4)' },
  lumber: { art: 'einen', name: 'Holzfäller', icon: '🌲', cost: { food: 4 }, desc: '+1 Holz je Wald im Stadtkreis (ohne: +4)' },
  mine: { art: 'eine', name: 'Mine', icon: '⛏️', cost: { food: 4, wood: 4 }, desc: '+1 Erz je Hügel/Berg im Stadtkreis (ohne: +4)' },
  barracks: { art: 'eine', name: 'Kaserne', icon: '🛡️', cost: { wood: 6, ore: 4 }, desc: 'Ritter möglich, neue Einheiten können sofort ziehen' },
  workshop: { art: 'eine', name: 'Werkstatt', icon: '⚙️', cost: { wood: 8, ore: 4 }, desc: 'Katapulte möglich' },
  wall: { art: 'eine', name: 'Mauer', icon: '🧱', cost: { wood: 4, ore: 6 }, desc: 'Verteidigung in der Stadt ×2,2' },
  sanctum: { art: 'einen', name: 'Turm der Weisen', icon: '🔮', cost: { wood: 6, ore: 6 }, desc: 'Zauberer möglich' },
  nest: { art: 'ein', name: 'Basiliskennest', icon: '🦎', cost: { food: 10, wood: 8, ore: 12 }, minLevel: 3, desc: 'Basilisk möglich (Stadt ab Stufe 3)' },
  lair: { art: 'eine', name: 'Trollhöhle', icon: '🦴', cost: { food: 10, wood: 12, ore: 16 }, minLevel: 4, desc: 'Schwarzer Troll möglich (Stadt ab Stufe 4)' },
  forge: { art: 'eine', name: 'Fusionsschmiede', icon: '⚗️', cost: { food: 30, wood: 40, ore: 50 }, minLevel: 4, perRealm: 1, tech: 'fusion', fusionOnly: true, desc: 'Zwei verschiedene Einheiten im Umkreis von 2 Feldern zu einer stärkeren verschmelzen (einmal pro Runde)' },
  market: { art: 'einen', name: 'Markt', icon: '⚖️', cost: { food: 16, wood: 16, ore: 8 }, perRealm: 1, desc: 'Erlaubt Handel (3:1, mit Handelsgilde 2:1), einer pro Reich' },
  dragonlair: { art: 'eine', name: 'Drachenhöhle', icon: '🐉', cost: { food: 20, wood: 20, ore: 30 }, perRealm: 1, desc: 'Drache möglich (nur eine im Reich)' },
};
export const BUILDING_ORDER = ['farm', 'lumber', 'mine', 'barracks', 'workshop', 'sanctum', 'nest', 'lair', 'dragonlair', 'wall', 'market', 'forge'];

// Stadtzentrum liefert von jedem Rohstoff so viel wie die Stufe
// Ertrag des Stadtzentrums je Rohstoff: steigt mit jeder Stufe stärker, damit auch wenige große Städte genug liefern
export const CENTER_YIELD = [0, 1, 2, 4, 6, 8, 10, 13, 16];
export function cityCenterYield(city) {
  return CENTER_YIELD[city.level] ?? city.level;
}
// Versorgung: wie viele Einheiten eine Stadt unterhält (bewusst knapp: wenige, aber wertvolle Einheiten)
export function citySupply(city) {
  return [0, 2, 2, 3, 4, 5, 6, 7, 8][city.level];
}
// Jede Stadt besitzt 2 Felder Gebiet um sich herum
export function cityRadius() {
  return 2;
}
export const MAX_SLOTS = 6;
// Bauernhof/Holzfäller/Mine ohne passendes Feld im Stadtkreis
export const BUILDING_FLAT = 4;
export function citySlots(city) {
  return Math.min(MAX_SLOTS, city.level);
}
export function upgradeCost(city) {
  return [null, { food: 8, wood: 8 }, { food: 14, wood: 12, ore: 6 }, { food: 22, wood: 18, ore: 14 }, { food: 30, wood: 26, ore: 22 },
    { food: 42, wood: 38, ore: 32 }, { food: 56, wood: 50, ore: 44 }, { food: 72, wood: 64, ore: 58 }][city.level];
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
