// Canvas-Renderer: Gelände wird einmal in eine Offscreen-Leinwand gezeichnet,
// pro Frame kommen nur Markierungen, Einheiten und Effekte dazu.
import { hexCenter, pixelToIndex, boardSize, SQRT3, getGeo } from './hex.js';
import { PLAYER_COLORS, NEUTRAL_COLOR, UNITS } from './data.js';
import { computeTerritory, statsOf, inAura } from './game.js';
import {
  hash, hexPath, mix, drawTileTop, drawTileSide, drawForest, drawHill, drawMountain, drawShore, drawCity, drawFigure, drawWallLink, FIG_BOX,
} from './art.js';

export const HEX = 40;
const DEPTH = HEX * 0.3;
const MARGIN = HEX * 1.4;
const GREY = '#8d8a85';
const FIG = 1.3; // Figurengröße relativ zum Feld
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
    this.unitPos = new Map(); // id -> {x, y, s, a}
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
    if (bx1 - bx0 <= vw) this.cam.x = (bx0 + bx1) / 2;
    else this.cam.x = Math.min(bx1 - vw / 2 + m, Math.max(bx0 + vw / 2 - m, this.cam.x));
    if (by1 - by0 <= vh) this.cam.y = (by0 + by1) / 2 - off;
    else this.cam.y = Math.min(by1 - vh / 2 + m, Math.max(by0 + vh / 2 - m, this.cam.y + off)) - off;
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

  lunge(id, fromIdx, toIdx, ms, ranged, holdEnd = false) {
    if (ms <= 0) return 0;
    const a = this.center(fromIdx), b = this.center(toIdx);
    const amt = ranged ? 0.12 : 0.4;
    this.addAnim(ms, (p) => {
      if (p >= 1) { if (holdEnd) this.unitPos.set(id, { ...a }); else this.unitPos.delete(id); return; }
      const e = Math.sin(p * Math.PI) * amt;
      this.unitPos.set(id, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
    });
    if (ranged) {
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
  ghost(unit, ms, fadeFrom = 0, lungeTo = null) {
    if (ms <= 0) return;
    const c0 = this.center(unit.idx);
    const t = lungeTo != null ? this.center(lungeTo) : null;
    this.addAnim(ms, null, (ctx, p) => {
      let x = c0.x, y = c0.y;
      if (t && p < fadeFrom) {
        const e = Math.sin((p / fadeFrom) * Math.PI) * 0.4;
        x += (t.x - c0.x) * e;
        y += (t.y - c0.y) * e;
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
        if (city) drawCity(ctx, city, c.x, c.y, HEX, colorOf(city.owner));
        else if (T[i] === 'forest') drawForest(ctx, c.x, c.y, HEX, i);
        else if (T[i] === 'hill') drawHill(ctx, c.x, c.y, HEX, i);
        else if (T[i] === 'mountain') drawMountain(ctx, c.x, c.y, HEX, i);
      }
    }
  }

  // Figuren werden einmal pro Typ/Farbe/Zoomstufe in einen Puffer gezeichnet
  sprite(type, owner, exhausted, level) {
    const k = Math.max(0.5, Math.round(this.cam.z * this.dpr * 4) / 4) * (HEX / 40) * FIG;
    if (this.spriteScale !== k) {
      this.sprites = new Map();
      this.spriteScale = k;
    }
    const key = type + owner + (exhausted ? 'x' : '') + (level || '');
    let sp = this.sprites.get(key);
    if (sp) return sp;
    const base = PLAYER_COLORS[owner] || NEUTRAL_COLOR;
    const col = exhausted
      ? { main: mix(base.main, GREY, 0.55), dark: mix(base.dark, '#4a4844', 0.55), light: mix(base.light, '#c9c6c0', 0.55) }
      : base;
    const B = FIG_BOX;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((B.left + B.right) * k);
    cv.height = Math.ceil((B.top + B.bottom) * k);
    const ctx = cv.getContext('2d');
    ctx.setTransform(k, 0, 0, k, B.left * k, B.top * k);
    drawFigure(ctx, type, col, level);
    if (exhausted) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(70,70,70,0.35)';
      ctx.fillRect(-B.left, -B.top, B.left + B.right, B.top + B.bottom);
    }
    sp = { cv, k };
    this.sprites.set(key, sp);
    return sp;
  }

  drawUnit(ctx, u, x, y, scale = 1, exhausted = false, flash = 0, ready = false, now = 0) {
    const s = (HEX / 40) * FIG;
    y += 4;
    if (ready) {
      const p = 0.5 + 0.5 * Math.sin(now / 260);
      ctx.strokeStyle = `rgba(255,236,120,${0.55 + p * 0.45})`;
      ctx.lineWidth = 3 + p * 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y + 7 * s, 19 * s, 7.5 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (flash > 0) {
      const g = ctx.createRadialGradient(x, y - 10 * s, 2, x, y - 10 * s, 26 * s);
      g.addColorStop(0, `rgba(255,70,50,${flash * 0.8})`);
      g.addColorStop(1, 'rgba(255,70,50,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 30 * s, y - 40 * s, 60 * s, 60 * s);
    }
    const sp = this.sprite(u.type, u.owner, exhausted, u.level);
    const B = FIG_BOX;
    const w = (B.left + B.right) * s * scale, h = (B.top + B.bottom) * s * scale;
    ctx.drawImage(sp.cv, x - B.left * s * scale, y - B.top * s * scale + (1 - scale) * 6 * s, w, h);
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
    // Fähigkeit wählbar / Wache
    if (u.pick || u.sentry) {
      const px = x + 14 * s * scale, py = y - 40 * s * scale;
      ctx.font = `800 ${12 * s}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (u.pick) {
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(px, py, 6.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,40,0,0.9)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#3b2a00';
        ctx.fillText('!', px, py + 0.5 * s);
      } else {
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText('z', px, py);
        ctx.fillStyle = '#e0f2fe';
        ctx.fillText('z', px, py);
      }
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
  drawPreview(ctx, type, owner, cx, cy, size, level) {
    const k = size / 60;
    ctx.save();
    ctx.translate(cx, cy + size * 0.22);
    ctx.scale(k, k);
    drawFigure(ctx, type, PLAYER_COLORS[owner] || NEUTRAL_COLOR, level);
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
    const pulsing = this.overlay.targets?.size || this.overlay.ready?.size || this.state?.units.some((u) => u.shaken);
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
    ctx.setTransform(z, 0, 0, z, this.dpr * (this.w / 2 - this.cam.x * this.cam.z), this.dpr * (this.h / 2 - this.cam.y * this.cam.z));
    ctx.imageSmoothingEnabled = true;
    const vr = this.visibleRange(40);
    for (let cy = Math.floor(vr.y0 / CHUNK); cy <= Math.floor(vr.y1 / CHUNK); cy++) {
      for (let cx = Math.floor(vr.x0 / CHUNK); cx <= Math.floor(vr.x1 / CHUNK); cx++) {
        if (cx < -2 || cy < -2 || cx * CHUNK > this.board().w + MARGIN || cy * CHUNK > this.board().h + MARGIN) continue;
        const ch = this.getChunk(cx, cy);
        ctx.drawImage(ch.cv, cx * CHUNK, cy * CHUNK, ch.cv.width / ch.scale, ch.cv.height / ch.scale);
      }
    }
    // Kartennebel
    const fog = this.overlay.fog;
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

    // Einheiten (von oben nach unten, damit vordere Figuren davor stehen)
    const s = this.state;
    this.drawWallLinks(ctx, fog);
    const sorted = s.units.slice().sort((a, b) => a.idx - b.idx);
    for (const u of sorted) {
      if (this.hidden.has(u.id)) continue;
      if (fog && !fog.vis[u.idx] && !this.unitPos.has(u.id)) continue;
      const pos = this.unitPos.get(u.id);
      const c = pos || this.center(u.idx);
      if (c.x < vr.x0 - HEX || c.x > vr.x1 + HEX || c.y < vr.y0 - HEX * 2 || c.y > vr.y1 + HEX * 2) continue;
      const exhausted = !!o.exhausted?.has(u.id);
      const ready = !pos && !!o.ready?.has(u.id) && u.idx !== o.selected && !o.selectedSet?.has(u.idx);
      this.drawUnit(ctx, u, c.x, c.y, pos?.s ?? 1, exhausted, pos?.flash || 0, ready, now);
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
    const sub = !t.kill && t.counter > 0 ? ` ↩${t.counter}` : '';
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
