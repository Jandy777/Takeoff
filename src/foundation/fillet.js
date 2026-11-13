import { dist, same, lineIntersect, centerlineClosedWallRun } from "./geometry";

export function wallEndNear(wall, x, y) {
  return dist(x, y, wall.x1, wall.y1) <= dist(x, y, wall.x2, wall.y2) ? 1 : 2;
}

function hasAttachments(doc, ids) {
  const idsSet = new Set(ids);
  return (doc.windows || []).some((item) => idsSet.has(item.wallId)) ||
    (doc.wings || []).some((item) => idsSet.has(item.wallId)) ||
    (doc.ledges || []).some((item) => idsSet.has(item.wallId)) ||
    (doc.drains || []).some((run) => run.pts.some((point) => idsSet.has(point.anchor?.wallId)));
}

// Find a simple, completely pending face-drawn loop and preserve each wall's
// original direction when converting the closed footprint to centerlines.
function pendingLoop(walls, firstId) {
  const startWall = walls.find((w) => w.id === firstId);
  if (!startWall?.pendingFace || startWall.lengthBasis === "centerline") return null;
  const ordered = [{ wall: startWall, reversed: false }], used = new Set([firstId]);
  const start = { x: startWall.x1, y: startWall.y1 };
  let end = { x: startWall.x2, y: startWall.y2 };
  while (!same(end.x, end.y, start.x, start.y)) {
    const matches = walls.filter((w) => !used.has(w.id) && (same(w.x1, w.y1, end.x, end.y) || same(w.x2, w.y2, end.x, end.y)));
    if (matches.length !== 1) return null;
    const next = matches[0];
    if (!next.pendingFace || next.lengthBasis !== startWall.lengthBasis) return null;
    const reversed = same(next.x2, next.y2, end.x, end.y);
    ordered.push({ wall: next, reversed }); used.add(next.id);
    end = reversed ? { x: next.x1, y: next.y1 } : { x: next.x2, y: next.y2 };
    if (ordered.length > walls.length) return null;
  }
  if (ordered.length < 3) return null;
  // Only simple corners: no external wall also connects to any loop vertex.
  for (const { wall } of ordered) for (const other of walls) {
    if (used.has(other.id)) continue;
    if (same(wall.x1, wall.y1, other.x1, other.y1) || same(wall.x1, wall.y1, other.x2, other.y2) || same(wall.x2, wall.y2, other.x1, other.y1) || same(wall.x2, wall.y2, other.x2, other.y2)) return null;
  }
  return ordered;
}

export function filletWalls(doc, first, second) {
  if (!first || !second || first.id === second.id) return { error: "Select two different walls." };
  const a = doc.walls.find((w) => w.id === first.id), b = doc.walls.find((w) => w.id === second.id);
  if (!a || !b) return { error: "A selected wall no longer exists." };
  const da = { x: a.x2 - a.x1, y: a.y2 - a.y1 }, db = { x: b.x2 - b.x1, y: b.y2 - b.y1 };
  const la = Math.hypot(da.x, da.y), lb = Math.hypot(db.x, db.y);
  if (la < 0.01 || lb < 0.01) return { error: "The selected wall is too short to join." };
  if (Math.abs(da.x * db.y - da.y * db.x) / (la * lb) < 1e-5) return { error: "Parallel walls cannot form a fillet corner." };
  const point = lineIntersect({ x: a.x1, y: a.y1 }, da, { x: b.x1, y: b.y1 }, db);
  const ta = ((point.x - a.x1) * da.x + (point.y - a.y1) * da.y) / (la * la);
  const tb = ((point.x - b.x1) * db.x + (point.y - b.y1) * db.y) / (lb * lb);
  if ((first.end === 1 ? ta >= 1 - 0.01 / la : ta <= 0.01 / la) || (second.end === 1 ? tb >= 1 - 0.01 / lb : tb <= 0.01 / lb)) return { error: "Those ends would remove a whole wall. Select the other ends." };
  const endPoint = (w, end) => end === 1 ? { x: w.x1, y: w.y1 } : { x: w.x2, y: w.y2 };
  for (const [w, pick, other] of [[a, first, b], [b, second, a]]) {
    const old = endPoint(w, pick.end);
    if (same(old.x, old.y, point.x, point.y)) continue;
    if (doc.walls.some((q) => q.id !== w.id && q.id !== other.id && (same(q.x1, q.y1, old.x, old.y) || same(q.x2, q.y2, old.x, old.y)))) return { error: "That wall end is already connected. Choose a free end." };
  }
  if (hasAttachments(doc, [a.id, b.id])) return { error: "A selected wall has attached windows, wings, ledges, or drain tile. Remove those attachments before filleting." };
  const move = (w, end) => {
    const result=end === 1 ? { ...w, x1: point.x, y1: point.y } : { ...w, x2: point.x, y2: point.y };
    // An explicitly joined end uses the new corner; retain any CAD cut only
    // at the wall's other, untouched end.
    if(w.cadEndCuts){result.cadEndCuts={...w.cadEndCuts};delete result.cadEndCuts[end===1?"start":"end"];}
    return result;
  };
  let walls = doc.walls.map((w) => w.id === a.id ? move(w, first.end) : w.id === b.id ? move(w, second.end) : w);
  const loop = pendingLoop(walls, a.id);
  if (loop) {
    if (hasAttachments(doc, loop.map((entry) => entry.wall.id))) return { error: "The closing loop has attached items. Remove them before joining these walls." };
    if (loop.every(({ wall }) => wall.traceSide === 1 || wall.traceSide === -1)) {
      const ids = new Set(loop.map(({ wall }) => wall.id));
      walls = walls.map((w) => ids.has(w.id) ? { ...w, pendingFace: false } : w);
      return { walls, point, closedFaceLoop: true };
    }
    const oriented = loop.map(({ wall, reversed }) => reversed ? { ...wall, x1: wall.x2, y1: wall.y2, x2: wall.x1, y2: wall.y1 } : wall);
    const centered = centerlineClosedWallRun(oriented, a.lengthBasis);
    const converted = new Map(centered.map((wall, i) => {
      const result = loop[i].reversed ? { ...wall, x1: wall.x2, y1: wall.y2, x2: wall.x1, y2: wall.y1 } : wall;
      return [wall.id, { ...result, pendingFace: false }];
    }));
    walls = walls.map((w) => converted.get(w.id) || w);
  }
  return { walls, point, closedFaceLoop: Boolean(loop) };
}
