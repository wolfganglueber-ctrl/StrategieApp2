// Zeichenfunktionen für Gelände, Städte und Spielfiguren ("Miniaturen").
// Alle Figuren sind in Koordinaten für eine Hex-Größe von 40 entworfen und werden skaliert.
import { SQRT3 } from './hex.js';

export function hash(i) {
  let x = (i + 1) * 374761393;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function hexPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k - 30);
    const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function hexCorner(x, y, r, k) {
  const a = (Math.PI / 180) * (60 * k - 30);
  return [x + r * Math.cos(a), y + r * Math.sin(a)];
}

// Farbe aufhellen/abdunkeln (#rrggbb, f in −1..1)
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export function mix(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------------ Gelände

export const TILE = {
  plain: { top: '#86cf52', dark: '#5fa83a', side: '#7a5530' },
  forest: { top: '#4f9a3c', dark: '#357a2a', side: '#6b4a2a' },
  hill: { top: '#c3b061', dark: '#9c8a43', side: '#7d6338' },
  mountain: { top: '#9a9488', dark: '#77716a', side: '#5e574f' },
  water: { top: '#2f86c9', dark: '#1d5f99', side: '#174a78' },
};

export function drawTileTop(ctx, t, x, y, H, seed) {
  const c = TILE[t];
  const g = ctx.createLinearGradient(x - H * 0.6, y - H, x + H * 0.5, y + H);
  g.addColorStop(0, shade(c.top, 0.18));
  g.addColorStop(0.55, c.top);
  g.addColorStop(1, c.dark);
  ctx.fillStyle = g;
  hexPath(ctx, x, y, H);
  ctx.fill();

  // Struktur
  ctx.save();
  hexPath(ctx, x, y, H - 1);
  ctx.clip();
  if (t === 'plain') {
    for (let k = 0; k < 14; k++) {
      const px = x + (hash(seed * 31 + k) - 0.5) * H * 1.7, py = y + (hash(seed * 17 + k * 7) - 0.5) * H * 1.6;
      const dark = hash(seed + k * 13) > 0.45;
      ctx.strokeStyle = dark ? 'rgba(40,100,25,0.55)' : 'rgba(210,255,160,0.55)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(px - 2.5, py - 3.5);
      ctx.lineTo(px, py + 1);
      ctx.lineTo(px + 2.5, py - 3.5);
      ctx.moveTo(px, py + 1);
      ctx.lineTo(px, py - 4.5);
      ctx.stroke();
    }
    for (let k = 0; k < 3; k++) {
      if (hash(seed * 7 + k) < 0.5) continue;
      const px = x + (hash(seed * 3 + k * 5) - 0.5) * H * 1.3, py = y + (hash(seed * 9 + k * 3) - 0.5) * H * 1.2;
      ctx.fillStyle = hash(seed + k) > 0.5 ? '#fff6a8' : '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (t === 'forest') {
    for (let k = 0; k < 18; k++) {
      const px = x + (hash(seed * 29 + k) - 0.5) * H * 1.8, py = y + (hash(seed * 13 + k * 3) - 0.5) * H * 1.7;
      ctx.fillStyle = hash(seed + k * 5) > 0.5 ? 'rgba(20,60,15,0.35)' : 'rgba(150,210,90,0.25)';
      ctx.beginPath();
      ctx.ellipse(px, py, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (t === 'hill') {
    for (let k = 0; k < 10; k++) {
      const px = x + (hash(seed * 23 + k) - 0.5) * H * 1.7, py = y + (hash(seed * 11 + k * 3) - 0.5) * H * 1.6;
      ctx.strokeStyle = 'rgba(110,90,30,0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px - 3, py);
      ctx.quadraticCurveTo(px, py - 3, px + 3, py);
      ctx.stroke();
    }
  } else if (t === 'mountain') {
    for (let k = 0; k < 12; k++) {
      const px = x + (hash(seed * 19 + k) - 0.5) * H * 1.7, py = y + (hash(seed * 7 + k * 3) - 0.5) * H * 1.6;
      ctx.fillStyle = hash(seed + k) > 0.5 ? 'rgba(60,55,50,0.35)' : 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(px, py, 1.5 + hash(seed + k * 3) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (t === 'water') {
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const px = x + (hash(seed * 7 + k) - 0.5) * H * 1.2, py = y + (hash(seed * 3 + k * 5) - 0.5) * H * 1.1;
      ctx.beginPath();
      ctx.moveTo(px - 6, py);
      ctx.quadraticCurveTo(px - 3, py - 2.5, px, py);
      ctx.quadraticCurveTo(px + 3, py + 2.5, px + 6, py);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Fase: oben hell, unten dunkel
  ctx.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    const [ax, ay] = hexCorner(x, y, H - 1.2, k);
    const [bx, by] = hexCorner(x, y, H - 1.2, k + 1);
    const upper = k >= 3; // Kanten oben/links
    ctx.strokeStyle = upper ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  hexPath(ctx, x, y, H);
  ctx.stroke();
}

// Seitenwand eines Feldes (sichtbar nach unten)
export function drawTileSide(ctx, t, x, y, H, D) {
  const c = TILE[t];
  const g = ctx.createLinearGradient(0, y, 0, y + H + D);
  g.addColorStop(0, shade(c.side, 0.1));
  g.addColorStop(1, shade(c.side, -0.35));
  ctx.fillStyle = g;
  ctx.beginPath();
  const p1 = hexCorner(x, y, H, 0), p2 = hexCorner(x, y, H, 1), p3 = hexCorner(x, y, H, 2), p4 = hexCorner(x, y, H, 3);
  ctx.moveTo(p1[0], p1[1]);
  ctx.lineTo(p2[0], p2[1]);
  ctx.lineTo(p3[0], p3[1]);
  ctx.lineTo(p4[0], p4[1]);
  ctx.lineTo(p4[0], p4[1] + D);
  ctx.lineTo(p3[0], p3[1] + D);
  ctx.lineTo(p2[0], p2[1] + D);
  ctx.lineTo(p1[0], p1[1] + D);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function shadowEllipse(ctx, x, y, rx, ry, a = 0.28) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Schlagschatten: Licht von links oben, Schatten fällt nach rechts unten
function castShadow(ctx, x, y, w, h, a = 0.26) {
  const g = ctx.createRadialGradient(x, y, 0, x + h * 0.3, y + h * 0.1, h * 0.6);
  g.addColorStop(0, `rgba(10,15,5,${a})`);
  g.addColorStop(1, 'rgba(10,15,5,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x + h * 0.28, y + h * 0.08, h * 0.5, w, 0.32, 0, Math.PI * 2);
  ctx.fill();
  shadowEllipse(ctx, x + w * 0.2, y + w * 0.1, w * 0.9, w * 0.35, a * 0.9);
}

function conifer(ctx, x, y, s) {
  castShadow(ctx, x, y, 6 * s, 22 * s);
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(x - 1.3 * s, y - 4 * s, 2.6 * s, 5 * s);
  ctx.fillStyle = '#2e1c0d';
  ctx.fillRect(x + 0.2 * s, y - 4 * s, 1.1 * s, 5 * s);
  for (let l = 0; l < 3; l++) {
    const by = y - 3 * s - l * 5.5 * s, w = (8 - l * 2) * s, h = 9 * s;
    ctx.fillStyle = '#1f5e2a';
    ctx.beginPath();
    ctx.moveTo(x - w, by);
    ctx.lineTo(x, by - h);
    ctx.lineTo(x + w, by);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3b8a3c';
    ctx.beginPath();
    ctx.moveTo(x - w, by);
    ctx.lineTo(x, by - h);
    ctx.lineTo(x - w * 0.05, by);
    ctx.closePath();
    ctx.fill();
    // Unterkante jeder Lage wirft Schatten auf die nächste
    ctx.fillStyle = 'rgba(5,30,10,0.45)';
    ctx.beginPath();
    ctx.moveTo(x - w, by);
    ctx.lineTo(x + w, by);
    ctx.lineTo(x + w * 0.7, by + 1.4 * s);
    ctx.lineTo(x - w * 0.7, by + 1.4 * s);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(210,255,170,0.35)';
  ctx.beginPath();
  ctx.moveTo(x - 0.3 * s, y - 19.5 * s);
  ctx.lineTo(x - 2.2 * s, y - 15 * s);
  ctx.lineTo(x - 0.6 * s, y - 15.5 * s);
  ctx.closePath();
  ctx.fill();
}

function leafTree(ctx, x, y, s) {
  castShadow(ctx, x, y, 7 * s, 22 * s);
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(x - 1.5 * s, y - 7 * s, 3 * s, 8 * s);
  ctx.fillStyle = '#2e1c0d';
  ctx.fillRect(x + 0.3 * s, y - 7 * s, 1.2 * s, 8 * s);
  const g = ctx.createRadialGradient(x - 3 * s, y - 15 * s, 1, x, y - 12 * s, 9 * s);
  g.addColorStop(0, '#8fd45e');
  g.addColorStop(0.6, '#3f9a3a');
  g.addColorStop(1, '#22652a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x - 3.5 * s, y - 11 * s, 5.5 * s, 0, Math.PI * 2);
  ctx.arc(x + 3.5 * s, y - 11 * s, 5.5 * s, 0, Math.PI * 2);
  ctx.arc(x, y - 16 * s, 6.5 * s, 0, Math.PI * 2);
  ctx.fill();
  // Blattbüschel: Lichtflecken oben links, Schattentaschen unten rechts
  for (const [dx, dy, r, c] of [[-4, -17, 2.2, 'rgba(200,245,140,0.45)'], [-1, -20, 1.6, 'rgba(200,245,140,0.4)'], [-6, -12, 1.5, 'rgba(200,245,140,0.3)'], [4, -9, 2.6, 'rgba(10,45,15,0.4)'], [6, -13, 1.8, 'rgba(10,45,15,0.35)'], [1, -11, 1.6, 'rgba(10,45,15,0.3)']]) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawForest(ctx, x, y, H, seed) {
  const s = H / 40;
  const spots = [[-15, -6], [6, -12], [16, 2], [-6, 6], [-20, 10], [10, 16], [-2, -18]];
  const trees = spots.map(([dx, dy], k) => ({ x: x + dx * s + (hash(seed * 5 + k) - 0.5) * 4 * s, y: y + dy * s + 8 * s, k }));
  trees.sort((a, b) => a.y - b.y);
  for (const t of trees) {
    const sc = s * (0.85 + hash(seed * 11 + t.k) * 0.3);
    if (hash(seed * 3 + t.k) > 0.45) conifer(ctx, t.x, t.y, sc);
    else leafTree(ctx, t.x, t.y, sc);
  }
}

export function drawHill(ctx, x, y, H, seed) {
  const s = H / 40;
  const mounds = [[-11, 6, 15, 11], [10, -2, 17, 13], [2, 15, 11, 7]];
  for (const [dx, dy, rx, ry] of mounds) {
    const cx = x + dx * s, cy = y + dy * s;
    shadowEllipse(ctx, cx + 3 * s, cy + 1 * s, rx * s, ry * 0.3 * s, 0.22);
    const g = ctx.createRadialGradient(cx - rx * 0.4 * s, cy - ry * 0.8 * s, 1, cx, cy - ry * 0.3 * s, rx * 1.1 * s);
    g.addColorStop(0, '#e8d98b');
    g.addColorStop(0.55, '#b49d4c');
    g.addColorStop(1, '#7e6a2c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * s, ry * s, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    // Schattenflanke rechts und Grasbüschel
    ctx.fillStyle = 'rgba(60,40,10,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * s, ry * s, 0, -Math.PI * 0.42, 0);
    ctx.lineTo(cx + rx * 0.25 * s, cy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(95,110,40,0.7)';
    ctx.lineWidth = 0.9 * s;
    for (let k = 0; k < 4; k++) {
      const gx = cx + (hash(seed * 13 + dx + k) - 0.5) * rx * 1.3 * s, gy = cy - hash(seed * 17 + dy + k) * ry * 0.6 * s;
      ctx.beginPath();
      ctx.moveTo(gx - 1.2 * s, gy - 1.6 * s);
      ctx.lineTo(gx, gy);
      ctx.lineTo(gx + 0.2 * s, gy - 2.2 * s);
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + 1.4 * s, gy - 1.5 * s);
      ctx.stroke();
    }
  }
  // Erzbrocken
  for (let k = 0; k < 3; k++) {
    const px = x + (hash(seed * 7 + k) - 0.5) * 30 * s, py = y + 18 * s - hash(seed + k) * 8 * s;
    ctx.fillStyle = '#6f6a63';
    ctx.beginPath();
    ctx.moveTo(px - 3 * s, py);
    ctx.lineTo(px - 1 * s, py - 3 * s);
    ctx.lineTo(px + 2.5 * s, py - 2.5 * s);
    ctx.lineTo(px + 3 * s, py);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9fd3ff';
    ctx.fillRect(px - 0.5 * s, py - 2 * s, 1.4 * s, 1.4 * s);
  }
}

export function drawMountain(ctx, x, y, H, seed) {
  const s = H / 40;
  const peak = (px, py, w, h) => {
    // Langer Schlagschatten nach rechts unten
    ctx.fillStyle = 'rgba(15,12,25,0.22)';
    ctx.beginPath();
    ctx.moveTo(px - w * 0.3, py);
    ctx.lineTo(px + w * 1.5, py + w * 0.2);
    ctx.lineTo(px + w * 0.9, py + w * 0.42);
    ctx.lineTo(px - w * 0.5, py + w * 0.25);
    ctx.closePath();
    ctx.fill();
    shadowEllipse(ctx, px + w * 0.25, py, w * 1.05, w * 0.28, 0.3);
    // Licht- und Schattenseite
    ctx.fillStyle = '#a8a297';
    ctx.beginPath();
    ctx.moveTo(px - w, py);
    ctx.lineTo(px - w * 0.08, py - h);
    ctx.lineTo(px + w * 0.1, py);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6a645c';
    ctx.beginPath();
    ctx.moveTo(px - w * 0.08, py - h);
    ctx.lineTo(px + w, py);
    ctx.lineTo(px + w * 0.1, py);
    ctx.closePath();
    ctx.fill();
    // Gesteinsschichten und Felskanten
    ctx.strokeStyle = 'rgba(40,36,32,0.35)';
    ctx.lineWidth = 0.8;
    for (let k = 1; k <= 3; k++) {
      const f = 0.25 + k * 0.17;
      ctx.beginPath();
      ctx.moveTo(px - w * (1 - f) * 0.92, py - h * f);
      ctx.lineTo(px - w * (1 - f) * 0.4, py - h * f + 1.5 * s);
      ctx.lineTo(px - w * 0.05, py - h * f - 0.5 * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px + w * 0.1, py - h * f + 1 * s);
      ctx.lineTo(px + w * (1 - f) * 0.85, py - h * f + 2.5 * s);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,250,235,0.18)';
    ctx.beginPath();
    ctx.moveTo(px - w * 0.08, py - h);
    ctx.lineTo(px - w * 0.6, py - h * 0.35);
    ctx.lineTo(px - w * 0.45, py - h * 0.33);
    ctx.closePath();
    ctx.fill();
    // Geröll am Fuß
    for (let k = 0; k < 3; k++) {
      const bx = px + (hash(seed * 19 + k + w) - 0.5) * w * 1.4, by = py - 0.5 * s;
      ctx.fillStyle = '#7d776d';
      ctx.beginPath();
      ctx.ellipse(bx, by, 2.4 * s, 1.5 * s, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#4f4a43';
      ctx.beginPath();
      ctx.ellipse(bx + 0.8 * s, by, 1.4 * s, 1.1 * s, 0, Math.PI * 1.5, 0);
      ctx.lineTo(bx + 0.8 * s, by);
      ctx.fill();
    }
    // Grat
    ctx.strokeStyle = 'rgba(40,36,32,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px - w * 0.08, py - h);
    ctx.lineTo(px + w * 0.05, py - h * 0.55);
    ctx.lineTo(px - w * 0.1, py - h * 0.25);
    ctx.stroke();
    // Schnee
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(px - w * 0.08, py - h);
    ctx.lineTo(px - w * 0.42, py - h * 0.6);
    ctx.lineTo(px - w * 0.2, py - h * 0.66);
    ctx.lineTo(px - w * 0.05, py - h * 0.56);
    ctx.lineTo(px + w * 0.12, py - h * 0.68);
    ctx.lineTo(px + w * 0.38, py - h * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d6e2ee';
    ctx.beginPath();
    ctx.moveTo(px - w * 0.08, py - h);
    ctx.lineTo(px + w * 0.38, py - h * 0.6);
    ctx.lineTo(px + w * 0.12, py - h * 0.68);
    ctx.closePath();
    ctx.fill();
  };
  const v = hash(seed) * 6;
  peak(x + 14 * s, y + 14 * s, 14 * s, (24 + v) * s);
  peak(x - 6 * s, y + 18 * s, 22 * s, (44 + v) * s);
}

export function drawShore(ctx, x, y, H, edgeK) {
  const [ax, ay] = hexCorner(x, y, H - 2, edgeK);
  const [bx, by] = hexCorner(x, y, H - 2, edgeK + 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

// ------------------------------------------------------------------ Städte

function house(ctx, x, y, w, h, roof, s) {
  const d = w * 0.45;
  const rh = h * 0.75;
  shadowEllipse(ctx, x + d * 0.6, y + 1.5 * s, w * 0.85, 3 * s, 0.3);
  // Seitenwand
  ctx.fillStyle = '#c9b48c';
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2 + d, y - d * 0.55);
  ctx.lineTo(x + w / 2 + d, y - h - d * 0.55);
  ctx.lineTo(x + w / 2, y - h);
  ctx.closePath();
  ctx.fill();
  // Front
  ctx.fillStyle = '#f6ead2';
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.strokeStyle = 'rgba(60,40,20,0.55)';
  ctx.lineWidth = 0.8 * s;
  ctx.strokeRect(x - w / 2, y - h, w, h);
  // Tür + Fenster
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(x - w * 0.12, y - h * 0.55, w * 0.24, h * 0.55);
  ctx.fillStyle = '#ffd96a';
  ctx.fillRect(x + w / 2 + d * 0.3, y - h * 0.75 - d * 0.2, d * 0.35, h * 0.3);
  // Dach
  ctx.fillStyle = shade(roof, -0.25);
  ctx.beginPath();
  ctx.moveTo(x, y - h - rh);
  ctx.lineTo(x + w / 2 + 1 * s, y - h);
  ctx.lineTo(x + w / 2 + d + 1 * s, y - h - d * 0.55);
  ctx.lineTo(x + d, y - h - rh - d * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 1 * s, y - h);
  ctx.lineTo(x, y - h - rh);
  ctx.lineTo(x + w / 2 + 1 * s, y - h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,10,0.6)';
  ctx.stroke();
}

function tower(ctx, x, y, r, h, roof, s) {
  const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
  g.addColorStop(0, '#f2eadb');
  g.addColorStop(0.6, '#cfc3ad');
  g.addColorStop(1, '#9d917c');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - h, r * 2, h);
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.35, 0, 0, Math.PI);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,40,20,0.5)';
  ctx.lineWidth = 0.8 * s;
  ctx.strokeRect(x - r, y - h, r * 2, h);
  ctx.fillStyle = '#4a3420';
  ctx.fillRect(x - r * 0.25, y - h * 0.7, r * 0.5, h * 0.22);
  // Kegeldach
  const rg = ctx.createLinearGradient(x - r, 0, x + r, 0);
  rg.addColorStop(0, shade(roof, 0.25));
  rg.addColorStop(1, shade(roof, -0.35));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(x - r - 2 * s, y - h);
  ctx.lineTo(x, y - h - r * 2.2);
  ctx.lineTo(x + r + 2 * s, y - h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Steinverlauf für Mauern und Türme
function stone(ctx, x0, x1, dark = 0) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade('#efe6d3', -dark));
  g.addColorStop(0.55, shade('#cdbfa4', -dark));
  g.addColorStop(1, shade('#9a8d74', -dark));
  return g;
}

// Fahne an einer Stange
function flag(ctx, x, y, len, col, s, big = false) {
  const h = (big ? 10 : 7) * s, w = (big ? 16 : 11) * s;
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = (big ? 1.6 : 1.2) * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - len);
  ctx.stroke();
  ctx.fillStyle = '#e8c35a';
  ctx.beginPath();
  ctx.arc(x, y - len, 1.2 * s, 0, Math.PI * 2);
  ctx.fill();
  const fy = y - len + 1.5 * s;
  ctx.fillStyle = col.main;
  ctx.beginPath();
  ctx.moveTo(x, fy);
  ctx.quadraticCurveTo(x + w * 0.5, fy - 2 * s, x + w, fy + h * 0.3);
  ctx.lineTo(x + w * 0.82, fy + h * 0.5);
  ctx.lineTo(x + w, fy + h * 0.75);
  ctx.quadraticCurveTo(x + w * 0.5, fy + h * 0.55, x, fy + h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = col.dark;
  ctx.lineWidth = 0.7 * s;
  ctx.stroke();
}

// Hängendes Banner mit goldenem Wappen
function banner(ctx, x, y, w, h, col, s) {
  ctx.fillStyle = col.main;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.lineTo(x, y + h - w * 0.45);
  ctx.lineTo(x - w / 2, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = col.dark;
  ctx.lineWidth = 0.6 * s;
  ctx.stroke();
  ctx.fillStyle = '#f2c94c';
  ctx.fillRect(x - w / 2, y, w, 1.2 * s);
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.25);
  ctx.lineTo(x + w * 0.22, y + h * 0.42);
  ctx.lineTo(x, y + h * 0.6);
  ctx.lineTo(x - w * 0.22, y + h * 0.42);
  ctx.closePath();
  ctx.fill();
}

// Zinnen auf einer waagerechten Kante
function merlons(ctx, x0, x1, y, s, n) {
  const w = (x1 - x0) / (n * 2 - 1);
  ctx.fillStyle = '#e9e0cc';
  ctx.strokeStyle = 'rgba(60,45,25,0.6)';
  ctx.lineWidth = 0.6 * s;
  for (let k = 0; k < n; k++) {
    ctx.fillRect(x0 + k * 2 * w, y - 3 * s, w, 3 * s);
    ctx.strokeRect(x0 + k * 2 * w, y - 3 * s, w, 3 * s);
  }
}

// Runder Wehrturm mit Zinnenkranz und Kegeldach in Spielerfarbe
function turret(ctx, x, y, r, h, col, s, roof = true) {
  shadowEllipse(ctx, x + r * 0.5, y + 1 * s, r * 1.3, r * 0.45, 0.3);
  ctx.fillStyle = stone(ctx, x - r, x + r);
  ctx.fillRect(x - r, y - h, r * 2, h);
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.35, 0, 0, Math.PI);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,40,20,0.55)';
  ctx.lineWidth = 0.7 * s;
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x - r, y - h);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + r, y - h);
  ctx.stroke();
  // Steinfugen
  ctx.strokeStyle = 'rgba(90,75,55,0.3)';
  for (let yy = y - 4 * s; yy > y - h + 3 * s; yy -= 4 * s) {
    ctx.beginPath();
    ctx.moveTo(x - r, yy);
    ctx.lineTo(x + r, yy);
    ctx.stroke();
  }
  ctx.fillStyle = '#2b2118';
  ctx.fillRect(x - 0.6 * s, y - h * 0.62, 1.2 * s, 3 * s);
  // Kranz
  const top = y - h;
  ctx.fillStyle = stone(ctx, x - r - 1.2 * s, x + r + 1.2 * s);
  ctx.fillRect(x - r - 1.2 * s, top - 2 * s, (r + 1.2 * s) * 2, 3 * s);
  merlons(ctx, x - r - 1.2 * s, x + r + 1.2 * s, top - 2 * s, s, 3);
  if (roof) {
    const rg = ctx.createLinearGradient(x - r, 0, x + r, 0);
    rg.addColorStop(0, shade(col.main, 0.3));
    rg.addColorStop(1, shade(col.main, -0.35));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(x - r - 0.5 * s, top - 2 * s);
    ctx.lineTo(x, top - 2 * s - r * 2.6);
    ctx.lineTo(x + r + 0.5 * s, top - 2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,20,10,0.6)';
    ctx.stroke();
  }
  return roof ? top - 2 * s - r * 2.6 : top - 5 * s;
}

// Dicke Stadtmauer als Ring mit Wehrgang; erst die hintere Hälfte (vor den Häusern), dann die vordere
function cityWall(ctx, x, y, s, col, half, big) {
  const cx = x, cy = y + 7 * s, rx = 33 * s, ry = 20.5 * s;
  const wh = (big ? 14 : 12) * s, thick = 5 * s;
  const a0 = half === 'back' ? Math.PI : 0, a1 = half === 'back' ? Math.PI * 2 : Math.PI;
  const N = 18;
  const pt = (a, inset = 0) => [cx + Math.cos(a) * (rx - inset), cy + Math.sin(a) * (ry - inset * 0.62)];
  for (let k = 0; k < N; k++) {
    const aa = a0 + ((a1 - a0) * k) / N, ab = a0 + ((a1 - a0) * (k + 1)) / N;
    // Hinten sieht man die Innenseite der Mauer, vorne die Außenseite
    const inset = half === 'back' ? thick : 0;
    const [x0, y0] = pt(aa, inset), [x1, y1] = pt(ab, inset);
    const light = half === 'back' ? -0.3 : -0.02 - 0.3 * Math.max(0, Math.cos(aa + Math.PI / 4));
    ctx.fillStyle = shade('#d6c9ad', light);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1, y1 - wh);
    ctx.lineTo(x0, y0 - wh);
    ctx.closePath();
    ctx.fill();
    // Mauerwerk: Lagen und versetzte Fugen
    ctx.strokeStyle = 'rgba(70,55,35,0.35)';
    ctx.lineWidth = 0.5 * s;
    ctx.stroke();
    for (let r = 1; r < 4; r++) {
      const f = r / 4;
      ctx.beginPath();
      ctx.moveTo(x0, y0 - wh * f);
      ctx.lineTo(x1, y1 - wh * f);
      ctx.stroke();
      const m = (k + r) % 2 ? 0.33 : 0.66;
      const mx = x0 + (x1 - x0) * m, my = y0 + (y1 - y0) * m;
      ctx.beginPath();
      ctx.moveTo(mx, my - wh * f);
      ctx.lineTo(mx, my - wh * (f - 0.25));
      ctx.stroke();
    }
    // Sockel aus dunklerem Stein
    ctx.fillStyle = 'rgba(60,45,30,0.25)';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1, y1 - 2 * s);
    ctx.lineTo(x0, y0 - 2 * s);
    ctx.closePath();
    ctx.fill();
    // Wehrgang: breite, helle Oberseite der Mauer
    const [ox0, oy0] = pt(aa, 0), [ox1, oy1] = pt(ab, 0), [ix0, iy0] = pt(aa, thick), [ix1, iy1] = pt(ab, thick);
    ctx.fillStyle = shade('#efe6d2', half === 'back' ? -0.08 : 0);
    ctx.beginPath();
    ctx.moveTo(ox0, oy0 - wh);
    ctx.lineTo(ox1, oy1 - wh);
    ctx.lineTo(ix1, iy1 - wh);
    ctx.lineTo(ix0, iy0 - wh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,55,35,0.4)';
    ctx.stroke();
    // Zinnen an der Außenkante
    const mx = (ox0 + ox1) / 2, my = (oy0 + oy1) / 2 - wh;
    ctx.fillStyle = shade('#e6dcc6', light * 0.5);
    ctx.fillRect(mx - 1.6 * s, my - 3.5 * s, 3.2 * s, 3.5 * s);
    ctx.strokeStyle = 'rgba(60,45,25,0.6)';
    ctx.lineWidth = 0.5 * s;
    ctx.strokeRect(mx - 1.6 * s, my - 3.5 * s, 3.2 * s, 3.5 * s);
  }
  ctx.strokeStyle = 'rgba(50,38,25,0.7)';
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, a0, a1);
  ctx.stroke();
  const tr = 5.2 * s, th = wh + 8 * s;
  if (half === 'back') {
    for (const a of [Math.PI * 1.22, Math.PI * 1.78]) {
      const [tx, ty] = pt(a);
      turret(ctx, tx, ty, tr, th, col, s, true);
    }
  } else {
    // Seitentürme und Torhaus
    for (const a of [Math.PI * 0.02, Math.PI * 0.98]) {
      const [tx, ty] = pt(a);
      turret(ctx, tx, ty, tr, th, col, s, true);
    }
    const [gx, gy] = pt(Math.PI / 2);
    const gw = 14 * s, gh = wh + 7 * s;
    ctx.fillStyle = stone(ctx, gx - gw / 2, gx + gw / 2);
    ctx.fillRect(gx - gw / 2, gy - gh, gw, gh);
    ctx.strokeStyle = 'rgba(60,40,20,0.6)';
    ctx.lineWidth = 0.7 * s;
    ctx.strokeRect(gx - gw / 2, gy - gh, gw, gh);
    merlons(ctx, gx - gw / 2, gx + gw / 2, gy - gh, s, 4);
    ctx.fillStyle = '#2b2118';
    ctx.beginPath();
    ctx.arc(gx, gy - 5 * s, 3.5 * s, Math.PI, 0);
    ctx.lineTo(gx + 3.5 * s, gy);
    ctx.lineTo(gx - 3.5 * s, gy);
    ctx.fill();
    // Fallgitter
    ctx.strokeStyle = 'rgba(170,150,110,0.75)';
    ctx.lineWidth = 0.6 * s;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(gx + k * 1.4 * s, gy - 8 * s);
      ctx.lineTo(gx + k * 1.4 * s, gy);
      ctx.stroke();
    }
    for (const yy of [-6, -3]) {
      ctx.beginPath();
      ctx.moveTo(gx - 3.4 * s, gy + yy * s);
      ctx.lineTo(gx + 3.4 * s, gy + yy * s);
      ctx.stroke();
    }
    banner(ctx, gx, gy - gh + 1.5 * s, 4.5 * s, 7 * s, col, s);
  }
}

// Kleine Kirche mit Glockenturm
function chapel(ctx, x, y, roof, s) {
  house(ctx, x, y, 10 * s, 7 * s, roof, s);
  const tx = x - 6 * s;
  ctx.fillStyle = stone(ctx, tx - 2.5 * s, tx + 2.5 * s);
  ctx.fillRect(tx - 2.5 * s, y - 15 * s, 5 * s, 15 * s);
  ctx.strokeStyle = 'rgba(60,40,20,0.55)';
  ctx.lineWidth = 0.7 * s;
  ctx.strokeRect(tx - 2.5 * s, y - 15 * s, 5 * s, 15 * s);
  ctx.fillStyle = '#2b2118';
  ctx.fillRect(tx - 1 * s, y - 13 * s, 2 * s, 3 * s);
  ctx.fillStyle = shade(roof, -0.2);
  ctx.beginPath();
  ctx.moveTo(tx - 3 * s, y - 15 * s);
  ctx.lineTo(tx, y - 24 * s);
  ctx.lineTo(tx + 3 * s, y - 15 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#e8c35a';
  ctx.lineWidth = 0.8 * s;
  ctx.beginPath();
  ctx.moveTo(tx, y - 24 * s);
  ctx.lineTo(tx, y - 28 * s);
  ctx.moveTo(tx - 1.5 * s, y - 26.5 * s);
  ctx.lineTo(tx + 1.5 * s, y - 26.5 * s);
  ctx.stroke();
}

// Burg: großer Bergfried mit Ecktürmchen, flankiert von Rundtürmen
function fortress(ctx, x, y, s, col, walled) {
  const roof = col.main;
  // Ohne Stadtmauer flankieren zwei Rundtürme den Bergfried
  if (!walled) {
    turret(ctx, x - 18 * s, y - 1 * s, 4.5 * s, 22 * s, col, s);
    turret(ctx, x + 19 * s, y + 1 * s, 4.5 * s, 20 * s, col, s);
  }
  // Bergfried
  const kw = 20 * s, kh = 30 * s, kx = x + 1 * s, ky = y + 9 * s, dep = 7 * s;
  shadowEllipse(ctx, kx + 6 * s, ky + 1.5 * s, kw * 0.8, 4 * s, 0.35);
  ctx.fillStyle = shade('#b8ab93', -0.05);
  ctx.beginPath();
  ctx.moveTo(kx + kw / 2, ky);
  ctx.lineTo(kx + kw / 2 + dep, ky - dep * 0.55);
  ctx.lineTo(kx + kw / 2 + dep, ky - kh - dep * 0.55);
  ctx.lineTo(kx + kw / 2, ky - kh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = stone(ctx, kx - kw / 2, kx + kw / 2);
  ctx.fillRect(kx - kw / 2, ky - kh, kw, kh);
  ctx.strokeStyle = 'rgba(60,40,20,0.6)';
  ctx.lineWidth = 0.9 * s;
  ctx.strokeRect(kx - kw / 2, ky - kh, kw, kh);
  ctx.strokeStyle = 'rgba(90,75,55,0.28)';
  ctx.lineWidth = 0.6 * s;
  for (let yy = ky - 4 * s; yy > ky - kh; yy -= 4 * s) {
    ctx.beginPath();
    ctx.moveTo(kx - kw / 2, yy);
    ctx.lineTo(kx + kw / 2, yy);
    ctx.stroke();
  }
  // Oberer Rand der Seitenwand + Zinnen
  merlons(ctx, kx - kw / 2, kx + kw / 2, ky - kh, s, 4);
  // Fenster und Tor
  ctx.fillStyle = '#2b2118';
  for (const [wx, wy] of [[-5, -22], [5, -22], [0, -15]]) {
    ctx.beginPath();
    ctx.arc(kx + wx * s, ky + wy * s, 1.4 * s, Math.PI, 0);
    ctx.lineTo(kx + wx * s + 1.4 * s, ky + wy * s + 3 * s);
    ctx.lineTo(kx + wx * s - 1.4 * s, ky + wy * s + 3 * s);
    ctx.fill();
  }
  ctx.fillStyle = '#ffd96a';
  ctx.fillRect(kx - 5.6 * s, ky - 21.5 * s, 1.2 * s, 1.5 * s);
  ctx.fillStyle = '#4a3420';
  ctx.beginPath();
  ctx.arc(kx, ky - 5 * s, 3.5 * s, Math.PI, 0);
  ctx.lineTo(kx + 3.5 * s, ky);
  ctx.lineTo(kx - 3.5 * s, ky);
  ctx.fill();
  banner(ctx, kx - 7 * s, ky - kh + 3 * s, 4 * s, 11 * s, col, s);
  banner(ctx, kx + 7 * s, ky - kh + 3 * s, 4 * s, 11 * s, col, s);
  // Ecktürmchen
  for (const ex of [-kw / 2, kw / 2]) {
    turret(ctx, kx + ex, ky - kh + 6 * s, 2.8 * s, 9 * s, col, s);
  }
  // Große Fahne auf dem Bergfried
  flag(ctx, kx + 2 * s, ky - kh - 3 * s, 18 * s, col, s, true);
  // Häuser vor der Burg
  house(ctx, x - 15 * s, y + 19 * s, 8 * s, 6 * s, roof, s);
  house(ctx, x + 16 * s, y + 20 * s, 8 * s, 6 * s, roof, s);
}

// Kleiner Drache, der auf einem Turm sitzt (Füße bei x, y)
function miniDragon(ctx, x, y, s, col) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const body = '#5a1f1a', dark = '#260c09';
  // Flügel in Spielerfarbe, halb gespreizt
  for (const [wx, sx] of [[-1, -1], [1, 1]]) {
    ctx.fillStyle = sx < 0 ? col.dark : col.main;
    ctx.beginPath();
    ctx.moveTo(wx, -6);
    ctx.lineTo(wx + sx * 7, -15);
    ctx.quadraticCurveTo(wx + sx * 6, -11, wx + sx * 9, -9);
    ctx.quadraticCurveTo(wx + sx * 5, -8, wx + sx * 6, -4);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.5);
  }
  // Schwanz hängt über die Kante
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3, -2);
  ctx.quadraticCurveTo(-7, 1, -6, 6);
  ctx.stroke();
  // Körper und Hals
  ctx.fillStyle = grad(ctx, -4, 5, '#8a3a2c', body);
  ctx.beginPath();
  ctx.ellipse(0, -3, 4, 3, -0.2, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 0.5);
  ctx.beginPath();
  ctx.moveTo(2, -5);
  ctx.quadraticCurveTo(4, -10, 6, -11);
  ctx.lineTo(7.5, -9.5);
  ctx.quadraticCurveTo(5, -8, 4, -3);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.4);
  // Kopf mit Horn, Auge und Glut
  ctx.beginPath();
  ctx.ellipse(7.5, -11, 2.6, 1.6, 0.2, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 0.4);
  ctx.fillStyle = '#e8e0d0';
  ctx.beginPath();
  ctx.moveTo(6.5, -12.2);
  ctx.lineTo(5, -14.5);
  ctx.lineTo(7.4, -12.5);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(7.6, -11.7, 0.9, 0.7);
  ctx.fillStyle = 'rgba(255,140,40,0.85)';
  ctx.beginPath();
  ctx.arc(10.6, -10.4, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Krallen
  ctx.fillStyle = dark;
  ctx.fillRect(-2.5, -0.8, 1.4, 1.2);
  ctx.fillRect(1.5, -0.8, 1.4, 1.2);
  ctx.restore();
}

// Eine Stadt ist eine Burg, wenn sie voll ausgebaut ist (Stufe 5, alle Bauplätze belegt)
export function isFortress(city) {
  return city.level >= 5 && (city.buildings?.length || 0) >= 5;
}

export function drawCity(ctx, city, x, y, H, col) {
  const s = H / 40;
  const big = isFortress(city);
  const walled = !!city.buildings?.includes('wall');
  let perch = null; // Sitzplatz für den kleinen Drachen (Drachenhöhle)
  // Pflaster
  const g = ctx.createRadialGradient(x - 6 * s, y, 2, x, y + 4 * s, 26 * s);
  g.addColorStop(0, '#efe2c4');
  g.addColorStop(1, '#bfa77c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y + 6 * s, (big ? 30 : 27) * s, (big ? 18 : 17) * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,65,35,0.5)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  if (walled) cityWall(ctx, x, y, s, col, 'back', big);
  const roof = col.main;
  if (big) {
    fortress(ctx, x, y, s, col, walled);
    perch = [x - 5 * s, y - 24 * s];
  } else if (city.capital) {
    // Burg: Bergfried mit Türmen
    tower(ctx, x - 15 * s, y + 10 * s, 5.5 * s, 22 * s, roof, s);
    const kw = 22 * s, kh = 24 * s, kx = x - 4 * s, ky = y + 12 * s;
    ctx.fillStyle = '#b8ab93';
    ctx.beginPath();
    ctx.moveTo(kx + kw / 2, ky);
    ctx.lineTo(kx + kw / 2 + 7 * s, ky - 4 * s);
    ctx.lineTo(kx + kw / 2 + 7 * s, ky - kh - 4 * s);
    ctx.lineTo(kx + kw / 2, ky - kh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = stone(ctx, kx - kw / 2, kx + kw / 2);
    ctx.fillRect(kx - kw / 2, ky - kh, kw, kh);
    ctx.strokeStyle = 'rgba(60,40,20,0.6)';
    ctx.lineWidth = 0.9 * s;
    ctx.strokeRect(kx - kw / 2, ky - kh, kw, kh);
    merlons(ctx, kx - kw / 2, kx + kw / 2, ky - kh, s, 4);
    ctx.fillStyle = '#4a3420';
    ctx.beginPath();
    ctx.arc(kx, ky - 6 * s, 4 * s, Math.PI, 0);
    ctx.lineTo(kx + 4 * s, ky);
    ctx.lineTo(kx - 4 * s, ky);
    ctx.fill();
    if (city.level >= 3) banner(ctx, kx - 6 * s, ky - kh + 2 * s, 3.5 * s, 9 * s, col, s);
    if (city.level >= 4) banner(ctx, kx + 6 * s, ky - kh + 2 * s, 3.5 * s, 9 * s, col, s);
    flag(ctx, kx, ky - kh - 3 * s, 19 * s, col, s, city.level >= 4);
    perch = [kx + 6 * s, ky - kh - 3 * s];
    tower(ctx, x + 16 * s, y + 14 * s, 5 * s, 18 * s, roof, s);
    const dy = walled ? -3 * s : 0;
    if (city.level >= 3) house(ctx, x - 20 * s, y + 22 * s + dy, 9 * s, 7 * s, roof, s);
    if (city.level >= 4) house(ctx, x + 4 * s, y + 24 * s + dy, 9 * s, 7 * s, roof, s);
    if (city.level >= 5) house(ctx, x + 22 * s, y + 24 * s + dy, 8 * s, 6 * s, roof, s);
  } else {
    const dy = walled ? -3 : 0;
    const layouts = {
      1: [[-7, 8, 12], [9, 14, 10]],
      2: [[-10, 4, 11], [10, 6, 11], [-1, 18, 12]],
      3: [[4, -2, 12], [16, 10, 10], [-6, 19, 11], [10, 22, 9]],
    }[Math.min(3, city.level)];
    if (city.level >= 4) {
      // Burgstadt / Metropole: Turm in der Mitte, Kirche, mehr Häuser
      chapel(ctx, x - 12 * s, y + 6 * s, roof, s);
      const th = city.level >= 5 ? 22 * s : 17 * s;
      const top = turret(ctx, x + 6 * s, y + 6 * s, 5 * s, th, col, s);
      perch = [x + 6 * s, y + 6 * s - th - 2 * s];
      flag(ctx, x + 6 * s, top, 8 * s, col, s, city.level >= 5);
      for (const [hx, hy, w] of [[18, 10, 10], [-8, 22 + dy, 11], [10, 24 + dy, 10], ...(city.level >= 5 ? [[-22, 18 + dy, 8], [24, 22 + dy, 8]] : [])]) {
        house(ctx, x + hx * s, y + hy * s, w * s, w * 0.75 * s, roof, s);
      }
    } else {
      if (city.level >= 3) { chapel(ctx, x - 12 * s, y + 3 * s, roof, s); perch = [x - 18 * s, y - 12 * s]; }
      for (const [hx, hy, w] of layouts) house(ctx, x + hx * s, y + (hy + (hy > 15 ? dy : 0)) * s, w * s, w * 0.75 * s, roof, s);
      if (city.level >= 2) flag(ctx, x + (city.level >= 3 ? 4 : -10) * s, y + (city.level >= 3 ? -9 : -4) * s, 9 * s, col, s);
    }
  }
  if (walled) cityWall(ctx, x, y, s, col, 'front', big);
  if (city.buildings?.includes('dragonlair')) {
    // Ohne Turm: ein Drachenfels in der Stadt
    if (!perch) {
      const rx = x + 13 * s, ry = y + 8 * s;
      ctx.fillStyle = grad(ctx, rx - 6 * s, rx + 6 * s, '#9a948a', '#4e4a44');
      ctx.beginPath();
      ctx.moveTo(rx - 7 * s, ry);
      ctx.lineTo(rx - 4 * s, ry - 10 * s);
      ctx.lineTo(rx - 1 * s, ry - 13 * s);
      ctx.lineTo(rx + 3 * s, ry - 11 * s);
      ctx.lineTo(rx + 7 * s, ry);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 0.8);
      perch = [rx, ry - 12 * s];
    }
    miniDragon(ctx, perch[0], perch[1], s, col);
  }
  // Stufenanzeige
  const lv = city.stars ?? city.level;
  if (lv > 1) {
    // Ab Stufe 6 enger und kleiner, damit 8 Sterne aufs Feld passen
    const sp = lv > 5 ? 7.5 : 10, sk = lv > 5 ? 0.8 : 1;
    for (let k = 0; k < lv; k++) {
      const px = x - ((lv - 1) * sp * s) / 2 + k * sp * s, py = y + 29 * s;
      ctx.fillStyle = k >= 5 ? '#ffb02e' : '#ffd34d';
      ctx.strokeStyle = '#6b4a00';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = (i % 2 ? 2 * s : 4.5 * s) * sk;
        if (i === 0) ctx.moveTo(px + r * Math.cos(a), py + r * Math.sin(a));
        else ctx.lineTo(px + r * Math.cos(a), py + r * Math.sin(a));
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ Figuren

const SKIN = '#f1c59a';

function grad(ctx, x0, x1, light, dark) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  return g;
}

function outline(ctx, w = 1) {
  ctx.strokeStyle = 'rgba(20,14,10,0.85)';
  ctx.lineWidth = w;
  ctx.stroke();
}

// Polierter Stahl: Glanzkante links oben, dunkel nach rechts
function steel(ctx, x0, x1, y0 = 0, y1 = 0) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  // Ab Entwicklungsstufe 4: geschwärzter Stahl
  const c = FIG.stage >= 4 ? ['#b4b8c0', '#5b606b', '#2b2e35', '#0b0c10'] : ['#f4f7fa', '#d5dbe2', '#8f99a4', '#4f5862'];
  g.addColorStop(0, c[0]);
  g.addColorStop(0.3, c[1]);
  g.addColorStop(0.65, c[2]);
  g.addColorStop(1, c[3]);
  return g;
}

// Aktuelle Entwicklung der gezeichneten Figur (Stufe 0–5 und gewählte Ausbauten)
let FIG = { stage: 0, ups: new Set() };
const hasUp = (id) => FIG.ups.has(id);

// Haarschopf für Figuren ohne Helm
function hair(ctx, x, y, c = '#5a3a1e') {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y - 0.8, 4.4, Math.PI * 1.05, Math.PI * 1.95);
  ctx.quadraticCurveTo(x + 2, y - 3.6, x - 4.1, y - 0.2);
  ctx.fill();
}

// Goldene Stufen-Steine vorn am Sockel und goldene Aura bei voller Entwicklung
function stageMarks(ctx, r) {
  const n = FIG.stage;
  if (!n) return;
  for (let k = 0; k < n; k++) {
    const x = (k - (n - 1) / 2) * 3.6, y = 9.6 + r * 0.02;
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = 'rgba(90,60,0,0.9)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 1.6);
    ctx.lineTo(x + 1.3, y);
    ctx.lineTo(x, y + 1.6);
    ctx.lineTo(x - 1.3, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
function stageAura(ctx) {
  if (FIG.stage < 5) return;
  const g = ctx.createRadialGradient(0, -16, 2, 0, -16, 32);
  g.addColorStop(0, 'rgba(253,230,138,0.55)');
  g.addColorStop(0.55, 'rgba(250,204,21,0.18)');
  g.addColorStop(1, 'rgba(250,204,21,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -16, 30, 34, 0, 0, Math.PI * 2);
  ctx.fill();
}

function cloth(ctx, x0, x1, col) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, col.light);
  g.addColorStop(0.4, col.main);
  g.addColorStop(1, col.dark);
  return g;
}

function shine(ctx, x, y, rx, ry, a = 0.55) {
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function pedestal(ctx, col, r = 15) {
  // Sockel in Spielerfarbe mit Goldrand
  const k = r / 15;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(2 * k, 13, 17 * k, 6 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col.dark;
  ctx.beginPath();
  ctx.ellipse(0, 10, r, 5.5 * k, 0, 0, Math.PI);
  ctx.lineTo(-r, 6);
  ctx.ellipse(0, 6, r, 5.5 * k, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  const g = ctx.createLinearGradient(-r, 0, r, 0);
  g.addColorStop(0, col.light);
  g.addColorStop(0.45, col.main);
  g.addColorStop(1, col.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 6, r, 5.5 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f2d27a';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(0, 6, r - 3, 5.5 * k - 1.2, 0, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();
}

// Beine mit Hose und Lederstiefeln
function legs(ctx, x, y, trouser = '#4a3a2e', spread = 2.6) {
  for (const sx of [-1, 1]) {
    const lx = x + sx * spread;
    ctx.fillStyle = grad(ctx, lx - 2, lx + 2, shade(trouser, 0.2), shade(trouser, -0.3));
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(lx - 1.9, y - 13, 3.8, 9, 1.4) : ctx.rect(lx - 1.9, y - 13, 3.8, 9);
    ctx.fill();
    outline(ctx, 0.6);
    // Stiefel mit Spitze nach vorne
    ctx.fillStyle = grad(ctx, lx - 2, lx + 3, '#7a5236', '#2e1d12');
    ctx.beginPath();
    ctx.moveTo(lx - 2.1, y - 5.5);
    ctx.lineTo(lx + 2.1, y - 5.5);
    ctx.lineTo(lx + 2.2, y - 1.6);
    ctx.quadraticCurveTo(lx + 4.4, y - 1.2, lx + 4.2, y + 0.4);
    ctx.lineTo(lx - 2.2, y + 0.4);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.6);
    ctx.strokeStyle = 'rgba(255,230,200,0.35)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(lx - 1.4, y - 5);
    ctx.lineTo(lx - 1.4, y - 1);
    ctx.stroke();
  }
}

// Umhang in Spielerfarbe hinter dem Körper
function cape(ctx, x, y, col, len = 22, wide = 9) {
  ctx.fillStyle = cloth(ctx, x - wide, x + wide, { light: shade(col.main, 0.1), main: col.dark, dark: shade(col.dark, -0.35) });
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 20);
  ctx.quadraticCurveTo(x - wide - 1, y - 8, x - wide, y - 20 + len);
  ctx.quadraticCurveTo(x - 2, y - 20 + len + 2, x + wide - 2, y - 20 + len - 1);
  ctx.quadraticCurveTo(x + wide - 1, y - 8, x + 5, y - 20);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.7);
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 0.6;
  for (const fx of [-3, 1.5]) {
    ctx.beginPath();
    ctx.moveTo(x + fx, y - 15);
    ctx.quadraticCurveTo(x + fx - 1.5, y - 6, x + fx - 1, y - 20 + len - 1);
    ctx.stroke();
  }
}

// Oberkörper: 'tunic' (Stoff), 'leather', 'mail' (Kettenhemd), 'plate' (Plattenpanzer); dazu Wappenrock
function torso(ctx, x, y, col, kind = 'tunic') {
  const top = y - 22, waist = y - 11;
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(x - 5.6, waist + 1);
    ctx.lineTo(x - 5.2, top + 3);
    ctx.quadraticCurveTo(x - 5, top, x - 2, top);
    ctx.lineTo(x + 2, top);
    ctx.quadraticCurveTo(x + 5, top, x + 5.2, top + 3);
    ctx.lineTo(x + 5.6, waist + 1);
    ctx.closePath();
  };
  if (kind === 'mail') {
    ctx.fillStyle = steel(ctx, x - 6, x + 6);
    body();
    ctx.fill();
    outline(ctx, 0.8);
    // Kettenringe
    ctx.save();
    body();
    ctx.clip();
    ctx.fillStyle = 'rgba(40,46,54,0.45)';
    for (let yy = top + 1; yy < waist + 1; yy += 1.4) {
      for (let xx = x - 6 + ((yy - top) % 2.8 < 1.4 ? 0.7 : 0); xx < x + 6; xx += 1.4) {
        ctx.fillRect(xx, yy, 0.6, 0.6);
      }
    }
    ctx.restore();
  } else if (kind === 'plate') {
    ctx.fillStyle = steel(ctx, x - 6, x + 6, top, waist);
    body();
    ctx.fill();
    outline(ctx, 0.8);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x - 0.4, top + 1);
    ctx.lineTo(x - 0.4, waist);
    ctx.stroke();
    shine(ctx, x - 2.6, top + 4, 1.4, 2.6, 0.6);
  } else {
    const c = kind === 'leather' ? { light: '#b98756', main: '#8a5a30', dark: '#4d3018' } : col;
    ctx.fillStyle = cloth(ctx, x - 6, x + 6, c);
    body();
    ctx.fill();
    outline(ctx, 0.8);
    if (kind === 'leather') {
      // Schnürung und Hemdkragen in Spielerfarbe
      ctx.fillStyle = col.main;
      ctx.beginPath();
      ctx.moveTo(x - 2, top);
      ctx.lineTo(x, top + 4);
      ctx.lineTo(x + 2, top);
      ctx.fill();
      ctx.strokeStyle = '#e8d2a8';
      ctx.lineWidth = 0.4;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(x - 1, top + 5 + k * 1.6);
        ctx.lineTo(x + 1, top + 5.8 + k * 1.6);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x - 2.5, top + 2);
      ctx.lineTo(x - 3, waist);
      ctx.moveTo(x + 2.5, top + 2);
      ctx.lineTo(x + 3, waist);
      ctx.stroke();
    }
  }
  if (kind === 'mail' || kind === 'plate') {
    // Wappenrock in Spielerfarbe mit Goldsaum
    ctx.fillStyle = cloth(ctx, x - 4, x + 4, col);
    ctx.beginPath();
    ctx.moveTo(x - 3.3, top + 5);
    ctx.lineTo(x + 3.3, top + 5);
    ctx.lineTo(x + 3.8, y - 5);
    ctx.lineTo(x, y - 3.8);
    ctx.lineTo(x - 3.8, y - 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e9c45a';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.fillStyle = '#f2d06a';
    ctx.beginPath();
    ctx.moveTo(x, top + 7);
    ctx.lineTo(x + 1.5, top + 9);
    ctx.lineTo(x, top + 11);
    ctx.lineTo(x - 1.5, top + 9);
    ctx.closePath();
    ctx.fill();
  } else {
    // Rockschoß
    ctx.fillStyle = cloth(ctx, x - 6, x + 6, col);
    ctx.beginPath();
    ctx.moveTo(x - 5.6, waist);
    ctx.lineTo(x + 5.6, waist);
    ctx.lineTo(x + 6.2, y - 6);
    ctx.lineTo(x - 6.2, y - 6);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.6);
  }
  // Gürtel mit Schnalle
  ctx.fillStyle = '#3b2616';
  ctx.fillRect(x - 5.7, waist - 1, 11.4, 2);
  ctx.fillStyle = '#e9c45a';
  ctx.fillRect(x - 1, waist - 1.2, 2, 2.4);
  // Schulterstücke
  if (kind === 'plate' || kind === 'mail') {
    for (const sx of [-1, 1]) {
      ctx.fillStyle = steel(ctx, x + sx * 6 - 3, x + sx * 6 + 3, top, top + 4);
      ctx.beginPath();
      ctx.ellipse(x + sx * 5.6, top + 2.2, 3, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      outline(ctx, 0.6);
    }
  }
}

// Arm von der Schulter zur Hand
function arm(ctx, x0, y0, x1, y1, sleeve, armored = false) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(20,14,10,0.85)';
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = armored ? '#b9c1ca' : sleeve;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.fillStyle = armored ? '#8f99a4' : SKIN;
  ctx.beginPath();
  ctx.arc(x1, y1, 1.6, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 0.5);
}

// Kopf mit Gesicht; beard: Bartfarbe oder null
function face(ctx, x, y, beard = null) {
  const g = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 5);
  g.addColorStop(0, '#ffe6cc');
  g.addColorStop(1, '#cf9466');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 4.2, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 0.7);
  if (beard) {
    ctx.fillStyle = beard;
    ctx.beginPath();
    ctx.moveTo(x - 3.6, y + 0.5);
    ctx.quadraticCurveTo(x, y + 6.5, x + 3.6, y + 0.5);
    ctx.quadraticCurveTo(x, y + 2.5, x - 3.6, y + 0.5);
    ctx.fill();
  }
  ctx.fillStyle = '#2a1a10';
  ctx.beginPath();
  ctx.arc(x + 0.4, y - 0.4, 0.55, 0, Math.PI * 2);
  ctx.arc(x + 2.6, y - 0.4, 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,30,15,0.6)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x + 0.8, y + 2);
  ctx.lineTo(x + 2.4, y + 2);
  ctx.stroke();
}

function helmet(ctx, x, y, type, col) {
  if (type === 'kettle') {
    // Eisenhut mit breiter Krempe
    ctx.fillStyle = steel(ctx, x - 5, x + 5, y - 6, y);
    ctx.beginPath();
    ctx.arc(x, y - 1, 4.6, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.7);
    ctx.fillStyle = steel(ctx, x - 7, x + 7);
    ctx.beginPath();
    ctx.ellipse(x, y - 0.8, 7, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx, 0.6);
    shine(ctx, x - 1.8, y - 3.6, 1, 1.6);
  } else if (type === 'nasal') {
    ctx.fillStyle = steel(ctx, x - 5, x + 5, y - 8, y);
    ctx.beginPath();
    ctx.moveTo(x - 4.8, y);
    ctx.quadraticCurveTo(x - 4.8, y - 6, x, y - 7.5);
    ctx.quadraticCurveTo(x + 4.8, y - 6, x + 4.8, y);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.7);
    ctx.fillStyle = '#9aa3ad';
    ctx.fillRect(x + 1.1, y - 0.5, 1.1, 4);
    ctx.fillStyle = '#e9c45a';
    ctx.fillRect(x - 4.8, y - 1, 9.6, 1.1);
    shine(ctx, x - 2, y - 4.5, 1, 1.8);
  } else if (type === 'great') {
    // Topfhelm mit Sehschlitz und Helmbusch
    ctx.fillStyle = col.main;
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 6.5);
    ctx.quadraticCurveTo(x - 10, y - 15, x - 13, y - 6);
    ctx.quadraticCurveTo(x - 7, y - 10, x + 1, y - 6);
    ctx.fill();
    outline(ctx, 0.6);
    ctx.fillStyle = steel(ctx, x - 5.5, x + 5.5, y - 7, y + 5);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - 5.2, y - 6.5, 10.4, 11.5, [3, 3, 1.5, 1.5]) : ctx.rect(x - 5.2, y - 6.5, 10.4, 11.5);
    ctx.fill();
    outline(ctx, 0.8);
    ctx.fillStyle = '#1b1d21';
    ctx.fillRect(x - 4.2, y - 1.6, 8.4, 1.3);
    ctx.fillStyle = '#e9c45a';
    ctx.fillRect(x - 0.5, y - 6.3, 1, 11);
    for (const hy of [1.5, 3]) for (const hx of [1.5, 3]) { ctx.fillStyle = '#1b1d21'; ctx.fillRect(x + hx, y + hy, 0.6, 0.6); }
    shine(ctx, x - 3, y - 3.8, 0.9, 2);
  } else if (type === 'hood') {
    ctx.fillStyle = cloth(ctx, x - 6, x + 6, col);
    ctx.beginPath();
    ctx.moveTo(x - 5.6, y + 3.5);
    ctx.quadraticCurveTo(x - 6.4, y - 7, x - 0.5, y - 7.4);
    ctx.quadraticCurveTo(x + 6, y - 6.8, x + 5.6, y + 3.5);
    ctx.quadraticCurveTo(x + 3.8, y - 2.4, x + 0.6, y - 2.8);
    ctx.quadraticCurveTo(x - 3, y - 2.4, x - 5.6, y + 3.5);
    ctx.fill();
    outline(ctx, 0.7);
  }
}

// Schwert mit Hohlkehle, Parierstange und Knauf
function sword(ctx, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const gx = x0 + ux * 3, gy = y0 + uy * 3;
  ctx.fillStyle = steel(ctx, gx + nx * 1.2, gx - nx * 1.2, gy + ny * 1.2, gy - ny * 1.2);
  ctx.beginPath();
  ctx.moveTo(gx + nx * 1.2, gy + ny * 1.2);
  ctx.lineTo(x1 + nx * 0.5 - ux * 1.5, y1 + ny * 0.5 - uy * 1.5);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - nx * 0.5 - ux * 1.5, y1 - ny * 0.5 - uy * 1.5);
  ctx.lineTo(gx - nx * 1.2, gy - ny * 1.2);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(gx + ux * 1, gy + uy * 1);
  ctx.lineTo(x1 - ux * 4, y1 - uy * 4);
  ctx.stroke();
  // Griff, Parierstange, Knauf
  ctx.strokeStyle = '#4a2f1a';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0 - ux * 1, y0 - uy * 1);
  ctx.lineTo(gx, gy);
  ctx.stroke();
  ctx.strokeStyle = '#d9ad3c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(gx + nx * 3.2, gy + ny * 3.2);
  ctx.lineTo(gx - nx * 3.2, gy - ny * 3.2);
  ctx.stroke();
  ctx.fillStyle = '#e9c45a';
  ctx.beginPath();
  ctx.arc(x0 - ux * 1.6, y0 - uy * 1.6, 1.1, 0, Math.PI * 2);
  ctx.fill();
}

// Rundschild: Holz in Spielerfarbe geviertelt, Metallrand und Buckel
function roundShield(ctx, x, y, r, col) {
  ctx.fillStyle = cloth(ctx, x - r, x + r, col);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(x - r, y - r, r, r);
  ctx.fillRect(x, y, r, r);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = steel(ctx, x - r, x + r);
  ctx.beginPath();
  ctx.arc(x, y, r - 0.6, 0, Math.PI * 2);
  ctx.stroke();
  outline(ctx, 0.5);
  ctx.fillStyle = steel(ctx, x - 2, x + 2, y - 2, y + 2);
  ctx.beginPath();
  ctx.arc(x, y, 2.2, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 0.5);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x - 0.8, y - 0.8, 0.6, 0, Math.PI * 2);
  ctx.fill();
}

// Dreiecksschild mit goldenem Wappen
function kiteShield(ctx, x, y, w, h, col, sign = 'cross') {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h * 0.45);
    ctx.quadraticCurveTo(x + w / 2, y + h * 0.85, x, y + h);
    ctx.quadraticCurveTo(x - w / 2, y + h * 0.85, x - w / 2, y + h * 0.45);
    ctx.closePath();
  };
  ctx.fillStyle = cloth(ctx, x - w / 2, x + w / 2, col);
  path();
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = steel(ctx, x - w / 2, x + w / 2);
  ctx.stroke();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(20,14,10,0.85)';
  ctx.stroke();
  ctx.fillStyle = '#f2d06a';
  if (sign === 'cross') {
    ctx.fillRect(x - w * 0.09, y + h * 0.12, w * 0.18, h * 0.66);
    ctx.fillRect(x - w * 0.32, y + h * 0.3, w * 0.64, h * 0.14);
  } else {
    // Sparren
    ctx.beginPath();
    ctx.moveTo(x - w * 0.42, y + h * 0.55);
    ctx.lineTo(x, y + h * 0.22);
    ctx.lineTo(x + w * 0.42, y + h * 0.55);
    ctx.lineTo(x + w * 0.42, y + h * 0.7);
    ctx.lineTo(x, y + h * 0.38);
    ctx.lineTo(x - w * 0.42, y + h * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + 1, y + 1);
  ctx.lineTo(x - w * 0.1, y + 1);
  ctx.lineTo(x - w / 2 + 1, y + h * 0.5);
  ctx.closePath();
  ctx.fill();
}

// Pferd seitlich, Kopf nach rechts. armored: Schabracke in Spielerfarbe und Rossstirn
function horse(ctx, coat, mane, col, armored) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const legC = shade(coat, -0.3);
  const leg = (x, y, back, farSide) => {
    const c = farSide ? shade(coat, -0.45) : legC;
    ctx.strokeStyle = 'rgba(20,14,10,0.8)';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (back ? -1.2 : 0.8), y + 6);
    ctx.lineTo(x + (back ? 0.2 : 0.4), y + 12.5);
    ctx.stroke();
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.fillStyle = '#2a2420';
    ctx.fillRect(x + (back ? -1.2 : -0.9), y + 12, 2.6, 1.8);
  };
  // hintere Beine (fern)
  leg(-9, -10, true, true);
  leg(8, -10, false, true);
  // Schweif
  ctx.strokeStyle = mane;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(-14.5, -16);
  ctx.quadraticCurveTo(-21, -12, -18.5, -1);
  ctx.stroke();
  ctx.strokeStyle = shade(mane, 0.3);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-15, -15.5);
  ctx.quadraticCurveTo(-20, -11, -18, -3);
  ctx.stroke();
  // Rumpf
  const g = ctx.createLinearGradient(0, -22, 0, -6);
  g.addColorStop(0, shade(coat, 0.3));
  g.addColorStop(0.55, coat);
  g.addColorStop(1, shade(coat, -0.35));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-15, -15);
  ctx.quadraticCurveTo(-15, -21.5, -7, -21);
  ctx.quadraticCurveTo(2, -20, 9, -21);
  ctx.quadraticCurveTo(14, -20, 14, -14);
  ctx.quadraticCurveTo(13, -8, 8, -8);
  ctx.lineTo(-9, -8);
  ctx.quadraticCurveTo(-15, -9, -15, -15);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.9);
  // Hals und Kopf
  ctx.beginPath();
  ctx.moveTo(8, -19);
  ctx.quadraticCurveTo(11, -27, 15, -31);
  ctx.quadraticCurveTo(18, -33.5, 20.5, -31);
  ctx.lineTo(24.5, -24.5);
  ctx.quadraticCurveTo(25, -22, 22.5, -22);
  ctx.lineTo(19.5, -24);
  ctx.quadraticCurveTo(16, -18, 13.5, -12);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.9);
  // Ohr, Auge, Nüster
  ctx.fillStyle = shade(coat, -0.2);
  ctx.beginPath();
  ctx.moveTo(16, -31.5);
  ctx.lineTo(16.5, -35);
  ctx.lineTo(18, -32);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(18.6, -28.4, 0.8, 0, Math.PI * 2);
  ctx.arc(23.3, -23.6, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(18.7, -28.8, 0.4, 0.4);
  // Mähne
  ctx.fillStyle = mane;
  ctx.beginPath();
  ctx.moveTo(15.5, -32);
  ctx.quadraticCurveTo(10, -28, 7.5, -19);
  ctx.lineTo(9.5, -19.5);
  ctx.quadraticCurveTo(12, -27, 16.5, -30.5);
  ctx.fill();
  // Zaumzeug
  ctx.strokeStyle = '#3b2616';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(17, -30);
  ctx.lineTo(22.5, -24.2);
  ctx.moveTo(21.5, -23.4);
  ctx.quadraticCurveTo(14, -22, 6, -20);
  ctx.stroke();
  // vordere Beine (nah)
  leg(-6, -9.5, true, false);
  leg(10.5, -9.5, false, false);
  if (armored) {
    // Schabracke mit Zackensaum und Goldlilien
    ctx.fillStyle = cloth(ctx, -15, 14, col);
    ctx.beginPath();
    ctx.moveTo(-15, -17);
    ctx.quadraticCurveTo(-12, -21.5, -4, -21);
    ctx.lineTo(12, -21);
    ctx.quadraticCurveTo(15.5, -18, 14, -12);
    ctx.lineTo(14, -4);
    for (let k = 0; k <= 7; k++) ctx.lineTo(14 - k * 4.1, k % 2 ? -1.5 : -4);
    ctx.lineTo(-15, -4);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.8);
    ctx.strokeStyle = '#e9c45a';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-15, -6);
    ctx.lineTo(14, -6);
    ctx.stroke();
    ctx.fillStyle = '#f2d06a';
    for (const [lx, ly] of [[-9, -14], [-1, -12], [7, -14]]) {
      ctx.beginPath();
      ctx.moveTo(lx, ly - 2.2);
      ctx.lineTo(lx + 1.2, ly);
      ctx.lineTo(lx, ly + 1.6);
      ctx.lineTo(lx - 1.2, ly);
      ctx.closePath();
      ctx.fill();
    }
    // Rossstirn aus Stahl
    ctx.fillStyle = steel(ctx, 16, 25, -32, -22);
    ctx.beginPath();
    ctx.moveTo(15.6, -31);
    ctx.lineTo(19.5, -32.5);
    ctx.lineTo(24.5, -25);
    ctx.lineTo(22, -23.5);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.5);
  } else {
    // Satteldecke und Sattel
    ctx.fillStyle = cloth(ctx, -8, 6, col);
    ctx.beginPath();
    ctx.moveTo(-8, -21);
    ctx.lineTo(6, -21);
    ctx.lineTo(5, -11.5);
    ctx.lineTo(-7, -11.5);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.7);
    ctx.strokeStyle = '#e9c45a';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(-6.5, -19.5, 11, 6.5);
    ctx.fillStyle = grad(ctx, -6, 4, '#8a5a30', '#3e2614');
    ctx.beginPath();
    ctx.moveTo(-6, -21.5);
    ctx.quadraticCurveTo(-1, -19, 4, -21.5);
    ctx.lineTo(4, -23);
    ctx.quadraticCurveTo(-1, -21, -6, -23.5);
    ctx.closePath();
    ctx.fill();
  }
  shine(ctx, -4, -19.5, 5, 1.2, 0.25);
}

// Türme: Stufe 1 Holzwachturm, 2 steinerner Wehrturm, 3 großer Bergfried mit Kegeldach
function drawTowerFigure(ctx, col, level) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(3, 9, 19, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (level === 1) {
    // Steinsockel
    ctx.fillStyle = stone(ctx, -12, 12, 0.1);
    ctx.beginPath();
    ctx.ellipse(0, 6, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx, 0.7);
    const log = (x0, y0, x1, y1, w) => {
      ctx.strokeStyle = 'rgba(20,14,10,0.85)';
      ctx.lineWidth = w + 1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.strokeStyle = grad(ctx, Math.min(x0, x1) - 1, Math.max(x0, x1) + 1, '#b07a44', '#5e3b1c');
      ctx.lineWidth = w;
      ctx.stroke();
    };
    // Beine und Streben
    log(-6, 5, -5, -26, 2.2);
    log(6, 5, 5, -26, 2.2);
    log(-10, 6, -8, -26, 2.6);
    log(10, 6, 8, -26, 2.6);
    log(-9, 2, 8, -10, 1.3);
    log(9, 2, -8, -10, 1.3);
    log(-8, -12, 8, -24, 1.3);
    log(8, -12, -8, -24, 1.3);
    // Leiter
    ctx.strokeStyle = '#7a5230';
    ctx.lineWidth = 0.8;
    for (const lx of [-2.2, 2.2]) {
      ctx.beginPath();
      ctx.moveTo(lx, 6);
      ctx.lineTo(lx * 0.8, -26);
      ctx.stroke();
    }
    for (let y = 3; y > -25; y -= 3.5) {
      ctx.beginPath();
      ctx.moveTo(-2, y);
      ctx.lineTo(2, y);
      ctx.stroke();
    }
    // Plattform mit Brüstung aus Brettern
    ctx.fillStyle = grad(ctx, -13, 13, '#c8935a', '#6b4423');
    ctx.fillRect(-13, -34, 26, 9);
    ctx.strokeStyle = 'rgba(60,35,15,0.6)';
    ctx.lineWidth = 0.6;
    for (let x = -10; x < 13; x += 3.2) {
      ctx.beginPath();
      ctx.moveTo(x, -34);
      ctx.lineTo(x, -25);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(20,14,10,0.85)';
    ctx.lineWidth = 0.9;
    ctx.strokeRect(-13, -34, 26, 9);
    ctx.fillStyle = '#5e3b1c';
    ctx.fillRect(-14, -26, 28, 2);
    // Wappenbanner an der Brüstung
    banner(ctx, 0, -33, 6, 9, col, 1);
    // Pfosten und Schindeldach
    log(-11, -34, -11, -42, 1.4);
    log(11, -34, 11, -42, 1.4);
    ctx.fillStyle = grad(ctx, -15, 15, shade(col.main, 0.15), shade(col.dark, -0.2));
    ctx.beginPath();
    ctx.moveTo(-16, -41);
    ctx.lineTo(0, -51);
    ctx.lineTo(16, -41);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.9);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.6;
    for (let k = 1; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(-16 + k * 4, -41 - k * 2.5);
      ctx.lineTo(16 - k * 4, -41 - k * 2.5);
      ctx.stroke();
    }
    flag(ctx, 0, -51, 9, col, 1);
  } else if (level === 2) {
    // Steinerner Rundturm mit Holzerker und Zinnen
    const r = 10, base = 7, top = -36;
    ctx.fillStyle = stone(ctx, -r, r);
    ctx.beginPath();
    ctx.moveTo(-r - 1.5, base);
    ctx.lineTo(-r, top);
    ctx.lineTo(r, top);
    ctx.lineTo(r + 1.5, base);
    ctx.ellipse(0, base, r + 1.5, 3.5, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 1);
    ctx.strokeStyle = 'rgba(90,75,55,0.35)';
    ctx.lineWidth = 0.6;
    for (let y = base - 4, row = 0; y > top + 2; y -= 4, row++) {
      ctx.beginPath();
      ctx.moveTo(-r, y);
      ctx.lineTo(r, y);
      ctx.stroke();
      for (let x = -r + (row % 2 ? 2 : 5); x < r; x += 6) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 4);
        ctx.stroke();
      }
    }
    shine(ctx, -6, -12, 1.5, 9, 0.25);
    // Tor und Schießscharten
    ctx.fillStyle = '#3a2416';
    ctx.beginPath();
    ctx.arc(0, base - 5, 3.5, Math.PI, 0);
    ctx.lineTo(3.5, base);
    ctx.lineTo(-3.5, base);
    ctx.fill();
    ctx.strokeStyle = '#d9ad3c';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-3.5, base - 3);
    ctx.lineTo(3.5, base - 3);
    ctx.stroke();
    ctx.fillStyle = '#1e1610';
    for (const [x, y] of [[-4, -14], [4, -14], [0, -24]]) ctx.fillRect(x - 0.7, y, 1.4, 4.5);
    // Kragen und Zinnen
    ctx.fillStyle = stone(ctx, -r - 2.5, r + 2.5);
    ctx.fillRect(-r - 2.5, top - 3, (r + 2.5) * 2, 4);
    outline(ctx, 0.6);
    ctx.strokeRect(-r - 2.5, top - 3, (r + 2.5) * 2, 4);
    merlons(ctx, -r - 2.5, r + 2.5, top - 3, 1, 5);
    // Wappenband
    ctx.fillStyle = cloth(ctx, -r, r, col);
    ctx.fillRect(-r, top + 2, r * 2, 3);
    ctx.fillStyle = '#e9c45a';
    ctx.fillRect(-r, top + 5, r * 2, 0.7);
    banner(ctx, 6, top + 6, 5, 10, col, 1);
    flag(ctx, -4, top - 6, 12, col, 1);
  } else {
    // Großer Wehrturm: Stufensockel, Pechnasen, Ecktürmchen, Kegeldach
    const r = 12, base = 7, top = -36;
    ctx.fillStyle = stone(ctx, -r - 4, r + 4, 0.08);
    ctx.beginPath();
    ctx.moveTo(-r - 4, base);
    ctx.lineTo(-r - 2, base - 8);
    ctx.lineTo(r + 2, base - 8);
    ctx.lineTo(r + 4, base);
    ctx.ellipse(0, base, r + 4, 4, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.9);
    ctx.fillStyle = stone(ctx, -r, r);
    ctx.fillRect(-r, top, r * 2, base - 8 - top);
    outline(ctx, 1);
    ctx.strokeRect(-r, top, r * 2, base - 8 - top);
    ctx.strokeStyle = 'rgba(90,75,55,0.33)';
    ctx.lineWidth = 0.6;
    for (let y = base - 12, row = 0; y > top + 2; y -= 4, row++) {
      ctx.beginPath();
      ctx.moveTo(-r, y);
      ctx.lineTo(r, y);
      ctx.stroke();
      for (let x = -r + (row % 2 ? 2 : 5); x < r; x += 6) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 4);
        ctx.stroke();
      }
    }
    shine(ctx, -7, -16, 1.6, 11, 0.25);
    // Tor mit Fallgitter, Fenster mit Licht
    ctx.fillStyle = '#2b2118';
    ctx.beginPath();
    ctx.arc(0, base - 13, 4, Math.PI, 0);
    ctx.lineTo(4, base - 8);
    ctx.lineTo(-4, base - 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,160,120,0.7)';
    ctx.lineWidth = 0.5;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(k * 1.5, base - 16);
      ctx.lineTo(k * 1.5, base - 8);
      ctx.stroke();
    }
    for (const [x, y] of [[-5, -24], [5, -24], [0, -33]]) {
      ctx.fillStyle = '#2b2118';
      ctx.beginPath();
      ctx.arc(x, y, 1.6, Math.PI, 0);
      ctx.lineTo(x + 1.6, y + 3.5);
      ctx.lineTo(x - 1.6, y + 3.5);
      ctx.fill();
      ctx.fillStyle = '#ffcf5a';
      ctx.fillRect(x - 0.6, y + 0.5, 1.2, 2.5);
    }
    // Wappenbanner
    banner(ctx, -7, top + 6, 4.5, 13, col, 1);
    banner(ctx, 7, top + 6, 4.5, 13, col, 1);
    // Pechnasen-Kranz
    ctx.fillStyle = stone(ctx, -r - 3, r + 3);
    ctx.fillRect(-r - 3, top - 5, (r + 3) * 2, 5);
    outline(ctx, 0.6);
    ctx.strokeRect(-r - 3, top - 5, (r + 3) * 2, 5);
    ctx.fillStyle = '#4a3c2c';
    for (let x = -r - 1; x < r + 2; x += 3.4) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + 2, top);
      ctx.lineTo(x + 1, top + 2.2);
      ctx.closePath();
      ctx.fill();
    }
    merlons(ctx, -r - 3, r + 3, top - 5, 1, 6);
    // Ecktürmchen und Kegeldach
    for (const ex of [-r - 1, r + 1]) turret(ctx, ex, top - 4, 3, 8, col, 1);
    const rg = ctx.createLinearGradient(-r, 0, r, 0);
    rg.addColorStop(0, shade(col.main, 0.3));
    rg.addColorStop(0.5, col.main);
    rg.addColorStop(1, shade(col.main, -0.4));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(-r + 1, top - 8);
    ctx.lineTo(0, top - 26);
    ctx.lineTo(r - 1, top - 8);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.9);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.6;
    for (let k = 1; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(0, top - 26);
      ctx.lineTo(-r + 1 + k * (2 * r - 2) / 5, top - 8);
      ctx.stroke();
    }
    flag(ctx, 0, top - 25, 8, col, 1, true);
  }
  ctx.restore();
}

// Steinwall: massiver Mauerblock mit Zinnen und Wappenband
function drawBarrierFigure(ctx, col) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(3, 8, 17, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  const w = 11, top = -14, base = 7, d = 6;
  // Seitenwand
  ctx.fillStyle = shade('#b5a78b', -0.15);
  ctx.beginPath();
  ctx.moveTo(w, base);
  ctx.lineTo(w + d, base - d * 0.6);
  ctx.lineTo(w + d, top - d * 0.6);
  ctx.lineTo(w, top);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.8);
  // Vorderseite mit Quadern
  ctx.fillStyle = stone(ctx, -w, w);
  ctx.fillRect(-w, top, w * 2, base - top);
  ctx.strokeStyle = 'rgba(70,55,35,0.45)';
  ctx.lineWidth = 0.6;
  for (let r = 0; r < 5; r++) {
    const y = top + 4 + r * 4;
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    for (let k = -w + (r % 2 ? 3 : 6); k < w; k += 6) {
      ctx.beginPath();
      ctx.moveTo(k, y - 4);
      ctx.lineTo(k, y);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(20,14,10,0.85)';
  ctx.lineWidth = 0.9;
  ctx.strokeRect(-w, top, w * 2, base - top);
  // Oberseite und Zinnen
  ctx.fillStyle = '#efe6d2';
  ctx.beginPath();
  ctx.moveTo(-w, top);
  ctx.lineTo(w, top);
  ctx.lineTo(w + d, top - d * 0.6);
  ctx.lineTo(-w + d, top - d * 0.6);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.6);
  for (let k = 0; k < 4; k++) {
    const mx = -w + 1 + k * 6;
    ctx.fillStyle = stone(ctx, mx, mx + 3.6);
    ctx.fillRect(mx, top - 4, 3.6, 4);
    ctx.strokeStyle = 'rgba(20,14,10,0.7)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(mx, top - 4, 3.6, 4);
  }
  // Wappenband in Spielerfarbe
  ctx.fillStyle = cloth(ctx, -w, w, col);
  ctx.fillRect(-w, top + 3, w * 2, 2.6);
  ctx.fillStyle = '#e9c45a';
  ctx.fillRect(-w, top + 5.6, w * 2, 0.6);
  // Schießscharte
  ctx.fillStyle = '#2b2118';
  ctx.fillRect(-0.8, top + 9, 1.6, 5);
}

// Fusionseinheiten: beide Ausgangsfiguren auf einem gemeinsamen Sockel, umhüllt von violetter Fusionsenergie
const FUSION_LOOK = {
  horsearcher: ['knight', 'archer'], shieldbreaker: ['defender', 'warrior'], firemage: ['catapult', 'mage'], gorgon: ['basilisk', 'rider'],
  rocktroll: ['troll', 'catapult'], stormdragon: ['dragon', 'mage'], ram: ['trebuchet', 'knight'], chimera: ['rider', 'warrior'],
};
const BIG_FIG = ['troll', 'dragon', 'trebuchet'];
function drawFusion(ctx, back, front, col) {
  ctx.save();
  // Energieaura hinter den Figuren
  const g = ctx.createRadialGradient(0, -18, 2, 0, -18, 34);
  g.addColorStop(0, 'rgba(216,180,254,0.55)');
  g.addColorStop(0.6, 'rgba(147,51,234,0.22)');
  g.addColorStop(1, 'rgba(147,51,234,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -18, 34, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  pedestal(ctx, col, BIG_FIG.includes(back) ? 18 : 16);
  // Goldener Fusionsring auf dem Sockel
  ctx.strokeStyle = 'rgba(250,204,21,0.9)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  ctx.ellipse(0, 6, 13, 4.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const bigBack = BIG_FIG.includes(back);
  ctx.save();
  ctx.translate(bigBack ? -2 : -8, bigBack ? -2 : -5);
  ctx.scale(bigBack ? 0.86 : 0.8, bigBack ? 0.86 : 0.8);
  drawFigure(ctx, back, col, 1, true);
  ctx.restore();
  ctx.save();
  ctx.translate(bigBack ? 9 : 7, 3);
  ctx.scale(0.78, 0.78);
  drawFigure(ctx, front, col, 1, true);
  ctx.restore();
  // Funken
  ctx.fillStyle = '#f5d0fe';
  for (const [x, y, r] of [[-16, -40, 1.6], [14, -46, 1.2], [20, -22, 1.4], [-20, -14, 1.1], [2, -54, 1.3]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawFigure(ctx, type, col, level = 1, noPedestal = false, opts = null) {
  const prevFig = FIG;
  FIG = opts || { stage: 0, ups: new Set() };
  try { drawFigureInner(ctx, type, col, level, noPedestal); } finally { FIG = prevFig; }
}
function drawFigureInner(ctx, type, col, level, noPedestal) {
  if (type === 'tower') { drawTowerFigure(ctx, col, level); return; }
  if (type === 'barrier') { drawBarrierFigure(ctx, col); return; }
  if (type.startsWith('chimera:')) { const [a, b] = type.slice(8).split('+'); drawFusion(ctx, BIG_FIG.includes(b) ? b : a, BIG_FIG.includes(b) ? a : b, col); return; }
  if (FUSION_LOOK[type]) { drawFusion(ctx, FUSION_LOOK[type][0], FUSION_LOOK[type][1], col); return; }
  ctx.save();
  ctx.lineJoin = 'round';
  if (!noPedestal) {
    stageAura(ctx);
    pedestal(ctx, col, type === 'troll' || type === 'dragon' ? 18 : 15);
    stageMarks(ctx, type === 'troll' || type === 'dragon' ? 18 : 15);
  }
  switch (type) {
    case 'warrior': {
      cape(ctx, 0, 6, col, 19, 7.5);
      legs(ctx, 0, 6);
      torso(ctx, 0, 6, col, FIG.stage >= 4 ? 'plate' : 'mail');
      arm(ctx, 4.8, -14, 8.5, -19, '#9aa3ad', true);
      sword(ctx, 8.5, -19, 15, -38);
      face(ctx, 0, -20.5);
      // Ohne Eisenhelm (Stufe 2) nur Haarschopf
      if (FIG.stage >= 2) helmet(ctx, 0, -21.5, FIG.stage >= 5 ? 'great' : 'kettle', col);
      else hair(ctx, 0, -20.5);
      if (hasUp('w3a')) {
        // Beidhändig: zweites Schwert statt Schild
        arm(ctx, -4.8, -14, -8.5, -19, '#9aa3ad', true);
        sword(ctx, -8.5, -19, -15, -38);
      } else if (hasUp('w3b')) kiteShield(ctx, -6, -24, 12, 22, col, 'cross');
      else roundShield(ctx, -6.5, -9.5, 7.2, col);
      break;
    }
    case 'archer': {
      // Köcher mit Pfeilen auf dem Rücken
      ctx.save();
      ctx.translate(-4.5, -15);
      ctx.rotate(-0.4);
      ctx.fillStyle = grad(ctx, -2, 2, '#9a6334', '#4d2c12');
      ctx.fillRect(-2.2, -8, 4.4, 13);
      outline(ctx, 0.6);
      for (const fx of [-1.3, 0, 1.3]) {
        ctx.strokeStyle = '#6b4a2b';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(fx, -8);
        ctx.lineTo(fx, -11);
        ctx.stroke();
        ctx.fillStyle = fx === 0 ? col.light : '#f5f5f5';
        ctx.fillRect(fx - 0.6, -12.5, 1.2, 2.5);
      }
      ctx.restore();
      legs(ctx, 0, 6, '#3d4a2e');
      torso(ctx, 0, 6, col, 'leather');
      face(ctx, 0, -20.5);
      helmet(ctx, 0, -20.5, 'hood', col);
      // Langbogen gespannt, Pfeil eingelegt
      ctx.strokeStyle = 'rgba(20,14,10,0.85)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      // Langbogenschütze: deutlich größerer Bogen
      const br = hasUp('a3a') ? 19 : 14;
      ctx.beginPath();
      ctx.arc(3, -13, br, -1.2, 1.2);
      ctx.stroke();
      ctx.strokeStyle = grad(ctx, 0, 17, FIG.stage >= 4 ? '#5b3a22' : '#b77a3e', FIG.stage >= 4 ? '#24140a' : '#6b3d14');
      ctx.lineWidth = 2;
      ctx.stroke();
      const tx = 3 + br * Math.cos(-1.2), ty = -13 + br * Math.sin(-1.2), by = -13 + br * Math.sin(1.2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(-1, -13);
      ctx.lineTo(tx, by);
      ctx.stroke();
      ctx.strokeStyle = '#4a3420';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-1, -13);
      ctx.lineTo(21, -13);
      ctx.stroke();
      ctx.fillStyle = steel(ctx, 20, 24);
      ctx.beginPath();
      ctx.moveTo(23.5, -13);
      ctx.lineTo(20, -15);
      ctx.lineTo(20, -11);
      ctx.fill();
      if (hasUp('a3b')) {
        // Brandpfeil: Flamme an der Spitze
        const fg = ctx.createRadialGradient(24, -14, 0.3, 24, -14, 5);
        fg.addColorStop(0, 'rgba(255,250,200,1)');
        fg.addColorStop(0.4, 'rgba(255,140,30,0.9)');
        fg.addColorStop(1, 'rgba(220,40,0,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.ellipse(24, -15, 3.2, 5, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = col.light;
      ctx.beginPath();
      ctx.moveTo(-1, -13);
      ctx.lineTo(1.5, -14.8);
      ctx.lineTo(2.5, -13);
      ctx.lineTo(1.5, -11.2);
      ctx.fill();
      arm(ctx, 4.5, -14.5, 15.5, -13.2, col.main);
      arm(ctx, -3.5, -14.5, -0.5, -13, col.main);
      break;
    }
    case 'defender': {
      // Speer hinter dem Schild
      ctx.strokeStyle = 'rgba(20,14,10,0.8)';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      // Pikenier: viel längere Pike
      const pk = hasUp('d3b') ? -16 : 0;
      ctx.beginPath();
      ctx.moveTo(8, 6);
      ctx.lineTo(8, -38 + pk);
      ctx.stroke();
      ctx.strokeStyle = grad(ctx, 7, 9, '#a87a4c', '#5a3d22');
      ctx.lineWidth = 1.7;
      ctx.stroke();
      ctx.fillStyle = steel(ctx, 6, 10, -46 + pk, -38 + pk);
      ctx.beginPath();
      ctx.moveTo(8, -47 + pk);
      ctx.quadraticCurveTo(11, -41 + pk, 9.3, -38 + pk);
      ctx.lineTo(6.7, -38 + pk);
      ctx.quadraticCurveTo(5, -41 + pk, 8, -47 + pk);
      ctx.fill();
      outline(ctx, 0.6);
      if (FIG.stage >= 2) {
        // Hellebarden-Beil
        ctx.fillStyle = steel(ctx, 8, 13, -40 + pk, -34 + pk);
        ctx.beginPath();
        ctx.moveTo(8.5, -40 + pk);
        ctx.quadraticCurveTo(14.5, -38 + pk, 13, -32 + pk);
        ctx.lineTo(8.5, -34 + pk);
        ctx.closePath();
        ctx.fill();
        outline(ctx, 0.5);
      }
      ctx.fillStyle = col.main;
      ctx.beginPath();
      ctx.moveTo(8, -31 + pk / 2);
      ctx.lineTo(13, -29 + pk / 2);
      ctx.lineTo(8, -26.5 + pk / 2);
      ctx.fill();
      cape(ctx, 0, 6, col, 18, 7);
      legs(ctx, 0, 6, '#3a3f46');
      torso(ctx, 0, 6, col, 'plate');
      arm(ctx, 4.8, -14, 8, -11, '#9aa3ad', true);
      face(ctx, 0, -20.5);
      helmet(ctx, 0, -21, FIG.stage >= 4 ? 'great' : 'nasal', col);
      // Pavese (Stufe 1) und Schildwall: größere Schilde
      if (hasUp('d3a')) kiteShield(ctx, -5, -24, 16, 31, col, 'cross');
      else if (FIG.stage >= 1) kiteShield(ctx, -4.8, -22.5, 14.5, 28, col, 'cross');
      else kiteShield(ctx, -4.5, -21, 13, 26, col, 'cross');
      break;
    }
    case 'rider': {
      ctx.save();
      ctx.translate(0, 6);
      horse(ctx, '#9a5b2a', '#3b2312', col, false);
      // Reiter
      ctx.fillStyle = grad(ctx, -3, 2, '#5a4636', '#2e2219');
      ctx.fillRect(-2.6, -22, 3.6, 9);
      ctx.fillStyle = '#3a2416';
      ctx.fillRect(-2.8, -14, 4, 3);
      torso(ctx, -1, -11, col, FIG.stage >= 4 ? 'mail' : 'leather');
      face(ctx, -1, -37.5);
      helmet(ctx, -1, -37.5, FIG.stage >= 4 ? 'kettle' : 'hood', col);
      if (FIG.stage >= 2) roundShield(ctx, -7, -26, 5, col);
      if (hasUp('r3b')) {
        // Plänkler: Bündel Wurfspeere auf dem Rücken
        ctx.strokeStyle = '#7a5530';
        ctx.lineWidth = 1;
        for (const d of [-1.5, 0, 1.5]) {
          ctx.beginPath();
          ctx.moveTo(-9 + d, -14);
          ctx.lineTo(-3 + d, -42);
          ctx.stroke();
        }
      }
      if (hasUp('r3a')) {
        // Säbelreiter: geschwungener Krummsäbel statt Speer
        ctx.strokeStyle = 'rgba(20,14,10,0.85)';
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(6, -26);
        ctx.quadraticCurveTo(16, -32, 19, -44);
        ctx.stroke();
        ctx.strokeStyle = steel(ctx, 6, 19, -44, -26);
        ctx.lineWidth = 1.8;
        ctx.stroke();
        arm(ctx, 2.8, -30, 6, -26, col.main);
        ctx.restore();
        break;
      }
      // Speer
      ctx.strokeStyle = 'rgba(20,14,10,0.8)';
      ctx.lineWidth = 2.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-8, -18);
      ctx.lineTo(19, -41);
      ctx.stroke();
      ctx.strokeStyle = '#8a6038';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = steel(ctx, 18, 23, -46, -40);
      ctx.beginPath();
      ctx.moveTo(23, -45);
      ctx.lineTo(18, -42.5);
      ctx.lineTo(20.5, -39.5);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 0.5);
      arm(ctx, 2.8, -30, 6, -26, col.main);
      ctx.restore();
      break;
    }
    case 'knight': {
      ctx.save();
      ctx.translate(0, 6);
      // Ritter wächst mit: ohne Helm mit Schwert → Lanze → Helm und Rossharnisch → schwarze Rüstung → Ordensritter
      const st = FIG.stage;
      horse(ctx, st >= 4 ? '#3a3a42' : '#e4e4ea', st >= 4 ? '#15151a' : '#8f8f99', col, st >= 2);
      ctx.fillStyle = st >= 2 ? steel(ctx, -3, 2) : cloth(ctx, -3, 2, col);
      ctx.fillRect(-2.6, -22, 3.6, 9);
      torso(ctx, -1, -11, col, st >= 2 ? 'plate' : 'mail');
      face(ctx, -1, -37.5);
      if (st >= 2) helmet(ctx, -1, -38, 'great', col);
      else hair(ctx, -1, -37.5, '#c08a3a');
      if (st >= 2 && (hasUp('k3a') || st >= 5)) {
        // Federbusch
        ctx.fillStyle = st >= 5 ? '#facc15' : col.light;
        ctx.beginPath();
        ctx.moveTo(-1, -44);
        ctx.quadraticCurveTo(-9, -50, -12, -42);
        ctx.quadraticCurveTo(-6, -46, -1, -42);
        ctx.fill();
        outline(ctx, 0.5);
      }
      kiteShield(ctx, -7.5, -32, hasUp('k3b') ? 10.5 : 8, hasUp('k3b') ? 17 : 13, col, 'chevron');
      if (st === 0) {
        // Anfangs: Schwert erhoben
        arm(ctx, 2.8, -30, 6.5, -33, col.main);
        sword(ctx, 6.5, -33, 12, -50);
      } else {
        // Turnierlanze mit Wimpel (Chevalier: extralang)
        const L = hasUp('k3a') ? 1.35 : 1;
        const lx = -10 + 35 * L, ly = -17 - 28 * L;
        ctx.strokeStyle = 'rgba(20,14,10,0.8)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-10, -17);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        ctx.strokeStyle = grad(ctx, -10, lx, st >= 4 ? '#6b6b75' : '#f1e3c4', st >= 4 ? '#1b1b20' : '#8a6a3a');
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = st >= 5 ? '#facc15' : col.main;
        ctx.lineWidth = 2.1;
        for (let k = 0; k < 4; k++) {
          const t0 = 0.2 + k * 0.18;
          ctx.beginPath();
          ctx.moveTo(-10 + 35 * L * t0, -17 - 28 * L * t0);
          ctx.lineTo(-10 + 35 * L * (t0 + 0.06), -17 - 28 * L * (t0 + 0.06));
          ctx.stroke();
        }
        ctx.fillStyle = col.main;
        ctx.beginPath();
        ctx.moveTo(lx - 5, ly + 4);
        ctx.lineTo(lx - 12, ly - 1);
        ctx.lineTo(lx - 9, ly + 3);
        ctx.lineTo(lx - 13, ly + 5);
        ctx.closePath();
        ctx.fill();
        outline(ctx, 0.5);
        arm(ctx, 2.8, -30, 5, -26, st >= 2 ? '#9aa3ad' : col.main, st >= 2);
      }
      ctx.restore();
      break;
    }
    case 'catapult': {
      const wood = '#9a6634', woodD = '#5c3b1b', iron = '#4b4f55';
      const beam = (x0, y0, x1, y1, w, c = wood) => {
        ctx.strokeStyle = 'rgba(20,14,10,0.85)';
        ctx.lineWidth = w + 1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,220,170,0.35)';
        ctx.lineWidth = w * 0.3;
        ctx.beginPath();
        ctx.moveTo(x0, y0 - w * 0.2);
        ctx.lineTo(x1, y1 - w * 0.2);
        ctx.stroke();
      };
      const wheel = (x, y, r, far) => {
        ctx.fillStyle = far ? shade(woodD, -0.2) : grad(ctx, x - r, x + r, shade(wood, 0.25), woodD);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        outline(ctx, 0.8);
        ctx.strokeStyle = iron;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, r - 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = woodD;
        ctx.lineWidth = 0.9;
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3 + 0.3;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * (r - 1), y + Math.sin(a) * (r - 1));
          ctx.stroke();
        }
        ctx.fillStyle = iron;
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      };
      wheel(-9, -1, 5.5, true);
      wheel(12, -1, 5.5, true);
      // Rahmen
      beam(-15, -4, 16, -4, 4);
      beam(-14, -7, 15, -7, 2.4, shade(wood, -0.1));
      for (const bx of [-8, 3]) {
        ctx.fillStyle = iron;
        ctx.fillRect(bx, -9, 1.6, 7);
      }
      // A-Gestell mit gepolstertem Querbalken
      beam(-4, -5, 1, -22, 2.8);
      beam(6, -5, 1, -22, 2.8);
      beam(-2, -21, 4, -21, 3.2, '#7a3b28');
      // Seilwinde
      ctx.fillStyle = grad(ctx, 4, 12, '#c9a56b', '#7a5a2e');
      ctx.beginPath();
      ctx.ellipse(8, -8, 3.4, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      outline(ctx, 0.6);
      ctx.strokeStyle = 'rgba(80,55,25,0.8)';
      ctx.lineWidth = 0.5;
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(8 + k, -10.4);
        ctx.lineTo(8 + k, -5.6);
        ctx.stroke();
      }
      // Wurfarm mit Schale und Stein
      beam(11, -6, -12, -33, 2.6, woodD);
      ctx.strokeStyle = '#d8c79e';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(8, -8);
      ctx.lineTo(4, -12);
      ctx.stroke();
      ctx.fillStyle = grad(ctx, -17, -8, '#a0703c', '#4e3017');
      ctx.beginPath();
      ctx.ellipse(-13, -34, 4.6, 2.6, -0.7, 0, Math.PI * 2);
      ctx.fill();
      outline(ctx, 0.7);
      const rg = ctx.createRadialGradient(-14.5, -38, 0.5, -13.5, -36.5, 4);
      rg.addColorStop(0, hasUp('c3b') ? '#d6b98c' : '#c9c4bb');
      rg.addColorStop(1, hasUp('c3b') ? '#6b4a22' : '#5f5a53');
      ctx.fillStyle = rg;
      if (hasUp('c3b')) {
        // Streugeschosse: viele kleine Steine
        for (const [sx, sy] of [[-15.5, -37], [-12, -38.5], [-13.5, -35], [-11, -35.8], [-16, -34.5]]) {
          ctx.beginPath();
          ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
          ctx.fill();
          outline(ctx, 0.4);
        }
      } else {
        ctx.beginPath();
        ctx.arc(-13.5, -36.5, hasUp('c3a') ? 3.9 : 3.4, 0, Math.PI * 2);
        ctx.fill();
        outline(ctx, 0.6);
      }
      if (FIG.stage >= 5) {
        // Brandladung
        const fg = ctx.createRadialGradient(-13.5, -39, 0.5, -13.5, -39, 6);
        fg.addColorStop(0, 'rgba(255,240,180,0.95)');
        fg.addColorStop(0.5, 'rgba(255,120,20,0.7)');
        fg.addColorStop(1, 'rgba(220,40,0,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(-13.5, -39, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      // Wimpel
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(14.5, -6);
      ctx.lineTo(14.5, -22);
      ctx.stroke();
      ctx.fillStyle = col.main;
      ctx.beginPath();
      ctx.moveTo(14.5, -22);
      ctx.quadraticCurveTo(19, -22, 23, -19.5);
      ctx.lineTo(14.5, -16.5);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 0.5);
      wheel(-11, 1.5, 6.2, false);
      wheel(10, 1.5, 6.2, false);
      break;
    }
    case 'mage': {
      cape(ctx, 0, 6, col, 21, 9);
      // Stab mit Kristall
      ctx.strokeStyle = 'rgba(20,14,10,0.85)';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(9, 6);
      ctx.quadraticCurveTo(11, -14, 10, -34);
      ctx.stroke();
      ctx.strokeStyle = grad(ctx, 8, 12, '#a87a4c', '#4d3018');
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.strokeStyle = '#6b4a2b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, -33);
      ctx.quadraticCurveTo(7, -36, 8, -39);
      ctx.moveTo(10, -33);
      ctx.quadraticCurveTo(13, -36, 12, -39);
      ctx.stroke();
      // Kriegsmagier: Feuerkugel · Heiliger Hüter: goldenes Licht
      const glow = ctx.createRadialGradient(10, -37, 0.5, 10, -37, hasUp('m3a') ? 11 : 9);
      glow.addColorStop(0, 'rgba(255,255,255,1)');
      glow.addColorStop(0.3, hasUp('m3a') ? 'rgba(255,140,40,0.95)' : hasUp('m3b') ? 'rgba(253,224,71,0.95)' : 'rgba(147,220,255,0.95)');
      glow.addColorStop(1, hasUp('m3a') ? 'rgba(239,68,68,0)' : hasUp('m3b') ? 'rgba(250,204,21,0)' : 'rgba(125,211,252,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(10, -37, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e0f7ff';
      ctx.beginPath();
      ctx.moveTo(10, -40.5);
      ctx.lineTo(11.6, -37);
      ctx.lineTo(10, -34);
      ctx.lineTo(8.4, -37);
      ctx.closePath();
      ctx.fill();
      // Robe
      ctx.fillStyle = cloth(ctx, -8, 8, col);
      ctx.beginPath();
      ctx.moveTo(-8.5, 6);
      ctx.lineTo(-4.8, -16);
      ctx.quadraticCurveTo(0, -18.5, 4.8, -16);
      ctx.lineTo(8.5, 6);
      ctx.quadraticCurveTo(0, 8.5, -8.5, 6);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 0.9);
      ctx.strokeStyle = '#e9c45a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -16.5);
      ctx.lineTo(0, 6.5);
      ctx.moveTo(-8.2, 5.2);
      ctx.quadraticCurveTo(0, 7.6, 8.2, 5.2);
      ctx.stroke();
      ctx.fillStyle = '#3b2616';
      ctx.fillRect(-5.2, -7, 10.4, 1.8);
      ctx.fillStyle = '#7a4b22';
      ctx.fillRect(-4.5, -5.3, 2.6, 3);
      // Arm zum Stab
      ctx.strokeStyle = 'rgba(20,14,10,0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(3.5, -14);
      ctx.lineTo(9.5, -12);
      ctx.stroke();
      ctx.strokeStyle = col.main;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.arc(10, -12.2, 1.6, 0, Math.PI * 2);
      ctx.fill();
      // Kopf mit langem Bart
      face(ctx, 0, -20.5);
      ctx.fillStyle = grad(ctx, -4, 4, '#ffffff', '#c9ccd1');
      ctx.beginPath();
      ctx.moveTo(-3.8, -20);
      ctx.quadraticCurveTo(-3, -10, 0, -8);
      ctx.quadraticCurveTo(3, -10, 3.8, -20);
      ctx.quadraticCurveTo(0, -17.5, -3.8, -20);
      ctx.fill();
      outline(ctx, 0.5);
      // Spitzhut mit Hutband und Sternen
      ctx.fillStyle = cloth(ctx, -7, 7, col);
      ctx.beginPath();
      ctx.moveTo(-7.5, -23);
      ctx.quadraticCurveTo(0, -25.5, 7.5, -23);
      ctx.lineTo(2.5, -28);
      ctx.quadraticCurveTo(1.5, -37, -4.5, -42);
      ctx.quadraticCurveTo(-2, -34, -3, -28);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 0.8);
      ctx.fillStyle = '#e9c45a';
      ctx.beginPath();
      ctx.moveTo(-3.3, -26.5);
      ctx.quadraticCurveTo(0, -27.6, 3, -26.6);
      ctx.lineTo(2.6, -25.2);
      ctx.quadraticCurveTo(0, -26, -3.5, -25.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff3b0';
      for (const [sx, sy, r] of [[-1, -31, 1], [1, -34.5, 0.7], [-2.6, -37, 0.6]]) {
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'troll':
      drawTroll(ctx, col);
      break;
    case 'dragon':
      drawDragon(ctx, col);
      break;
    case 'basilisk':
      drawBasilisk(ctx, col);
      break;
    case 'trebuchet':
      drawTrebuchet(ctx, col);
      break;
  }
  ctx.restore();
}

// Basilisk: geschuppte Riesenechse mit Kamm in Spielerfarbe und glühendem Versteinerungsblick
function drawBasilisk(ctx, col) {
  const sc = '#3f6b2a', scD = '#1b3010', scL = '#8fbf5a', belly = '#d9cf8a';
  const body = (x0, y0, r) => {
    const g = ctx.createRadialGradient(x0 - r * 0.4, y0 - r * 0.5, r * 0.1, x0, y0, r);
    g.addColorStop(0, scL);
    g.addColorStop(0.5, sc);
    g.addColorStop(1, scD);
    return g;
  };
  ctx.lineCap = 'round';
  // Schwanz in S-Kurve nach hinten links
  ctx.strokeStyle = scD;
  ctx.lineWidth = 7.5;
  ctx.beginPath();
  ctx.moveTo(-4, 2);
  ctx.bezierCurveTo(-16, 6, -24, 0, -22, -8);
  ctx.bezierCurveTo(-21, -14, -28, -17, -33, -12);
  ctx.stroke();
  ctx.strokeStyle = sc;
  ctx.lineWidth = 5.5;
  ctx.stroke();
  ctx.strokeStyle = scL;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.bezierCurveTo(-16, 3, -22, -2, -21, -9);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Schwanzstachel
  ctx.fillStyle = col.main;
  ctx.beginPath();
  ctx.moveTo(-31, -14);
  ctx.lineTo(-37, -17);
  ctx.lineTo(-34, -10);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.7);
  // Hinterbeine
  const leg = (x, y, dx, far) => {
    ctx.strokeStyle = far ? scD : sc;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dx, y + 2, x + dx * 0.6, y + 8);
    ctx.stroke();
    ctx.strokeStyle = '#efe6c8';
    ctx.lineWidth = 0.9;
    for (const k of [-1.6, 0, 1.6]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * 0.6 + k, y + 8);
      ctx.lineTo(x + dx * 0.6 + k * 1.6 + 1, y + 10);
      ctx.stroke();
    }
  };
  leg(-9, -2, -4, true);
  leg(7, -4, 4, true);
  // Rumpf
  ctx.fillStyle = body(-1, -6, 14);
  ctx.beginPath();
  ctx.ellipse(-1, -5, 13, 8, -0.15, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 0.9);
  // Bauchschuppen
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(1, 0, 9, 3, -0.1, 0, Math.PI);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,70,30,0.55)';
  ctx.lineWidth = 0.6;
  for (let i = -6; i <= 8; i += 2.4) {
    ctx.beginPath();
    ctx.moveTo(i, 0.5);
    ctx.lineTo(i + 0.6, 2.8);
    ctx.stroke();
  }
  // Schuppenmuster
  ctx.strokeStyle = 'rgba(20,40,10,0.55)';
  ctx.lineWidth = 0.6;
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 6; i++) {
      const sx = -10 + i * 4 + (r % 2) * 2, sy = -10 + r * 3;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.6, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }
  }
  shine(ctx, -5, -10, 5, 2, 0.25);
  // Rückenkamm in Spielerfarbe
  ctx.fillStyle = cloth(ctx, -12, 8, col);
  ctx.beginPath();
  ctx.moveTo(-12, -9);
  for (let i = 0; i < 5; i++) {
    const x = -11 + i * 4.4;
    ctx.lineTo(x + 1.2, -18 - (i === 2 ? 3 : 0) + Math.abs(i - 2) * 1.2);
    ctx.lineTo(x + 3.2, -12.5);
  }
  ctx.lineTo(10, -10);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.7);
  // Vorderbeine
  leg(-6, 0, -3, false);
  leg(8, -1, 3, false);
  // Hals und Kopf, erhoben nach rechts
  ctx.fillStyle = body(12, -16, 9);
  ctx.beginPath();
  ctx.moveTo(6, -10);
  ctx.quadraticCurveTo(12, -14, 13, -24);
  ctx.lineTo(19, -24);
  ctx.quadraticCurveTo(18, -12, 11, -3);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.8);
  ctx.fillStyle = body(17, -28, 8);
  ctx.beginPath();
  ctx.moveTo(10, -26);
  ctx.quadraticCurveTo(13, -33, 20, -32);
  ctx.quadraticCurveTo(28, -31, 30, -26);
  ctx.quadraticCurveTo(27, -22, 20, -21);
  ctx.quadraticCurveTo(13, -21, 10, -26);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.9);
  // Maul mit Zähnen und Zunge
  ctx.strokeStyle = scD;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(30, -25.5);
  ctx.quadraticCurveTo(24, -24, 18, -24.5);
  ctx.stroke();
  ctx.fillStyle = '#fff8e0';
  for (const tx of [21, 24, 27]) {
    ctx.beginPath();
    ctx.moveTo(tx, -24.6);
    ctx.lineTo(tx + 0.8, -22.8);
    ctx.lineTo(tx + 1.6, -24.8);
    ctx.fill();
  }
  ctx.strokeStyle = '#c0263a';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(30, -25.5);
  ctx.lineTo(34, -24.5);
  ctx.moveTo(34, -24.5);
  ctx.lineTo(36, -26);
  ctx.moveTo(34, -24.5);
  ctx.lineTo(36, -23.5);
  ctx.stroke();
  // Kopfkrone (Kamm) in Spielerfarbe mit Goldspitzen
  ctx.fillStyle = cloth(ctx, 10, 22, col);
  ctx.beginPath();
  ctx.moveTo(11, -28);
  ctx.lineTo(10, -38);
  ctx.lineTo(14, -32);
  ctx.lineTo(16, -41);
  ctx.lineTo(18, -32.5);
  ctx.lineTo(22, -38);
  ctx.lineTo(21, -31);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.7);
  ctx.fillStyle = '#f2d27a';
  for (const [gx, gy] of [[10, -38], [16, -41], [22, -38]]) {
    ctx.beginPath();
    ctx.arc(gx, gy, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  // Glühendes Auge
  const eg = ctx.createRadialGradient(22, -28, 0, 22, -28, 6);
  eg.addColorStop(0, 'rgba(255,240,120,0.95)');
  eg.addColorStop(0.35, 'rgba(190,255,80,0.55)');
  eg.addColorStop(1, 'rgba(120,255,60,0)');
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.arc(22, -28, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff36b';
  ctx.beginPath();
  ctx.ellipse(22, -28, 2.1, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(22.2, -28, 0.5, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nüster
  ctx.fillStyle = scD;
  ctx.beginPath();
  ctx.arc(28, -28, 0.6, 0, Math.PI * 2);
  ctx.fill();
}

// Tribok: hohes Gestell, langer Wurfarm mit Schlinge, schwerer Gegengewichtskasten
function drawTrebuchet(ctx, col) {
  const wood = '#9a6634', woodD = '#5c3b1b', iron = '#4b4f55';
  const beam = (x0, y0, x1, y1, w, c = wood) => {
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(20,14,10,0.85)';
    ctx.lineWidth = w + 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,170,0.3)';
    ctx.lineWidth = w * 0.3;
    ctx.beginPath();
    ctx.moveTo(x0 - w * 0.2, y0 - w * 0.2);
    ctx.lineTo(x1 - w * 0.2, y1 - w * 0.2);
    ctx.stroke();
  };
  // Hinteres Gestell (dunkler)
  beam(-12, -4, -2, -46, 3, woodD);
  beam(10, -4, 0, -46, 3, woodD);
  // Schlitten
  beam(-20, 0, 20, 0, 4.2);
  beam(-17, -6, 17, -6, 2.6, shade(wood, -0.1));
  for (const bx of [-14, -2, 10]) {
    ctx.fillStyle = iron;
    ctx.fillRect(bx, -8, 1.6, 10);
  }
  // Gegengewichtskasten an der kurzen Seite (rechts), hängt am Drehpunkt
  const px = 1, py = -46;
  const kx = 13, ky = -36;
  beam(px, py, kx, ky, 3.2, woodD);
  ctx.strokeStyle = '#3a3f45';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(kx - 3, ky + 1);
  ctx.lineTo(kx - 5, ky + 8);
  ctx.moveTo(kx + 3, ky + 1);
  ctx.lineTo(kx + 5, ky + 8);
  ctx.stroke();
  ctx.fillStyle = grad(ctx, kx - 7, kx + 7, '#a97a45', '#4e3017');
  ctx.beginPath();
  ctx.moveTo(kx - 7, ky + 7);
  ctx.lineTo(kx + 7, ky + 7);
  ctx.lineTo(kx + 6, ky + 18);
  ctx.lineTo(kx - 6, ky + 18);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.8);
  // Steinfüllung und Eisenbänder
  ctx.fillStyle = '#8d877e';
  for (const [sx, sy, r] of [[-3.5, 8.5, 1.8], [0, 7.8, 2], [3.6, 8.6, 1.7]]) {
    ctx.beginPath();
    ctx.arc(kx + sx, ky + sy, r, Math.PI, 0);
    ctx.fill();
  }
  ctx.fillStyle = iron;
  ctx.fillRect(kx - 6.6, ky + 11, 13.2, 1.4);
  ctx.fillRect(kx - 6.2, ky + 15.5, 12.4, 1.4);
  ctx.fillStyle = '#c9ccd1';
  for (const rx of [-5, 0, 5]) ctx.fillRect(kx + rx - 0.5, ky + 11.2, 1, 1);
  // Langer Wurfarm nach hinten oben links, mit Schlinge und Stein
  const ax = -30, ay = -70;
  beam(px, py, ax, ay, 2.8);
  ctx.strokeStyle = '#d8c79e';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(ax - 6, ay + 10, ax - 2, ay + 18);
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(ax + 3, ay + 10, ax + 1, ay + 18);
  ctx.stroke();
  // Geschoss: Steinkugel · Riesenkugel · Sprengbombe mit glimmender Lunte
  const pr = hasUp('t3b') ? 4.4 : 3;
  const rg = ctx.createRadialGradient(ax - 1.6, ay + 17.6, 0.4, ax - 0.5, ay + 19, pr + 0.4);
  rg.addColorStop(0, hasUp('t3a') ? '#6b7280' : '#d2cdc4');
  rg.addColorStop(1, hasUp('t3a') ? '#0f1115' : '#5f5a53');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(ax - 0.5, ay + 19.5, pr, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 0.6);
  if (hasUp('t3a')) {
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(ax + 1.5, ay + 17);
    ctx.quadraticCurveTo(ax + 4, ay + 14, ax + 5, ay + 15);
    ctx.stroke();
    const sg = ctx.createRadialGradient(ax + 5, ay + 15, 0.2, ax + 5, ay + 15, 3);
    sg.addColorStop(0, 'rgba(255,255,200,1)');
    sg.addColorStop(0.5, 'rgba(255,150,40,0.8)');
    sg.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(ax + 5, ay + 15, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Vorderes Gestell
  beam(-10, -4, 0, -46, 3.4);
  beam(12, -4, 2, -46, 3.4);
  beam(-6, -24, 8, -24, 2.4, shade(wood, -0.05));
  // Drehachse
  ctx.fillStyle = iron;
  ctx.beginPath();
  ctx.arc(px, py, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9ccd1';
  ctx.beginPath();
  ctx.arc(px - 0.6, py - 0.6, 0.8, 0, Math.PI * 2);
  ctx.fill();
  // Wimpel in Spielerfarbe
  beam(-16, -2, -16, -26, 1.2, woodD);
  ctx.fillStyle = cloth(ctx, -16, -4, col);
  ctx.beginPath();
  ctx.moveTo(-16, -26);
  ctx.lineTo(-5, -23);
  ctx.lineTo(-16, -19);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.6);
}

// Burghof: Pflaster auf den 6 Burgfeldern um den Bergfried
export function drawCourt(ctx, x, y, H, seed) {
  const s = H / 40;
  const g = ctx.createLinearGradient(x - H, y - H, x + H, y + H);
  g.addColorStop(0, '#ddcfae');
  g.addColorStop(1, '#a8946c');
  ctx.fillStyle = g;
  hexPath(ctx, x, y, H - 1);
  ctx.fill();
  ctx.save();
  hexPath(ctx, x, y, H - 1);
  ctx.clip();
  // Pflastersteine in versetzten Reihen
  ctx.strokeStyle = 'rgba(95,75,45,0.35)';
  ctx.lineWidth = 0.8 * s;
  const bw = 8 * s, bh = 5 * s;
  for (let r = -6; r <= 6; r++) {
    const yy = y + r * bh;
    ctx.beginPath();
    ctx.moveTo(x - H, yy);
    ctx.lineTo(x + H, yy);
    ctx.stroke();
    for (let c = -6; c <= 6; c++) {
      const xx = x + c * bw + (r & 1) * bw * 0.5;
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx, yy + bh);
      ctx.stroke();
    }
  }
  for (let k = 0; k < 7; k++) {
    const px = x + (hash(seed * 13 + k) - 0.5) * H * 1.4, py = y + (hash(seed * 29 + k) - 0.5) * H * 1.4;
    ctx.fillStyle = hash(seed + k * 3) > 0.5 ? 'rgba(255,250,235,0.25)' : 'rgba(70,55,30,0.18)';
    ctx.fillRect(px, py, bw * 0.9, bh * 0.8);
  }
  ctx.restore();
}

// Große Burg über 7 Felder: Ringmauer mit sechs Ecktürmen, Torhaus und Bergfried in der Mitte
export const CASTLE_BOX = { left: 3.1, right: 3.1, top: 4.4, bottom: 2.6 }; // in Hexgrößen
export function drawCastle(ctx, city, x, y, H, col) {
  const s = H / 40;
  const R = 2.42 * H, wh = 15 * s, wt = 4 * s;
  const P = [];
  for (let k = 0; k < 6; k++) P.push([x + Math.cos((Math.PI / 3) * k) * R, y + Math.sin((Math.PI / 3) * k) * R]);
  const seg = (k, front) => {
    const [ax, ay] = P[k], [bx, by] = P[(k + 1) % 6];
    // Mauerfläche
    const g = ctx.createLinearGradient(0, Math.min(ay, by) - wh, 0, Math.max(ay, by));
    g.addColorStop(0, front ? '#e9dfc8' : '#b9ab8e');
    g.addColorStop(1, front ? '#a99a7c' : '#7f7360');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx, by - wh);
    ctx.lineTo(ax, ay - wh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,45,25,0.6)';
    ctx.lineWidth = 0.9 * s;
    ctx.stroke();
    // Steinlagen
    ctx.strokeStyle = 'rgba(80,65,45,0.28)';
    ctx.lineWidth = 0.6 * s;
    for (let f = 0.25; f < 1; f += 0.25) {
      ctx.beginPath();
      ctx.moveTo(ax, ay - wh * f);
      ctx.lineTo(bx, by - wh * f);
      ctx.stroke();
    }
    // Wehrgang oben
    ctx.fillStyle = front ? '#d8ccb2' : '#cfc3a8';
    ctx.beginPath();
    ctx.moveTo(ax, ay - wh);
    ctx.lineTo(bx, by - wh);
    ctx.lineTo(bx, by - wh - wt);
    ctx.lineTo(ax, ay - wh - wt);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,45,25,0.55)';
    ctx.stroke();
    // Zinnen auf der Außenkante
    const n = 9;
    ctx.fillStyle = '#efe6d2';
    for (let i = 0; i < n; i++) {
      const t0 = (i + 0.15) / n, t1 = (i + 0.6) / n;
      const x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0 - wh - (front ? 0 : wt);
      const x1 = ax + (bx - ax) * t1, y1 = ay + (by - ay) * t1 - wh - (front ? 0 : wt);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1, y1 - 3.5 * s);
      ctx.lineTo(x0, y0 - 3.5 * s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,45,25,0.5)';
      ctx.lineWidth = 0.5 * s;
      ctx.stroke();
    }
    // Schießscharten und Banner auf der Vorderseite
    if (front) {
      ctx.fillStyle = '#2b2118';
      for (const t of [0.25, 0.75]) {
        const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
        ctx.fillRect(mx - 0.7 * s, my - wh * 0.7, 1.4 * s, 4 * s);
      }
    }
  };
  const cornerTower = (k) => {
    const [tx, ty] = P[k];
    const top = turret(ctx, tx, ty + 2 * s, 7.5 * s, 30 * s, col, s);
    flag(ctx, tx, top, 9 * s, col, s, k === 4 || k === 5);
  };
  // Rückseite: Mauern und Türme hinten
  for (const k of [3, 4, 5]) seg(k, false);
  cornerTower(4);
  cornerTower(5);
  cornerTower(3);
  cornerTower(0);
  // Bergfried in der Mitte (immer als prächtige Burg)
  const keep = { ...city, level: 5, stars: city.level, buildings: ['farm', 'mine', 'lumber', 'barracks', 'market', ...(city.buildings || []).filter((b) => b === 'dragonlair')] };
  drawCity(ctx, keep, x, y - 6 * s, H * 1.45, col);
  // Vorderseite mit Torhaus
  for (const k of [2, 0]) seg(k, true);
  seg(1, true);
  const gx = x, gy = y + R * Math.sin(Math.PI / 3);
  // Torhaus: zwei Tortürme und ein Bogen mit Fallgitter
  ctx.fillStyle = stone(ctx, gx - 14 * s, gx + 14 * s);
  ctx.fillRect(gx - 12 * s, gy - wh - 8 * s, 24 * s, wh + 8 * s);
  ctx.strokeStyle = 'rgba(60,45,25,0.6)';
  ctx.lineWidth = 0.9 * s;
  ctx.strokeRect(gx - 12 * s, gy - wh - 8 * s, 24 * s, wh + 8 * s);
  merlons(ctx, gx - 12 * s, gx + 12 * s, gy - wh - 8 * s, s, 5);
  ctx.fillStyle = '#2a1d12';
  ctx.beginPath();
  ctx.moveTo(gx - 6 * s, gy);
  ctx.lineTo(gx - 6 * s, gy - 9 * s);
  ctx.arc(gx, gy - 9 * s, 6 * s, Math.PI, 0);
  ctx.lineTo(gx + 6 * s, gy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,150,160,0.8)';
  ctx.lineWidth = 0.7 * s;
  for (let k = -4; k <= 4; k += 2) {
    ctx.beginPath();
    ctx.moveTo(gx + k * s, gy - 1 * s);
    ctx.lineTo(gx + k * s, gy - 13 * s);
    ctx.stroke();
  }
  for (let yy = gy - 3 * s; yy > gy - 13 * s; yy -= 3 * s) {
    ctx.beginPath();
    ctx.moveTo(gx - 5.5 * s, yy);
    ctx.lineTo(gx + 5.5 * s, yy);
    ctx.stroke();
  }
  banner(ctx, gx - 9 * s, gy - wh - 4 * s, 4 * s, 11 * s, col, s);
  banner(ctx, gx + 9 * s, gy - wh - 4 * s, 4 * s, 11 * s, col, s);
  cornerTower(2);
  cornerTower(1);
}

// Schwarzer Troll: gebeugter Koloss mit Steinhammer, Stachel-Schulterpanzer, Kette und Kriegsbemalung
function drawTroll(ctx, col) {
  const skin = '#363d48', skinD = '#14171c', skinL = '#6c7787';
  const skinGrad = (x0, y0, r) => {
    const g = ctx.createRadialGradient(x0 - r * 0.35, y0 - r * 0.35, r * 0.1, x0, y0, r);
    g.addColorStop(0, skinL);
    g.addColorStop(0.55, skin);
    g.addColorStop(1, skinD);
    return g;
  };
  const limb = (pts, w, fill) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(10,8,6,0.9)';
    ctx.lineWidth = w + 1.6;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
    ctx.strokeStyle = fill;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  // Hinterer Arm hängt bis fast zum Boden
  limb([[-12, -40], [-19, -24], [-18, -8]], 7.5, grad(ctx, -22, -12, skin, skinD));
  ctx.fillStyle = skinGrad(-18, -5, 5);
  ctx.beginPath();
  ctx.ellipse(-18, -5, 4.6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 0.7);
  // Beine, leicht gebeugt, mit Fellwickeln
  for (const [hx, kx, fx] of [[-7, -10, -9], [5, 7, 6]]) {
    limb([[hx, -14], [kx, -4], [fx, 3]], 7.5, grad(ctx, kx - 5, kx + 5, skinL, skinD));
    ctx.fillStyle = grad(ctx, fx - 5, fx + 5, '#8a6a46', '#3b2a1a');
    ctx.beginPath();
    ctx.ellipse(fx, -1, 4.6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx, 0.6);
    ctx.fillStyle = skinD;
    ctx.beginPath();
    ctx.ellipse(fx + 1.2, 5, 5.5, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8d0bd';
    for (let k = 0; k < 3; k++) ctx.fillRect(fx + 2.6 + k * 1.6, 5.2, 1.2, 1.3);
  }
  // Rumpf mit Buckel
  ctx.fillStyle = skinGrad(-2, -34, 24);
  ctx.beginPath();
  ctx.moveTo(-11, -12);
  ctx.quadraticCurveTo(-20, -26, -15, -42);
  ctx.quadraticCurveTo(-8, -54, 4, -50);
  ctx.quadraticCurveTo(15, -46, 15, -34);
  ctx.quadraticCurveTo(16, -20, 10, -12);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 1.2);
  // Muskeln: Brust, Bauch, Rückenlinie
  ctx.strokeStyle = 'rgba(0,0,0,0.38)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-3, -40);
  ctx.quadraticCurveTo(4, -34, 13, -38);
  ctx.moveTo(4, -34);
  ctx.quadraticCurveTo(5, -26, 4, -16);
  ctx.moveTo(-2, -27);
  ctx.quadraticCurveTo(4, -24, 11, -27);
  ctx.moveTo(-1, -21);
  ctx.quadraticCurveTo(4, -19, 10, -21);
  ctx.moveTo(-12, -44);
  ctx.quadraticCurveTo(-16, -32, -12, -18);
  ctx.stroke();
  shine(ctx, -9, -44, 3, 6, 0.2);
  shine(ctx, 6, -37, 2.5, 1.6, 0.2);
  // Kriegsbemalung in Spielerfarbe
  ctx.strokeStyle = col.main;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  for (const [x0, y0, x1, y1] of [[-8, -30, -4, -33], [-8, -26, -4, -29], [-9, -22, -5, -25]]) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  // Kette quer über die Brust
  for (let k = 0; k <= 9; k++) {
    const t = k / 9;
    const cx = -12 + 24 * t, cy = -45 + 31 * t + Math.sin(t * Math.PI) * 2;
    ctx.strokeStyle = '#2c3036';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 1.6, 1, 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#a7afb8';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  // Gürtel mit Schädeln und Lendenschurz
  ctx.fillStyle = grad(ctx, -12, 11, '#6b4a2e', '#2e1d12');
  ctx.fillRect(-12, -15, 23, 3.4);
  outline(ctx, 0.6);
  ctx.fillStyle = cloth(ctx, -11, 11, col);
  ctx.beginPath();
  ctx.moveTo(-11, -11.6);
  ctx.lineTo(10, -11.6);
  ctx.lineTo(8, -2);
  ctx.lineTo(5, -4.5);
  ctx.lineTo(2.5, 0);
  ctx.lineTo(-1, -4);
  ctx.lineTo(-4.5, 0.5);
  ctx.lineTo(-7, -4);
  ctx.lineTo(-10, -2);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.7);
  ctx.strokeStyle = '#e9c45a';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-11, -10.8);
  ctx.lineTo(10, -10.8);
  ctx.stroke();
  for (const sx of [-7, 4]) {
    ctx.fillStyle = grad(ctx, sx - 2.4, sx + 2.4, '#f3eddc', '#a89f8a');
    ctx.beginPath();
    ctx.arc(sx, -13, 2.4, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx, 0.5);
    ctx.fillStyle = '#2a2018';
    ctx.beginPath();
    ctx.arc(sx - 0.9, -13.4, 0.6, 0, Math.PI * 2);
    ctx.arc(sx + 0.9, -13.4, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Kopf weit vorne, schwere Stirn, vorstehender Kiefer
  ctx.fillStyle = skinGrad(8, -50, 9);
  ctx.beginPath();
  ctx.moveTo(1, -50);
  ctx.quadraticCurveTo(2, -58, 9, -58);
  ctx.quadraticCurveTo(16, -57, 16, -50);
  ctx.quadraticCurveTo(18, -44, 13, -42);
  ctx.quadraticCurveTo(6, -40, 3, -44);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(10, -51.5, 5.5, 2, -0.1, 0, Math.PI * 2);
  ctx.fill();
  // Hörner, nach hinten geschwungen
  ctx.fillStyle = grad(ctx, -8, 8, '#f1eadb', '#8f846f');
  ctx.beginPath();
  ctx.moveTo(4, -56);
  ctx.quadraticCurveTo(-4, -62, -6, -70);
  ctx.quadraticCurveTo(-1, -64, 7, -58);
  ctx.closePath();
  ctx.moveTo(10, -58);
  ctx.quadraticCurveTo(6, -66, 8, -73);
  ctx.quadraticCurveTo(11, -66, 13, -58);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.6);
  // Glühende Augen
  ctx.fillStyle = '#ff3b2f';
  ctx.shadowColor = '#ff2a1f';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.ellipse(8.5, -51.4, 1.3, 0.8, 0, 0, Math.PI * 2);
  ctx.ellipse(13.5, -51.4, 1.1, 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // Kriegsbemalung im Gesicht
  ctx.strokeStyle = col.main;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, -49);
  ctx.lineTo(7, -46);
  ctx.moveTo(15, -49);
  ctx.lineTo(14.5, -46.5);
  ctx.stroke();
  // Hauer
  ctx.fillStyle = '#f5f0e2';
  ctx.beginPath();
  ctx.moveTo(7, -43.5);
  ctx.quadraticCurveTo(6, -47.5, 7.5, -49);
  ctx.lineTo(8.5, -43.6);
  ctx.closePath();
  ctx.moveTo(13, -43.8);
  ctx.quadraticCurveTo(13.5, -47.5, 15, -48.5);
  ctx.lineTo(14.5, -43.4);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.4);
  // Vorderer Arm schultert den Steinhammer
  ctx.strokeStyle = 'rgba(10,8,6,0.9)';
  ctx.lineWidth = 4.6;
  ctx.beginPath();
  ctx.moveTo(19, -16);
  ctx.lineTo(25, -60);
  ctx.stroke();
  ctx.strokeStyle = grad(ctx, 18, 26, '#9a6a3c', '#3e2614');
  ctx.lineWidth = 3.2;
  ctx.stroke();
  ctx.strokeStyle = '#2c3036';
  ctx.lineWidth = 1;
  for (const t of [0.15, 0.25]) {
    ctx.beginPath();
    ctx.moveTo(19 + 6 * t - 2, -16 - 44 * t);
    ctx.lineTo(19 + 6 * t + 2, -16 - 44 * t);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(25.5, -63);
  ctx.rotate(0.14);
  ctx.fillStyle = grad(ctx, -9, 9, '#a39d93', '#4a4640');
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-9, -6, 18, 12, 3) : ctx.rect(-9, -6, 18, 12);
  ctx.fill();
  outline(ctx, 1);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-5, -6);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 6);
  ctx.moveTo(4, -6);
  ctx.lineTo(2, 2);
  ctx.stroke();
  ctx.fillStyle = steel(ctx, -9, 9);
  ctx.fillRect(-2.2, -6.5, 4.4, 13);
  outline(ctx, 0.5);
  ctx.strokeRect(-2.2, -6.5, 4.4, 13);
  for (const [sx, sy] of [[-9, -2], [9, -2], [-9, 3], [9, 3]]) {
    ctx.fillStyle = steel(ctx, sx - 2, sx + 2);
    ctx.beginPath();
    ctx.moveTo(sx, sy - 1.4);
    ctx.lineTo(sx + Math.sign(sx) * 3, sy);
    ctx.lineTo(sx, sy + 1.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  limb([[11, -40], [17, -30], [19, -20]], 7.5, grad(ctx, 10, 22, skinL, skinD));
  ctx.fillStyle = skinGrad(19.5, -19, 4.6);
  ctx.beginPath();
  ctx.ellipse(19.5, -19, 4.4, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 0.7);
  // Stachel-Schulterpanzer
  ctx.fillStyle = steel(ctx, 3, 17, -44, -32);
  ctx.beginPath();
  ctx.ellipse(9, -36.5, 7.5, 5, -0.3, Math.PI * 0.95, Math.PI * 2.05);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.8);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(9, -36.5, 5.5, 3.4, -0.3, Math.PI * 1.1, Math.PI * 1.6);
  ctx.stroke();
  for (const [sx, sy] of [[4, -40], [8, -42.5], [12.5, -42]]) {
    ctx.fillStyle = steel(ctx, sx - 1.5, sx + 1.5);
    ctx.beginPath();
    ctx.moveTo(sx - 1.4, sy + 1);
    ctx.lineTo(sx, sy - 4.5);
    ctx.lineTo(sx + 1.4, sy + 1);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.4);
  }
}

// Drache: dunkle Schuppen, Flügelhäute in Spielerfarbe, glühendes Maul
function drawDragon(ctx, col) {
  const sc = '#4a1d1d', scD = '#1f0b0b', scL = '#8a3a2c', belly = '#d8a560';
  const memb = (x0, y0) => {
    const g = ctx.createLinearGradient(x0, y0, x0 - 30, y0 - 40);
    g.addColorStop(0, shade(col.dark, -0.2));
    g.addColorStop(1, col.main);
    return g;
  };
  // Hinterer Flügel
  const wing = (bx, by, tips, far) => {
    ctx.fillStyle = memb(bx, by);
    ctx.globalAlpha = far ? 0.8 : 1;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tips[0][0], tips[0][1]);
    for (let k = 1; k < tips.length; k++) {
      const [px, py] = tips[k - 1], [qx, qy] = tips[k];
      ctx.quadraticCurveTo((px + qx) / 2 + 2, (py + qy) / 2 + 5, qx, qy);
    }
    ctx.quadraticCurveTo(bx - 4, by + 4, bx + 3, by + 4);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.8);
    ctx.globalAlpha = 1;
    // Flügelknochen
    ctx.strokeStyle = scD;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (const [tx, ty] of tips) {
      ctx.beginPath();
      ctx.moveTo(tips[0][0], tips[0][1]);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tips[0][0], tips[0][1]);
    ctx.stroke();
    ctx.fillStyle = '#e8e0d0';
    ctx.beginPath();
    ctx.arc(tips[0][0], tips[0][1], 1.2, 0, Math.PI * 2);
    ctx.fill();
  };
  wing(4, -24, [[10, -50], [2, -60], [-6, -58], [-12, -50], [-14, -40]], true);
  // Schwanz
  ctx.fillStyle = grad(ctx, -34, -6, scL, scD);
  ctx.beginPath();
  ctx.moveTo(-8, -6);
  ctx.quadraticCurveTo(-22, -4, -28, 2);
  ctx.quadraticCurveTo(-33, 6, -30, 8);
  ctx.quadraticCurveTo(-26, 4, -20, 2.5);
  ctx.quadraticCurveTo(-12, 1, -6, 0);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.8);
  ctx.fillStyle = scD;
  ctx.beginPath();
  ctx.moveTo(-30, 8);
  ctx.lineTo(-35, 10);
  ctx.lineTo(-31, 4.5);
  ctx.closePath();
  ctx.fill();
  // Hinterbein
  ctx.fillStyle = grad(ctx, -12, 0, scL, scD);
  ctx.beginPath();
  ctx.ellipse(-6, -8, 7, 8.5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 0.8);
  ctx.fillStyle = scD;
  ctx.beginPath();
  ctx.moveTo(-9, -2);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-1, 6);
  ctx.lineTo(-10, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#efe7d6';
  for (const cx of [-10, -6.5, -3]) {
    ctx.beginPath();
    ctx.moveTo(cx, 6);
    ctx.lineTo(cx + 1.4, 7.6);
    ctx.lineTo(cx + 2.4, 6);
    ctx.fill();
  }
  // Rumpf
  const bg = ctx.createLinearGradient(0, -30, 0, -2);
  bg.addColorStop(0, scL);
  bg.addColorStop(0.5, sc);
  bg.addColorStop(1, scD);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-12, -8);
  ctx.quadraticCurveTo(-12, -24, 0, -26);
  ctx.quadraticCurveTo(10, -26, 13, -18);
  ctx.quadraticCurveTo(14, -6, 4, -3);
  ctx.quadraticCurveTo(-8, -1, -12, -8);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 1);
  // Bauchschuppen
  ctx.fillStyle = grad(ctx, 2, 14, '#f0c987', '#a8763a');
  ctx.beginPath();
  ctx.moveTo(4, -4);
  ctx.quadraticCurveTo(13, -7, 12, -19);
  ctx.quadraticCurveTo(8, -12, 2, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,50,20,0.6)';
  ctx.lineWidth = 0.5;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(4 + k * 2, -5 - k * 3);
    ctx.lineTo(9 + k * 0.8, -6 - k * 3);
    ctx.stroke();
  }
  // Schuppenmuster
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let k = 0; k < 9; k++) {
    const px = -9 + (k % 3) * 5 + (Math.floor(k / 3) % 2) * 2.5, py = -20 + Math.floor(k / 3) * 4.5;
    ctx.beginPath();
    ctx.arc(px, py, 1.6, 0, Math.PI);
    ctx.fill();
  }
  // Hals
  ctx.fillStyle = grad(ctx, 6, 22, scL, scD);
  ctx.beginPath();
  ctx.moveTo(6, -24);
  ctx.quadraticCurveTo(10, -38, 18, -42);
  ctx.lineTo(23, -38);
  ctx.quadraticCurveTo(16, -32, 13, -17);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.9);
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.moveTo(13, -17);
  ctx.quadraticCurveTo(16, -31, 22, -37);
  ctx.lineTo(20.5, -38.5);
  ctx.quadraticCurveTo(14, -32, 11.5, -19);
  ctx.closePath();
  ctx.fill();
  // Rückenstacheln
  ctx.fillStyle = scD;
  for (const [sx, sy] of [[-6, -23], [-1, -25.5], [4, -26], [8, -31], [11, -37], [15, -41]]) {
    ctx.beginPath();
    ctx.moveTo(sx - 1.8, sy + 0.8);
    ctx.lineTo(sx - 0.6, sy - 3.6);
    ctx.lineTo(sx + 1.8, sy + 0.6);
    ctx.closePath();
    ctx.fill();
  }
  // Kopf mit offenem Maul
  ctx.fillStyle = grad(ctx, 15, 33, scL, scD);
  ctx.beginPath();
  ctx.moveTo(16, -42);
  ctx.quadraticCurveTo(20, -47, 26, -45);
  ctx.lineTo(33, -42);
  ctx.quadraticCurveTo(34, -40, 31, -39.5);
  ctx.lineTo(23, -39);
  ctx.quadraticCurveTo(19, -37, 16, -38);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.9);
  // Unterkiefer
  ctx.beginPath();
  ctx.moveTo(19, -37.5);
  ctx.lineTo(31, -35);
  ctx.quadraticCurveTo(30, -33, 27, -33.5);
  ctx.lineTo(20, -34.5);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.8);
  // Glut im Maul und Zähne
  const fg = ctx.createRadialGradient(27, -37, 0.3, 27, -37, 5);
  fg.addColorStop(0, '#fff6b0');
  fg.addColorStop(0.5, '#ff9a2e');
  fg.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(28, -37, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5f0e2';
  for (const tx of [24, 27, 30]) {
    ctx.beginPath();
    ctx.moveTo(tx, -39.4);
    ctx.lineTo(tx + 0.8, -37.8);
    ctx.lineTo(tx + 1.6, -39.3);
    ctx.fill();
  }
  // Hörner und Auge
  ctx.fillStyle = grad(ctx, 12, 22, '#efe7d6', '#9a8f78');
  ctx.beginPath();
  ctx.moveTo(19, -45);
  ctx.quadraticCurveTo(13, -50, 10, -49);
  ctx.quadraticCurveTo(14, -47, 17.5, -43);
  ctx.closePath();
  ctx.moveTo(22, -45.5);
  ctx.quadraticCurveTo(19, -52, 15, -53);
  ctx.quadraticCurveTo(19, -50, 20.5, -44.5);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.5);
  ctx.fillStyle = '#ffd23f';
  ctx.shadowColor = '#ffb000';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.ellipse(23.5, -42.6, 1.4, 0.9, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#1a0a05';
  ctx.fillRect(23.3, -43.4, 0.5, 1.6);
  // Vorderbein
  ctx.fillStyle = grad(ctx, 6, 14, scL, scD);
  ctx.beginPath();
  ctx.moveTo(7, -10);
  ctx.quadraticCurveTo(12, -8, 11, 0);
  ctx.lineTo(13, 6);
  ctx.lineTo(6, 6);
  ctx.lineTo(6.5, -2);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.8);
  ctx.fillStyle = '#efe7d6';
  for (const cx of [6.5, 9.2, 11.8]) {
    ctx.beginPath();
    ctx.moveTo(cx, 6);
    ctx.lineTo(cx + 1.3, 7.6);
    ctx.lineTo(cx + 2.2, 6);
    ctx.fill();
  }
  // Vorderer Flügel
  wing(1, -22, [[-6, -46], [-20, -60], [-28, -56], [-33, -46], [-30, -36], [-22, -30]], false);
}

// Mauerabschnitt zwischen zwei benachbarten Steinwällen (Weltkoordinaten der Feldmitten)
export function drawWallLink(ctx, ax, ay, bx, by, col, s) {
  const h = 16 * s, half = 4 * s;
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
  const nx = -dy / L * half, ny = dx / L * half * 0.6;
  // Vorderseite (die nach unten zeigende Kante)
  const fx = ny >= 0 ? 1 : -1;
  const p0 = [ax + nx * fx, ay + ny * fx], p1 = [bx + nx * fx, by + ny * fx];
  const q0 = [ax - nx * fx, ay - ny * fx], q1 = [bx - nx * fx, by - ny * fx];
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.moveTo(p0[0] + 3 * s, p0[1] + 2 * s);
  ctx.lineTo(p1[0] + 3 * s, p1[1] + 2 * s);
  ctx.lineTo(q1[0] + 3 * s, q1[1] + 2 * s);
  ctx.lineTo(q0[0] + 3 * s, q0[1] + 2 * s);
  ctx.closePath();
  ctx.fill();
  const light = -0.1 - 0.2 * Math.abs(dy / L);
  ctx.fillStyle = shade('#d6c9ad', light);
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  ctx.lineTo(p1[0], p1[1]);
  ctx.lineTo(p1[0], p1[1] - h);
  ctx.lineTo(p0[0], p0[1] - h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,45,30,0.5)';
  ctx.lineWidth = 0.7 * s;
  ctx.stroke();
  for (let r = 1; r < 4; r++) {
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1] - h * r / 4);
    ctx.lineTo(p1[0], p1[1] - h * r / 4);
    ctx.stroke();
  }
  // Wehrgang oben
  ctx.fillStyle = '#efe6d2';
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1] - h);
  ctx.lineTo(p1[0], p1[1] - h);
  ctx.lineTo(q1[0], q1[1] - h);
  ctx.lineTo(q0[0], q0[1] - h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Wappenband und Zinnen
  ctx.strokeStyle = col.main;
  ctx.lineWidth = 2.2 * s;
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1] - h + 3.5 * s);
  ctx.lineTo(p1[0], p1[1] - h + 3.5 * s);
  ctx.stroke();
  const n = Math.max(2, Math.round(L / (7 * s)));
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const mx = p0[0] + (p1[0] - p0[0]) * t, my = p0[1] + (p1[1] - p0[1]) * t - h;
    ctx.fillStyle = '#e6dcc6';
    ctx.fillRect(mx - 1.8 * s, my - 4 * s, 3.6 * s, 4 * s);
    ctx.strokeStyle = 'rgba(60,45,25,0.6)';
    ctx.lineWidth = 0.5 * s;
    ctx.strokeRect(mx - 1.8 * s, my - 4 * s, 3.6 * s, 4 * s);
  }
}

// Ausdehnung der Figuren relativ zum Mittelpunkt (für Sprite-Puffer)
export const FIG_BOX = { left: 38, right: 38, top: 82, bottom: 20 };

export const SQRT3_ = SQRT3;
