// ---------- document model: entity shapes, ids, grouping keys ----------

export const defFootW = (t) => t * 2;
export const defFootH = (t) => t;

export const footOf = (w) => (w.footing ? w.footing : { w: defFootW(w.thickness), h: defFootH(w.thickness) });

let _id = 1;
export const nid = () => _id++;

export const wallKey = (w) => {
  const f = footOf(w);
  return `wall|${w.thickness}|${w.depth}|${f.w}|${f.h}|${w.lengthBasis || "centerline"}`;
};
export const padKey = (p) => `pad|${p.w}x${p.l}x${p.d}`;
export const winKey = (w) => `win|${w.kind}|${w.width}`;
export const areaKey = (a) => `area|${a.id}`;

export const EMPTY_DOC = { walls: [], pads: [], windows: [], areas: [], dims: [], drains: [] };

