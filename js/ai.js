// Computergegner. Bewertet für jede Einheit alle Züge (Bewegung + Angriff) und wählt den besten.
// Die Schwierigkeit steuert Zufallsrauschen, Fehlerquote, Risikobewusstsein und Wirtschaft.
import {
  UNITS, UNIT_ORDER, CITY_MAX_LEVEL, canAfford, BUILDINGS, citySlots, hasBuilding, RES, BASE_RES, TECHS, TOWER_UPGRADE, TOWERS_PER_CITY, structureLimit,
  costTotal, ATK_TYPE, DEF_TABLE, DEF_MAX, UNIT_UPS, unitUpCost, boostCost, skillCost, PLANT_COST, slotsUsed, usesSlot,
} from './data.js';
import {
  geoOf, buildOcc, getMoves, getTargets, computeCombat, canMove, canAttack, cityOn, terrainDefense, hitDamage, unitRange, unitCap, canRecruit,
  spawnSpots, computeTerritory, incomeOf, tradeRate, statsOf, visibility, upgradeCostOf, techAvailable, canBuildTower, towersOfCity, splashDamage, getHealTargets, healAmount, perkOptions, unitCount, unitUpOptions, unitUpList, canBuild, canPetrify,
  canBoost, skillOptions, getFreezeTargets, canStorm, stormArea, stormDamage, canTerraform, cityTiles, cityYield,
} from './game.js';
import { bfsDistances } from './mapgen.js';

// calm: so viele Runden greift die KI menschliche Spieler nicht an (außer bei Gefahr für eigene Städte)
// expand: wie gierig sie neutrale Dörfer einsammelt · tech: wie eifrig sie forscht
export const AI_PARAMS = {
  1: { noise: 6, mistake: 0.35, risk: 0, lossW: 0.3, smart: false, upgrade: 0.1, guard: 0, idle: 0.3, calm: 16, expand: 0.35, tech: 0.15 },
  2: { noise: 3, mistake: 0.15, risk: 0.3, lossW: 0.6, smart: false, upgrade: 0.25, guard: 0.5, idle: 0.12, calm: 11, expand: 0.55, tech: 0.35 },
  3: { noise: 2, mistake: 0.07, risk: 0.6, lossW: 0.9, smart: true, upgrade: 0.45, guard: 0.8, idle: 0.03, calm: 7, expand: 0.8, tech: 0.55 },
  4: { noise: 0.5, mistake: 0.02, risk: 0.9, lossW: 1, smart: true, upgrade: 0.85, guard: 0.95, idle: 0, calm: 3, expand: 1.1, tech: 0.85, armyCap: 1.15 },
  5: { noise: 0.4, mistake: 0, risk: 0.95, lossW: 1, smart: true, upgrade: 0.85, guard: 1, idle: 0, calm: 0, expand: 1.2, tech: 0.9, armyCap: 1.35, aggr: 1.6, boost: true },
  6: { noise: 0.4, mistake: 0, risk: 0.95, lossW: 1, smart: true, upgrade: 0.85, guard: 1, idle: 0, calm: 0, expand: 1.3, tech: 0.9, armyCap: 1.5, aggr: 1.6, boost: true },
};

const memory = { key: '', done: new Set() };

// Wert einer Einheit: Kosten, Rang und Gesundheit
function baseValue(u) {
  const b = u.boost ? (u.boost.atk || 0) + (u.boost.def || 0) + (u.boost.hp || 0) + (u.boost.pen || 0) : 0;
  return UNITS[u.type].value * (1 + 0.25 * ((u.rank || 1) - 1) + 0.2 * b + 0.15 * (u.skills?.length || 0));
}
function unitValue(u, maxHp) {
  return baseValue(u) * (0.4 + 0.6 * (u.hp / maxHp)) + 1;
}

function buildContext(state, pid, P) {
  const geo = geoOf(state);
  const occ = buildOcc(state);
  const stCache = new Map();
  const st = (u) => {
    let v = stCache.get(u);
    if (!v) { v = statsOf(state, u); stCache.set(u, v); }
    return v;
  };
  // Kartennebel: die KI kennt nur Gegner, die sie sieht
  const vis = state.fog ? visibility(state, pid) : null;
  const mine = state.units.filter((u) => u.owner === pid);
  const ownCities = state.cities.filter((c) => c.owner === pid);
  // Schonfrist auf niedrigen Stufen: Menschen werden anfangs nicht angegriffen (nur wer eigenen Städten zu nahe kommt)
  const calm = state.turn <= (P.calm || 0);
  const spared = (owner) => calm && owner >= 0 && state.players[owner]?.human;
  const nearOwn = (idx) => ownCities.some((c) => geo.dist(c.idx, idx) <= 2);
  const enemies = state.units.filter((u) => u.owner !== pid && (!vis || vis[u.idx]) && (!spared(u.owner) || nearOwn(u.idx)));
  const targetCities = state.cities.filter((c) => c.owner !== pid && !spared(c.owner));

  // Teure Felder nur einmal pro Zug berechnen
  if (memory.ctxKey !== memory.key + (calm ? 'c' : '')) {
    memory.ctxKey = memory.key + (calm ? 'c' : '');
    memory.distCity = bfsDistances(geo, state.terrain, targetCities.map((c) => c.idx));
    memory.distEnemy = bfsDistances(geo, state.terrain, enemies.map((u) => u.idx));
    const threat = new Array(geo.n);
    if (P.risk > 0) {
      for (const e of enemies) {
        if (e.type === 'tower') {
          for (const t of geo.within(e.idx, st(e).range)) (threat[t] || (threat[t] = [])).push(e);
          continue;
        }
        const fake = { ...e, moved: false, attacked: false };
        const moves = getMoves(state, fake, occ);
        const froms = [e.idx, ...moves.keys()];
        const seen = new Set();
        const r = st(e).range;
        for (const f of froms) {
          if (UNITS[e.type].noMoveAttack && f !== e.idx) continue;
          for (const t of geo.within(f, r)) {
            if (seen.has(t)) continue;
            seen.add(t);
            (threat[t] || (threat[t] = [])).push(e);
          }
        }
      }
    }
    memory.threat = threat;
    memory.territory = computeTerritory(state);
  }
  const distCity = memory.distCity, distEnemy = memory.distEnemy, threat = memory.threat;

  // Bedrohte eigene Städte
  const cityDanger = new Map();
  for (const c of ownCities) {
    let d = 0;
    for (const e of enemies) {
      const dd = geo.dist(e.idx, c.idx);
      if (dd <= 3) d += st(e).atk * (4 - dd);
    }
    cityDanger.set(c.idx, d);
  }

  const armyValue = (list) => list.reduce((s, u) => s + unitValue(u, st(u).hp), 0);
  // Aggressivität: wer überlegen ist oder wenn das Spiel sich zieht, greift entschlossener an
  const myArmy = armyValue(mine);
  let enemyArmy = 0;
  for (const p of state.players) {
    if (p.id === pid || !p.alive) continue;
    enemyArmy = Math.max(enemyArmy, armyValue(enemies.filter((e) => e.owner === p.id)));
  }
  const ratio = myArmy / Math.max(4, enemyArmy);
  let aggr = Math.min(2.5, Math.max(0.6, ratio));
  if (P.smart) aggr *= 1 + Math.min(0.8, Math.max(0, state.turn - 25) * 0.02);
  aggr *= P.aggr || 1;
  const territory = memory.territory;
  const alive = new Set(state.units);
  const splashThreat = enemies.some((e) => UNITS[e.type].splash);
  const enemySet = new Set(enemies);
  return { enemySet, splashThreat, geo, occ, enemies, mine, distCity, distEnemy, threat, cityDanger, ownCities, targetCities, armyValue, myArmy, enemyArmy, aggr, territory, st, alive };
}

function expectedDamage(state, ctx, u, idx, hp) {
  const list = ctx.threat[idx];
  if (!list) return 0;
  const D = ctx.st(u);
  const terr = terrainDefense(state, idx);
  let sum = 0;
  for (const e of list) {
    if (!ctx.alive.has(e)) continue;
    const A = ctx.st(e);
    const kind = ATK_TYPE[e.type] || 'melee';
    const pct = Math.max(0, Math.min(DEF_MAX, (DEF_TABLE[u.type]?.[kind] ?? 0) + D.def + (kind === 'siege' ? Math.round(terr / 2) : terr) - A.pen));
    sum += hitDamage(A.atk, pct);
  }
  return sum;
}

function positionScore(state, ctx, P, u, idx, hp, pid) {
  const T = ctx.st(u);
  const value = baseValue(u);
  let s = 0;
  const dc = ctx.distCity[idx], de = ctx.distEnemy[idx];
  const near = Math.min(dc < 0 ? 99 : dc, de < 0 ? 99 : de + 1);
  s -= near * 0.6 * (ctx.aggr > 1.2 ? 1.6 : 1) * Math.min(1, P.expand ?? 1);

  const c = cityOn(state, idx);
  if (c && c.owner !== pid && ctx.targetCities.includes(c)) {
    s += c.owner < 0 ? (5 + c.level) * (P.expand ?? 1) : 7 + c.level * 2 + (c.capital ? 4 : 0);
  }
  if (c && c.owner === pid) {
    const danger = ctx.cityDanger.get(idx) || 0;
    if (danger > 0) s += P.guard * Math.min(6, danger * 0.5) * (u.type === 'defender' ? 1.5 : 1);
    else if (P.smart) s -= 1.2; // nicht unnötig Rekrutierung blockieren
  }
  if (P.risk > 0) {
    const risk = P.risk / ctx.aggr;
    const exp = expectedDamage(state, ctx, u, idx, hp);
    if (exp >= hp) s -= risk * unitValue({ type: u.type, rank: u.rank, hp }, T.hp) * 1.1;
    else s -= risk * (exp / T.hp) * value * 0.6;
  }
  // Gegen Katapulte nicht zusammenballen (Flächenschaden)
  if (P.smart && ctx.splashThreat && ctx.threat[idx]?.some((e) => UNITS[e.type].splash)) {
    let n = 0;
    for (const j of ctx.geo.nb[idx]) { const o = ctx.occ[j]; if (o && o.owner === pid && o !== u) n++; }
    s -= n * 0.35;
  }
  // Zauberer stehen gern bei eigenen Truppen (Schutzaura), aber nicht an vorderster Front
  if (UNITS[u.type].healer) {
    let n = 0;
    for (const j of ctx.geo.nb[idx]) { const o = ctx.occ[j]; if (o && o.owner === pid && o !== u && o.type !== 'tower') n++; }
    s += Math.min(3, n) * 0.6;
    if (de === 1) s -= 1.5;
  }
  // Fernkämpfer bleiben gern auf Distanz
  if (T.range > 1 && de === 1) s -= 1.5 * (P.smart ? 1 : 0);
  // Gelände-Bonus
  s += terrainDefense(state, idx) * 0.03;
  return s;
}

function attackScore(state, ctx, P, u, t, from) {
  const r = computeCombat(state, u, t, from);
  const DT = ctx.st(t), UT = ctx.st(u);
  const dv = baseValue(t), uv = baseValue(u);
  let gain = (Math.min(r.dmg, t.hp) / DT.hp) * dv * 1.2;
  if (UNITS[u.type].petrify && !r.kill && canPetrify(t)) gain += Math.min(baseValue(t) * 0.3, 8);
  if (r.kill) gain += dv + 3;
  const tc = cityOn(state, t.idx);
  if (tc && tc.owner === u.owner) gain += r.kill ? 8 : 3; // Besetzer aus eigener Stadt werfen
  if (tc && tc.capital && tc.owner === u.owner) gain += r.kill ? 6 : 2;
  if (UNITS[u.type].splash || UNITS[u.type].line) {
    for (const h of splashDamage(state, u, t.idx, r.dmg, from)) {
      const hv = baseValue(h.unit);
      gain += (Math.min(h.dmg, h.unit.hp) / ctx.st(h.unit).hp) * hv * 1.2 + (h.dmg >= h.unit.hp ? hv + 3 : 0);
    }
  }
  let loss = (Math.min(r.counter, u.hp) / UT.hp) * uv;
  if (r.die) loss += uv + 2;
  return { score: gain - loss * P.lossW, r };
}

function evaluateUnit(state, ctx, P, u, pid, rng) {
  const options = [];
  const stayBase = positionScore(state, ctx, P, u, u.idx, u.hp, pid);
  const healBonus = canMove(u) && u.hp < ctx.st(u).hp ? 0.6 : 0;
  options.push({ score: stayBase + healBonus, actions: [] });

  const froms = [];
  if (canAttack(u)) froms.push(u.idx);
  const moves = canMove(u) ? getMoves(state, u, ctx.occ) : new Map();
  for (const d of moves.keys()) {
    options.push({ score: positionScore(state, ctx, P, u, d, u.hp, pid), actions: [{ type: 'move', unitId: u.id, to: d }] });
    if (!UNITS[u.type].noMoveAttack) froms.push(d);
  }
  if (canAttack(u)) {
    for (const f of froms) {
      for (const t of getTargets(state, u, f, ctx.occ)) {
        if (!ctx.enemySet.has(t)) continue; // Schonfrist oder im Nebel
        const { score, r } = attackScore(state, ctx, P, u, t, f);
        if (r.die) {
          options.push({ score: score, actions: actionsFor(u, f, t) });
          continue;
        }
        const endIdx = r.kill && UNITS[u.type].range === 1 && u.type !== 'tower' ? t.idx : f;
        const hpAfter = u.hp - r.counter;
        const pos = positionScore(state, ctx, P, u, endIdx, hpAfter, pid);
        options.push({ score: score + pos, actions: actionsFor(u, f, t) });
      }
    }
  }
  // Drache: Feuersturm über die Schneise mit der meisten Beute
  if (canStorm(state, u)) {
    for (const to of ctx.geo.nb[u.idx]) {
      const { area } = stormArea(state, u.idx, to);
      let gain = 0, n = 0;
      for (const t of ctx.enemies) {
        if (!area.includes(t.idx)) continue;
        const d = stormDamage(state, u, t), hv = baseValue(t);
        gain += (Math.min(d, t.hp) / ctx.st(t).hp) * hv * 1.2 + (d >= t.hp ? hv + 3 : 0);
        n++;
      }
      if (n >= 2 && gain > 8) options.push({ score: stayBase + gain, actions: [{ type: 'storm', unitId: u.id, toward: to }] });
    }
  }
  if (UNITS[u.type].healer && canAttack(u)) {
    const hf = [u.idx, ...moves.keys()];
    for (const f of hf) {
      for (const t of getHealTargets(state, u, f)) {
        const max = ctx.st(t).hp;
        const h = Math.min(max - t.hp, healAmount(state, u));
        const gain = (h / max) * baseValue(t) * 1.4 + 0.3;
        const acts = f !== u.idx ? [{ type: 'move', unitId: u.id, to: f }] : [];
        acts.push({ type: 'heal', unitId: u.id, targetId: t.id });
        options.push({ score: gain + positionScore(state, ctx, P, u, f, u.hp, pid), actions: acts });
      }
      // Vereisen: gefährliche Gegner eine Runde ausschalten
      for (const t of getFreezeTargets(state, u, f)) {
        if (!ctx.enemySet.has(t)) continue;
        const gain = Math.min(baseValue(t) * 0.3, 8) + (ctx.geo.dist(t.idx, f) <= 2 ? 0.5 : 0);
        const acts = f !== u.idx ? [{ type: 'move', unitId: u.id, to: f }] : [];
        acts.push({ type: 'freeze', unitId: u.id, targetId: t.id });
        options.push({ score: gain + positionScore(state, ctx, P, u, f, u.hp, pid), actions: acts });
      }
    }
  }
  for (const o of options) o.score += (rng() - 0.5) * P.noise;
  return { options, stay: options[0].score };
}

function actionsFor(u, from, t) {
  const acts = [];
  if (from !== u.idx) acts.push({ type: 'move', unitId: u.id, to: from });
  acts.push({ type: 'attack', unitId: u.id, targetId: t.id });
  return acts;
}

function chooseRecruit(state, ctx, P, pid, ci, rng) {
  const city = state.cities[ci];
  const options = UNIT_ORDER.filter((k) => !canRecruit(state, pid, ci, k));
  if (!options.length) return null;
  if (!P.smart) {
    const w = { warrior: 5, archer: 2, rider: 2, defender: 1, knight: 1, griffin: 0.5, catapult: 0.5, trebuchet: 0.5, mage: 0.5, basilisk: 1, troll: 3, dragon: 3 };
    if (ctx.mine.filter((u) => u.type === 'catapult' || u.type === 'trebuchet').length >= Math.max(1, Math.floor(ctx.mine.filter((u) => !UNITS[u.type].structure).length / 4))) w.catapult = w.trebuchet = 0;
    return weightedPick(options, (k) => w[k], rng);
  }
  const danger = ctx.cityDanger.get(city.idx) || 0;
  const neutralLeft = state.cities.filter((c) => c.owner < 0).length;
  const enemyDef = ctx.enemies.filter((e) => e.type === 'defender').length;
  const mineCount = (t) => ctx.mine.filter((u) => u.type === t).length;
  const melee = ctx.mine.filter((u) => UNITS[u.type].range === 1 && u.type !== 'tower').length;
  const ranged = ctx.mine.length - melee;
  // Belagerungsgerät (Katapult, Tribok) höchstens jede vierte Einheit
  const siegeFull = mineCount('catapult') + mineCount('trebuchet') >= Math.max(1, Math.floor(ctx.mine.filter((u) => !UNITS[u.type].structure).length / 4));
  const w = {
    warrior: 3,
    archer: 2.5 + (danger > 0 ? 1.5 : 0) + (ranged * 2 < melee ? 2 : 0),
    rider: neutralLeft > 0 ? 3.5 * (P.expand ?? 1) : 1.2,
    defender: danger > 4 ? 3 : 0.6,
    knight: 4,
    griffin: 2.5,
    // Belagerungsgerät nur als Beimischung (siegeFull)
    catapult: siegeFull ? 0 : 1.5 + Math.min(enemyDef, 4) * 0.4,
    trebuchet: siegeFull ? 0 : 2,
    mage: ctx.mine.length >= 4 ? 3 : 0.5,
    basilisk: ctx.mine.length >= 5 ? 3 : 0.6,
    troll: 50,
    dragon: 60,
  };
  for (const k of Object.keys(w)) w[k] /= 1 + mineCount(k) * 0.35;
  return weightedPick(options, (k) => w[k], rng);
}

function weightedPick(list, wf, rng) {
  let tot = 0;
  for (const k of list) tot += Math.max(0, wf(k));
  if (tot <= 0) return null; // nichts Gewolltes bezahlbar: lieber sparen
  let r = rng() * tot;
  for (const k of list) {
    r -= Math.max(0, wf(k));
    if (r <= 0) return k;
  }
  return list[list.length - 1];
}

function cityYieldSum(state, ci, territory) {
  const y = cityYield(state, ci, territory);
  return y.food + y.wood + y.ore;
}

function chooseBuilding(state, ctx, pid, ci, inc) {
  const c = state.cities[ci];
  const full = slotsUsed(c) >= citySlots(c);
  const t = cityTiles(state, ci, ctx.territory);
  // Wirtschaftsgebäude nur mit passenden Feldern (sie belegen keinen Bauplatz)
  const score = {
    farm: t.food ? 2 + t.food * 0.6 + (inc.food < 6 ? 2 : 0) : 0,
    lumber: t.wood ? 1.5 + t.wood * 1.2 - (inc.wood > inc.ore + 4 ? 1 : 0) : 0,
    mine: t.ore ? 1.5 + t.ore * 2 + (inc.ore < inc.wood ? 1 : 0) : 0,
    barracks: c.capital || ctx.ownCities.length >= 3 ? 2.2 : 0.3,
    workshop: ctx.ownCities.length >= 4 && ctx.ownCities.some((x) => hasBuilding(x, 'barracks')) ? 1.4 : 0.2,
    dragonlair: c.level >= 3 && ctx.ownCities.some((x) => hasBuilding(x, 'lair')) ? 2.6 : 0, // KI baut sie spät
    lair: c.level >= 3 && !ctx.ownCities.some((x) => hasBuilding(x, 'lair')) ? 2.5 : 0,
    nest: ctx.ownCities.length >= 3 && !ctx.ownCities.some((x) => hasBuilding(x, 'nest')) ? 1.3 : 0.1,
    sanctum: ctx.ownCities.length >= 3 && !ctx.ownCities.some((x) => hasBuilding(x, 'sanctum')) ? 1.5 : 0.3,
    wall: (ctx.cityDanger.get(c.idx) || 0) > 3 ? 3 : 0.4,
    market: ctx.ownCities.some((x) => hasBuilding(x, 'market')) ? 0 : ctx.ownCities.length >= 3 ? 2 : 1,
    press: t.mana ? 1.5 + t.mana : 0, // Kelterei nur bei Traubenhainen im Stadtkreis
  };
  let best = null;
  for (const [b, v] of Object.entries(score)) {
    if (v <= 0.5 || (full && usesSlot(b)) || canBuild(state, pid, c, b)) continue;
    if (!best || v > best.v) best = { b, v };
  }
  return best && best.b;
}

function tradeAction(state, pid) {
  const res = state.players[pid].res;
  const rate = tradeRate(state, pid);
  if (!rate) return null;
  const sorted = BASE_RES.slice().sort((a, b) => res[a] - res[b]);
  const low = sorted[0], high = sorted[2];
  if (res[low] < 4 && res[high] >= rate + 8) return { type: 'trade', give: high, get: low };
  // Großer Überschuss: einen Teil auf einmal tauschen, statt Rohstoffe zu horten
  if (res[high] > 80 && res[low] * 3 < res[high]) {
    const count = Math.floor((res[high] - res[low]) / (2 * (rate + 1)));
    if (count >= 2) return { type: 'trade', give: high, get: low, count };
  }
  return null;
}

function economyAction(state, ctx, P, pid, rng) {
  const player = state.players[pid];
  const res = player.res;
  const myArmy = ctx.armyValue(ctx.mine);
  let maxEnemyArmy = 0;
  for (const p of state.players) {
    if (p.id === pid || !p.alive) continue;
    maxEnemyArmy = Math.max(maxEnemyArmy, ctx.armyValue(ctx.enemies.filter((e) => e.owner === p.id)));
  }
  const totalDanger = [...ctx.cityDanger.values()].reduce((a, b) => a + b, 0);
  // Spieler haben kein Einheitenlimit; die KI hält sich an ein weiches Maß (Versorgung der Städte), bei Gefahr etwas mehr
  const incNow = incomeOf(state, pid, ctx.territory);
  // Keine weiteren Einheiten, wenn die Nahrung schon jetzt kaum für den Unterhalt reicht (außer bei Gefahr)
  const starving = incNow.food < 2 && totalDanger <= 6 && ctx.mine.length >= ctx.ownCities.length;
  // Für den Stadtausbau sparen: genug Armee da, keine Gefahr, Holz und Erz reichen schon fast → keine neuen Einheiten
  const upCity = P.upgrade >= 0.45 && totalDanger <= 6 && ctx.mine.length >= ctx.ownCities.length + 1
    ? ctx.ownCities.filter((c) => c.level < CITY_MAX_LEVEL && (ctx.cityDanger.get(c.idx) || 0) < 4).sort((x, y) => x.level - y.level)[0] : null;
  const upCost = upCity && upgradeCostOf(state, upCity);
  const saveUp = !!upCost && res.wood >= upCost.wood * 0.7 && res.ore >= upCost.ore * 0.7 && res.food < upCost.food;
  const capped = starving || saveUp || unitCount(state, pid) >= unitCap(state, pid) * (P.armyCap || 1) + (totalDanger > 6 ? 2 : 0);
  const wantArmy = !capped && (ctx.mine.length < ctx.ownCities.length + 2 || myArmy < maxEnemyArmy * 0.9 || totalDanger > 6);
  const cityIdx = (c) => state.cityAt[c.idx];

  // Fähigkeit wählen (alle Stufen, sonst blieben die Ränge ungenutzt)
  for (const u of ctx.mine) {
    const opts = perkOptions(u);
    if (opts.length) return { type: 'perk', unitId: u.id, perk: opts[Math.floor(rng() * opts.length)] };
  }
  // Troll: wer eine Trollhöhle hat, spart darauf
  // Titanen (Drache, Troll): wer die Höhle hat, spart darauf
  let saveTroll = false;
  if (P.smart && totalDanger < 8 && ctx.mine.length >= ctx.ownCities.length) {
    for (const [type, b, want] of [['dragon', 'dragonlair', 1], ['troll', 'lair', 2]]) {
      const home = ctx.ownCities.find((c) => hasBuilding(c, b));
      if (!home || ctx.mine.filter((u) => u.type === type).length >= want) continue;
      if (!canRecruit(state, pid, cityIdx(home), type)) return { type: 'recruit', idx: home.idx, unitType: type };
      if (type === 'dragon') continue; // viel zu teuer zum gezielten Sparen
      saveTroll = true;
      break;
    }
  }
  // Wiesen bearbeiten (abseits der Gegner): Wald bei Holzmangel, Grube bei Erzmangel, Traubenhain für Zauberer
  if (P.smart && rng() < 0.3 && canAfford(res, PLANT_COST) && (state.plants || []).filter((p) => p.pid === pid).length < ctx.ownCities.length) {
    const inc = incNow;
    const sanctum = ctx.ownCities.some((x) => hasBuilding(x, 'sanctum'));
    // Wiesen nur umwandeln, wenn genug Nahrung übrig bleibt; das knappere von Holz und Erz zuerst
    const to = inc.food < 6 ? null : sanctum && inc.mana < 3 ? 'vine' : Math.min(inc.wood, inc.ore) < 4 + ctx.ownCities.length * 2 ? (inc.wood <= inc.ore ? 'forest' : 'pit') : null;
    const need = { forest: 'lumber', pit: 'mine', vine: 'press' }[to];
    if (to) {
      for (let i = 0; i < ctx.territory.length; i++) {
        const c = state.cities[ctx.territory[i]];
        if (!c || (to !== 'vine' && !hasBuilding(c, need))) continue;
        if ((ctx.distEnemy[i] < 0 || ctx.distEnemy[i] > 4) && canTerraform(state, pid, i, ctx.territory) === 'plant') return { type: 'plant', idx: i, to };
      }
    }
  }
  if (P.smart) {
    const t = tradeAction(state, pid);
    if (t && rng() < 0.8) return t;
  }

  // Wirtschaft: Gebäude und Ausbau, wenn keine akute Gefahr
  // Wirtschaft zuerst: Bauernhof, Holzfäller, Mine, Kelterei überall, wo passende Felder liegen (belegen keinen Bauplatz)
  if (P.upgrade > 0) {
    for (const c of ctx.ownCities) {
      const t = cityTiles(state, cityIdx(c), ctx.territory);
      for (const b of ['farm', 'lumber', 'mine', 'press']) {
        if (t[BUILDINGS[b].eco] && !canBuild(state, pid, c, b)) return { type: 'build', idx: c.idx, building: b };
      }
    }
  }
  if (P.upgrade > 0 && !saveTroll && (!wantArmy || capped || rng() < 0.3) && rng() < P.upgrade) {
    const safe = ctx.ownCities.filter((c) => (ctx.cityDanger.get(c.idx) || 0) < 4);
    // Stadtausbau vor neuen Gebäuden: verdoppelt bzw. verdreifacht den Ertrag (Städte mit viel Ertrag zuerst)
    const ups = safe
      .filter((c) => c.level < CITY_MAX_LEVEL && canAfford(res, upgradeCostOf(state, c)))
      .sort((a, b) => (a.level - b.level) || (cityYieldSum(state, cityIdx(b), ctx.territory) - cityYieldSum(state, cityIdx(a), ctx.territory)));
    if (ups.length) {
      memory.ctxKey = ''; // Ausbau verschiebt Gebietsgrenzen: Karte neu berechnen
      return { type: 'upgrade', idx: ups[0].idx };
    }
    for (const c of safe.sort((a, b) => (b.capital - a.capital) || (b.level - a.level))) {
      const b = chooseBuilding(state, ctx, pid, cityIdx(c), incNow);
      if (b) return { type: 'build', idx: c.idx, building: b };
    }
  }
  // Türme in bedrohten Städten
  if (P.smart) {
    for (const c of ctx.ownCities) {
      const danger = ctx.cityDanger.get(c.idx) || 0;
      if (danger < 6) continue;
      const ci = cityIdx(c);
      const tower = state.units.find((u) => u.type === 'tower' && u.owner === pid && ctx.territory[u.idx] === ci);
      if (tower && tower.level < 3 && canAfford(res, TOWER_UPGRADE[tower.level]) && rng() < 0.5) return { type: 'towerUp', unitId: tower.id };
      if (towersOfCity(state, ci, ctx.territory) < structureLimit(c, 'tower') && rng() < 0.5) {
        let best = null;
        for (const j of ctx.geo.within(c.idx, 1)) {
          if (canBuildTower(state, pid, j, ctx.territory, 'tower', ci)) continue;
          const d = ctx.distEnemy[j] < 0 ? 99 : ctx.distEnemy[j];
          if (!best || d < best.d) best = { j, d };
        }
        if (best) return { type: 'tower', idx: best.j, city: c.idx };
      }
      // Steinwälle am Rand des Gebiets, dort wo der Gegner herkommt
      if (P.upgrade >= 1 && towersOfCity(state, ci, ctx.territory, 'barrier') < (c.castle ? 8 : 4) && rng() < 0.25) {
        let best = null;
        for (const j of ctx.geo.within(c.idx, 2)) {
          if (ctx.geo.dist(j, c.idx) < 2 || canBuildTower(state, pid, j, ctx.territory, 'barrier', ci)) continue;
          const d = ctx.distEnemy[j] < 0 ? 99 : ctx.distEnemy[j];
          if (d < 2) continue;
          if (!best || d < best.d) best = { j, d };
        }
        if (best && best.d <= 4) return { type: 'tower', unitType: 'barrier', idx: best.j, city: c.idx };
      }
    }
  }
  // Forschung, wenn Rohstoffe übrig sind (Eifer je nach Stufe)
  if ((P.tech ?? P.upgrade) > 0 && !saveTroll && rng() < (P.tech ?? P.upgrade)) {
    const resSum = res.food + res.wood + res.ore;
    // Wirtschaftsforschung (+50 % aufs Reich) lohnt sich erst mit mehreren Städten
    const eco = ctx.ownCities.length >= 3 ? ['plough', 'mining', 'saw'] : [];
    const prio = [...eco, 'bow', 'smith', 'horse', 'armor', 'masonry', 'oxcart', 'ballistics', 'roads', 'stonework', 'towers2', 'plough', 'mining', 'saw', 'stirrups', 'keep', 'tactics', 'granary', 'counterweight', 'siegecart', 'battlements', 'medic', 'enlight', 'blessing', 'guild'].filter((t) => t !== 'guild' || tradeRate(state, pid));
    if (resSum > (wantArmy ? 70 : 35)) {
      // Einheiten-Entwicklung: die meistgenutzten Einheiten gezielt verbessern (abwechselnd mit normaler Forschung)
      if (P.smart && rng() < 0.5) {
        const counts = {};
        for (const u of ctx.mine) if (UNIT_UPS[u.type]) counts[u.type] = (counts[u.type] || 0) + 1;
        for (const [type] of Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2)) {
          const opts = unitUpOptions(state, pid, type);
          if (opts.length && canAfford(res, unitUpCost(type, unitUpList(state, pid, type).length))) return { type: 'unitUp', unit: type, id: opts[Math.floor(rng() * opts.length)].id };
        }
      }
      for (const t of prio) {
        if (techAvailable(state, pid, t) && canAfford(res, TECHS[t].cost)) return { type: 'research', tech: t };
      }
      // Einzel-Verbesserungen (nur Meister und Kaiser): die wertvollsten Einheiten (hoher Rang, Titanen) gezielt stärken
      if (P.boost && resSum > (wantArmy ? 120 : 60) && rng() < 0.5) {
        const pick = ctx.mine.filter(canBoost).sort((a, b) => baseValue(b) - baseValue(a)).slice(0, 3);
        for (const u of pick) {
          const sk = skillOptions(u).filter((k) => k !== 'bomb');
          if (sk.length && rng() < 0.4 && canAfford(res, skillCost(u.type))) return { type: 'skill', unitId: u.id, skill: sk[0] };
          const stat = ['atk', 'hp', 'def', 'pen'][Math.floor(rng() * 4)];
          const lvl = u.boost?.[stat] || 0;
          if (lvl < 3 && canAfford(res, boostCost(u.type, lvl))) return { type: 'boost', unitId: u.id, stat };
        }
      }
    }
  }
  if (capped || (saveTroll && !wantArmy)) return null;
  // Rekrutieren: gefährdete Städte zuerst, sonst nahe an Zielen
  const cities = ctx.ownCities
    .filter((c) => spawnSpots(state, cityIdx(c), ctx.occ, ctx.territory).length)
    .sort((a, b) => (ctx.cityDanger.get(b.idx) || 0) - (ctx.cityDanger.get(a.idx) || 0) || ctx.distCity[a.idx] - ctx.distCity[b.idx]);
  for (const city of cities) {
    const type = chooseRecruit(state, ctx, P, pid, cityIdx(city), rng);
    if (type) return { type: 'recruit', idx: city.idx, unitType: type };
  }
  return null;
}

// Liefert die nächste Aktion für den aktuellen KI-Spieler.
export function planAction(state, rng = Math.random) {
  const pid = state.current;
  const P = AI_PARAMS[state.players[pid].ai] || AI_PARAMS[3];
  const key = state.gameId + ':' + state.turn + ':' + pid;
  if (memory.key !== key) {
    memory.key = key;
    memory.done = new Set();
    memory.checked = new Set();
    memory.econ = 0;
  }
  const ctx = buildContext(state, pid, P);

  let best = null;
  for (const u of ctx.mine) {
    if (memory.done.has(u.id)) continue;
    if (!canMove(u) && !canAttack(u)) continue;
    if (!memory.checked.has(u.id)) {
      memory.checked.add(u.id);
      if (P.idle && rng() < P.idle) { memory.done.add(u.id); continue; }
    }
    const { options, stay } = evaluateUnit(state, ctx, P, u, pid, rng);
    if (rng() < P.mistake && options.length > 1) {
      const o = options[1 + Math.floor(rng() * (options.length - 1))];
      memory.done.add(u.id);
      return o.actions[0];
    }
    let top = options[0];
    for (const o of options) if (o.score > top.score) top = o;
    const gain = top.score - stay;
    if (!top.actions.length || gain <= 0.05) {
      memory.done.add(u.id);
      continue;
    }
    if (!best || gain > best.gain) best = { gain, action: top.actions[0], u };
  }
  if (best) {
    if (best.action.type === 'attack' || best.action.type === 'heal' || best.action.type === 'freeze' || best.action.type === 'storm') memory.done.add(best.u.id);
    return best.action;
  }
  if (memory.econ++ < 40) {
    const e = economyAction(state, ctx, P, pid, rng);
    if (e) return e;
  }
  return { type: 'end' };
}
