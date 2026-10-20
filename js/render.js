// Canvas-Renderer: Gelände wird einmal in eine Offscreen-Leinwand gezeichnet,
// pro Frame kommen nur Markierungen, Einheiten und Effekte dazu.
import { hexCenter, pixelToIndex, boardSize, SQRT3, getGeo } from './hex.js';
import { PLAYER_COLORS, NEUTRAL_COLOR, UNITS, PERKS } from './data.js';
import { computeTerritory, statsOf, inAura } from './game.js';
import {
  hash, hexPath, mix, drawGrapes, drawTileTop, drawTileSide, drawForest, drawHill, drawMountain, drawShore, drawCity, drawFigure, drawWallLink, FIG_BOX, drawCastle, drawCourt, CASTLE_BOX,
} from './art.js';

export const HEX = 40;
const DEPTH = HEX * 0.3;
const MARGIN = HEX * 1.4;
const GREY = '#8d8a85';
const FIG = 1.3; // Figurengröße relativ zum Feld
const BIG = { dragon: 1.6 }; // der Drache ragt über die Nachbarfelder
// Größe der Stadtgrafik je Stufe: Dorf und Siedlung klein, Städte wachsen mit jeder Stufe
const CITY_SCALE = [1, 1, 1, 1.6, 1.8, 1.95, 2.05, 2.15, 2.25];
const CHUNK = 512; // Kachelgröße für den Geländepuffer (Weltpixel)

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function colorOf(owner) {
  return owner >= 0 ? PLAYER_COLORS[owner] : NEUTRAL_COLOR;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, z: 1 };
    this.state = null;
    this.overlay = {};
    this.anims = [];
    this.unitPos = new Map(); // id -> {x, y, s, rot}
    this.fx = true; // Kampfeffekte
    this.hidden = new Set();
    this.cache = null;
    this.cacheDirty = true;
    this.dirty = true;
    this.viewPad = { top: 70, bottom: 150 };
    this.resize();
    window.addEventListener('resize', () => this.resize());
    const loop = (t) => {
      this.now = t;
      this.frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    if (this.state) this.clampCam();
    this.dirty = true;
  }

  setState(state, fit = true, focusIdx) {
    const sizeChanged = !this.state || this.state.cols !== state.cols || this.state.rows !== state.rows;
    this.state = state;
    this.cacheDirty = true;
    this.dirty = true;
    this.unitPos.clear();
    this.hidden.clear();
    if (fit || sizeChanged) this.fit(focusIdx);
  }

  invalidate(map = false, idx) {
    if (map) {
      if (idx != null && this.chunks) this.invalidateArea(idx);
      else this.cacheDirty = true;
    }
    this.dirty = true;
  }

  board() {
    return boardSize(this.state.cols, this.state.rows, HEX);
  }

  fitZoom() {
    const b = this.board();
    const availW = this.w - 16, availH = this.h - this.viewPad.top - this.viewPad.bottom;
    return Math.min(availW / b.w, availH / (b.h + DEPTH));
  }

  // Ganze Karte zeigen – bei großen Karten aber mindestens gut bedienbare Feldgröße, zentriert auf focusIdx
  fit(focusIdx) {
    if (!this.state) return;
    const fz = this.fitZoom();
    const comfort = Math.min(0.75, Math.max(0.55, this.w / 640));
    const z = Math.max(fz, Math.min(comfort, fz * 10));
    this.cam.z = z;
    this.minZ = Math.min(fz * 0.95, z);
    this.maxZ = Math.max(z * 3, 2);
    if (focusIdx != null && focusIdx >= 0) {
      const c = this.center(focusIdx);
      const off = ((this.viewPad.top + this.h - this.viewPad.bottom) / 2 - this.h / 2) / z;
      this.cam.x = c.x;
      this.cam.y = c.y - off;
    }
    this.clampCam();
    this.dirty = true;
  }

  // Kamera begrenzen: Karte zentrieren, wenn sie in den Bildschirm passt, sonst Ränder nicht verlassen
  clampCam() {
    const b = this.board();
    this.cam.z = Math.min(this.maxZ || 3, Math.max(this.minZ || 0.2, this.cam.z));
    const z = this.cam.z;
    const bx0 = (-HEX * SQRT3) / 2, bx1 = bx0 + b.w, by0 = -HEX, by1 = by0 + b.h + DEPTH;
    const vw = this.w / z, vh = Math.max(50, this.h - this.viewPad.top - this.viewPad.bottom) / z;
    const off = ((this.viewPad.top + this.h - this.viewPad.bottom) / 2 - this.h / 2) / z;
    const m = 24 / z;
    // Über den Rand hinaus scrollen: links/rechts 2 Felder, unten 3, oben 1 – damit Randfelder nicht unter Menüs liegen
    const ex = HEX * SQRT3 * 2, eyTop = HEX * 1.5, eyBottom = HEX * 1.5 * 3;
    if (bx1 - bx0 + 2 * ex <= vw) this.cam.x = (bx0 + bx1) / 2;
    else this.cam.x = Math.min(bx1 + ex - vw / 2 + m, Math.max(bx0 - ex + vw / 2 - m, this.cam.x));
    // Senkrecht: so weit scrollen, dass die äußersten Felder über dem offenen Menü unten
    // bzw. unter der Rohstoffleiste oben sichtbar werden (overlayPad wird laufend gemessen)
    const T = Math.max(this.viewPad.top, this.overlayPad?.top || 0), Bp = Math.max(this.viewPad.bottom, this.overlayPad?.bottom || 0);
    const yMin = by0 - eyTop + (this.h / 2 - T) / z - m, yMax = by1 + eyBottom - (this.h / 2 - Bp) / z + m;
    if (by1 - by0 <= vh && yMin > yMax) this.cam.y = (by0 + by1) / 2 - off;
    else if (yMin > yMax) this.cam.y = (yMin + yMax) / 2;
    else this.cam.y = Math.min(yMax, Math.max(yMin, this.cam.y));
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.w / 2) / this.cam.z + this.cam.x, y: (sy - this.h / 2) / this.cam.z + this.cam.y };
  }
  worldToScreen(x, y) {
    return { x: (x - this.cam.x) * this.cam.z + this.w / 2, y: (y - this.cam.y) * this.cam.z + this.h / 2 };
  }
  pick(sx, sy) {
    if (!this.state) return -1;
    const p = this.screenToWorld(sx, sy);
    return pixelToIndex(p.x, p.y, HEX, this.state.cols, this.state.rows);
  }
  center(i) {
    return hexCenter(i, this.state.cols, HEX);
  }

  panBy(dx, dy) {
    this.cam.x -= dx / this.cam.z;
    this.cam.y -= dy / this.cam.z;
    this.clampCam();
    this.dirty = true;
  }
  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.cam.z *= factor;
    this.clampCam();
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
    this.dirty = true;
  }

  // Kamera sanft auf ein Feld bewegen, falls es nicht gut sichtbar ist
  ensureVisible(i, ms = 260) {
    const c = this.center(i);
    const s = this.worldToScreen(c.x, c.y);
    const m = 50;
    if (s.x > m && s.x < this.w - m && s.y > this.viewPad.top + m * 0.6 && s.y < this.h - this.viewPad.bottom - m * 0.4) return 0;
    const from = { x: this.cam.x, y: this.cam.y };
    const midScreen = (this.viewPad.top + (this.h - this.viewPad.bottom)) / 2;
    const to = { x: c.x, y: c.y + (this.h / 2 - midScreen) / this.cam.z };
    this.addAnim(ms, (p) => {
      const e = easeInOut(p);
      this.cam.x = from.x + (to.x - from.x) * e;
      this.cam.y = from.y + (to.y - from.y) * e;
      this.clampCam();
    });
    return ms;
  }

  addAnim(dur, update, draw, delay = 0) {
    const a = { t0: performance.now() + delay, dur, update, draw };
    this.anims.push(a);
    this.dirty = true;
    return a;
  }

  // ---------- Effekte ----------
  animateMove(id, path, stepMs) {
    if (path.length < 2 || stepMs <= 0) return 0;
    const pts = path.map((i) => this.center(i));
    const total = stepMs * (path.length - 1);
    this.unitPos.set(id, { ...pts[0] });
    this.addAnim(total, (p) => {
      if (p >= 1) { this.unitPos.delete(id); return; }
      const f = p * (pts.length - 1);
      const k = Math.min(pts.length - 2, Math.floor(f));
      const t = easeInOut(f - k);
      const hop = Math.sin(t * Math.PI) * HEX * 0.12;
      this.unitPos.set(id, { x: pts[k].x + (pts[k + 1].x - pts[k].x) * t, y: pts[k].y + (pts[k + 1].y - pts[k].y) * t - hop });
    });
    return total;
  }

  lunge(id, fromIdx, toIdx, ms, ranged, holdEnd = false, noShot = false) {
    if (ms <= 0) return 0;
    const a = this.center(fromIdx), b = this.center(toIdx);
    const amt = ranged ? 0.12 : 0.4;
    this.addAnim(ms, (p) => {
      if (p >= 1) { if (holdEnd) this.unitPos.set(id, { ...a }); else this.unitPos.delete(id); return; }
      const e = Math.sin(p * Math.PI) * amt;
      this.unitPos.set(id, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
    });
    if (ranged && !noShot) {
      // Projektil
      this.addAnim(ms * 0.6, null, (ctx, p) => {
        const x = a.x + (b.x - a.x) * p, y = a.y + (b.y - a.y) * p - Math.sin(p * Math.PI) * HEX * 0.8;
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(x, y - HEX * 0.1, HEX * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }, ms * 0.25);
    }
    return ms;
  }

  shake(id, idx, ms, delay) {
    if (ms <= 0) return;
    const c = this.center(idx);
    this.addAnim(ms, (p) => {
      if (p >= 1) { this.unitPos.delete(id); return; }
      if (p <= 0) return;
      const off = Math.sin(p * Math.PI * 6) * HEX * 0.08 * (1 - p);
      this.unitPos.set(id, { x: c.x + off, y: c.y, flash: 1 - p });
    }, null, delay);
  }

  floatText(idx, text, color, ms = 900, delay = 0) {
    if (ms <= 0) return;
    const c = this.center(idx);
    this.addAnim(ms, null, (ctx, p) => {
      const y = c.y - HEX * 0.5 - easeOut(p) * HEX * 0.7;
      ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      ctx.font = `800 ${HEX * 0.5}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = HEX * 0.1;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(text, c.x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, c.x, y);
      ctx.globalAlpha = 1;
    }, delay);
  }

  // Einheit, die schon aus dem Zustand entfernt ist: erst normal zeigen, ab "fadeFrom" ausblenden
  ghost(unit, ms, fadeFrom = 0, lungeTo = null, fallDir = 1) {
    if (ms <= 0) return;
    const fx = this.fx, fall = fallDir;
    const c0 = this.center(unit.idx);
    const t = lungeTo != null ? this.center(lungeTo) : null;
    // Kampfeffekte: Besiegte legen sich schlafen (zZZ) und verschwinden danach – dafür länger sichtbar
    const tDie = ms * fadeFrom, total = fx ? tDie + 1500 : ms;
    this.addAnim(total, null, (ctx, p) => {
      const now = p * total;
      let x = c0.x, y = c0.y;
      if (t && now < tDie) {
        const e = Math.sin((now / tDie) * Math.PI) * 0.4;
        x += (t.x - c0.x) * e;
        y += (t.y - c0.y) * e;
      }
      if (fx) {
        const d = Math.max(0, now - tDie); // Zeit seit dem Ende
        const lie = easeInOut(Math.min(1, d / 450)); // langsam hinlegen
        const fade = Math.max(0, (d - 1050) / 450);
        const py = y + HEX * 0.3;
        ctx.save();
        ctx.globalAlpha = 1 - fade;
        ctx.translate(x, py);
        ctx.rotate(lie * 1.45 * fall);
        ctx.translate(-x, -py);
        this.drawUnit(ctx, unit, x, y + lie * HEX * 0.08, 1, false, d > 0 ? Math.max(0, 1 - d / 250) : 0);
        ctx.restore();
        // zZZ steigt auf (klein → groß, leicht schaukelnd)
        if (d > 300) {
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ['z', 'Z', 'Z'].forEach((ch, k) => {
            const q = (d - 300 - k * 170) / 900;
            if (q <= 0 || q >= 1) return;
            const zx = x + fall * HEX * (0.25 + k * 0.18) + Math.sin(q * 6 + k) * HEX * 0.06;
            const zy = y - HEX * (0.35 + k * 0.22) - q * HEX * 0.6;
            ctx.globalAlpha = Math.min(1, q * 4) * (1 - Math.max(0, (q - 0.6) / 0.4));
            ctx.font = `italic 800 ${HEX * (0.3 + k * 0.1)}px Georgia, serif`;
            ctx.lineWidth = HEX * 0.07;
            ctx.strokeStyle = 'rgba(15,23,42,0.75)';
            ctx.strokeText(ch, zx, zy);
            ctx.fillStyle = '#e0e7ff';
            ctx.fillText(ch, zx, zy);
          });
          ctx.restore();
        }
        return;
      }
      const f = p < fadeFrom ? 0 : (p - fadeFrom) / (1 - fadeFrom);
      ctx.globalAlpha = 1 - f;
      this.drawUnit(ctx, unit, x, y - f * HEX * 0.2, 1 - f * 0.3, false, f > 0 ? 1 - f : 0);
      ctx.globalAlpha = 1;
    });
  }

  pop(id, ms) {
    if (ms <= 0) return 0;
    this.addAnim(ms, (p) => {
      if (p >= 1) { this.unitPos.delete(id); return; }
      const u = this.state.units.find((x) => x.id === id);
      if (!u) return;
      const c = this.center(u.idx);
      const s = p < 0.7 ? easeOut(p / 0.7) * 1.15 : 1.15 - (p - 0.7) / 0.3 * 0.15;
      this.unitPos.set(id, { x: c.x, y: c.y, s });
    });
    return ms;
  }

  ring(idx, color, ms) {
    if (ms <= 0) return;
    const c = this.center(idx);
    this.addAnim(ms, null, (ctx, p) => {
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = color;
      ctx.lineWidth = HEX * 0.12;
      hexPath(ctx, c.x, c.y, HEX * (0.6 + p * 0.6));
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  // ---------- Kampfeffekte (abschaltbar in den Einstellungen) ----------
  // Nahkampf mit Ausholen: erst zurücklehnen, dann nach vorn stoßen (Treffer bei der Hälfte), zurück
  strike(id, fromIdx, toIdx, ms, holdEnd = false) {
    if (ms <= 0) return 0;
    const a = this.center(fromIdx), b = this.center(toIdx);
    const dir = b.x >= a.x ? 1 : -1;
    this.addAnim(ms, (p) => {
      if (p >= 1) { if (holdEnd) this.unitPos.set(id, { ...a }); else this.unitPos.delete(id); return; }
      let e, rot;
      if (p < 0.32) { const k = easeOut(p / 0.32); e = -0.12 * k; rot = -0.16 * dir * k; }
      else if (p < 0.5) { const k = (p - 0.32) / 0.18; e = -0.12 + 0.57 * k * k; rot = (-0.16 + 0.38 * k) * dir; }
      else { const k = easeInOut((p - 0.5) / 0.5); e = 0.45 * (1 - k); rot = 0.22 * dir * (1 - k); }
      this.unitPos.set(id, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, rot });
    });
    return ms;
  }

  // Hieb: leuchtender Bogen über dem Ziel
  slash(idx, fromIdx, delay, color = '#fff7d6', big = false) {
    const c = this.center(idx), f = this.center(fromIdx);
    const ang = Math.atan2(c.y - f.y, c.x - f.x);
    const r = HEX * (big ? 0.75 : 0.55);
    this.addAnim(260, null, (ctx, p) => {
      const a0 = ang - 1.3 + p * 1.6, a1 = a0 + 1.1;
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.lineWidth = HEX * (big ? 0.24 : 0.17) * (1 - p * 0.5);
      ctx.beginPath();
      ctx.arc(c.x, c.y - HEX * 0.35, r, a0, a1);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.lineWidth *= 0.4;
      ctx.stroke();
      ctx.restore();
    }, delay);
  }

  // Funken/Splitter: kleine Teilchen fliegen auseinander und fallen
  sparks(idx, delay, { n = 14, colors = ['#fff7c2', '#fcd34d', '#fb923c'], speed = 1, size = 1, gravity = 1, ms = 420, up = 0.35 } = {}) {
    const c = this.center(idx);
    const parts = [];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = HEX * (0.5 + Math.random() * 0.9) * speed;
      parts.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - HEX * 0.4 * speed, r: HEX * (0.045 + Math.random() * 0.05) * size, col: colors[k % colors.length] });
    }
    this.addAnim(ms, null, (ctx, p) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - p * p;
      for (const q of parts) {
        const x = c.x + q.vx * p, y = c.y - HEX * up + q.vy * p + HEX * 1.2 * gravity * p * p;
        ctx.fillStyle = q.col;
        ctx.beginPath();
        ctx.arc(x, y, q.r * (1 - p * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }, delay);
  }

  // Staubwolke (Einschlag, Sturz, Schritt eines Titanen)
  dust(idx, delay, { n = 9, size = 1, color = '170,150,120', ms = 650 } = {}) {
    const c = this.center(idx);
    const puffs = [];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      puffs.push({ dx: Math.cos(a) * HEX * (0.3 + Math.random() * 0.4) * size, dy: Math.sin(a) * HEX * 0.18 * size, r: HEX * (0.16 + Math.random() * 0.14) * size });
    }
    this.addAnim(ms, null, (ctx, p) => {
      const e = easeOut(p);
      for (const q of puffs) {
        ctx.fillStyle = `rgba(${color},${0.5 * (1 - p)})`;
        ctx.beginPath();
        ctx.arc(c.x + q.dx * e, c.y + HEX * 0.15 + q.dy * e - HEX * 0.25 * e, q.r * (0.6 + e * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
    }, delay);
  }

  // Geschoss: Pfeil (dreht sich in Flugrichtung), Brandpfeil, Stein, Zauberkugel, Eis
  projectile(fromIdx, toIdx, ms, delay, kind = 'arrow') {
    if (ms <= 0) return;
    const a = this.center(fromIdx), b = this.center(toIdx);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const arc = kind === 'stone' ? Math.max(HEX * 1.2, dist * 0.45) : kind === 'arrow' || kind === 'fire' ? dist * 0.22 : dist * 0.08;
    const pos = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y - HEX * 0.45 + (b.y - a.y + HEX * 0.1) * t - Math.sin(t * Math.PI) * arc });
    const glow = { fire: '#fb923c', bolt: '#c084fc', heal: '#86efac', ice: '#bae6fd', gaze: '#a3e635', blast: '#fdba74' }[kind];
    this.addAnim(ms, null, (ctx, p) => {
      const q = pos(p), q0 = pos(Math.max(0, p - 0.06));
      ctx.save();
      if (kind === 'arrow' || kind === 'fire') {
        const ang = Math.atan2(q.y - q0.y, q.x - q0.x);
        if (kind === 'fire') {
          // Flammenschweif
          ctx.globalCompositeOperation = 'lighter';
          for (let k = 1; k <= 5; k++) {
            const t = pos(Math.max(0, p - k * 0.035));
            ctx.fillStyle = k < 3 ? 'rgba(253,186,116,0.7)' : 'rgba(239,68,68,0.45)';
            ctx.beginPath();
            ctx.arc(t.x, t.y, HEX * (0.09 - k * 0.012), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.translate(q.x, q.y);
        ctx.rotate(ang);
        const L = HEX * 0.42;
        ctx.strokeStyle = '#5b3a1e';
        ctx.lineWidth = HEX * 0.035;
        ctx.beginPath();
        ctx.moveTo(-L, 0);
        ctx.lineTo(0, 0);
        ctx.stroke();
        ctx.fillStyle = kind === 'fire' ? '#fde047' : '#cbd5e1';
        ctx.beginPath();
        ctx.moveTo(HEX * 0.1, 0);
        ctx.lineTo(-HEX * 0.03, -HEX * 0.05);
        ctx.lineTo(-HEX * 0.03, HEX * 0.05);
        ctx.fill();
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(-L, -HEX * 0.05, HEX * 0.1, HEX * 0.1);
      } else if (kind === 'stone') {
        // Schatten am Boden, Stein dreht sich
        const g = { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p + HEX * 0.15 };
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(g.x, g.y, HEX * 0.14, HEX * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.translate(q.x, q.y);
        ctx.rotate(p * 9);
        ctx.fillStyle = '#6b6258';
        ctx.beginPath();
        ctx.moveTo(-HEX * 0.13, -HEX * 0.05);
        ctx.lineTo(-HEX * 0.04, -HEX * 0.14);
        ctx.lineTo(HEX * 0.11, -HEX * 0.09);
        ctx.lineTo(HEX * 0.14, HEX * 0.05);
        ctx.lineTo(HEX * 0.02, HEX * 0.13);
        ctx.lineTo(-HEX * 0.11, HEX * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(-HEX * 0.06, -HEX * 0.08, HEX * 0.07, HEX * 0.05);
      } else {
        // Leuchtende Kugel mit Schweif
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 4; k >= 0; k--) {
          const t = pos(Math.max(0, p - k * 0.04));
          ctx.globalAlpha = 1 - k * 0.18;
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(t.x, t.y, HEX * (0.14 - k * 0.02), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(q.x, q.y, HEX * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }, delay);
  }

  // Feueratem: Flammenstrom vom Drachen über das Ziel hinaus (len = Felder hinter dem Ziel)
  flames(fromIdx, toIdx, ms, delay, len = 2) {
    const a = this.center(fromIdx), b = this.center(toIdx);
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
    const total = d + len * HEX * SQRT3;
    const parts = [];
    for (let k = 0; k < 70; k++) parts.push({ t0: Math.random() * 0.55, life: 0.35 + Math.random() * 0.15, spread: (Math.random() - 0.5) * 0.5, r: HEX * (0.12 + Math.random() * 0.12) });
    this.addAnim(ms, null, (ctx, p) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const q of parts) {
        const t = (p - q.t0) / q.life;
        if (t < 0 || t > 1) continue;
        const dist = HEX * 0.3 + t * total;
        const side = q.spread * dist * 0.35;
        const x = a.x + ux * dist - uy * side, y = a.y - HEX * 0.5 + uy * dist + ux * side - t * HEX * 0.2;
        ctx.globalAlpha = (1 - t) * 0.65;
        ctx.fillStyle = t < 0.18 ? '#fde68a' : t < 0.5 ? '#f97316' : '#b91c1c';
        ctx.beginPath();
        ctx.arc(x, y, q.r * (0.6 + t * 1.2), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }, delay);
  }

  // Lichtfunken steigen auf (Heilen) bzw. Eissplitter (Vereisen)
  glitter(idx, delay, color = '#86efac', n = 12, ms = 700) {
    const c = this.center(idx);
    const parts = [];
    for (let k = 0; k < n; k++) parts.push({ dx: (Math.random() - 0.5) * HEX * 0.9, t0: Math.random() * 0.4, h: HEX * (0.6 + Math.random() * 0.6) });
    this.addAnim(ms, null, (ctx, p) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = color;
      for (const q of parts) {
        const t = (p - q.t0) / (1 - q.t0);
        if (t < 0) continue;
        ctx.globalAlpha = Math.sin(t * Math.PI);
        const x = c.x + q.dx, y = c.y - t * q.h;
        const r = HEX * 0.06;
        ctx.beginPath();
        ctx.moveTo(x, y - r * 1.8);
        ctx.lineTo(x + r * 0.6, y);
        ctx.lineTo(x, y + r * 1.8);
        ctx.lineTo(x - r * 0.6, y);
        ctx.fill();
      }
      ctx.restore();
    }, delay);
  }

  // Explosion: Lichtblitz, Brocken und Rauch
  explosion(idx, delay, size = 1) {
    const c = this.center(idx);
    this.addAnim(260, null, (ctx, p) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(c.x, c.y - HEX * 0.2, HEX * (0.3 + p * 0.6) * size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }, delay);
    this.sparks(idx, delay, { n: 12, colors: ['#78716c', '#a8a29e', '#57534e'], speed: 1.3 * size, size: 1.6, gravity: 1.6, ms: 600, up: 0.1 });
    this.dust(idx, delay + 60, { n: 10, size: 1.2 * size, color: '120,110,100', ms: 900 });
  }

  // Feuersturm: der Drache hebt ab, überfliegt die Schneise, setzt alles in Brand und landet wieder.
  // Liefert die Dauer und für jedes Feld der Fläche den Zeitpunkt, an dem es brennt.
  dragonStorm(id, from, line, area, ms) {
    const geo = getGeo(this.state.cols, this.state.rows);
    const P0 = this.center(from);
    const first = this.center(line[0]);
    const dx = first.x - P0.x, dy = first.y - P0.y;
    const pt = (k) => ({ x: P0.x + dx * k, y: P0.y + dy * k });
    const end = pt(line.length + 0.6);
    const perp = { x: -dy, y: dx };
    const lift = HEX * 0.9;
    const T1 = 0.12, T2 = 0.6, T3 = 0.9;
    const posAt = (p) => {
      if (p < T1) { const e = easeOut(p / T1); return { x: P0.x, y: P0.y, h: lift * e, s: 1 + 0.15 * e }; }
      if (p < T2) { const e = (p - T1) / (T2 - T1); return { x: P0.x + (end.x - P0.x) * e, y: P0.y + (end.y - P0.y) * e, h: lift, s: 1.15 }; }
      if (p < T3) {
        // Rückflug im Bogen
        const e = easeInOut((p - T2) / (T3 - T2)), b = Math.sin(e * Math.PI) * 1.3;
        return { x: end.x + (P0.x - end.x) * e + perp.x * b, y: end.y + (P0.y - end.y) * e + perp.y * b, h: lift, s: 1.15 };
      }
      const e = easeInOut((p - T3) / (1 - T3));
      return { x: P0.x, y: P0.y, h: lift * (1 - e), s: 1.15 - 0.15 * e };
    };
    this.addAnim(ms, (p) => {
      if (p >= 1) { this.unitPos.delete(id); return; }
      const q = posAt(p);
      const flap = p > T1 && p < T3 ? Math.sin(p * 70) * 0.06 : 0;
      this.unitPos.set(id, { x: q.x, y: q.y - q.h, s: q.s + flap, rot: p > T2 && p < T3 ? -0.15 : 0, fly: q.h > lift * 0.2 });
    }, (ctx, p) => {
      // Schatten am Boden
      const q = posAt(p);
      const k = 1 - q.h / lift * 0.5;
      ctx.fillStyle = `rgba(0,0,0,${0.18 + 0.12 * k})`;
      ctx.beginPath();
      ctx.ellipse(q.x, q.y + HEX * 0.35, HEX * 0.9 * k, HEX * 0.32 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    // Zeitpunkt je Feld: wenn der Drache darüber ist (Abstand zur Startposition)
    const times = new Map();
    for (const j of area) {
      const d = geo.dist(from, j);
      const t = T1 + ((d - 0.3) / (line.length + 0.6)) * (T2 - T1);
      times.set(j, ms * t);
    }
    if (this.fx) {
      for (const [j, t] of times) this.fireBurst(j, t);
      this.quake(4, ms * (T2 - T1), ms * T1);
      this.dust(from, ms * T3 + ms * 0.08, { n: 10, size: 1.4 });
      // Feueratem: Flammenstrom unter dem Drachen während des Überflugs
      const parts = [];
      for (let k = 0; k < 60; k++) parts.push({ t0: T1 + Math.random() * (T2 - T1 - 0.05), life: 0.06 + Math.random() * 0.04, dx: (Math.random() - 0.5) * HEX * 0.8, r: HEX * (0.1 + Math.random() * 0.12) });
      this.addAnim(ms, null, (ctx, p) => {
        ctx.save();
        for (const q of parts) {
          const t = (p - q.t0) / q.life;
          if (t < 0 || t > 1) continue;
          const o = posAt(q.t0);
          const x = o.x + q.dx * t, y = o.y - o.h * (1 - t) - HEX * 0.3;
          ctx.globalAlpha = (1 - t) * 0.7;
          ctx.fillStyle = t < 0.3 ? '#fde68a' : t < 0.65 ? '#f97316' : '#b91c1c';
          ctx.beginPath();
          ctx.arc(x, y, q.r * (0.6 + t), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
    }
    return { ms, times };
  }

  // Feuer schlägt aus einem Feld: Flammen, Glut und Rauch
  fireBurst(idx, delay) {
    const c = this.center(idx);
    const fl = [];
    for (let k = 0; k < 14; k++) fl.push({ dx: (Math.random() - 0.5) * HEX * 1.1, dy: (Math.random() - 0.5) * HEX * 0.5, h: HEX * (0.5 + Math.random() * 0.6), r: HEX * (0.1 + Math.random() * 0.1), t0: Math.random() * 0.3 });
    this.addAnim(700, null, (ctx, p) => {
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.45;
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.arc(c.x, c.y, HEX * (0.5 + p * 0.4), 0, Math.PI * 2);
      ctx.fill();
      for (const q of fl) {
        const t = (p - q.t0) / (1 - q.t0);
        if (t < 0) continue;
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.fillStyle = t < 0.25 ? '#fde047' : t < 0.6 ? '#f97316' : '#b91c1c';
        ctx.beginPath();
        ctx.arc(c.x + q.dx, c.y + q.dy - t * q.h, q.r * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }, delay);
    this.dust(idx, delay + 250, { n: 6, color: '70,60,55', ms: 900 });
  }

  // Schonungen (aufgeforstete Wiesen): umgegrabene Erde mit jungen Setzlingen, die mit der Zeit wachsen
  drawPlants(ctx) {
    const fog = this.overlay.fog;
    for (const p of this.state.plants) {
      if (fog && !fog.explored?.[p.idx]) continue;
      const c = this.center(p.idx);
      const grow = Math.min(1, Math.max(0.25, 1 - (p.done - this.state.turn) / 3));
      ctx.save();
      ctx.fillStyle = 'rgba(120,80,40,0.28)';
      hexPath(ctx, c.x, c.y, HEX - 6);
      ctx.fill();
      for (const [dx, dy] of [[-0.35, -0.15], [0.3, -0.25], [0, 0.2], [-0.15, 0.45], [0.38, 0.3]]) {
        const x = c.x + dx * HEX, y = c.y + dy * HEX, h = HEX * (0.18 + 0.22 * grow);
        ctx.strokeStyle = '#6b4a2a';
        ctx.lineWidth = HEX * 0.035;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - h * 0.4);
        ctx.stroke();
        ctx.fillStyle = '#3f8f3a';
        ctx.beginPath();
        ctx.moveTo(x, y - h);
        ctx.lineTo(x + h * 0.38, y - h * 0.3);
        ctx.lineTo(x - h * 0.38, y - h * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(190,240,140,0.5)';
        ctx.beginPath();
        ctx.moveTo(x, y - h);
        ctx.lineTo(x - h * 0.38, y - h * 0.3);
        ctx.lineTo(x - h * 0.05, y - h * 0.3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Brennende Felder (Flächenbrand bis zum nächsten Zug des Drachen): flackernde Flammen
  drawBurns(ctx, now) {
    for (const b of this.state.burns || []) {
      for (const j of b.tiles) {
        const c = this.center(j);
        ctx.save();
        ctx.fillStyle = 'rgba(234,88,12,0.18)';
        hexPath(ctx, c.x, c.y, HEX - 3);
        ctx.fill();
        if (this.fx) {
          ctx.globalCompositeOperation = 'lighter';
          for (let k = 0; k < 3; k++) {
            const fx = c.x + (hash(j * 7 + k) - 0.5) * HEX * 1.0, fy = c.y + (hash(j * 13 + k) - 0.3) * HEX * 0.6;
            const fl = 0.75 + 0.25 * Math.sin(now / 90 + k * 2 + j);
            const h = HEX * 0.42 * fl;
            ctx.fillStyle = 'rgba(249,115,22,0.75)';
            ctx.beginPath();
            ctx.moveTo(fx - HEX * 0.12, fy);
            ctx.quadraticCurveTo(fx - HEX * 0.1, fy - h * 0.6, fx, fy - h);
            ctx.quadraticCurveTo(fx + HEX * 0.1, fy - h * 0.6, fx + HEX * 0.12, fy);
            ctx.fill();
            ctx.fillStyle = 'rgba(253,230,138,0.7)';
            ctx.beginPath();
            ctx.ellipse(fx, fy - h * 0.25, HEX * 0.05, h * 0.25, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }
  }

  // Bildschirm wackelt kurz (schwere Treffer)
  quake(amp, ms, delay = 0) {
    this.addAnim(ms, (p) => {
      if (p >= 1) { this.quakeOff = null; return; }
      const k = amp * (1 - p);
      this.quakeOff = { x: (Math.random() - 0.5) * k, y: (Math.random() - 0.5) * k };
    }, null, delay);
  }

  // ---------- Zeichnen ----------
  territory() {
    const s = this.state;
    const t = computeTerritory(s);
    const own = new Int8Array(t.length).fill(-2);
    for (let i = 0; i < t.length; i++) if (t[i] >= 0) own[i] = s.cities[t[i]].owner;
    return own;
  }

  // Gelände wird in Kacheln (Chunks) vorgerendert – nur sichtbare, mit Speicherbudget
  chunkScaleWanted() {
    const want = Math.min(2.6, this.cam.z * this.dpr * 1.1);
    return Math.pow(2, Math.round(Math.log2(want) * 2) / 2);
  }

  resetChunks() {
    this.chunks = new Map();
    this.ownMap = this.territory();
    this.cacheDirty = false;
  }

  getChunk(cx, cy) {
    const key = cx + ',' + cy;
    let ch = this.chunks.get(key);
    if (ch && (ch.scale === this.chunkScale || this.gesturing)) {
      ch.used = this.frameNo;
      return ch;
    }
    const scale = this.chunkScale;
    const pad = 2 / scale;
    const size = CHUNK + pad;
    const cv = ch?.cv || document.createElement('canvas');
    cv.width = Math.ceil(size * scale);
    cv.height = Math.ceil(size * scale);
    const ctx = cv.getContext('2d');
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    ctx.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
    ctx.clearRect(x0, y0, size, size);
    this.drawTerrain(ctx, x0, y0, x0 + size, y0 + size);
    ch = { cv, scale, size, used: this.frameNo };
    this.chunks.set(key, ch);
    // Speicher begrenzen: älteste Kacheln verwerfen
    let px = 0;
    for (const c of this.chunks.values()) px += c.cv.width * c.cv.height;
    if (px > 18e6) {
      const old = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
      for (const [k, c] of old) {
        if (px <= 12e6 || c.used === this.frameNo) break;
        px -= c.cv.width * c.cv.height;
        this.chunks.delete(k);
      }
    }
    return ch;
  }

  // Nach Eroberung/Ausbau nur die betroffene Gegend neu zeichnen
  invalidateArea(idx) {
    if (!this.chunks) return;
    this.ownMap = this.territory();
    const c = this.center(idx);
    const r = HEX * 6;
    for (const key of [...this.chunks.keys()]) {
      const [cx, cy] = key.split(',').map(Number);
      const x0 = cx * CHUNK, y0 = cy * CHUNK;
      if (c.x + r < x0 || c.x - r > x0 + CHUNK || c.y + r < y0 || c.y - r > y0 + CHUNK) continue;
      this.chunks.delete(key);
    }
    this.dirty = true;
  }

  isOnScreen(i, margin = 30) {
    const c = this.center(i);
    const p = this.worldToScreen(c.x, c.y);
    return p.x > -margin && p.x < this.w + margin && p.y > this.viewPad.top - margin && p.y < this.h - this.viewPad.bottom + margin;
  }

  visibleRange(margin = 0) {
    const a = this.screenToWorld(-margin, -margin), b = this.screenToWorld(this.w + margin, this.h + margin);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }

  drawTerrain(ctx, x0, y0, x1, y1) {
    const s = this.state;
    const T = s.terrain;
    const own = this.ownMap || this.territory();
    const cityAt = new Map(s.cities.map((c) => [c.idx, c]));
    // Burghof: die 6 Felder um eine Burg werden gepflastert
    const geo = getGeo(s.cols, s.rows);
    const court = new Set();
    for (const c of s.cities) if (c.castle) for (const j of geo.nb[c.idx]) court.add(j);
    const W = HEX * SQRT3;
    const r0 = Math.max(0, Math.floor((y0 - HEX * 1.5) / (HEX * 1.5)));
    const r1 = Math.min(s.rows - 1, Math.ceil((y1 + HEX * 3) / (HEX * 1.5)));
    const c0 = Math.max(0, Math.floor((x0 - W) / W)), c1 = Math.min(s.cols - 1, Math.ceil((x1 + W) / W));
    const rowIdx = (r) => {
      const row = [];
      for (let col = c0; col <= c1; col++) row.push(r * s.cols + col);
      return row;
    };
    // Wasser liegt tiefer
    for (let r = r0; r <= r1; r++) {
      for (const i of rowIdx(r)) {
        if (T[i] !== 'water') continue;
        const c = this.center(i);
        drawTileTop(ctx, 'water', c.x, c.y + DEPTH * 0.5, HEX + 0.5, i);
      }
    }
    ctx.lineCap = 'round';
    for (let r = r0; r <= r1; r++) {
      const row = rowIdx(r);
      for (const i of row) {
        const t = T[i];
        if (t === 'water') continue;
        const c = this.center(i);
        drawTileSide(ctx, t, c.x, c.y, HEX, DEPTH);
        drawTileTop(ctx, t, c.x, c.y, HEX, i);
        if (court.has(i)) drawCourt(ctx, c.x, c.y, HEX, i);
        if (own[i] >= 0) {
          ctx.fillStyle = PLAYER_COLORS[own[i]].main;
          ctx.globalAlpha = 0.16;
          hexPath(ctx, c.x, c.y, HEX);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        // Grenzen
        if (own[i] >= -1) {
          for (let k = 0; k < 6; k++) {
            const ang = (Math.PI / 3) * k;
            const j = pixelToIndex(c.x + Math.cos(ang) * HEX * SQRT3, c.y + Math.sin(ang) * HEX * SQRT3, HEX, s.cols, s.rows);
            if (j >= 0 && own[j] === own[i]) continue;
            const a1 = (Math.PI / 180) * (60 * k - 30), a2 = (Math.PI / 180) * (60 * k + 30);
            const rr = HEX - 3.5;
            ctx.beginPath();
            ctx.moveTo(c.x + rr * Math.cos(a1), c.y + rr * Math.sin(a1));
            ctx.lineTo(c.x + rr * Math.cos(a2), c.y + rr * Math.sin(a2));
            if (own[i] >= 0) {
              ctx.strokeStyle = 'rgba(0,0,0,0.45)';
              ctx.lineWidth = 6.5;
              ctx.stroke();
              ctx.strokeStyle = PLAYER_COLORS[own[i]].main;
              ctx.lineWidth = 4;
              ctx.stroke();
            } else {
              ctx.strokeStyle = 'rgba(255,255,255,0.4)';
              ctx.lineWidth = 1.6;
              ctx.setLineDash([4, 5]);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }
        }
      }
      // Küstenlinien
      for (const i of row) {
        if (T[i] !== 'water') continue;
        const c = this.center(i);
        for (let k = 0; k < 6; k++) {
          const ang = (Math.PI / 3) * k;
          const j = pixelToIndex(c.x + Math.cos(ang) * HEX * SQRT3, c.y + DEPTH * 0.5 + Math.sin(ang) * HEX * SQRT3, HEX, s.cols, s.rows);
          if (j >= 0 && T[j] !== 'water' && k < 3) drawShore(ctx, c.x, c.y + DEPTH * 0.5, HEX, k);
        }
      }
      for (const i of row) {
        const c = this.center(i);
        const city = cityAt.get(i);
        if (city) continue; // Städte werden zum Schluss groß über die Nachbarfelder gezeichnet
        if (court.has(i)) continue;
        else if (T[i] === 'forest') drawForest(ctx, c.x, c.y, HEX, i);
        else if (T[i] === 'hill') drawHill(ctx, c.x, c.y, HEX, i);
        else if (T[i] === 'mountain') drawMountain(ctx, c.x, c.y, HEX, i);
        if (s.grapes?.includes(i)) drawGrapes(ctx, c.x, c.y, HEX, i);
      }
    }
    // Städte groß über die Nachbarfelder (je höher die Stufe, desto größer), damit man sie auch mit Einheit darauf gut erkennt
    for (const city of s.cities) {
      if (city.castle) continue;
      const c = this.center(city.idx);
      if (c.x < x0 - HEX * 3 || c.x > x1 + HEX * 3 || c.y < y0 - HEX * 3 || c.y > y1 + HEX * 4) continue;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.38)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 2;
      // Mit Mauer wirkt die Stadt durch den Mauerring ohnehin größer – etwas kleiner zeichnen
      const sc = (CITY_SCALE[city.level] || 2.2) * (city.buildings?.includes('wall') ? 0.8 : 1);
      drawCity(ctx, city, c.x, c.y - HEX * 0.25 * (sc - 1), HEX * sc, colorOf(city.owner));
      ctx.restore();
    }
  }

  // Figuren werden einmal pro Typ/Farbe/Zoomstufe in einen Puffer gezeichnet
  sprite(type, owner, exhausted, level, stone = false, fly = false) {
    // Aussehen je nach Einheiten-Entwicklung des Besitzers
    const ups = this.state?.players[owner]?.unitUps?.[type] || [];
    const k0 = Math.max(0.5, Math.round(this.cam.z * this.dpr * 4) / 4) * (HEX / 40) * FIG;
    if (this.spriteScale !== k0) {
      this.sprites = new Map();
      this.spriteScale = k0;
    }
    const k = k0 * (BIG[type] || 1);
    const key = type + owner + (exhausted ? 'x' : '') + (stone ? (stone === 'ice' ? 'i' : 's') : '') + (fly ? 'f' : '') + (level || '') + ups.join('');
    let sp = this.sprites.get(key);
    if (sp) return sp;
    const base = PLAYER_COLORS[owner] || NEUTRAL_COLOR;
    const col = exhausted
      ? { main: mix(base.main, GREY, 0.75), dark: mix(base.dark, '#4a4844', 0.75), light: mix(base.light, '#c9c6c0', 0.75) }
      : base;
    const B = FIG_BOX;
    const W = Math.ceil((B.left + B.right) * k), H = Math.ceil((B.top + B.bottom) * k);
    const raw = document.createElement('canvas');
    raw.width = W;
    raw.height = H;
    const rc = raw.getContext('2d');
    rc.setTransform(k, 0, 0, k, B.left * k, B.top * k);
    drawFigure(rc, type, col, level, fly, { stage: ups.length, ups: new Set(ups) });
    // Plastische Beleuchtung: Licht von links oben, Schatten nach rechts unten
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.globalCompositeOperation = 'source-atop';
    const lg = rc.createLinearGradient(W * 0.25, H * 0.15, W * 0.8, H * 0.95);
    lg.addColorStop(0, 'rgba(255,248,225,0.16)');
    lg.addColorStop(0.5, 'rgba(0,0,0,0)');
    lg.addColorStop(1, 'rgba(10,5,20,0.28)');
    rc.fillStyle = lg;
    rc.fillRect(0, 0, W, H);
    if (stone) {
      // Versteinert: entsättigt, Steinfarbe und Risse
      const mask = document.createElement('canvas');
      mask.width = W;
      mask.height = H;
      mask.getContext('2d').drawImage(raw, 0, 0);
      rc.globalCompositeOperation = 'saturation';
      rc.fillStyle = '#808080';
      rc.fillRect(0, 0, W, H);
      rc.globalCompositeOperation = 'destination-in';
      rc.drawImage(mask, 0, 0);
      rc.globalCompositeOperation = 'source-atop';
      // Vereist: blaues Eis statt Stein
      rc.fillStyle = stone === 'ice' ? 'rgba(140,205,255,0.55)' : 'rgba(150,145,135,0.45)';
      rc.fillRect(0, 0, W, H);
      rc.setTransform(k, 0, 0, k, B.left * k, B.top * k);
      rc.strokeStyle = stone === 'ice' ? 'rgba(235,248,255,0.9)' : 'rgba(40,36,32,0.7)';
      rc.lineWidth = 0.7;
      for (const pts of [[[-6, -30], [-3, -22], [-7, -15], [-4, -6]], [[5, -26], [8, -18], [4, -10]], [[-12, -4], [-5, 0], [3, -2]]]) {
        rc.beginPath();
        rc.moveTo(pts[0][0], pts[0][1]);
        for (const [px, py] of pts.slice(1)) rc.lineTo(px, py);
        rc.stroke();
      }
      rc.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (exhausted) {
      rc.fillStyle = 'rgba(60,60,60,0.5)';
      rc.fillRect(0, 0, W, H);
    }
    // Schlagschatten für räumliche Tiefe
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 2.5 * k;
    ctx.shadowOffsetX = 2.2 * k;
    ctx.shadowOffsetY = 1.4 * k;
    ctx.drawImage(raw, 0, 0);
    sp = { cv, k };
    this.sprites.set(key, sp);
    return sp;
  }

  // Burg als Bild im Puffer (je Besitzer, Drachenhöhle und Zoomstufe)
  castleSprite(c) {
    const k = Math.max(0.5, Math.round(this.cam.z * this.dpr * 4) / 4);
    if (this.castleScale !== k) {
      this.castles = new Map();
      this.castleScale = k;
    }
    const lair = c.buildings?.includes('dragonlair') ? 'd' : '';
    const key = c.owner + lair + c.level;
    let sp = this.castles.get(key);
    if (sp) return sp;
    const B = CASTLE_BOX;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((B.left + B.right) * HEX * k);
    cv.height = Math.ceil((B.top + B.bottom) * HEX * k);
    const ctx = cv.getContext('2d');
    ctx.setTransform(k, 0, 0, k, B.left * HEX * k, B.top * HEX * k);
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 4 * k;
    ctx.shadowOffsetX = 3 * k;
    ctx.shadowOffsetY = 2 * k;
    drawCastle(ctx, c, 0, 0, HEX, PLAYER_COLORS[c.owner] || NEUTRAL_COLOR);
    sp = { cv };
    this.castles.set(key, sp);
    return sp;
  }

  drawUnit(ctx, u, x, y, scale = 1, exhausted = false, flash = 0, ready = false, now = 0, fly = false) {
    const s = (HEX / 40) * FIG;
    const big = BIG[u.type] || 1;
    y += 4;
    if (ready) {
      // Gelb: ganzer Zug offen · Orange gestrichelt: schon gezogen, Angriff noch möglich
      const p = 0.5 + 0.5 * Math.sin(now / 260);
      const partial = ready === 'partial';
      ctx.strokeStyle = partial ? `rgba(251,146,60,${0.6 + p * 0.4})` : `rgba(255,236,120,${0.55 + p * 0.45})`;
      ctx.lineWidth = 3 + p * 1.5;
      if (partial) ctx.setLineDash([5 * s, 4 * s]);
      ctx.beginPath();
      ctx.ellipse(x, y + 7 * s, 19 * s, 7.5 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (flash > 0) {
      const g = ctx.createRadialGradient(x, y - 10 * s, 2, x, y - 10 * s, 26 * s);
      g.addColorStop(0, `rgba(255,70,50,${flash * 0.8})`);
      g.addColorStop(1, 'rgba(255,70,50,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 30 * s, y - 40 * s, 60 * s, 60 * s);
    }
    const stone = u.stone || u.stoneNow ? (u.iced || u.ice ? 'ice' : true) : false;
    const sp = this.sprite(u.type, u.owner, exhausted && !stone, u.level, stone, fly);
    const B = FIG_BOX;
    if (exhausted) ctx.globalAlpha *= 0.8;
    ctx.drawImage(sp.cv, x - B.left * s * scale * big, y - B.top * s * scale * big, (B.left + B.right) * s * scale * big, (B.top + B.bottom) * s * scale * big);
    if (exhausted) ctx.globalAlpha /= 0.8;
    if (u.shaken) {
      // Erschüttert: kreisende Sterne über dem Kopf
      const t = now / 300;
      for (let k = 0; k < 3; k++) {
        const a = t + (k * Math.PI * 2) / 3;
        const px = x + Math.cos(a) * 9 * s, py = y - 46 * s * scale + Math.sin(a) * 3 * s;
        ctx.fillStyle = '#ffe14d';
        ctx.strokeStyle = '#7a5200';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const ang = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 1.6 * s : 3.6 * s;
          ctx.lineTo(px + r * Math.cos(ang), py + r * Math.sin(ang));
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    // Schutzaura: kleines Schild-Symbol
    if (inAura(this.state, u)) {
      const bx = x - 15 * s * scale, by = y + 2 * s;
      ctx.fillStyle = 'rgba(125,211,252,0.95)';
      ctx.strokeStyle = 'rgba(12,40,70,0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx, by - 5 * s);
      ctx.lineTo(bx + 4 * s, by - 3.5 * s);
      ctx.quadraticCurveTo(bx + 4 * s, by + 2.5 * s, bx, by + 4.5 * s);
      ctx.quadraticCurveTo(bx - 4 * s, by + 2.5 * s, bx - 4 * s, by - 3.5 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Lebensbalken unter dem Sockel
    const max = statsOf(this.state, u).hp;
    const ratio = Math.max(0, u.hp / max);
    const bw = 24 * s * scale, bh = 4 * s, bx = x - bw / 2, by = y + 13.5 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(bx - 1.5, by - 1.5, bw + 3, bh + 3);
    ctx.fillStyle = ratio > 0.6 ? '#4ade80' : ratio > 0.3 ? '#facc15' : '#f87171';
    ctx.fillRect(bx, by, bw * ratio, bh);
    // Rang: goldene Sterne über dem Lebensbalken
    const rank = u.rank || 1;
    if (rank > 1) {
      const n = rank - 1, sr = 2.6 * s, gap = 6 * s;
      for (let k = 0; k < n; k++) {
        const px = x - ((n - 1) * gap) / 2 + k * gap, py = by - 4 * s;
        ctx.fillStyle = '#fde047';
        ctx.strokeStyle = 'rgba(60,40,0,0.95)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const ang = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? sr * 0.45 : sr;
          ctx.lineTo(px + r * Math.cos(ang), py + r * Math.sin(ang));
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    // Spezialisierung wählbar: goldener Schimmer, Aufblinken und aufsteigende Funken
    if (this.overlay.upgrade?.has(u.id)) {
      const p = 0.5 + 0.5 * Math.sin(now / 260);
      ctx.strokeStyle = `rgba(253,224,71,${0.4 + p * 0.5})`;
      ctx.lineWidth = 2 + p * 2.5;
      ctx.beginPath();
      ctx.ellipse(x, y + 7 * s, 22 * s, 9 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Figur blinkt hell auf
      const blink = Math.max(0, Math.sin(now / 420)) ** 3;
      if (blink > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= blink * 0.45;
        ctx.drawImage(sp.cv, x - B.left * s * scale * big, y - B.top * s * scale * big, (B.left + B.right) * s * scale * big, (B.top + B.bottom) * s * scale * big);
        ctx.restore();
      }
      for (let k = 0; k < 5; k++) {
        const ph = ((now / 1400 + k / 5) % 1);
        const px = x + Math.sin(k * 2.3 + now / 700) * 13 * s, py = y + 4 * s - ph * 44 * s * scale;
        ctx.fillStyle = `rgba(255,236,140,${(1 - ph) * 0.9})`;
        ctx.beginPath();
        ctx.arc(px, py, (1.6 - ph) * 1.3 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      const bx = x - 15 * s * scale, by = y - 36 * s * scale;
      ctx.font = `800 ${11 * s}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(80,50,0,${0.5 + p * 0.4})`;
      ctx.strokeText('⬆', bx, by);
      ctx.fillStyle = `rgba(253,224,71,${0.6 + p * 0.4})`;
      ctx.fillText('⬆', bx, by);
    }
    // Wache
    if (u.sentry) {
      const px = x + 14 * s * scale, py = y - 40 * s * scale;
      ctx.font = `800 ${12 * s}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText('z', px, py);
      ctx.fillStyle = '#e0f2fe';
      ctx.fillText('z', px, py);
    }
    // Gewählte Fähigkeiten als Abzeichen links neben der Figur
    if (u.perks?.length) {
      ctx.font = `${8.5 * s}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      u.perks.forEach((p, k) => {
        const px = x - 19 * s * scale, py = y - 6 * s - k * 12 * s;
        ctx.fillStyle = 'rgba(20,24,32,0.85)';
        ctx.beginPath();
        ctx.arc(px, py, 5.6 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e9c45a';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(PERKS[p]?.icon || '★', px, py + 0.5 * s);
      });
    }
    if (u.hp < max) {
      ctx.font = `800 ${11 * s}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(u.hp, bx + bw + 3, by + bh / 2);
      ctx.fillStyle = '#fff';
      ctx.fillText(u.hp, bx + bw + 3, by + bh / 2);
    }
  }

  // Vorschaubild einer Figur für Menüs/Panels
  drawPreview(ctx, type, owner, cx, cy, size, level, ups = []) {
    const k = size / 60;
    ctx.save();
    ctx.translate(cx, cy + size * 0.22);
    ctx.scale(k, k);
    drawFigure(ctx, type, PLAYER_COLORS[owner] || NEUTRAL_COLOR, level, false, { stage: ups.length, ups: new Set(ups) });
    ctx.restore();
  }

  frame(t) {
    const now = performance.now();
    if (this.anims.length) {
      for (const a of this.anims) {
        const p = Math.min(1, Math.max(0, (now - a.t0) / a.dur));
        a.p = now < a.t0 ? -1 : p;
        if (a.update && a.p >= 0) a.update(a.p);
      }
      this.dirty = true;
    }
    const pulsing = this.state?.burns?.length || this.overlay.targets?.size || this.overlay.ready?.size || this.overlay.upgrade?.size || this.state?.units.some((u) => u.shaken);
    if (!this.dirty && pulsing && now - (this.lastDraw || 0) > 40) this.dirty = true; // Pulsieren mit ~25 fps
    if (!this.dirty) return;
    this.lastDraw = now;
    this.dirty = false;
    this.draw(now);
    this.anims = this.anims.filter((a) => a.p < 1);
  }

  draw(now) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#12385e');
    g.addColorStop(1, '#0a1d33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    if (!this.state) return;
    if (this.cacheDirty || !this.chunks) this.resetChunks();
    this.frameNo = (this.frameNo || 0) + 1;
    if (!this.gesturing) {
      const want = this.chunkScaleWanted();
      if (want !== this.chunkScale) this.chunkScale = want;
    }
    if (!this.chunkScale) this.chunkScale = this.chunkScaleWanted();
    const z = this.cam.z * this.dpr;
    const qo = this.quakeOff || { x: 0, y: 0 };
    ctx.setTransform(z, 0, 0, z, this.dpr * (this.w / 2 - this.cam.x * this.cam.z + qo.x), this.dpr * (this.h / 2 - this.cam.y * this.cam.z + qo.y));
    ctx.imageSmoothingEnabled = true;
    const vr = this.visibleRange(40);
    for (let cy = Math.floor(vr.y0 / CHUNK); cy <= Math.floor(vr.y1 / CHUNK); cy++) {
      for (let cx = Math.floor(vr.x0 / CHUNK); cx <= Math.floor(vr.x1 / CHUNK); cx++) {
        if (cx < -2 || cy < -2 || cx * CHUNK > this.board().w + MARGIN || cy * CHUNK > this.board().h + MARGIN) continue;
        const ch = this.getChunk(cx, cy);
        ctx.drawImage(ch.cv, cx * CHUNK, cy * CHUNK, ch.cv.width / ch.scale, ch.cv.height / ch.scale);
      }
    }
    // Burgen über 7 Felder (vor dem Nebel, damit er sie verdeckt)
    const fog = this.overlay.fog;
    for (const c of this.state.cities) {
      if (!c.castle || (fog && !fog.explored?.[c.idx])) continue;
      const p = this.center(c.idx);
      if (p.x < vr.x0 - HEX * 4 || p.x > vr.x1 + HEX * 4 || p.y < vr.y0 - HEX * 3 || p.y > vr.y1 + HEX * 5) continue;
      const sp = this.castleSprite(c);
      const B = CASTLE_BOX;
      ctx.drawImage(sp.cv, p.x - B.left * HEX, p.y - B.top * HEX, (B.left + B.right) * HEX, (B.top + B.bottom) * HEX);
    }
    // Kartennebel
    if (fog) this.drawFog(ctx, fog, vr);

    const o = this.overlay;
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);
    if (o.cityIdx != null) {
      const c = this.center(o.cityIdx);
      ctx.strokeStyle = '#ffe14d';
      ctx.lineWidth = 5;
      hexPath(ctx, c.x, c.y, HEX - 3);
      ctx.stroke();
    }
    if (o.moves) {
      for (const i of o.moves) {
        const c = this.center(i);
        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        hexPath(ctx, c.x, c.y, HEX - 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(c.x, c.y, HEX * 0.11, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (o.aura) {
      for (const i of o.aura) {
        const c = this.center(i);
        ctx.fillStyle = 'rgba(125,211,252,0.16)';
        hexPath(ctx, c.x, c.y, HEX - 3);
        ctx.fill();
      }
    }
    if (o.special) {
      for (const i of o.special) {
        const c = this.center(i);
        ctx.fillStyle = `rgba(168,85,247,${0.22 + pulse * 0.14})`;
        hexPath(ctx, c.x, c.y, HEX - 3);
        ctx.fill();
        ctx.strokeStyle = `rgba(192,132,252,${0.75 + pulse * 0.25})`;
        ctx.lineWidth = 4 + pulse * 2;
        ctx.stroke();
      }
    }
    if (o.heals) {
      for (const i of o.heals) {
        const c = this.center(i);
        ctx.fillStyle = `rgba(74,222,128,${0.2 + pulse * 0.12})`;
        hexPath(ctx, c.x, c.y, HEX - 3);
        ctx.fill();
        ctx.strokeStyle = `rgba(74,222,128,${0.7 + pulse * 0.3})`;
        ctx.lineWidth = 4 + pulse * 2;
        ctx.stroke();
      }
    }
    if (o.selected != null) {
      const c = this.center(o.selected);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      hexPath(ctx, c.x, c.y, HEX - 3);
      ctx.stroke();
    }
    if (o.selectedSet) {
      for (const i of o.selectedSet) {
        const c = this.center(i);
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 5;
        hexPath(ctx, c.x, c.y, HEX - 3);
        ctx.stroke();
      }
    }
    if (o.targets) {
      for (const t of o.targets.values()) {
        const c = this.center(t.idx);
        ctx.fillStyle = `rgba(239,48,48,${0.18 + pulse * 0.12})`;
        hexPath(ctx, c.x, c.y, HEX - 3);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,60,60,${0.7 + pulse * 0.3})`;
        ctx.lineWidth = 4 + pulse * 2;
        ctx.stroke();
      }
    }

    if (this.state.plants?.length) this.drawPlants(ctx);
    if (this.state.burns?.length) this.drawBurns(ctx, now);
    // Einheiten (von oben nach unten, damit vordere Figuren davor stehen)
    const s = this.state;
    this.drawWallLinks(ctx, fog);
    // Fliegende (z. B. Drache im Feuersturm) zuletzt, damit sie über allem schweben
    const flying = (u) => (this.unitPos.get(u.id)?.fly ? 1 : 0);
    const sorted = s.units.slice().sort((a, b) => flying(a) - flying(b) || a.idx - b.idx);
    for (const u of sorted) {
      if (this.hidden.has(u.id)) continue;
      if (fog && !fog.vis[u.idx] && !this.unitPos.has(u.id)) continue;
      const pos = this.unitPos.get(u.id);
      const c = pos || this.center(u.idx);
      if (c.x < vr.x0 - HEX || c.x > vr.x1 + HEX || c.y < vr.y0 - HEX * 2 || c.y > vr.y1 + HEX * 2) continue;
      const exhausted = !pos && !!o.exhausted?.has(u.id);
      const ready = !pos && !!o.ready?.has(u.id) && u.idx !== o.selected && !o.selectedSet?.has(u.idx) && (o.partial?.has(u.id) ? 'partial' : true);
      if (pos?.rot) {
        // Ausholen/Zuschlagen: Figur um die Füße kippen
        const py = c.y + HEX * 0.3;
        ctx.save();
        ctx.translate(c.x, py);
        ctx.rotate(pos.rot);
        ctx.translate(-c.x, -py);
        this.drawUnit(ctx, u, c.x, c.y, pos?.s ?? 1, exhausted, pos?.flash || 0, ready, now, !!pos?.fly);
        ctx.restore();
      } else this.drawUnit(ctx, u, c.x, c.y, pos?.s ?? 1, exhausted, pos?.flash || 0, ready, now, !!pos?.fly);
    }

    // Kampfvorschau über jedem Ziel
    if (o.targets) for (const t of o.targets.values()) this.forecastBubble(ctx, t);

    for (const a of this.anims) if (a.draw && a.p >= 0) a.draw(ctx, a.p);
  }

  // Benachbarte Steinwälle desselben Spielers zu einer Mauer verbinden
  drawWallLinks(ctx, fog) {
    const s = this.state;
    const walls = s.units.filter((u) => u.type === 'barrier' && !this.hidden.has(u.id) && (!fog || fog.vis[u.idx]));
    if (walls.length < 2) return;
    const at = new Map(walls.map((u) => [u.idx, u]));
    const geo = getGeo(s.cols, s.rows);
    const k = (HEX / 40) * FIG;
    for (const u of walls.sort((a, b) => a.idx - b.idx)) {
      for (const j of geo.nb[u.idx]) {
        const o = at.get(j);
        if (!o || j < u.idx || o.owner !== u.owner) continue;
        const a = this.center(u.idx), b = this.center(j);
        drawWallLink(ctx, a.x, a.y + 4 + 4 * k, b.x, b.y + 4 + 4 * k, colorOf(u.owner), k);
      }
    }
  }

  drawFog(ctx, fog, vr) {
    const s = this.state;
    const W = HEX * SQRT3;
    const r0 = Math.max(0, Math.floor(vr.y0 / (HEX * 1.5)) - 1), r1 = Math.min(s.rows - 1, Math.ceil(vr.y1 / (HEX * 1.5)) + 1);
    const c0 = Math.max(0, Math.floor(vr.x0 / W) - 1), c1 = Math.min(s.cols - 1, Math.ceil(vr.x1 / W) + 1);
    for (let r = r0; r <= r1; r++) {
      for (let col = c0; col <= c1; col++) {
        const i = r * s.cols + col;
        if (fog.vis[i]) continue;
        const c = this.center(i);
        if (!fog.explored[i]) {
          const v = 9 + hash(i) * 3;
          ctx.fillStyle = `hsl(212, 45%, ${v}%)`;
          hexPath(ctx, c.x, c.y, HEX + 1.5);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(8,18,34,0.5)';
          hexPath(ctx, c.x, c.y, HEX + 0.5);
          ctx.fill();
        }
      }
    }
  }

  forecastBubble(ctx, t) {
    const c = this.center(t.idx);
    const fs = Math.max(HEX * 0.36, 13 / this.cam.z);
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    const main = (t.n > 1 ? `${t.n}× ` : '') + (t.kill ? '✖' : `−${t.dmg}`);
    const sub = (t.extra ? ` 💥${t.extra}×−${Math.round(t.extraDmg / t.extra)}` : '') + (!t.kill && t.counter > 0 ? ` ↩${t.counter}` : '');
    const wMain = ctx.measureText(main).width;
    ctx.font = `700 ${fs * 0.72}px system-ui, sans-serif`;
    const wSub = sub ? ctx.measureText(sub).width : 0;
    const pad = fs * 0.4;
    const w = wMain + wSub + pad * 2, h = fs * 1.35;
    const x = c.x - w / 2, y = c.y - HEX * 1.45 - h / 2;
    ctx.fillStyle = t.kill ? '#16a34a' : '#dc2626';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, h / 2) : ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, 2 / this.cam.z);
    ctx.stroke();
    // Spitze
    ctx.beginPath();
    ctx.moveTo(c.x - fs * 0.3, y + h);
    ctx.lineTo(c.x, y + h + fs * 0.35);
    ctx.lineTo(c.x + fs * 0.3, y + h);
    ctx.fillStyle = t.kill ? '#16a34a' : '#dc2626';
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    ctx.fillText(main, x + pad, y + h / 2 + 1);
    if (sub) {
      ctx.font = `700 ${fs * 0.72}px system-ui, sans-serif`;
      ctx.fillStyle = '#fed7aa';
      ctx.fillText(sub, x + pad + wMain, y + h / 2 + 1);
    }
  }
}
