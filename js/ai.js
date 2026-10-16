// Computergegner. Bewertet für jede Einheit alle Züge (Bewegung + Angriff) und wählt den besten.
// Die Schwierigkeit steuert Zufallsrauschen, Fehlerquote, Risikobewusstsein und Wirtschaft.
import { UNITS, UNIT_ORDER, CITY_MAX_LEVEL, upgradeCost } from './data.js';
import {
  geoOf, buildOcc, getMoves, getTargets, computeCombat, canMove, canAttack, cityOn, defenseMult, unitRange, incomeOf, unitCap,
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

function unitValue(u) {
  const T = UNITS[u.type];
  return T.cost * (0.4 + 0.6 * (u.hp / T.hp)) + 1;
}

function buildContext(state, pid, P) {
  const geo = geoOf(state);
  const occ = buildOcc(state);
  const enemies = state.units.filter((u) => u.owner !== pid);
  const mine = state.units.filter((u) => u.owner === pid);

  // Ziel-Distanzfelder (Gelände, ohne Einheiten)
  const targetCities = [];
  const ownCities = [];
  for (const c of state.cities) (c.owner === pid ? ownCities : targetCities).push(c);
  const distCity = bfsDistances(geo, state.terrain, targetCities.map((c) => c.idx));
  const distEnemy = bfsDistances(geo, state.terrain, enemies.map((u) => u.idx));

  // Bedrohung: welche Gegner könnten nächste Runde welches Feld angreifen?
  const threat = new Array(geo.n);
  if (P.risk > 0) {
    for (const e of enemies) {
      const fake = { ...e, moved: false, attacked: false };
      const moves = getMoves(state, fake, occ, zocFor(state, e.owner, geo));
      const froms = [e.idx, ...moves.keys()];
      const seen = new Set();
      for (const f of froms) {
        if (UNITS[e.type].noMoveAttack && f !== e.idx) continue;
        for (const t of geo.within(f, unitRange(state, e, f))) {
          if (seen.has(t)) continue;
          seen.add(t);
          (threat[t] || (threat[t] = [])).push(e);
        }
      }
    }
  }

  // Bedrohte eigene Städte
  const cityDanger = new Map();
  for (const c of ownCities) {
    let d = 0;
    for (const e of enemies) {
      const dd = geo.dist(e.idx, c.idx);
      if (dd <= 3) d += UNITS[e.type].atk * (4 - dd);
    }
    cityDanger.set(c.idx, d);
  }

  const armyValue = (list) => list.reduce((s, u) => s + unitValue(u), 0);
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
  return { geo, occ, enemies, mine, distCity, distEnemy, threat, cityDanger, ownCities, targetCities, armyValue, myArmy, enemyArmy, aggr };
}

function zocFor(state, owner, geo) {
  // ZOC aus Sicht von "owner": Felder neben Einheiten anderer Spieler
  const z = new Uint8Array(geo.n);
  for (const u of state.units) {
    if (u.owner === owner) continue;
    for (const j of geo.nb[u.idx]) z[j] = 1;
  }
  return z;
}

function expectedDamage(state, ctx, u, idx, hp) {
  const list = ctx.threat[idx];
  if (!list) return 0;
  const D = UNITS[u.type];
  const dF = D.def * (hp / D.hp) * defenseMult(state, idx);
  let sum = 0;
  for (const e of list) {
    const A = UNITS[e.type];
    const aF = A.atk * (e.hp / A.hp);
    sum += (aF / (aF + dF)) * A.atk * 4.5;
  }
  return sum;
}

function positionScore(state, ctx, P, u, idx, hp, pid) {
  const T = UNITS[u.type];
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
    if (exp >= hp) s -= risk * unitValue({ type: u.type, hp }) * 1.1;
    else s -= risk * (exp / T.hp) * T.cost * 0.6;
  }
  // Fernkämpfer bleiben gern auf Distanz
  if (T.range > 1 && de === 1) s -= 1.5 * (P.smart ? 1 : 0);
  // Gelände-Bonus
  s += (defenseMult(state, idx) - 1) * 1.2;
  return s;
}

function attackScore(state, ctx, P, u, t, from) {
  const r = computeCombat(state, u, t, from);
  const DT = UNITS[t.type], UT = UNITS[u.type];
  let gain = (Math.min(r.dmg, t.hp) / DT.hp) * DT.cost * 1.2;
  if (r.kill) gain += DT.cost + 3;
  const tc = cityOn(state, t.idx);
  if (tc && tc.owner === u.owner) gain += r.kill ? 8 : 3; // Besetzer aus eigener Stadt werfen
  if (tc && tc.capital && tc.owner === u.owner) gain += r.kill ? 6 : 2;
  let loss = (Math.min(r.counter, u.hp) / UT.hp) * UT.cost;
  if (r.die) loss += UT.cost + 2;
  return { score: gain - loss * P.lossW, r };
}

function evaluateUnit(state, ctx, P, u, pid, rng) {
  const options = [];
  const stayBase = positionScore(state, ctx, P, u, u.idx, u.hp, pid);
  const healBonus = canMove(u) && u.hp < UNITS[u.type].hp ? 0.6 : 0;
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
        const endIdx = r.kill && UNITS[u.type].range === 1 ? t.idx : f;
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

function chooseRecruit(state, ctx, P, pid, city, gold, rng) {
  const affordable = UNIT_ORDER.filter((k) => UNITS[k].cost <= gold);
  if (!affordable.length) return null;
  if (!P.smart) {
    const w = { warrior: 5, archer: 2, rider: 2, defender: 1, knight: 1, catapult: 0.5 };
    return weightedPick(affordable, (k) => w[k], rng);
  }
  const danger = ctx.cityDanger.get(city.idx) || 0;
  const neutralLeft = state.cities.filter((c) => c.owner < 0).length;
  const enemyDef = ctx.enemies.filter((e) => e.type === 'defender').length;
  const mineCount = (t) => ctx.mine.filter((u) => u.type === t).length;
  const w = {
    warrior: 3,
    archer: 2.5 + (danger > 0 ? 1.5 : 0),
    rider: neutralLeft > 0 ? 3.5 : 1.2,
    defender: danger > 4 ? 3 : 0.6,
    knight: gold >= 7 ? 4 : 0,
    catapult: gold >= 7 ? 1.5 + enemyDef * 0.8 : 0,
  };
  // Vielfalt: bereits häufige Typen abwerten
  for (const k of Object.keys(w)) w[k] /= 1 + mineCount(k) * 0.35;
  return weightedPick(affordable, (k) => w[k], rng);
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

function economyAction(state, ctx, P, pid, rng) {
  const player = state.players[pid];
  const gold = player.gold;
  const freeCities = ctx.ownCities.filter((c) => !ctx.occ[c.idx]);
  const myArmy = ctx.armyValue(ctx.mine);
  let maxEnemyArmy = 0;
  for (const p of state.players) {
    if (p.id === pid || !p.alive) continue;
    maxEnemyArmy = Math.max(maxEnemyArmy, ctx.armyValue(ctx.enemies.filter((e) => e.owner === p.id)));
  }
  const totalDanger = [...ctx.cityDanger.values()].reduce((a, b) => a + b, 0);
  const capped = ctx.mine.length >= unitCap(state, pid);
  const wantArmy = !capped && (ctx.mine.length < ctx.ownCities.length + 1 || myArmy < maxEnemyArmy * 0.9 || totalDanger > 6);

  // Ausbau
  if (P.upgrade > 0 && !wantArmy && rng() < P.upgrade) {
    const ups = ctx.ownCities
      .filter((c) => c.level < CITY_MAX_LEVEL && upgradeCost(c) <= gold && (ctx.cityDanger.get(c.idx) || 0) === 0)
      .sort((a, b) => (b.capital - a.capital) || (a.level - b.level));
    if (ups.length) return { type: 'upgrade', idx: ups[0].idx };
  }
  if (!freeCities.length || capped) return null;
  // Gefährdete Städte zuerst, sonst die nahe an Zielen
  freeCities.sort((a, b) => (ctx.cityDanger.get(b.idx) || 0) - (ctx.cityDanger.get(a.idx) || 0) || ctx.distCity[a.idx] - ctx.distCity[b.idx]);
  // Kluge KI spart gelegentlich für Ritter/Katapult, wenn keine Gefahr besteht
  if (P.smart && !wantArmy && gold < 7 && gold + incomeOf(state, pid) >= 7 && rng() < 0.5) return null;
  const city = freeCities[0];
  const type = chooseRecruit(state, ctx, P, pid, city, gold, rng);
  if (!type) return null;
  return { type: 'recruit', idx: city.idx, unitType: type };
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
  if (memory.econ++ < 20) {
    const e = economyAction(state, ctx, P, pid, rng);
    if (e) return e;
  }
  return { type: 'end' };
}
