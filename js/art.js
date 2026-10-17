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

function conifer(ctx, x, y, s) {
  shadowEllipse(ctx, x + 2 * s, y + 1 * s, 7 * s, 2.6 * s);
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(x - 1.3 * s, y - 4 * s, 2.6 * s, 5 * s);
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
  }
}

function leafTree(ctx, x, y, s) {
  shadowEllipse(ctx, x + 2 * s, y + 1 * s, 8 * s, 3 * s);
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(x - 1.5 * s, y - 7 * s, 3 * s, 8 * s);
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

export function drawCity(ctx, city, x, y, H, col) {
  const s = H / 40;
  // Pflaster
  const g = ctx.createRadialGradient(x - 6 * s, y, 2, x, y + 4 * s, 26 * s);
  g.addColorStop(0, '#efe2c4');
  g.addColorStop(1, '#bfa77c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y + 6 * s, 27 * s, 17 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,65,35,0.5)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  const roof = col.main;
  if (city.capital) {
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
    ctx.fillStyle = '#e9dfcb';
    ctx.fillRect(kx - kw / 2, ky - kh, kw, kh);
    ctx.strokeStyle = 'rgba(60,40,20,0.6)';
    ctx.lineWidth = 0.9 * s;
    ctx.strokeRect(kx - kw / 2, ky - kh, kw, kh);
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = '#e9dfcb';
      ctx.fillRect(kx - kw / 2 + k * (kw / 3.5), ky - kh - 4 * s, kw / 7, 4 * s);
      ctx.strokeRect(kx - kw / 2 + k * (kw / 3.5), ky - kh - 4 * s, kw / 7, 4 * s);
    }
    ctx.fillStyle = '#4a3420';
    ctx.beginPath();
    ctx.arc(kx, ky - 6 * s, 4 * s, Math.PI, 0);
    ctx.lineTo(kx + 4 * s, ky);
    ctx.lineTo(kx - 4 * s, ky);
    ctx.fill();
    // Fahne
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.moveTo(kx, ky - kh - 4 * s);
    ctx.lineTo(kx, ky - kh - 22 * s);
    ctx.stroke();
    ctx.fillStyle = col.main;
    ctx.beginPath();
    ctx.moveTo(kx, ky - kh - 22 * s);
    ctx.quadraticCurveTo(kx + 8 * s, ky - kh - 23 * s, kx + 14 * s, ky - kh - 18 * s);
    ctx.quadraticCurveTo(kx + 8 * s, ky - kh - 15 * s, kx, ky - kh - 13 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = col.dark;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    tower(ctx, x + 16 * s, y + 14 * s, 5 * s, 18 * s, roof, s);
    if (city.level >= 3) house(ctx, x - 20 * s, y + 22 * s, 9 * s, 7 * s, roof, s);
    if (city.level >= 4) house(ctx, x + 4 * s, y + 24 * s, 9 * s, 7 * s, roof, s);
    if (city.level >= 5) house(ctx, x + 22 * s, y + 24 * s, 8 * s, 6 * s, roof, s);
  } else {
    const layouts = {
      1: [[-7, 8, 12], [9, 14, 10]],
      2: [[-10, 4, 11], [10, 6, 11], [-1, 18, 12]],
      3: [[-13, 2, 10], [4, -2, 12], [16, 10, 10], [-6, 19, 11], [10, 22, 9]],
    }[Math.min(3, city.level)];
    if (city.level >= 4) {
      // Burgstadt / Metropole: Turm in der Mitte
      tower(ctx, x + 2 * s, y + 6 * s, 5 * s, city.level >= 5 ? 24 * s : 18 * s, roof, s);
      for (const [dx, dy, w] of [[-16, 8, 10], [18, 10, 10], [-8, 22, 11], [10, 24, 10], ...(city.level >= 5 ? [[-22, 20, 8], [24, 22, 8]] : [])]) {
        house(ctx, x + dx * s, y + dy * s, w * s, w * 0.75 * s, roof, s);
      }
    } else {
      for (const [dx, dy, w] of layouts) house(ctx, x + dx * s, y + dy * s, w * s, w * 0.75 * s, roof, s);
    }
  }
  if (city.buildings?.includes('wall')) {
    // Steinmauer vorne um die Stadt
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#6f675c';
    ctx.lineWidth = 6 * s;
    ctx.beginPath();
    ctx.ellipse(x, y + 8 * s, 30 * s, 19 * s, 0, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = '#b9b0a2';
    ctx.lineWidth = 4 * s;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70,60,50,0.6)';
    ctx.lineWidth = 0.8 * s;
    for (let k = 0; k <= 8; k++) {
      const a = (0.1 + (0.8 * k) / 8) * Math.PI;
      const px = x + Math.cos(a) * 30 * s, py = y + 8 * s + Math.sin(a) * 19 * s;
      ctx.beginPath();
      ctx.moveTo(px, py - 2.5 * s);
      ctx.lineTo(px, py + 2.5 * s);
      ctx.stroke();
    }
  }
  // Stufenanzeige
  if (city.level > 1) {
    for (let k = 0; k < city.level; k++) {
      const px = x - (city.level - 1) * 5 * s + k * 10 * s, py = y + 27 * s;
      ctx.fillStyle = '#ffd34d';
      ctx.strokeStyle = '#6b4a00';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 2 * s : 4.5 * s;
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

function pedestal(ctx, col) {
  // Sockel in Spielerfarbe (Höhe 4)
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(2, 13, 17, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col.dark;
  ctx.beginPath();
  ctx.ellipse(0, 10, 15, 5.5, 0, 0, Math.PI);
  ctx.lineTo(-15, 6);
  ctx.ellipse(0, 6, 15, 5.5, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  const g = ctx.createLinearGradient(-15, 0, 15, 0);
  g.addColorStop(0, col.light);
  g.addColorStop(0.45, col.main);
  g.addColorStop(1, col.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 6, 15, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function legs(ctx, x, y) {
  ctx.fillStyle = '#3d2f26';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x - 4, y - 10, 3.4, 10, 1.2) : ctx.rect(x - 4, y - 10, 3.4, 10);
  ctx.roundRect ? ctx.roundRect(x + 0.6, y - 10, 3.4, 10, 1.2) : ctx.rect(x + 0.6, y - 10, 3.4, 10);
  ctx.fill();
}

function torso(ctx, x, y, col, armor) {
  ctx.fillStyle = armor ? grad(ctx, x - 6, x + 6, '#f4f6f8', '#7d8590') : grad(ctx, x - 6, x + 6, col.light, col.dark);
  ctx.beginPath();
  ctx.moveTo(x - 5.5, y - 9);
  ctx.lineTo(x - 4.5, y - 21);
  ctx.quadraticCurveTo(x, y - 23, x + 4.5, y - 21);
  ctx.lineTo(x + 5.5, y - 9);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.9);
  ctx.fillStyle = '#4a3320';
  ctx.fillRect(x - 5.2, y - 12.5, 10.4, 2);
  if (armor) {
    ctx.fillStyle = col.main;
    ctx.fillRect(x - 1.5, y - 20, 3, 8);
  }
}

function head(ctx, x, y, helmet, col) {
  ctx.fillStyle = grad(ctx, x - 4.5, x + 4.5, '#ffe0c0', '#d39a6a');
  ctx.beginPath();
  ctx.arc(x, y, 4.3, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 0.8);
  if (helmet === 'steel') {
    ctx.fillStyle = grad(ctx, x - 5, x + 5, '#f2f4f7', '#6f7780');
    ctx.beginPath();
    ctx.arc(x, y - 0.6, 4.9, Math.PI, 0);
    ctx.lineTo(x + 4.9, y + 0.4);
    ctx.lineTo(x - 4.9, y + 0.4);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.8);
    ctx.fillStyle = '#6f7780';
    ctx.fillRect(x - 0.6, y - 0.2, 1.2, 3.4);
  } else if (helmet === 'hood') {
    ctx.fillStyle = grad(ctx, x - 6, x + 6, col.main, col.dark);
    ctx.beginPath();
    ctx.moveTo(x - 5.5, y + 3);
    ctx.quadraticCurveTo(x - 6, y - 6.5, x, y - 7);
    ctx.quadraticCurveTo(x + 6, y - 6.5, x + 5.5, y + 3);
    ctx.quadraticCurveTo(x + 3.5, y - 2, x, y - 2.5);
    ctx.quadraticCurveTo(x - 3.5, y - 2, x - 5.5, y + 3);
    ctx.fill();
    outline(ctx, 0.8);
  } else if (helmet === 'great') {
    ctx.fillStyle = grad(ctx, x - 5.5, x + 5.5, '#f7f9fb', '#6c7480');
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - 5.2, y - 6, 10.4, 11, 3) : ctx.rect(x - 5.2, y - 6, 10.4, 11);
    ctx.fill();
    outline(ctx, 0.8);
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 4, y - 1.5, 8, 1.6);
    // Federbusch
    ctx.fillStyle = col.main;
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 6);
    ctx.quadraticCurveTo(x - 9, y - 13, x - 12, y - 6);
    ctx.quadraticCurveTo(x - 6, y - 9, x + 1, y - 5);
    ctx.fill();
    outline(ctx, 0.7);
  }
}

function sword(ctx, x0, y0, x1, y1) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = '#eef2f6';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Parierstange
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L;
  const gx = x0 + dx * 0.12, gy = y0 + dy * 0.12;
  ctx.strokeStyle = '#8a6a1f';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(gx - nx * 3.5, gy - ny * 3.5);
  ctx.lineTo(gx + nx * 3.5, gy + ny * 3.5);
  ctx.stroke();
}

function horse(ctx, coat, mane, blanketCol, armored) {
  // Körper seitlich, Kopf nach rechts
  ctx.lineCap = 'round';
  const legC = shade(coat, -0.35);
  ctx.strokeStyle = legC;
  ctx.lineWidth = 3;
  for (const [lx, ox] of [[-9, -1], [-5, 1], [6, -1], [10, 1]]) {
    ctx.beginPath();
    ctx.moveTo(lx, -10);
    ctx.lineTo(lx + ox, 3);
    ctx.stroke();
  }
  // Schweif
  ctx.strokeStyle = mane;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-14, -15);
  ctx.quadraticCurveTo(-20, -10, -17, -2);
  ctx.stroke();
  // Rumpf
  ctx.fillStyle = grad(ctx, -15, 15, shade(coat, 0.25), shade(coat, -0.3));
  ctx.beginPath();
  ctx.ellipse(-1, -14, 14.5, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 0.9);
  // Hals + Kopf
  ctx.beginPath();
  ctx.moveTo(8, -18);
  ctx.lineTo(14, -29);
  ctx.quadraticCurveTo(17, -32, 21, -27);
  ctx.lineTo(23, -22);
  ctx.quadraticCurveTo(21, -20, 18, -22);
  ctx.lineTo(13, -12);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.9);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(17.5, -27, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mane;
  ctx.beginPath();
  ctx.moveTo(14, -30);
  ctx.quadraticCurveTo(9, -26, 8, -18);
  ctx.lineTo(10, -19);
  ctx.quadraticCurveTo(11, -26, 15, -29);
  ctx.fill();
  // Satteldecke / Schabracke
  ctx.fillStyle = grad(ctx, -10, 8, blanketCol.light, blanketCol.dark);
  ctx.beginPath();
  if (armored) {
    ctx.moveTo(-13, -19);
    ctx.lineTo(11, -19);
    ctx.lineTo(12, -6);
    for (let k = 0; k <= 6; k++) ctx.lineTo(12 - k * 4.2, k % 2 ? -4 : -7);
    ctx.closePath();
  } else {
    ctx.moveTo(-7, -20);
    ctx.lineTo(5, -20);
    ctx.lineTo(4, -11);
    ctx.lineTo(-6, -11);
    ctx.closePath();
  }
  ctx.fill();
  outline(ctx, 0.8);
}

function drawTowerFigure(ctx, col, level) {
  // Stufe 1: Holzturm, 2: Steinturm, 3: großer Wehrturm mit Fahne
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(3, 10, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  const w = level === 1 ? 9 : level === 2 ? 10 : 12;
  const h = level === 1 ? 30 : level === 2 ? 36 : 44;
  if (level === 1) {
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, 8); ctx.lineTo(-6, -h + 6);
    ctx.moveTo(9, 8); ctx.lineTo(6, -h + 6);
    ctx.moveTo(-8, -2); ctx.lineTo(7, -14);
    ctx.moveTo(8, -2); ctx.lineTo(-7, -14);
    ctx.stroke();
    ctx.fillStyle = grad(ctx, -11, 11, '#c08a52', '#6b4423');
    ctx.fillRect(-11, -h + 2, 22, 9);
    outline(ctx, 0.9);
    ctx.strokeRect(-11, -h + 2, 22, 9);
  } else {
    const g = ctx.createLinearGradient(-w, 0, w, 0);
    g.addColorStop(0, '#f1ebdf');
    g.addColorStop(0.6, '#c8bca6');
    g.addColorStop(1, '#8f846f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w - 2, 8);
    ctx.lineTo(-w, -h + 6);
    ctx.lineTo(w, -h + 6);
    ctx.lineTo(w + 2, 8);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 1);
    ctx.strokeStyle = 'rgba(80,70,55,0.45)';
    ctx.lineWidth = 0.7;
    for (let y = 2; y > -h + 8; y -= 6) {
      ctx.beginPath();
      ctx.moveTo(-w, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Zinnen
    ctx.fillStyle = '#e4dccb';
    const m = 4, mw = (w * 2 + 4) / (m * 2 - 1);
    for (let k = 0; k < m; k++) {
      ctx.fillRect(-w - 2 + k * 2 * mw, -h + 1, mw, 6);
      ctx.strokeStyle = 'rgba(20,14,10,0.7)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(-w - 2 + k * 2 * mw, -h + 1, mw, 6);
    }
    ctx.fillStyle = '#2b2118';
    ctx.fillRect(-2, -h + 14, 4, 7);
    ctx.beginPath();
    ctx.arc(0, 2, 4, Math.PI, 0);
    ctx.lineTo(4, 8);
    ctx.lineTo(-4, 8);
    ctx.fill();
  }
  // Wimpel/Fahne in Spielerfarbe
  const top = level === 1 ? -h + 2 : -h + 1;
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(0, top - (level === 3 ? 16 : 11));
  ctx.stroke();
  ctx.fillStyle = col.main;
  ctx.beginPath();
  const fy = top - (level === 3 ? 16 : 11);
  ctx.moveTo(0, fy);
  ctx.lineTo(level === 3 ? 13 : 9, fy + 3);
  ctx.lineTo(0, fy + 6.5);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.7);
  // Stufen-Band in Spielerfarbe
  ctx.fillStyle = col.main;
  ctx.fillRect(-w + 1, level === 1 ? -h + 5 : -h + 9, w * 2 - 2, 2.5);
}

export function drawFigure(ctx, type, col, level = 1) {
  if (type === 'tower') { drawTowerFigure(ctx, col, level); return; }
  pedestal(ctx, col);
  switch (type) {
    case 'warrior': {
      legs(ctx, 0, 6);
      torso(ctx, 0, 6, col, false);
      // Schild links
      ctx.fillStyle = grad(ctx, -14, -2, col.light, col.dark);
      ctx.beginPath();
      ctx.arc(-7.5, -9, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d7dbe0';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = '#e8ecef';
      ctx.beginPath();
      ctx.arc(-7.5, -9, 2, 0, Math.PI * 2);
      ctx.fill();
      head(ctx, 0, -19.5, 'steel', col);
      // Arm + Schwert erhoben
      ctx.strokeStyle = SKIN;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(4.5, -13);
      ctx.lineTo(8, -18);
      ctx.stroke();
      sword(ctx, 8, -17, 15, -36);
      break;
    }
    case 'archer': {
      // Köcher
      ctx.fillStyle = '#7a4b22';
      ctx.save();
      ctx.translate(-5, -14);
      ctx.rotate(-0.35);
      ctx.fillRect(-2, -8, 4, 12);
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(-2, -11, 1.3, 3);
      ctx.fillRect(0.6, -11, 1.3, 3);
      ctx.restore();
      legs(ctx, 0, 6);
      torso(ctx, 0, 6, col, false);
      head(ctx, 0, -19.5, 'hood', col);
      // Bogen
      ctx.strokeStyle = '#6b3d14';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(4, -13, 13, -1.15, 1.15);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(4 + 13 * Math.cos(-1.15), -13 + 13 * Math.sin(-1.15));
      ctx.lineTo(4 + 13 * Math.cos(1.15), -13 + 13 * Math.sin(1.15));
      ctx.stroke();
      // Pfeil
      ctx.strokeStyle = '#3b2a1a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(4, -13);
      ctx.lineTo(19, -13);
      ctx.stroke();
      ctx.fillStyle = '#c8ced6';
      ctx.beginPath();
      ctx.moveTo(21, -13);
      ctx.lineTo(18, -15);
      ctx.lineTo(18, -11);
      ctx.fill();
      break;
    }
    case 'defender': {
      // Speer
      ctx.strokeStyle = '#6b4a2b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, 6);
      ctx.lineTo(8, -38);
      ctx.stroke();
      ctx.fillStyle = '#dfe4ea';
      ctx.beginPath();
      ctx.moveTo(8, -45);
      ctx.lineTo(10.5, -37);
      ctx.lineTo(5.5, -37);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 0.7);
      legs(ctx, 0, 6);
      torso(ctx, 0, 6, col, true);
      head(ctx, 0, -19.5, 'steel', col);
      // Großer Turmschild
      ctx.fillStyle = grad(ctx, -11, 4, col.light, col.dark);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-11, -24, 14, 27, 3) : ctx.rect(-11, -24, 14, 27);
      ctx.fill();
      ctx.strokeStyle = '#e6eaee';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-5.2, -20, 2.4, 19);
      ctx.fillRect(-9, -13, 10, 2.4);
      break;
    }
    case 'rider': {
      ctx.save();
      ctx.translate(0, 6);
      horse(ctx, '#9a5b2a', '#3b2312', col, false);
      // Reiter
      ctx.fillStyle = '#3d2f26';
      ctx.fillRect(-2, -22, 3, 8);
      torso(ctx, -1, -12, col, false);
      head(ctx, -1, -37.5, 'hood', col);
      ctx.strokeStyle = '#6b4a2b';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-8, -20);
      ctx.lineTo(18, -40);
      ctx.stroke();
      ctx.fillStyle = '#dfe4ea';
      ctx.beginPath();
      ctx.moveTo(21, -42.5);
      ctx.lineTo(16, -41);
      ctx.lineTo(18.5, -37.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'knight': {
      ctx.save();
      ctx.translate(0, 6);
      horse(ctx, '#e9e9ee', '#9a9aa3', col, true);
      torso(ctx, -1, -12, col, true);
      head(ctx, -1, -38, 'great', col);
      // Lanze mit Wimpel
      ctx.strokeStyle = '#5a3d22';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-10, -18);
      ctx.lineTo(24, -44);
      ctx.stroke();
      ctx.fillStyle = col.main;
      ctx.beginPath();
      ctx.moveTo(19, -40);
      ctx.lineTo(13, -44);
      ctx.lineTo(23, -48);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 0.6);
      ctx.restore();
      break;
    }
    case 'mage': {
      // Stab mit leuchtender Kugel
      ctx.strokeStyle = '#5a3d22';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(9, 6);
      ctx.lineTo(10, -34);
      ctx.stroke();
      const glow = ctx.createRadialGradient(10, -37, 0.5, 10, -37, 8);
      glow.addColorStop(0, 'rgba(255,255,255,1)');
      glow.addColorStop(0.35, 'rgba(125,211,252,0.95)');
      glow.addColorStop(1, 'rgba(125,211,252,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(10, -37, 8, 0, Math.PI * 2);
      ctx.fill();
      // Robe in Spielerfarbe
      ctx.fillStyle = grad(ctx, -8, 8, col.light, col.dark);
      ctx.beginPath();
      ctx.moveTo(-8, 6);
      ctx.lineTo(-4.5, -21);
      ctx.quadraticCurveTo(0, -23, 4.5, -21);
      ctx.lineTo(8, 6);
      ctx.quadraticCurveTo(0, 8, -8, 6);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 0.9);
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(0, 5);
      ctx.stroke();
      // Arm zum Stab
      ctx.strokeStyle = col.dark;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(3.5, -16);
      ctx.lineTo(9, -14);
      ctx.stroke();
      // Bart und Kopf
      ctx.fillStyle = grad(ctx, -4.5, 4.5, '#ffe0c0', '#d39a6a');
      ctx.beginPath();
      ctx.arc(0, -25, 4.2, 0, Math.PI * 2);
      ctx.fill();
      outline(ctx, 0.8);
      ctx.fillStyle = '#eef0f2';
      ctx.beginPath();
      ctx.moveTo(-3.5, -24);
      ctx.quadraticCurveTo(0, -12, 3.5, -24);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 0.6);
      // Spitzhut mit Sternen
      ctx.fillStyle = grad(ctx, -7, 7, col.main, col.dark);
      ctx.beginPath();
      ctx.moveTo(-7.5, -27);
      ctx.quadraticCurveTo(0, -29.5, 7.5, -27);
      ctx.lineTo(2, -32);
      ctx.quadraticCurveTo(1, -40, -4, -45);
      ctx.quadraticCurveTo(-2, -38, -3, -32);
      ctx.closePath();
      ctx.fill();
      outline(ctx, 0.8);
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(-1, -31, 1.1, 0, Math.PI * 2);
      ctx.arc(1.5, -35.5, 0.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'catapult': {
      const wood = '#8a5a2b', woodD = '#5c3b1b';
      // Räder hinten
      for (const wx of [-10, 10]) {
        ctx.fillStyle = woodD;
        ctx.beginPath();
        ctx.arc(wx + 2, 0, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = grad(ctx, -14, 14, shade(wood, 0.2), woodD);
      ctx.fillRect(-14, -6, 28, 5);
      outline(ctx, 0.8);
      // Gestell
      ctx.strokeStyle = wood;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-6, -5);
      ctx.lineTo(0, -20);
      ctx.lineTo(6, -5);
      ctx.stroke();
      // Wurfarm
      ctx.strokeStyle = woodD;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(10, -3);
      ctx.lineTo(-12, -30);
      ctx.stroke();
      ctx.fillStyle = wood;
      ctx.beginPath();
      ctx.arc(-12.5, -31, 4, 0, Math.PI * 2);
      ctx.fill();
      outline(ctx, 0.7);
      ctx.fillStyle = '#7d7871';
      ctx.beginPath();
      ctx.arc(-12.5, -33, 3, 0, Math.PI * 2);
      ctx.fill();
      // Räder vorne
      for (const wx of [-10, 10]) {
        ctx.fillStyle = grad(ctx, wx - 6, wx + 6, shade(wood, 0.25), woodD);
        ctx.beginPath();
        ctx.arc(wx, 2, 6, 0, Math.PI * 2);
        ctx.fill();
        outline(ctx, 0.8);
        ctx.fillStyle = woodD;
        ctx.beginPath();
        ctx.arc(wx, 2, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // Wimpel
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(0, -32);
      ctx.stroke();
      ctx.fillStyle = col.main;
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(9, -29);
      ctx.lineTo(0, -26);
      ctx.fill();
      break;
    }
  }
}

// Ausdehnung der Figuren relativ zum Mittelpunkt (für Sprite-Puffer)
export const FIG_BOX = { left: 26, right: 30, top: 66, bottom: 20 };

export const SQRT3_ = SQRT3;
