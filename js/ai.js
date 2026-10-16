// Computergegner. Bewertet für jede Einheit alle Züge (Bewegung + Angriff) und wählt den besten.
// Die Schwierigkeit steuert Zufallsrauschen, Fehlerquote, Risikobewusstsein und Wirtschaft.
import {
  UNITS, UNIT_ORDER, CITY_MAX_LEVEL, canAfford, BUILDINGS, citySlots, hasBuilding, RES, TECHS, TOWER_UPGRADE, TOWERS_PER_CITY,
} from './data.js';
import {
  geoOf, buildOcc, getMoves, getTargets, computeCombat, canMove, canAttack, cityOn, defenseMult, unitRange, unitCap, canRecruit,
  spawnSpots, computeTerritory, incomeOf, tradeRate, statsOf, visibility, upgradeCostOf, techAvailable, canBuildTower, towersOfCity,
} from './game.js';
import { bfsDistances } from './mapgen.js';

export const AI_PARAMS = {
  1: { noise: 6, mistake: 0.35, risk: 0, lossW: 0.3, smart: false, upgrade: 0, guard: 0, idle: 0.25 },
  2: { noise: 3, mistake: 0.12, risk: 0.3, lossW: 0.6, smart: false, upgrade: 0.25, guard: 0.5, idle: 0.05 },
  3: { noise: 2, mistake: 0.07, risk: 0.6, lossW: 0.9, smart: true, upgrade: 0.4, guard: 0.8, idle: 0 },
  4: { noise: 0.25, mistake: 0, risk: 1, lossW: 1, smart: true, upgrade: 1, guard: 1, idle: 0 },
  5: { noise: 0.1, mistake: 0, risk: 1, lossW: 1, smart: true, upgrade: 1, guard: 1, idle: 0 },
};

const memory = { key: '', done: new Set() };

function unitValue(u, maxHp) {
  return UNITS[u.type].value * (0.4 + 0.6 * (u.hp / maxHp)) + 1;
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
  const enemies = state.units.filter((u) => u.owner !== pid && (!vis || vis[u.idx]));
  const mine = state.units.filter((u) => u.owner === pid);
  const targetCities = [];
  const ownCities = [];
  for (const c of state.cities) (c.owner === pid ? ownCities : targetCities).push(c);

  // Teure Felder nur einmal pro Zug berechnen
  if (memory.ctxKey !== memory.key) {
    memory.ctxKey = memory.key;
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
  const territory = memory.territory;
  const alive = new Set(state.units);
  return { geo, occ, enemies, mine, distCity, distEnemy, threat, cityDanger, ownCities, targetCities, armyValue, myArmy, enemyArmy, aggr, territory, st, alive };
}

function expectedDamage(state, ctx, u, idx, hp) {
  const list = ctx.threat[idx];
  if (!list) return 0;
  const D = ctx.st(u);
  const dF = D.def * (hp / D.hp) * defenseMult(state, idx);
  let sum = 0;
  for (const e of list) {
    if (!ctx.alive.has(e)) continue;
    const A = ctx.st(e);
    const aF = A.atk * (e.hp / A.hp);
    sum += (aF / (aF + dF)) * A.atk * 4.5;
  }
  return sum;
}

function positionScore(state, ctx, P, u, idx, hp, pid) {
  const T = ctx.st(u);
  const value = UNITS[u.type].value;
  let s = 0;
  const dc = ctx.distCity[idx], de = ctx.distEnemy[idx];
  const near = Math.min(dc < 0 ? 99 : dc, de < 0 ? 99 : de + 1);
  s -= near * 0.6 * (ctx.aggr > 1.2 ? 1.6 : 1);

  const c = cityOn(state, idx);
  if (c && c.owner !== pid) {
    s += c.owner < 0 ? 5 + c.level : 7 + c.level * 2 + (c.capital ? 4 : 0);
  }
  if (c && c.owner === pid) {
    const danger = ctx.cityDanger.get(idx) || 0;
    if (danger > 0) s += P.guard * Math.min(6, danger * 0.5) * (u.type === 'defender' ? 1.5 : 1);
    else if (P.smart) s -= 1.2; // nicht unnötig Rekrutierung blockieren
  }
  if (P.risk > 0) {
    const risk = P.risk / ctx.aggr;
    const exp = expectedDamage(state, ctx, u, idx, hp);
    if (exp >= hp) s -= risk * unitValue({ type: u.type, hp }, T.hp) * 1.1;
    else s -= risk * (exp / T.hp) * value * 0.6;
  }
  // Fernkämpfer bleiben gern auf Distanz
  if (T.range > 1 && de === 1) s -= 1.5 * (P.smart ? 1 : 0);
  // Gelände-Bonus
  s += (defenseMult(state, idx) - 1) * 1.2;
  return s;
}

function attackScore(state, ctx, P, u, t, from) {
  const r = computeCombat(state, u, t, from);
  const DT = ctx.st(t), UT = ctx.st(u);
  const dv = UNITS[t.type].value, uv = UNITS[u.type].value;
  let gain = (Math.min(r.dmg, t.hp) / DT.hp) * dv * 1.2;
  // Fernkampf zuerst: erschütterte Ziele sind für Nahkämpfer leichte Beute
  if (UT.range > 1 && !r.kill && !t.shaken) gain += 1.5;
  if (r.kill) gain += dv + 3;
  const tc = cityOn(state, t.idx);
  if (tc && tc.owner === u.owner) gain += r.kill ? 8 : 3; // Besetzer aus eigener Stadt werfen
  if (tc && tc.capital && tc.owner === u.owner) gain += r.kill ? 6 : 2;
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
    const w = { warrior: 5, archer: 2, rider: 2, defender: 1, knight: 1, catapult: 0.5 };
    return weightedPick(options, (k) => w[k], rng);
  }
  const danger = ctx.cityDanger.get(city.idx) || 0;
  const neutralLeft = state.cities.filter((c) => c.owner < 0).length;
  const enemyDef = ctx.enemies.filter((e) => e.type === 'defender').length;
  const mineCount = (t) => ctx.mine.filter((u) => u.type === t).length;
  const melee = ctx.mine.filter((u) => UNITS[u.type].range === 1 && u.type !== 'tower').length;
  const ranged = ctx.mine.length - melee;
  const w = {
    warrior: 3,
    archer: 2.5 + (danger > 0 ? 1.5 : 0) + (ranged * 2 < melee ? 2 : 0),
    rider: neutralLeft > 0 ? 3.5 : 1.2,
    defender: danger > 4 ? 3 : 0.6,
    knight: 4,
    catapult: 1.5 + enemyDef * 0.8,
  };
  for (const k of Object.keys(w)) w[k] /= 1 + mineCount(k) * 0.35;
  return weightedPick(options, (k) => w[k], rng);
}

function weightedPick(list, wf, rng) {
  let tot = 0;
  for (const k of list) tot += Math.max(0, wf(k));
  if (tot <= 0) return list[0];
  let r = rng() * tot;
  for (const k of list) {
    r -= Math.max(0, wf(k));
    if (r <= 0) return k;
  }
  return list[list.length - 1];
}

function chooseBuilding(state, ctx, pid, ci, inc) {
  const c = state.cities[ci];
  if (c.buildings.length >= citySlots(c)) return null;
  const res = state.players[pid].res;
  const territory = ctx.territory;
  let forests = 0, rocks = 0;
  for (let i = 0; i < territory.length; i++) {
    if (territory[i] !== ci) continue;
    if (state.terrain[i] === 'forest') forests++;
    if (state.terrain[i] === 'hill' || state.terrain[i] === 'mountain') rocks++;
  }
  const score = {
    farm: inc.food < 6 ? 3 : 1,
    lumber: 1 + forests * 1.2 - (inc.wood > inc.ore + 4 ? 1 : 0),
    mine: 1 + rocks * 2.4 + (inc.ore < inc.wood ? 1 : 0),
    barracks: c.capital || ctx.ownCities.length >= 3 ? 2.2 : 0.3,
    workshop: ctx.ownCities.length >= 4 && ctx.ownCities.some((x) => hasBuilding(x, 'barracks')) ? 1.4 : 0.2,
    wall: (ctx.cityDanger.get(c.idx) || 0) > 3 ? 3 : 0.4,
    market: ctx.ownCities.some((x) => hasBuilding(x, 'market')) ? 0 : 1.2,
  };
  let best = null;
  for (const [b, v] of Object.entries(score)) {
    if (hasBuilding(c, b) || v <= 0.5 || !canAfford(res, BUILDINGS[b].cost)) continue;
    if (!best || v > best.v) best = { b, v };
  }
  return best && best.b;
}

function tradeAction(state, pid) {
  const res = state.players[pid].res;
  const rate = tradeRate(state, pid);
  const sorted = RES.slice().sort((a, b) => res[a] - res[b]);
  const low = sorted[0], high = sorted[2];
  if (res[low] < 4 && res[high] >= rate + 8) return { type: 'trade', give: high, get: low };
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
  const capped = ctx.mine.length >= unitCap(state, pid);
  const wantArmy = !capped && (ctx.mine.length < ctx.ownCities.length + 2 || myArmy < maxEnemyArmy * 0.9 || totalDanger > 6);
  const cityIdx = (c) => state.cityAt[c.idx];

  if (P.smart) {
    const t = tradeAction(state, pid);
    if (t && rng() < 0.8) return t;
  }

  // Wirtschaft: Gebäude und Ausbau, wenn keine akute Gefahr
  if (P.upgrade > 0 && (!wantArmy || capped || rng() < 0.3) && rng() < P.upgrade) {
    const inc = incomeOf(state, pid, ctx.territory);
    const safe = ctx.ownCities.filter((c) => (ctx.cityDanger.get(c.idx) || 0) < 4);
    for (const c of safe.sort((a, b) => (b.capital - a.capital) || (b.level - a.level))) {
      const b = chooseBuilding(state, ctx, pid, cityIdx(c), inc);
      if (b) return { type: 'build', idx: c.idx, building: b };
    }
    const ups = safe
      .filter((c) => c.level < CITY_MAX_LEVEL && c.buildings.length >= citySlots(c) - 1 && canAfford(res, upgradeCostOf(state, c)))
      .sort((a, b) => (b.capital - a.capital) || (a.level - b.level));
    if (ups.length) return { type: 'upgrade', idx: ups[0].idx };
  }
  // Türme in bedrohten Städten
  if (P.smart) {
    for (const c of ctx.ownCities) {
      const danger = ctx.cityDanger.get(c.idx) || 0;
      if (danger < 6) continue;
      const ci = cityIdx(c);
      const tower = state.units.find((u) => u.type === 'tower' && u.owner === pid && ctx.territory[u.idx] === ci);
      if (tower && tower.level < 3 && canAfford(res, TOWER_UPGRADE[tower.level]) && rng() < 0.5) return { type: 'towerUp', unitId: tower.id };
      if (towersOfCity(state, ci, ctx.territory) < TOWERS_PER_CITY && rng() < 0.5) {
        let best = null;
        for (const j of ctx.geo.within(c.idx, 1)) {
          if (canBuildTower(state, pid, j, ctx.territory)) continue;
          const d = ctx.distEnemy[j] < 0 ? 99 : ctx.distEnemy[j];
          if (!best || d < best.d) best = { j, d };
        }
        if (best) return { type: 'tower', idx: best.j };
      }
    }
  }
  // Forschung, wenn Rohstoffe übrig sind
  if (P.upgrade > 0 && rng() < P.upgrade) {
    const resSum = res.food + res.wood + res.ore;
    const prio = ['mining', 'bow', 'smith', 'horse', 'plough', 'saw', 'armor', 'masonry', 'oxcart', 'ballistics', 'roads', 'stonework', 'towers2', 'medic', 'guild'];
    if (resSum > (wantArmy ? 70 : 35)) {
      for (const t of prio) {
        if (techAvailable(state, pid, t) && canAfford(res, TECHS[t].cost)) return { type: 'research', tech: t };
      }
    }
  }
  if (capped) return null;
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
    if (best.action.type === 'attack') memory.done.add(best.u.id);
    return best.action;
  }
  if (memory.econ++ < 40) {
    const e = economyAction(state, ctx, P, pid, rng);
    if (e) return e;
  }
  return { type: 'end' };
}
