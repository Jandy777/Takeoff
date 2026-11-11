import { EP } from "./constants";
import { footOf } from "./model";

// ---------- length parsing / formatting ----------
export function parseLength(s) {
  if (s == null) return null;
  s = String(s).trim();
  if (!s) return null;
  let m = s.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in)?\s*)?$/);
  if (m) return parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 12 : 0);
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:"|in)$/);
  if (m) return parseFloat(m[1]) / 12;
  if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function formatFtIn(ft) {
  if (!Number.isFinite(ft)) return "—";
  const neg = ft < 0;
  ft = Math.abs(ft);
  let f = Math.floor(ft);
  let i = Math.round((ft - f) * 24) / 2;
  if (i === 12) { f += 1; i = 0; }
  return `${neg ? "-" : ""}${f}'-${i}"`;
}

// ---------- basic vector / point helpers ----------
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const wallLen = (w) => dist(w.x1, w.y1, w.x2, w.y2);
// Slab rotation is in degrees in the plan, clockwise on screen.
export function slabCorners(s) {
  const angle = (s.rotation || 0) * Math.PI / 180, c = Math.cos(angle), n = Math.sin(angle);
  return [[-s.w / 24, -s.l / 24], [s.w / 24, -s.l / 24], [s.w / 24, s.l / 24], [-s.w / 24, s.l / 24]].map(([x, y]) => ({ x: s.x + x * c - y * n, y: s.y + x * n + y * c }));
}

export function wingFootprint(wing, walls) {
  const p = windowPose(wing, walls);
  if (!p) return [];
  const ux = Math.cos(p.ang), uy = Math.sin(p.ang), side = wing.side || 1;
  const nx = -uy * side, ny = ux * side, half = (p.thickness || 8) / 24;
  const at = (along, out) => ({ x: p.x + ux * along + nx * out, y: p.y + uy * along + ny * out });
  return [at(-half, half), at(half, half), at(half, half + 2), at(-half, half + 2)];
}
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

// Snap to the actual wall faces (including their mitered ends), not the
// centerline, so a partial drain run can start or end anywhere along a face.
export function snapToWallFace(x, y, walls, tolerance) {
  let best = null, bestDistance = tolerance;
  for (const w of walls) {
    const poly = wallPolygon(w, walls, (q) => q.thickness / 12);
    if (!poly) continue;
    for (const [index, corner] of poly.entries()) {
      const distance = dist(x, y, corner.x, corner.y);
      if (distance < bestDistance) { best = { ...corner, type: "wall corner", anchor: { wallId: w.id, corner: index } }; bestDistance = distance; }
    }
  }
  if (best) return best;
  for (const w of walls) {
    const poly = wallPolygon(w, walls, (q) => q.thickness / 12);
    if (!poly) continue;
    for (const [start, end] of [[0, 1], [3, 2]]) {
      const a = poly[start], b = poly[end];
      const dx = b.x - a.x, dy = b.y - a.y;
      const length2 = dx * dx + dy * dy;
      if (!length2) continue;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length2));
      const candidate = { x: a.x + dx * t, y: a.y + dy * t, type: "wall face", anchor: { wallId: w.id, start, end, t } };
      const distance = dist(x, y, candidate.x, candidate.y);
      if (distance < bestDistance) { best = candidate; bestDistance = distance; }
    }
  }
  return best;
}

// Select an incident face by pointing along it from a previously picked corner.
export function referenceFaceAt(corner, x, y, walls, tolerance) {
  let best = null;
  for (const wall of walls) {
    const poly = wallPolygon(wall, walls, (w) => w.thickness / 12);
    if (!poly) continue;
    for (const [i, j] of [[0, 1], [3, 2]]) {
      let origin, end;
      if (dist(corner.x, corner.y, poly[i].x, poly[i].y) < 1e-5) { origin = poly[i]; end = poly[j]; }
      else if (dist(corner.x, corner.y, poly[j].x, poly[j].y) < 1e-5) { origin = poly[j]; end = poly[i]; }
      else continue;
      const length = dist(origin.x, origin.y, end.x, end.y);
      if (length < 0.01) continue;
      const ux = (end.x - origin.x) / length, uy = (end.y - origin.y) / length;
      const along = (x - origin.x) * ux + (y - origin.y) * uy;
      if (along <= 0 || along > length + tolerance) continue;
      const distance = dist(x, y, origin.x + Math.min(along, length) * ux, origin.y + Math.min(along, length) * uy);
      if (distance <= tolerance && (!best || distance < best.distance)) best = { wallId: wall.id, origin: { ...origin }, end: { ...end }, ux, uy, length, distance };
    }
  }
  return best;
}

export function referencePointAtDistance(face, distance) {
  if (!face || !Number.isFinite(distance) || distance < 0 || distance > face.length + 1e-7) return null;
  const d = Math.min(distance, face.length);
  return { x: face.origin.x + face.ux * d, y: face.origin.y + face.uy * d };
}

// Resolve saved wall-relative anchors for every view and quantity calculation.
// Unattached points (and anchors whose wall is missing) retain their coordinates.
export function resolveDrainPoint(point, walls) {
  const anchor = point.anchor;
  const wall = anchor && walls.find((w) => w.id === anchor.wallId);
  if (!wall) return point;
  const poly = wallPolygon(wall, walls, (w) => w.thickness / 12);
  if (!poly) return point;
  if (anchor.corner != null && poly[anchor.corner]) return { ...point, ...poly[anchor.corner] };
  const a = poly[anchor.start], b = poly[anchor.end];
  if (!a || !b || !Number.isFinite(anchor.t)) return point;
  return { ...point, x: a.x + (b.x - a.x) * anchor.t, y: a.y + (b.y - a.y) * anchor.t };
}

export function resolveDrainRuns(drains, walls) {
  return (drains || []).map((drain) => ({ ...drain, pts: drain.pts.map((point) => resolveDrainPoint(point, walls)) }));
}

// Identify one wall face containing both picked points. Store proportional
// positions on that face so the ledge follows later wall edits.
export function ledgeOnWallFace(a, b, walls, tolerance) {
  let best = null;
  for (const w of walls) {
    const poly = wallPolygon(w, walls, (q) => q.thickness / 12);
    if (!poly) continue;
    for (const [start, end] of [[0, 1], [3, 2]]) {
      const p = poly[start], q = poly[end], dx = q.x - p.x, dy = q.y - p.y, l2 = dx * dx + dy * dy;
      if (l2 < 1e-8) continue;
      const project = (v) => {
        const t = Math.max(0, Math.min(1, ((v.x - p.x) * dx + (v.y - p.y) * dy) / l2));
        return { t, distance: dist(v.x, v.y, p.x + t * dx, p.y + t * dy) };
      };
      const pa = project(a), pb = project(b);
      if (pa.distance > tolerance || pb.distance > tolerance || Math.abs(pa.t - pb.t) * Math.sqrt(l2) < 0.02) continue;
      const score = pa.distance + pb.distance;
      if (!best || score < best.score) best = { wallId: w.id, start, end, t0: pa.t, t1: pb.t, score };
    }
  }
  return best;
}

export function resolveLedges(ledges, walls) {
  return (ledges || []).map((ledge) => {
    const a = resolveDrainPoint({ anchor: { wallId: ledge.wallId, start: ledge.start, end: ledge.end, t: ledge.t0 } }, walls);
    const b = resolveDrainPoint({ anchor: { wallId: ledge.wallId, start: ledge.start, end: ledge.end, t: ledge.t1 } }, walls);
    return { ...ledge, pts: Number.isFinite(a.x) && Number.isFinite(b.x) ? [a, b] : [] };
  });
}

// Convert a closed run whose entered vertices describe a wall face into the
// centerline geometry used by the rest of the editor. For an outside-face
// run we offset toward the enclosed region; for an inside-face run we offset
// away from it. Adjacent offset lines are intersected so mitered corners stay
// exact, including mixed wall thicknesses and non-square angles.
export function centerlineClosedWallRun(runWalls, basis = "outside") {
  if (basis === "centerline" || runWalls.length < 3) return runWalls.map((w) => ({ ...w }));
  const vertices = runWalls.map((w) => ({ x: w.x1, y: w.y1 }));
  const area = shoelace(vertices);
  if (Math.abs(area) < 1e-6) return runWalls.map((w) => ({ ...w }));
  const interiorSide = area > 0 ? 1 : -1;
  const towardInterior = basis === "outside" ? 1 : -1;
  const lines = runWalls.map((w, i) => {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const len = dist(a.x, a.y, b.x, b.y);
    if (len < 0.01) return null;
    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const n = rot90(d);
    const offset = (w.thickness / 24) * interiorSide * towardInterior;
    return { p: { x: a.x + n.x * offset, y: a.y + n.y * offset }, d };
  });
  if (lines.some((line) => !line)) return runWalls.map((w) => ({ ...w }));
  const centers = lines.map((line, i) => {
    const prev = lines[(i - 1 + lines.length) % lines.length];
    return lineIntersect(prev.p, prev.d, line.p, line.d) || line.p;
  });
  return runWalls.map((w, i) => ({
    ...w,
    x1: centers[i].x,
    y1: centers[i].y,
    x2: centers[(i + 1) % centers.length].x,
    y2: centers[(i + 1) % centers.length].y,
  }));
}

// During an open face-drawn run, entered vertices describe one continuous
// wall face. Offset each segment toward the chosen side and intersect the
// offset lines, rather than mistaking entered face lengths for centerlines.
export function centerlineOpenWallRun(runWalls, side) {
  if (!runWalls.length) return [];
  const lines = runWalls.map((w) => {
    const length = dist(w.x1, w.y1, w.x2, w.y2);
    if (length < 0.01) return null;
    const d = { x: (w.x2 - w.x1) / length, y: (w.y2 - w.y1) / length };
    const offset = side * w.thickness / 24;
    return { p: { x: w.x1 - d.y * offset, y: w.y1 + d.x * offset }, d, length };
  });
  if (lines.some((line) => !line)) return null;
  const vertices = [lines[0].p];
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1], next = lines[i];
    const intersection = lineIntersect(prev.p, prev.d, next.p, next.d);
    if (intersection) vertices.push(intersection);
    else {
      const separation = Math.abs((next.p.x - prev.p.x) * prev.d.y - (next.p.y - prev.p.y) * prev.d.x);
      const direction = prev.d.x * next.d.x + prev.d.y * next.d.y;
      if (separation > 1e-6 || direction <= 0) return null;
      vertices.push(next.p);
    }
  }
  const last = lines[lines.length - 1];
  vertices.push({ x: last.p.x + last.d.x * last.length, y: last.p.y + last.d.y * last.length });
  if (lines.some((line, i) => (vertices[i + 1].x - vertices[i].x) * line.d.x + (vertices[i + 1].y - vertices[i].y) * line.d.y <= 0.01)) return null;
  return runWalls.map((w, i) => ({ ...w, x1: vertices[i].x, y1: vertices[i].y, x2: vertices[i + 1].x, y2: vertices[i + 1].y }));
}

export function wallFaceLengths(w, allWalls, widthOf) {
  const centerline = wallLen(w);
  if (centerline < 0.01) return { outside: centerline, centerline, inside: centerline, resolved: false };
  const halfW = widthOf(w) / 2;
  if (halfW < 0.001) return { outside: centerline, centerline, inside: centerline, resolved: false };
  const d = { x: (w.x2 - w.x1) / centerline, y: (w.y2 - w.y1) / centerline };
  const n = rot90(d);
  const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
  const probe = Math.max(0.01, halfW * 0.25);
  const plusIn = Boolean(detectRegion(allWalls, mx + n.x * probe, my + n.y * probe));
  const minusIn = Boolean(detectRegion(allWalls, mx - n.x * probe, my - n.y * probe));
  const ca = endCorners({ x: w.x1, y: w.y1 }, d, halfW, allWalls, w, widthOf);
  const cb = endCorners({ x: w.x2, y: w.y2 }, { x: -d.x, y: -d.y }, halfW, allWalls, w, widthOf);
  const plusLen = dist(ca[0].x, ca[0].y, cb[1].x, cb[1].y);
  const minusLen = dist(ca[1].x, ca[1].y, cb[0].x, cb[0].y);
  if (plusIn === minusIn) {
    if (w.pendingFace && (w.traceSide === 1 || w.traceSide === -1)) {
      const interiorSide = w.lengthBasis === "inside" ? -w.traceSide : w.traceSide;
      return interiorSide > 0
        ? { outside: minusLen, centerline, inside: plusLen, resolved: true, interiorSide }
        : { outside: plusLen, centerline, inside: minusLen, resolved: true, interiorSide };
    }
    return { outside: centerline, centerline, inside: centerline, resolved: false };
  }
  return plusIn
    ? { outside: minusLen, centerline, inside: plusLen, resolved: true, interiorSide: 1 }
    : { outside: plusLen, centerline, inside: minusLen, resolved: true, interiorSide: -1 };
}

export function wallMeasuredLen(w, allWalls, basis = "centerline", widthOf = (q) => q.thickness / 12) {
  return wallFaceLengths(w, allWalls, widthOf)[basis] ?? wallLen(w);
}

// Length along a wall's exterior face (the mitered outside edge), used as the
// default dimension label. "Outside" is whichever face is farther from the
// enclosed interior when the wall is part of a closed loop; walls that
// aren't part of one (nothing to be "outside" of) fall back to centerline length.
export function wallOutsideLen(w, allWalls, widthOf) {
  return wallFaceLengths(w, allWalls, widthOf).outside;
}

// Resize a wall by the dimension basis the estimator is editing. The endpoint
// cluster at x2/y2 moves together, preserving connected corners. Face lengths
// are solved iteratively because miter geometry may involve mixed thicknesses
// or angled walls rather than a simple thickness subtraction.
export function resizeWallToMeasuredLength(wallId, allWalls, target, basis = "centerline") {
  const original = allWalls.find((w) => w.id === wallId);
  if (!original || target <= 0) return allWalls;
  const current = wallLen(original);
  if (current < 0.01) return allWalls;
  const ux = (original.x2 - original.x1) / current, uy = (original.y2 - original.y1) / current;
  const ox = original.x2, oy = original.y2;
  const moveToCenterlineLength = (length) => {
    const safe = Math.max(0.05, length);
    const nx = original.x1 + ux * safe, ny = original.y1 + uy * safe;
    return allWalls.map((w) => {
      const next = { ...w };
      if (same(w.x1, w.y1, ox, oy)) { next.x1 = nx; next.y1 = ny; }
      if (same(w.x2, w.y2, ox, oy)) { next.x2 = nx; next.y2 = ny; }
      return next;
    });
  };
  if (basis === "centerline") return moveToCenterlineLength(target);

  let guess = Math.max(0.05, current + target - wallMeasuredLen(original, allWalls, basis));
  let best = allWalls;
  for (let i = 0; i < 12; i++) {
    const candidate = moveToCenterlineLength(guess);
    const candidateWall = candidate.find((w) => w.id === wallId);
    const measured = wallMeasuredLen(candidateWall, candidate, basis);
    best = candidate;
    const error = measured - target;
    if (Math.abs(error) < 1 / 1200) break;
    const step = Math.max(1 / 1200, guess * 0.0001);
    const stepped = moveToCenterlineLength(guess + step);
    const steppedWall = stepped.find((w) => w.id === wallId);
    const slope = (wallMeasuredLen(steppedWall, stepped, basis) - measured) / step;
    guess = Math.max(0.05, guess - error / (Math.abs(slope) > 1e-5 ? slope : 1));
  }
  return best;
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

// For topology only, extend a branch that physically ends at another wall's
// face to its centerline, then divide that host into virtual segments. The
// stored wall lengths and physical wall/footing geometry remain unchanged.
export function wallTopologySegments(walls) {
  const adjusted = walls.map((wall) => ({ ...wall }));
  for (const wall of adjusted) for (const end of [1, 2]) {
    const point = { x: wall[`x${end}`], y: wall[`y${end}`] };
    const other = { x: wall[`x${3 - end}`], y: wall[`y${3 - end}`] };
    if (walls.some((w) => w.id !== wall.id && (same(point.x, point.y, w.x1, w.y1) || same(point.x, point.y, w.x2, w.y2)))) continue;
    let best = null;
    for (const host of walls) {
      if (host.id === wall.id || !(host.thickness > 0)) continue;
      const dx = host.x2 - host.x1, dy = host.y2 - host.y1, length = Math.hypot(dx, dy);
      const branchLength = dist(point.x, point.y, other.x, other.y);
      if (length < 0.01 || branchLength < 0.01) continue;
      const t = ((point.x - host.x1) * dx + (point.y - host.y1) * dy) / (length * length);
      if (t <= EP / length || t >= 1 - EP / length) continue;
      const x = host.x1 + t * dx, y = host.y1 + t * dy;
      const separation = dist(x, y, point.x, point.y), error = Math.abs(separation - host.thickness / 24);
      if (error > 0.01) continue;
      // Branch must leave the face, not continue through the host wall.
      if ((point.x - x) * (other.x - point.x) + (point.y - y) * (other.y - point.y) <= 0) continue;
      if (Math.abs(dx * (other.y - point.y) - dy * (other.x - point.x)) / (length * branchLength) < 0.01) continue;
      if (!best || error < best.error) best = { x, y, error };
    }
    if (best) { wall[`x${end}`] = best.x; wall[`y${end}`] = best.y; }
  }
  const endpoints = adjusted.flatMap((w) => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]);
  const segments = [];
  for (const wall of adjusted) {
    const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1, length2 = dx * dx + dy * dy;
    if (length2 < 0.0001) continue;
    const points = [0, 1];
    for (const p of endpoints) {
      const t = ((p.x - wall.x1) * dx + (p.y - wall.y1) * dy) / length2;
      if (t > 1e-6 && t < 1 - 1e-6 && dist(p.x, p.y, wall.x1 + t * dx, wall.y1 + t * dy) < EP) points.push(t);
    }
    points.sort((a, b) => a - b);
    const unique = points.filter((t, i) => !i || (t - points[i - 1]) * Math.sqrt(length2) > EP);
    for (let i = 1; i < unique.length; i++) {
      const from = unique[i - 1], to = unique[i];
      segments.push({ wallId: wall.id, thickness: wall.thickness, x1: wall.x1 + from * dx, y1: wall.y1 + from * dy, x2: wall.x1 + to * dx, y2: wall.y1 + to * dy });
    }
  }
  return segments;
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
  wallTopologySegments(walls).forEach((w) => {
    if (wallLen(w) < 0.01) return;
    const a = nodeKey(w.x1, w.y1), b = nodeKey(w.x2, w.y2);
    if (a === b) return;
    const A = nodes[a], B = nodes[b];
    half.push({ from: a, to: b, wallId: w.wallId, ang: Math.atan2(B.y - A.y, B.x - A.x) });
    half.push({ from: b, to: a, wallId: w.wallId, ang: Math.atan2(A.y - B.y, A.x - B.x) });
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
  let best = null, bestA = Infinity, bestWallIds = null;
  for (let s = 0; s < half.length; s++) {
    if (used[s]) continue;
    const poly = [], wallIds = [];
    let i = s, guard = 0;
    while (!used[i] && guard++ < 20000) {
      used[i] = true;
      poly.push(nodes[half[i].from]);
      wallIds.push(half[i].wallId);
      i = nextHE(i);
    }
    if (poly.length < 3) continue;
    if (!pointInPoly(px, py, poly)) continue;
    const a = Math.abs(shoelace(poly));
    if (a > 0.5 && a < bestA) { bestA = a; best = poly; bestWallIds = wallIds; }
  }
  if (!best) return null;
  const result = best.map((p) => ({ x: p.x, y: p.y }));
  result.wallIds = bestWallIds;
  return result;
}

// Offset each boundary of the detected centerline face into the room by that
// wall's half-thickness. Intersect neighboring offsets to obtain clear corners.
export function detectClearRegion(walls, px, py) {
  const loop = detectRegion(walls, px, py);
  if (!loop) return null;
  const orientation = Math.sign(shoelace(loop));
  const lines = loop.map((a, i) => {
    const b = loop[(i + 1) % loop.length];
    const matching = walls.filter((w) => w.id === loop.wallIds[i]);
    if (matching.length !== 1 || !(matching[0].thickness > 0)) return null;
    const length = dist(a.x, a.y, b.x, b.y);
    if (length < 0.01) return null;
    const d = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const offset = matching[0].thickness / 24 * orientation;
    return { p: { x: a.x - d.y * offset, y: a.y + d.x * offset }, d };
  });
  if (lines.some((line) => !line)) return null;
  const clear = lines.map((line, i) => {
    const prev = lines[(i - 1 + lines.length) % lines.length];
    const intersection = lineIntersect(prev.p, prev.d, line.p, line.d);
    if (intersection) return intersection;
    // Collinear segments with the same wall face share a valid corner.
    const cross = (line.p.x - prev.p.x) * prev.d.y - (line.p.y - prev.p.y) * prev.d.x;
    return Math.abs(cross) < 1e-6 ? line.p : null;
  });
  if (clear.some((p) => !p) || Math.sign(shoelace(clear)) !== orientation || !pointInPoly(px, py, clear)) return null;
  // Reject self-crossing offsets instead of reporting a misleading area for
  // an area too narrow or complex for this simple boundary construction.
  for (let i = 0; i < clear.length; i++) {
    const a = clear[i], b = clear[(i + 1) % clear.length];
    for (let j = i + 1; j < clear.length; j++) {
      if (j === i + 1 || (i === 0 && j === clear.length - 1)) continue;
      const c = clear[j], d = clear[(j + 1) % clear.length];
      const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return null;
    }
  }
  return clear;
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
export function collectFitPoints({ walls, pads, areas, drains = [], slabs = [], texts = [], wings = [] }) {
  const pts = [];
  walls.forEach((w) => { pts.push([w.x1, w.y1], [w.x2, w.y2]); });
  pads.forEach((p) => { pts.push([p.x - p.w / 24, p.y - p.l / 24], [p.x + p.w / 24, p.y + p.l / 24]); });
  areas.forEach((a) => a.pts.forEach((p) => pts.push([p.x, p.y])));
  drains.forEach((d) => d.pts.forEach((p) => pts.push([p.x, p.y])));
  slabs.forEach((s) => slabCorners(s).forEach((p) => pts.push([p.x, p.y])));
  texts.forEach((t) => { pts.push([t.x, t.y - t.size / 12], [t.x + t.text.length * t.size / 20, t.y]); });
  wings.forEach((w) => wingFootprint(w, walls).forEach((p) => pts.push([p.x, p.y])));
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

