// Canvas-Renderer: Gelände wird einmal in eine Offscreen-Leinwand gezeichnet,
// pro Frame kommen nur Markierungen, Einheiten und Effekte dazu.
import { hexCenter, pixelToIndex, boardSize, SQRT3, getGeo } from './hex.js';
import { PLAYER_COLORS, NEUTRAL_COLOR, UNITS } from './data.js';

export const HEX = 40;
const DEPTH = HEX * 0.2;
const MARGIN = HEX * 0.6;

function hash(i) {
  let x = (i + 1) * 374761393;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function hexPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k - 30);
    const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

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

  setState(state, fit = true) {
    const sizeChanged = !this.state || this.state.cols !== state.cols || this.state.rows !== state.rows;
    this.state = state;
    this.cacheDirty = true;
    this.dirty = true;
    this.unitPos.clear();
    this.hidden.clear();
    if (fit || sizeChanged) this.fit();
  }

  invalidate(map = false) {
    if (map) this.cacheDirty = true;
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

  fit() {
    if (!this.state) return;
    this.cam.z = this.fitZoom();
    this.minZ = this.cam.z * 0.9;
    this.maxZ = Math.max(this.cam.z * 3, 1.6);
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
    const s = this.state, geo = getGeo(s.cols, s.rows);
    const own = new Int8Array(geo.n).fill(-2);
    const lvl = new Int8Array(geo.n).fill(-1);
    for (const c of s.cities) {
      for (const j of geo.within(c.idx, 1)) {
        const w = j === c.idx ? 10 : c.level;
        if (w > lvl[j]) { lvl[j] = w; own[j] = c.owner; }
      }
    }
    return own;
  }

  buildCache() {
    const s = this.state;
    const b = this.board();
    let scale = Math.min(3, this.cam.z * this.dpr * 1.25);
    const W = b.w + MARGIN * 2, H = b.h + MARGIN * 2 + DEPTH;
    const maxArea = 7e6;
    if (W * H * scale * scale > maxArea) scale = Math.sqrt(maxArea / (W * H));
    const cv = this.cache?.canvas || document.createElement('canvas');
    cv.width = Math.ceil(W * scale);
    cv.height = Math.ceil(H * scale);
    const ctx = cv.getContext('2d');
    const ox = (HEX * SQRT3) / 2 + MARGIN, oy = HEX + MARGIN;
    ctx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);
    ctx.clearRect(-ox, -oy, W, H);
    this.drawTerrain(ctx);
    this.cache = { canvas: cv, scale, ox, oy, W, H };
    this.cacheDirty = false;
  }

  drawTerrain(ctx) {
    const s = this.state, geo = getGeo(s.cols, s.rows);
    const T = s.terrain;
    // Wasser
    for (let i = 0; i < geo.n; i++) {
      if (T[i] !== 'water') continue;
      const c = this.center(i);
      const v = hash(i) * 6;
      ctx.fillStyle = `hsl(207, 52%, ${38 + v}%)`;
      hexPath(ctx, c.x, c.y, HEX + 0.6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      const wx = c.x + (hash(i + 7) - 0.5) * HEX * 0.6, wy = c.y + (hash(i + 3) - 0.5) * HEX * 0.6;
      ctx.beginPath();
      ctx.moveTo(wx - HEX * 0.2, wy);
      ctx.quadraticCurveTo(wx - HEX * 0.1, wy - HEX * 0.08, wx, wy);
      ctx.quadraticCurveTo(wx + HEX * 0.1, wy + HEX * 0.08, wx + HEX * 0.2, wy);
      ctx.stroke();
    }
    const own = this.territory();
    // Land, Zeile für Zeile (für die 2,5D-Seitenflächen)
    for (let i = 0; i < geo.n; i++) {
      const t = T[i];
      if (t === 'water') continue;
      const c = this.center(i);
      const v = (hash(i) - 0.5) * 6;
      const base = {
        plain: [95, 46, 54 + v],
        forest: [105, 38, 44 + v],
        hill: [68, 36, 55 + v],
        mountain: [30, 9, 52 + v],
      }[t];
      ctx.fillStyle = `hsl(${base[0]}, ${base[1]}%, ${base[2] - 22}%)`;
      hexPath(ctx, c.x, c.y + DEPTH, HEX);
      ctx.fill();
      ctx.fillStyle = `hsl(${base[0]}, ${base[1]}%, ${base[2]}%)`;
      hexPath(ctx, c.x, c.y, HEX);
      ctx.fill();
      if (own[i] >= 0) {
        ctx.fillStyle = PLAYER_COLORS[own[i]].main;
        ctx.globalAlpha = 0.2;
        hexPath(ctx, c.x, c.y, HEX);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.14)';
      ctx.lineWidth = 1;
      hexPath(ctx, c.x, c.y, HEX);
      ctx.stroke();
      this.drawDecoration(ctx, t, c.x, c.y, i);
    }
    // Reichsgrenzen
    ctx.lineCap = 'round';
    for (let i = 0; i < geo.n; i++) {
      const o = own[i];
      if (o < 0) continue;
      const c = this.center(i);
      for (let k = 0; k < 6; k++) {
        const ang = (Math.PI / 3) * k;
        const nx = c.x + Math.cos(ang) * HEX * SQRT3, ny = c.y + Math.sin(ang) * HEX * SQRT3;
        const j = pixelToIndex(nx, ny, HEX, s.cols, s.rows);
        if (j >= 0 && own[j] === o) continue;
        const a1 = (Math.PI / 180) * (60 * k - 30), a2 = (Math.PI / 180) * (60 * k + 30);
        const r = HEX - 2.5;
        ctx.strokeStyle = PLAYER_COLORS[o].main;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(c.x + r * Math.cos(a1), c.y + r * Math.sin(a1));
        ctx.lineTo(c.x + r * Math.cos(a2), c.y + r * Math.sin(a2));
        ctx.stroke();
      }
    }
    for (const city of s.cities) {
      const c = this.center(city.idx);
      this.drawCity(ctx, city, c.x, c.y);
    }
  }

  drawDecoration(ctx, t, x, y, i) {
    if (t === 'forest') {
      const spots = [[-0.32, 0.12], [0.3, 0.16], [0, -0.22], [0.02, 0.42]];
      for (let k = 0; k < spots.length; k++) {
        const [dx, dy] = spots[k];
        const sc = 0.85 + hash(i * 7 + k) * 0.3;
        this.drawTree(ctx, x + dx * HEX, y + dy * HEX, HEX * 0.24 * sc);
      }
    } else if (t === 'hill') {
      for (const [dx, dy, r] of [[-0.25, 0.12, 0.34], [0.22, -0.06, 0.4]]) {
        const cx = x + dx * HEX, cy = y + dy * HEX, rr = r * HEX;
        ctx.fillStyle = 'hsl(64, 32%, 44%)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + rr * 0.25, rr, rr * 0.75, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'hsla(60, 50%, 75%, 0.45)';
        ctx.beginPath();
        ctx.ellipse(cx - rr * 0.25, cy, rr * 0.5, rr * 0.38, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
      }
    } else if (t === 'mountain') {
      const peak = (px, py, w, h) => {
        ctx.fillStyle = '#7b7f87';
        ctx.beginPath();
        ctx.moveTo(px - w, py);
        ctx.lineTo(px, py - h);
        ctx.lineTo(px + w, py);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#5a5e66';
        ctx.beginPath();
        ctx.moveTo(px, py - h);
        ctx.lineTo(px + w, py);
        ctx.lineTo(px + w * 0.15, py);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f1f5f9';
        ctx.beginPath();
        ctx.moveTo(px - w * 0.36, py - h * 0.64);
        ctx.lineTo(px, py - h);
        ctx.lineTo(px + w * 0.36, py - h * 0.64);
        ctx.lineTo(px + w * 0.1, py - h * 0.72);
        ctx.lineTo(px - w * 0.08, py - h * 0.6);
        ctx.closePath();
        ctx.fill();
      };
      peak(x + HEX * 0.28, y + HEX * 0.38, HEX * 0.38, HEX * 0.6);
      peak(x - HEX * 0.08, y + HEX * 0.42, HEX * 0.55, HEX * 0.95);
    } else if (t === 'plain') {
      if (hash(i * 3) > 0.55) {
        ctx.strokeStyle = 'hsla(100, 45%, 35%, 0.5)';
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) {
          const gx = x + (hash(i * 5 + k) - 0.5) * HEX * 1.1, gy = y + (hash(i * 11 + k) - 0.5) * HEX * 1.0;
          ctx.beginPath();
          ctx.moveTo(gx - 3, gy - 4);
          ctx.lineTo(gx, gy + 2);
          ctx.lineTo(gx + 3, gy - 4);
          ctx.stroke();
        }
      }
    }
  }

  drawTree(ctx, x, y, s) {
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(x - s * 0.12, y - s * 0.1, s * 0.24, s * 0.45);
    ctx.fillStyle = 'hsl(135, 42%, 26%)';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.7, y);
    ctx.lineTo(x, y - s * 1.5);
    ctx.lineTo(x + s * 0.7, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'hsl(130, 40%, 36%)';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.7, y);
    ctx.lineTo(x, y - s * 1.5);
    ctx.lineTo(x - s * 0.05, y);
    ctx.closePath();
    ctx.fill();
  }

  drawCity(ctx, city, x, y) {
    const col = colorOf(city.owner);
    ctx.fillStyle = 'rgba(245, 230, 200, 0.85)';
    ctx.beginPath();
    ctx.ellipse(x, y + HEX * 0.12, HEX * 0.72, HEX * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 90, 50, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const house = (hx, hy, s) => {
      ctx.fillStyle = '#fbf3e4';
      ctx.strokeStyle = 'rgba(60,40,20,0.6)';
      ctx.lineWidth = 1.2;
      ctx.fillRect(hx - s * 0.5, hy - s * 0.4, s, s * 0.7);
      ctx.strokeRect(hx - s * 0.5, hy - s * 0.4, s, s * 0.7);
      ctx.fillStyle = col.main;
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.65, hy - s * 0.38);
      ctx.lineTo(hx, hy - s * 0.95);
      ctx.lineTo(hx + s * 0.65, hy - s * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(60,40,20,0.7)';
      ctx.fillRect(hx - s * 0.1, hy - s * 0.05, s * 0.2, s * 0.35);
    };
    const S = HEX * 0.34;
    if (city.capital) {
      // Burg
      const w = HEX * 0.62, h = HEX * 0.5, bx = x, by = y + HEX * 0.25;
      ctx.fillStyle = '#e7dccb';
      ctx.strokeStyle = 'rgba(60,40,20,0.7)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.rect(bx - w / 2, by - h, w, h);
      ctx.fill();
      ctx.stroke();
      const m = 5, mw = w / (m * 2 - 1);
      for (let k = 0; k < m; k++) {
        ctx.fillRect(bx - w / 2 + k * 2 * mw, by - h - mw, mw, mw);
        ctx.strokeRect(bx - w / 2 + k * 2 * mw, by - h - mw, mw, mw);
      }
      ctx.fillStyle = 'rgba(60,40,20,0.75)';
      ctx.beginPath();
      ctx.arc(bx, by - h * 0.25, w * 0.14, Math.PI, 0);
      ctx.lineTo(bx + w * 0.14, by);
      ctx.lineTo(bx - w * 0.14, by);
      ctx.fill();
      // Fahne
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(bx, by - h - mw);
      ctx.lineTo(bx, by - h - HEX * 0.55);
      ctx.stroke();
      ctx.fillStyle = col.main;
      ctx.beginPath();
      ctx.moveTo(bx, by - h - HEX * 0.55);
      ctx.lineTo(bx + HEX * 0.32, by - h - HEX * 0.45);
      ctx.lineTo(bx, by - h - HEX * 0.35);
      ctx.closePath();
      ctx.fill();
      if (city.level >= 2) house(x - HEX * 0.5, y + HEX * 0.38, S * 0.8);
      if (city.level >= 3) house(x + HEX * 0.5, y + HEX * 0.38, S * 0.8);
    } else {
      const spots = {
        1: [[0, 0.2]],
        2: [[-0.22, 0.26], [0.22, 0.14]],
        3: [[-0.28, 0.32], [0.28, 0.28], [0, 0.04]],
      }[city.level];
      spots.sort((a, b) => a[1] - b[1]);
      for (const [dx, dy] of spots) house(x + dx * HEX, y + dy * HEX, S);
    }
    if (city.level > 1) {
      // Stufenanzeige
      for (let k = 0; k < city.level; k++) {
        ctx.fillStyle = '#fde68a';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(x - (city.level - 1) * 4 + k * 8, y + HEX * 0.6, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  drawUnit(ctx, u, x, y, scale = 1, exhausted = false, flash = 0) {
    const col = PLAYER_COLORS[u.owner] || NEUTRAL_COLOR;
    const R = HEX * 0.42 * scale;
    const cy = y - HEX * 0.12;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + HEX * 0.3, R * 0.9, R * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    if (exhausted) ctx.globalAlpha *= 0.62;
    const g = ctx.createLinearGradient(x, cy - R, x, cy + R);
    g.addColorStop(0, col.light);
    g.addColorStop(0.35, col.main);
    g.addColorStop(1, col.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.2 * scale;
    ctx.strokeStyle = exhausted ? '#52525b' : '#fff';
    ctx.stroke();
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,60,60,${flash * 0.7})`;
      ctx.beginPath();
      ctx.arc(x, cy, R, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawIcon(ctx, u.type, x, cy, R * 0.58, col);
    ctx.restore();
    // Lebensbalken
    const max = UNITS[u.type].hp;
    const ratio = Math.max(0, u.hp / max);
    const bw = HEX * 0.72 * scale, bh = 5 * scale, by = cy + R + 3;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - bw / 2 - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = ratio > 0.6 ? '#4ade80' : ratio > 0.3 ? '#facc15' : '#f87171';
    ctx.fillRect(x - bw / 2, by, bw * ratio, bh);
    if (u.hp < max) {
      ctx.font = `700 ${HEX * 0.26}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(u.hp, x + R * 0.85, cy - R * 0.8);
      ctx.fillStyle = '#fff';
      ctx.fillText(u.hp, x + R * 0.85, cy - R * 0.8);
    }
  }

  drawIcon(ctx, type, x, y, s, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (type) {
      case 'warrior':
        ctx.lineWidth = s * 0.26;
        ctx.beginPath();
        ctx.moveTo(-0.45 * s, 0.45 * s);
        ctx.lineTo(0.8 * s, -0.8 * s);
        ctx.stroke();
        ctx.lineWidth = s * 0.22;
        ctx.beginPath();
        ctx.moveTo(-0.72 * s, 0.02 * s);
        ctx.lineTo(-0.02 * s, 0.72 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-0.72 * s, 0.72 * s, s * 0.17, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'archer':
        ctx.lineWidth = s * 0.2;
        ctx.beginPath();
        ctx.arc(-0.55 * s, 0, s * 1.05, -1.05, 1.05);
        ctx.stroke();
        ctx.lineWidth = s * 0.08;
        ctx.beginPath();
        ctx.moveTo(-0.03 * s, -0.91 * s);
        ctx.lineTo(-0.03 * s, 0.91 * s);
        ctx.stroke();
        ctx.lineWidth = s * 0.14;
        ctx.beginPath();
        ctx.moveTo(-0.6 * s, 0);
        ctx.lineTo(0.75 * s, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0.95 * s, 0);
        ctx.lineTo(0.6 * s, -0.24 * s);
        ctx.lineTo(0.6 * s, 0.24 * s);
        ctx.closePath();
        ctx.fill();
        break;
      case 'rider':
        ctx.lineWidth = s * 0.34;
        ctx.beginPath();
        ctx.arc(0, -0.05 * s, s * 0.62, Math.PI * 0.78, Math.PI * 2.22);
        ctx.stroke();
        ctx.fillStyle = col.dark;
        for (const a of [0.95, 1.25, 1.5, 1.75, 2.05]) {
          ctx.beginPath();
          ctx.arc(Math.cos(a * Math.PI) * s * 0.62, -0.05 * s + Math.sin(a * Math.PI) * s * 0.62, s * 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'defender':
        ctx.beginPath();
        ctx.moveTo(0, -0.95 * s);
        ctx.quadraticCurveTo(0.45 * s, -0.7 * s, 0.85 * s, -0.72 * s);
        ctx.quadraticCurveTo(0.85 * s, 0.45 * s, 0, 0.98 * s);
        ctx.quadraticCurveTo(-0.85 * s, 0.45 * s, -0.85 * s, -0.72 * s);
        ctx.quadraticCurveTo(-0.45 * s, -0.7 * s, 0, -0.95 * s);
        ctx.fill();
        ctx.fillStyle = col.main;
        ctx.fillRect(-0.12 * s, -0.6 * s, 0.24 * s, 1.25 * s);
        ctx.fillRect(-0.55 * s, -0.22 * s, 1.1 * s, 0.24 * s);
        break;
      case 'knight':
        ctx.beginPath();
        ctx.arc(0, -0.05 * s, s * 0.72, Math.PI, 0);
        ctx.lineTo(0.72 * s, 0.75 * s);
        ctx.lineTo(-0.72 * s, 0.75 * s);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = col.dark;
        ctx.fillRect(-0.5 * s, -0.02 * s, 1.0 * s, 0.16 * s);
        ctx.fillRect(-0.06 * s, 0.14 * s, 0.12 * s, 0.45 * s);
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.ellipse(0, -0.85 * s, 0.18 * s, 0.32 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'catapult':
        ctx.lineWidth = s * 0.18;
        ctx.beginPath();
        ctx.moveTo(-0.85 * s, 0.5 * s);
        ctx.lineTo(0.85 * s, 0.5 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-0.45 * s, 0.45 * s);
        ctx.lineTo(0.45 * s, -0.55 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0.55 * s, -0.68 * s, s * 0.26, 0, Math.PI * 2);
        ctx.fill();
        for (const wx of [-0.5, 0.5]) {
          ctx.beginPath();
          ctx.arc(wx * s, 0.72 * s, s * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
    }
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
    if (this.overlay.targets?.size || this.overlay.pulse) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.draw(now);
    this.anims = this.anims.filter((a) => a.p < 1);
  }

  draw(now) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#173a5c');
    g.addColorStop(1, '#0d2238');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    if (!this.state) return;
    if (this.cache && !this.gesturing) {
      const want = Math.min(3, this.cam.z * this.dpr * 1.25);
      const r = want / this.cache.scale;
      if ((r > 1.4 && this.cache.scale < 2.9) || r < 0.6) this.cacheDirty = true;
    }
    if (this.cacheDirty || !this.cache) this.buildCache();
    const z = this.cam.z * this.dpr;
    ctx.setTransform(z, 0, 0, z, this.dpr * (this.w / 2 - this.cam.x * this.cam.z), this.dpr * (this.h / 2 - this.cam.y * this.cam.z));
    const cc = this.cache;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cc.canvas, -cc.ox, -cc.oy, cc.canvas.width / cc.scale, cc.canvas.height / cc.scale);

    const o = this.overlay;
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);
    if (o.cityIdx != null) {
      const c = this.center(o.cityIdx);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 4;
      hexPath(ctx, c.x, c.y, HEX - 3);
      ctx.stroke();
    }
    if (o.moves) {
      for (const i of o.moves) {
        const c = this.center(i);
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        hexPath(ctx, c.x, c.y, HEX - 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(c.x, c.y, HEX * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (o.selected != null) {
      const c = this.center(o.selected);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      hexPath(ctx, c.x, c.y, HEX - 3);
      ctx.stroke();
    }
    if (o.targets) {
      for (const i of o.targets) {
        const c = this.center(i);
        ctx.strokeStyle = `rgba(239,68,68,${0.6 + pulse * 0.4})`;
        ctx.lineWidth = 4 + pulse * 2;
        hexPath(ctx, c.x, c.y, HEX - 4);
        ctx.stroke();
      }
    }

    // Einheiten
    const s = this.state;
    const sorted = s.units.slice().sort((a, b) => a.idx - b.idx);
    for (const u of sorted) {
      if (this.hidden.has(u.id)) continue;
      const pos = this.unitPos.get(u.id);
      const c = pos || this.center(u.idx);
      const exhausted = !!o.exhausted?.has(u.id);
      this.drawUnit(ctx, u, c.x, c.y, pos?.s ?? 1, exhausted, pos?.flash || 0);
    }

    // Kampfvorschau
    if (o.forecast) {
      const f = o.forecast;
      this.bubble(ctx, f.targetIdx, f.kill ? '✖ besiegt' : `−${f.dmg}`, f.kill ? '#16a34a' : '#dc2626');
      if (f.counter > 0) this.bubble(ctx, f.fromIdx, `−${f.counter}`, '#dc2626');
    }

    for (const a of this.anims) if (a.draw && a.p >= 0) a.draw(ctx, a.p);
  }

  bubble(ctx, idx, text, color) {
    const c = this.center(idx);
    const fs = HEX * 0.38;
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 14;
    const x = c.x, y = c.y - HEX * 0.95;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - w / 2, y - fs * 0.75, w, fs * 1.5, 8) : ctx.rect(x - w / 2, y - fs * 0.75, w, fs * 1.5);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }
}
