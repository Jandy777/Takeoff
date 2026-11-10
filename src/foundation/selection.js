import { same, windowPose, wallPolygon, pointInPoly, slabCorners, wingFootprint } from "./geometry";

const TYPES = { wall: "walls", pad: "pads", window: "windows", area: "areas", dim: "dims", drain: "drains", ledge: "ledges", slab: "slabs", text: "texts", wing: "wings" };
export const selected = (items, type, id) => items.some((item) => item.type === type && item.id === id);
export function toggleSelection(items, item) {
  return selected(items, item.type, item.id) ? items.filter((s) => s.type !== item.type || s.id !== item.id) : [...items, item];
}

export function selectInBox(doc, a, b) {
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  const inside = (p) => p && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  const segmentHits = (p, q) => {
    let low = 0, high = 1;
    const dx = q.x - p.x, dy = q.y - p.y;
    for (const [direction, offset] of [[-dx, p.x - minX], [dx, maxX - p.x], [-dy, p.y - minY], [dy, maxY - p.y]]) {
      if (Math.abs(direction) < 1e-12) { if (offset < 0) return false; continue; }
      const t = offset / direction;
      if (direction < 0) low = Math.max(low, t); else high = Math.min(high, t);
      if (low > high) return false;
    }
    return true;
  };
  const overlaps = (points, closed = false) => {
    if (!points.length) return false;
    if (points.some(inside)) return true;
    for (let i = 1; i < points.length; i++) if (segmentHits(points[i - 1], points[i])) return true;
    if (closed && points.length > 2) {
      if (segmentHits(points[points.length - 1], points[0])) return true;
      if (pointInPoly(minX, minY, points)) return true;
    }
    return false;
  };
  const hits = [];
  const add = (type, id, points, closed = false) => { if (overlaps(points, closed)) hits.push({ type, id }); };
  for (const w of doc.walls) add("wall", w.id, wallPolygon(w, doc.walls, (q) => q.thickness / 12) || [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }], true);
  for (const p of doc.pads) add("pad", p.id, [{ x: p.x - p.w / 24, y: p.y - p.l / 24 }, { x: p.x + p.w / 24, y: p.y - p.l / 24 }, { x: p.x + p.w / 24, y: p.y + p.l / 24 }, { x: p.x - p.w / 24, y: p.y + p.l / 24 }], true);
  for (const w of doc.windows) {
    const p = windowPose(w, doc.walls);
    if (p) { const ux = Math.cos(p.ang) * w.width / 24, uy = Math.sin(p.ang) * w.width / 24; add("window", w.id, [{ x: p.x - ux, y: p.y - uy }, { x: p.x + ux, y: p.y + uy }]); }
  }
  for (const a of doc.areas) add("area", a.id, a.pts, true);
  for (const m of doc.dims || []) add("dim", m.id, [{ x: m.x1, y: m.y1 }, { x: m.x2, y: m.y2 }]);
  for (const d of doc.drains || []) add("drain", d.id, d.pts);
  for (const l of doc.ledges || []) add("ledge", l.id, l.pts);
  for (const s of doc.slabs || []) add("slab", s.id, slabCorners(s), true);
  for (const t of doc.texts || []) add("text", t.id, [{ x: t.x, y: t.y - t.size / 12 }, { x: t.x + t.text.length * t.size / 20, y: t.y }], true);
  for (const w of doc.wings || []) add("wing", w.id, wingFootprint(w, doc.walls), true);
  return hits;
}

export function selectionDocument(doc, items) {
  const result = {};
  for (const [type, field] of Object.entries(TYPES)) result[field] = (doc[field] || []).filter((entity) => selected(items, type, entity.id));
  return result;
}

export function moveSelection(doc, items, dx, dy) {
  const has = (type, id) => selected(items, type, id);
  const movingWalls = doc.walls.filter((w) => has("wall", w.id));
  for (const wall of movingWalls) for (const other of doc.walls) {
    if (has("wall", other.id)) continue;
    if ([ [wall.x1, wall.y1], [wall.x2, wall.y2] ].some(([x, y]) => same(x, y, other.x1, other.y1) || same(x, y, other.x2, other.y2))) return { error: "Select adjoining walls too before moving this group." };
  }
  if (doc.windows.some((w) => has("window", w.id) && w.wallId != null && !has("wall", w.wallId))) return { error: "Select the window's wall too before moving this group." };
  if ((doc.wings || []).some((w) => has("wing", w.id) && w.wallId != null && !has("wall", w.wallId))) return { error: "Select the wing arm's wall too before moving this group." };
  if ((doc.ledges || []).some((l) => has("ledge", l.id) && !has("wall", l.wallId))) return { error: "Select the ledge's wall too before moving this group." };
  if ((doc.drains || []).some((d) => has("drain", d.id) && d.pts.some((p) => p.anchor && !has("wall", p.anchor.wallId)))) return { error: "Select the walls attached to the drain tile before moving this group." };
  const point = (p) => ({ ...p, x: p.x + dx, y: p.y + dy });
  const pair = (w) => ({ ...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy });
  return { doc: {
    ...doc,
    walls: doc.walls.map((w) => has("wall", w.id) ? pair(w) : w),
    pads: doc.pads.map((p) => has("pad", p.id) ? point(p) : p),
    slabs: (doc.slabs || []).map((p) => has("slab", p.id) ? point(p) : p),
    texts: (doc.texts || []).map((p) => has("text", p.id) ? point(p) : p),
    wings: (doc.wings || []).map((p) => has("wing", p.id) && p.wallId == null ? point(p) : p),
    windows: doc.windows.map((w) => has("window", w.id) && w.wallId == null ? point(w) : w),
    areas: doc.areas.map((a) => has("area", a.id) ? { ...a, pts: a.pts.map(point) } : a),
    dims: (doc.dims || []).map((m) => has("dim", m.id) ? pair(m) : m),
    drains: (doc.drains || []).map((d) => has("drain", d.id) ? { ...d, pts: d.pts.map((p) => p.anchor ? p : point(p)) } : d),
  } };
}

export function deleteSelection(doc, items, resolvedDoc = doc) {
  const has = (type, id) => selected(items, type, id);
  const deletedWalls = new Set(doc.walls.filter((w) => has("wall", w.id)).map((w) => w.id));
  return {
    ...doc,
    walls: doc.walls.filter((w) => !has("wall", w.id)),
    pads: doc.pads.filter((p) => !has("pad", p.id)),
    slabs: (doc.slabs || []).filter((p) => !has("slab", p.id)),
    texts: (doc.texts || []).filter((p) => !has("text", p.id)),
    wings: (doc.wings || []).filter((p) => !has("wing", p.id) && !deletedWalls.has(p.wallId)),
    windows: doc.windows.filter((w) => !has("window", w.id) && !deletedWalls.has(w.wallId)),
    areas: doc.areas.filter((a) => !has("area", a.id)),
    dims: (doc.dims || []).filter((m) => !has("dim", m.id)),
    ledges: (doc.ledges || []).filter((l) => !has("ledge", l.id) && !deletedWalls.has(l.wallId)),
    drains: (doc.drains || []).filter((d) => !has("drain", d.id)).map((run) => {
      const visible = (resolvedDoc.drains || []).find((r) => r.id === run.id);
      return { ...run, pts: run.pts.map((p, i) => p.anchor && deletedWalls.has(p.anchor.wallId) && visible?.pts[i] ? { x: visible.pts[i].x, y: visible.pts[i].y } : p) };
    }),
  };
}
