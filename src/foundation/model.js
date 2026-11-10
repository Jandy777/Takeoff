// ---------- document model: entity shapes, ids, grouping keys ----------

export const defFootW = (t) => t * 2;
export const defFootH = (t) => t;

export const footOf = (w) => (w.footing ? w.footing : { w: defFootW(w.thickness), h: defFootH(w.thickness) });

let _id = 1;
export const nid = () => _id++;

export const wallColorKey = (w) => `wall-color|${w.thickness}|${w.depth}`;
export const wallKey = (w) => `wall|${w.thickness}|${w.depth}|${w.lengthBasis || "centerline"}`;
export const footingColorKey = (w) => { const f = footOf(w); return `footing-color|${f.w}|${f.h}`; };
export const footingKey = (w) => { const f = footOf(w); return `footing|${f.w}|${f.h}|${w.lengthBasis || "centerline"}`; };
export const padKey = (p) => `pad|${p.w}x${p.l}x${p.d}`;
export const winKey = (w) => `win|${w.kind}|${w.width}`;
export const areaKey = (a) => `area|${a.id}`;
export const slabKey = (s) => `thickened-slab|${s.w}|${s.l}|${s.d}`;
export const wingKey = () => "wing-arm";

export const EMPTY_DOC = { walls: [], pads: [], windows: [], areas: [], dims: [], drains: [], ledges: [], slabs: [], texts: [], wings: [] };

