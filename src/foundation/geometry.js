import { EP } from "./constants";
import { footOf } from "./model";

// ---------- length parsing / formatting ----------
export function parseLength(s) {
  if (s == null) return null;
  s = String(s).trim();
  if (!s) return null;
  let m = s.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in)?\s*)?$/);
  if (m) return parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 12 : 0);
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:"|in)$/);
  if (m) return parseFloat(m[1]) / 12;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function formatFtIn(ft) {
  if (!Number.isFinite(ft)) return "—";
  const neg = ft < 0;
  ft = Math.abs(ft);
  let f = Math.floor(ft);
  let i = Math.round((ft - f) * 12);
  if (i === 12) { f += 1; i = 0; }
  return `${neg ? "-" : ""}${f}'-${i}"`;
}

// ---------- basic vector / point helpers ----------
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const wallLen = (w) => dist(w.x1, w.y1, w.x2, w.y2);
export const same = (ax, ay, bx, by) => Math.abs(ax - bx) < EP && Math.abs(ay - by) < EP;
export const clone = (o) => JSON.parse(JSON.stringify(o));

export function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

export const rot90 = (d) => ({ x: -d.y, y: d.x });

export function lineIntersect(p1, d1, p2, d2) {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-9) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / cross;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

// Corners of a wall band at endpoint P. d = unit vector pointing from P into the wall.
export function endCorners(P, d, halfW, allWalls, w, widthOf) {
  const n = rot90(d);
  const butt = [
    { x: P.x + n.x * halfW, y: P.y + n.y * halfW },
    { x: P.x - n.x * halfW, y: P.y - n.y * halfW },
  ];
  const conn = allWalls.filter(
    (q) => q.id !== w.id && (same(q.x1, q.y1, P.x, P.y) || same(q.x2, q.y2, P.x, P.y))
  );
  if (conn.length !== 1) return butt;
  const q = conn[0];
  const qOther = same(q.x1, q.y1, P.x, P.y) ? { x: q.x2, y: q.y2 } : { x: q.x1, y: q.y1 };
  const qlen = dist(P.x, P.y, qOther.x, qOther.y);
  if (qlen < 0.01) return butt;
  const dq = { x: (qOther.x - P.x) / qlen, y: (qOther.y - P.y) / qlen };
  if (Math.abs(d.x * dq.y - d.y * dq.x) < 1e-6) return butt;
  const nq = rot90(dq);
  const halfQ = widthOf(q) / 2;
  const maxMiter = Math.max(halfW, halfQ) * 8;
  return butt.map((c, i) => {
    const side = i === 0 ? 1 : -1;
    const oA = { x: n.x * halfW * side, y: n.y * halfW * side };
    const s1 = oA.x * dq.x + oA.y * dq.y;
    const nqd = nq.x * d.x + nq.y * d.y;
    const sB = (s1 >= 0 ? 1 : -1) * (nqd >= 0 ? 1 : -1);
    const oB = { x: nq.x * halfQ * sB, y: nq.y * halfQ * sB };
    const X = lineIntersect(
      { x: P.x + oA.x, y: P.y + oA.y }, d,
      { x: P.x + oB.x, y: P.y + oB.y }, dq
    );
    if (!X || dist(X.x, X.y, P.x, P.y) > maxMiter) return c;
    return X;
  });
}

export function wallPolygon(w, allWalls, widthOf) {
  const len = wallLen(w);
  if (len < 0.01) return null;
  const d = { x: (w.x2 - w.x1) / len, y: (w.y2 - w.y1) / len };
  const halfW = widthOf(w) / 2;
  const ca = endCorners({ x: w.x1, y: w.y1 }, d, halfW, allWalls, w, widthOf);
  const cb = endCorners({ x: w.x2, y: w.y2 }, { x: -d.x, y: -d.y }, halfW, allWalls, w, widthOf);
  return [ca[0], cb[1], cb[0], ca[1]];
}

// Length along a wall's exterior face (the mitered outside edge), used as the
// default dimension label. "Outside" is whichever face is farther from the
// enclosed interior when the wall is part of a closed loop; walls that
// aren't part of one (nothing to be "outside" of) fall back to centerline length.
export function wallOutsideLen(w, allWalls, widthOf) {
  const len = wallLen(w);
  if (len < 0.01) return len;
  const halfW = widthOf(w) / 2;
  if (halfW < 0.001) return len;
  const d = { x: (w.x2 - w.x1) / len, y: (w.y2 - w.y1) / len };
  const n = rot90(d);
  const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
  const eps = 0.01;
  const plusIn = detectRegion(allWalls, mx + n.x * eps, my + n.y * eps);
  const minusIn = detectRegion(allWalls, mx - n.x * eps, my - n.y * eps);
  if (!plusIn === !minusIn) return len; // both or neither enclosed — no clear outside face
  const ca = endCorners({ x: w.x1, y: w.y1 }, d, halfW, allWalls, w, widthOf);
  const cb = endCorners({ x: w.x2, y: w.y2 }, { x: -d.x, y: -d.y }, halfW, allWalls, w, widthOf);
  // "+n" side is ca[0]-cb[1]; "-n" side is ca[1]-cb[0] (see wallPolygon above).
  return plusIn ? dist(ca[1].x, ca[1].y, cb[0].x, cb[0].y) : dist(ca[0].x, ca[0].y, cb[1].x, cb[1].y);
}

// Plan polygon for the piece of a wall between stations s0..s1 (ft along the wall).
// Outer ends keep the mitered corners; interior cuts are square.
export function wallSubPoly(w, allWalls, widthOf, s0, s1) {
  const len = wallLen(w);
  if (len < 0.01 || s1 - s0 < 0.02) return null;
  const d = { x: (w.x2 - w.x1) / len, y: (w.y2 - w.y1) / len };
  const n = rot90(d);
  const halfW = widthOf(w) / 2;
  const ca = endCorners({ x: w.x1, y: w.y1 }, d, halfW, allWalls, w, widthOf);
  const cb = endCorners({ x: w.x2, y: w.y2 }, { x: -d.x, y: -d.y }, halfW, allWalls, w, widthOf);
  const at = (s, side) => {
    if (s <= 0.011) return side > 0 ? ca[0] : ca[1];
    if (s >= len - 0.011) return side > 0 ? cb[1] : cb[0];
    return { x: w.x1 + d.x * s + n.x * halfW * side, y: w.y1 + d.y * s + n.y * halfW * side };
  };
  return [at(s0, 1), at(s1, 1), at(s1, -1), at(s0, -1)];
}

// Opening height for a window cut into a wall (ft): peek ~16", well ~48",
// never taller than the wall minus 6" of remaining stem.
export const openingHFor = (win, depth) => Math.min(win.kind === "peek" ? 16 / 12 : 4, Math.max(0.5, depth - 0.5));

export function shoelace(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Planar face walk: find the smallest closed wall loop containing (px, py).
export function detectRegion(walls, px, py) {
  const nodes = [];
  const nodeKey = (x, y) => {
    for (let i = 0; i < nodes.length; i++) if (same(nodes[i].x, nodes[i].y, x, y)) return i;
    nodes.push({ x, y });
    return nodes.length - 1;
  };
  const half = [];
  walls.forEach((w) => {
    if (wallLen(w) < 0.01) return;
    const a = nodeKey(w.x1, w.y1), b = nodeKey(w.x2, w.y2);
    if (a === b) return;
    const A = nodes[a], B = nodes[b];
    half.push({ from: a, to: b, ang: Math.atan2(B.y - A.y, B.x - A.x) });
    half.push({ from: b, to: a, ang: Math.atan2(A.y - B.y, A.x - B.x) });
  });
  if (!half.length) return null;
  const out = new Map();
  half.forEach((h, i) => {
    if (!out.has(h.from)) out.set(h.from, []);
    out.get(h.from).push(i);
  });
  out.forEach((list) => list.sort((i, j) => half[i].ang - half[j].ang));
  const twin = (i) => i ^ 1;
  const nextHE = (i) => {
    const t = twin(i);
    const list = out.get(half[t].from);
    const idx = list.indexOf(t);
    return list[(idx - 1 + list.length) % list.length];
  };
  const used = new Array(half.length).fill(false);
  let best = null, bestA = Infinity;
  for (let s = 0; s < half.length; s++) {
    if (used[s]) continue;
    const poly = [];
    let i = s, guard = 0;
    while (!used[i] && guard++ < 20000) {
      used[i] = true;
      poly.push(nodes[half[i].from]);
      i = nextHE(i);
    }
    if (poly.length < 3) continue;
    if (!pointInPoly(px, py, poly)) continue;
    const a = Math.abs(shoelace(poly));
    if (a > 0.5 && a < bestA) { bestA = a; best = poly; }
  }
  return best ? best.map((p) => ({ x: p.x, y: p.y })) : null;
}

// nearest wall snap for windows: given a world point and the wall list, find the
// closest point-on-wall within tolerance (tol is in world ft).
export function findWallSnap(wx, wy, walls, tol) {
  let best = null, bd = tol;
  for (const w of walls) {
    const len = wallLen(w);
    if (len < 0.1) continue;
    const dx = (w.x2 - w.x1) / len, dy = (w.y2 - w.y1) / len;
    let t = ((wx - w.x1) * dx + (wy - w.y1) * dy) / len;
    t = Math.max(0.02, Math.min(0.98, t));
    const cx = w.x1 + dx * len * t, cy = w.y1 + dy * len * t;
    const d = dist(wx, wy, cx, cy);
    if (d < bd) {
      bd = d;
      const cross = (wx - cx) * dy - (wy - cy) * dx;
      best = { wallId: w.id, t, side: cross >= 0 ? -1 : 1, x: cx, y: cy, ang: Math.atan2(dy, dx) };
    }
  }
  return best;
}

// Collects the world-space points that should be framed by "Fit view":
// wall endpoints, pad footprints, and traced area outlines.
export function collectFitPoints({ walls, pads, areas }) {
  const pts = [];
  walls.forEach((w) => { pts.push([w.x1, w.y1], [w.x2, w.y2]); });
  pads.forEach((p) => { pts.push([p.x - p.w / 24, p.y - p.l / 24], [p.x + p.w / 24, p.y + p.l / 24]); });
  areas.forEach((a) => a.pts.forEach((p) => pts.push([p.x, p.y])));
  return pts;
}

// Resolve a window's world position/angle/host-wall geometry for rendering & hit-testing.
export function windowPose(win, walls) {
  if (win.wallId != null) {
    const w = walls.find((q) => q.id === win.wallId);
    if (!w) return null;
    const len = wallLen(w);
    if (len < 0.01) return null;
    const dx = (w.x2 - w.x1) / len, dy = (w.y2 - w.y1) / len;
    return {
      x: w.x1 + dx * len * win.t,
      y: w.y1 + dy * len * win.t,
      ang: Math.atan2(dy, dx),
      thickness: w.thickness,
      depth: w.depth,
      footH: footOf(w).h,
    };
  }
  return { x: win.x, y: win.y, ang: win.ang || 0, thickness: 8, depth: 8, footH: 8 };
}
