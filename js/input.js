// Touch- und Maussteuerung: Tippen, Ziehen zum Verschieben, Zwei-Finger-Zoom, Mausrad.
export function attachInput(canvas, renderer, onTap) {
  const pts = new Map();
  let drag = null, pinch = null, moved = false, downTime = 0;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
      moved = false;
      downTime = performance.now();
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      moved = true;
      renderer.gesturing = true;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      renderer.panBy(mx - pinch.mx, my - pinch.my);
      renderer.zoomAt(mx, my, d / pinch.d);
      pinch = { d, mx, my };
    } else if (pts.size === 1 && drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 9) {
        moved = true;
        renderer.gesturing = true;
      }
      if (moved) renderer.panBy(dx, dy);
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  });

  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 0) {
      if (!moved && drag && performance.now() - downTime < 600 && e.type === 'pointerup') onTap(e.clientX, e.clientY);
      drag = null;
      pinch = null;
      renderer.gesturing = false;
      renderer.invalidate();
    } else if (pts.size === 1) {
      const [p] = [...pts.values()];
      drag = { x: p.x, y: p.y, sx: p.x, sy: p.y };
      pinch = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    renderer.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
}
