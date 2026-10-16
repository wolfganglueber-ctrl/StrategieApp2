// Hex-Geometrie: "pointy-top" Hexfelder, Speicherung als odd-r Offset (Spalte, Zeile).
export const SQRT3 = Math.sqrt(3);

const EVEN_DIRS = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const ODD_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];

const geoCache = new Map();

export function getGeo(cols, rows) {
  const key = cols + 'x' + rows;
  let g = geoCache.get(key);
  if (g) return g;
  const n = cols * rows;
  const cq = new Int16Array(n);
  const cr = new Int16Array(n);
  const nb = new Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      cq[i] = c - ((r - (r & 1)) >> 1);
      cr[i] = r;
      const dirs = r & 1 ? ODD_DIRS : EVEN_DIRS;
      const list = [];
      for (const [dc, dr] of dirs) {
        const nc = c + dc, nr = r + dr;
        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) list.push(nr * cols + nc);
      }
      nb[i] = list;
    }
  }
  const withinCache = new Map();
  g = {
    cols, rows, n, cq, cr, nb,
    col: (i) => i % cols,
    row: (i) => (i / cols) | 0,
    dist(a, b) {
      const dq = cq[a] - cq[b], dr = cr[a] - cr[b];
      return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    },
    // Alle Felder im Umkreis k (inklusive Mitte)
    within(i, k) {
      let arr = withinCache.get(k);
      if (!arr) { arr = new Array(n); withinCache.set(k, arr); }
      if (arr[i]) return arr[i];
      const res = [];
      const r0 = (i / cols) | 0;
      for (let r = Math.max(0, r0 - k); r <= Math.min(rows - 1, r0 + k); r++) {
        for (let c = 0; c < cols; c++) {
          const j = r * cols + c;
          if (g.dist(i, j) <= k) res.push(j);
        }
      }
      arr[i] = res;
      return res;
    },
  };
  geoCache.set(key, g);
  return g;
}

export function hexCenter(i, cols, size) {
  const c = i % cols, r = (i / cols) | 0;
  return { x: size * SQRT3 * (c + 0.5 * (r & 1)), y: size * 1.5 * r };
}

export function pixelToIndex(x, y, size, cols, rows) {
  const qf = ((SQRT3 / 3) * x - y / 3) / size;
  const rf = ((2 / 3) * y) / size;
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  const c = q + ((r - (r & 1)) >> 1);
  if (c < 0 || c >= cols || r < 0 || r >= rows) return -1;
  return r * cols + c;
}

export function boardSize(cols, rows, size) {
  return { w: size * SQRT3 * (cols + 0.5), h: size * (1.5 * (rows - 1) + 2) };
}
