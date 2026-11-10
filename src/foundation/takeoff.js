import { wallMeasuredLen, shoelace, dist } from "./geometry";
import { footOf, wallKey, padKey, winKey, areaKey } from "./model";

// Pure rollup of a document's entities into the grouped rows shown in the
// takeoff panel. Kept free of React so it can be unit tested and reused
// (e.g. for export/print) without mounting the editor.
export function computeTakeoff({ walls, pads, windows, areas, drains = [], ledges = [] }) {
  const wallGroups = new Map();
  let totalLF = 0;
  for (const w of walls) {
    const f = footOf(w);
    const key = wallKey(w);
    const basis = w.lengthBasis || "centerline";
    const len = wallMeasuredLen(w, walls, basis);
    totalLF += len;
    if (!wallGroups.has(key)) wallGroups.set(key, { key, thickness: w.thickness, depth: w.depth, fw: f.w, fh: f.h, basis, len: 0, count: 0 });
    const g = wallGroups.get(key);
    g.len += len;
    g.count++;
  }
  const padGroups = new Map();
  for (const p of pads) {
    const key = padKey(p);
    if (!padGroups.has(key)) padGroups.set(key, { key, w: p.w, l: p.l, d: p.d, count: 0 });
    padGroups.get(key).count++;
  }
  const winGroups = new Map();
  for (const w of windows) {
    const key = winKey(w);
    if (!winGroups.has(key)) winGroups.set(key, { key, kind: w.kind, width: w.width, count: 0 });
    winGroups.get(key).count++;
  }
  const areaRows = areas.map((a) => ({ key: areaKey(a), name: a.name, sf: Math.abs(shoelace(a.pts)) }));
  const totalSF = areaRows.reduce((s, r) => s + r.sf, 0);
  const drainRows = ["exterior", "interior"].map((kind) => {
    const runs = drains.filter((d) => d.kind === kind);
    const len = runs.reduce((sum, run) => sum + run.pts.slice(1).reduce((n, p, i) => n + dist(run.pts[i].x, run.pts[i].y, p.x, p.y), 0), 0);
    return { kind, len, count: runs.length };
  }).filter((r) => r.count);
  const ledgeGroups = new Map();
  for (const ledge of ledges) {
    if (ledge.pts?.length !== 2) continue;
    const key = `${ledge.kind}|${ledge.size}`;
    if (!ledgeGroups.has(key)) ledgeGroups.set(key, { kind: ledge.kind, size: ledge.size, len: 0 });
    ledgeGroups.get(key).len += dist(ledge.pts[0].x, ledge.pts[0].y, ledge.pts[1].x, ledge.pts[1].y);
  }
  return {
    wallRows: [...wallGroups.values()].sort((a, b) => a.thickness - b.thickness || a.depth - b.depth),
    padRows: [...padGroups.values()].sort((a, b) => a.w - b.w || a.l - b.l),
    winRows: [...winGroups.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.width - b.width),
    areaRows,
    totalLF,
    totalSF,
    drainRows,
    ledgeRows: [...ledgeGroups.values()],
  };
}

