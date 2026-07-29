import { wallLen, shoelace } from "./geometry";
import { footOf, wallKey, padKey, winKey, areaKey } from "./model";

// Pure rollup of a document's entities into the grouped rows shown in the
// takeoff panel. Kept free of React so it can be unit tested and reused
// (e.g. for export/print) without mounting the editor.
export function computeTakeoff({ walls, pads, windows, areas }) {
  const wallGroups = new Map();
  let totalLF = 0;
  for (const w of walls) {
    const f = footOf(w);
    const key = wallKey(w);
    const len = wallLen(w);
    totalLF += len;
    if (!wallGroups.has(key)) wallGroups.set(key, { key, thickness: w.thickness, depth: w.depth, fw: f.w, fh: f.h, len: 0, count: 0 });
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
  return {
    wallRows: [...wallGroups.values()].sort((a, b) => a.thickness - b.thickness || a.depth - b.depth),
    padRows: [...padGroups.values()].sort((a, b) => a.w - b.w || a.l - b.l),
    winRows: [...winGroups.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.width - b.width),
    areaRows,
    totalLF,
    totalSF,
  };
}
