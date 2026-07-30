import React from "react";
import { SEL } from "../constants";
import { MONO as mono } from "../constants";
import { wallPolygon, wallOutsideLen, formatFtIn } from "../geometry";
import { footOf, wallKey } from "../model";
import { hexToRgba, shade } from "../color";
import { ptsStr } from "./screenUtils";

export function WallGlyph({ wall: w, isPreview = false, walls, tf, toScreen, sel, rowColor, shown, showDims }) {
  const geomWalls = isPreview ? [w] : walls;
  const wPoly = wallPolygon(w, geomWalls, (q) => q.thickness / 12);
  const fPoly = wallPolygon(w, geomWalls, (q) => footOf(q).w / 12);
  if (!wPoly) return null;
  const key = wallKey(w);
  const col = isPreview ? SEL : rowColor(key);
  const vis = isPreview ? 1 : shown(key) ? 1 : 0.06;
  const [x1, y1] = toScreen(w.x1, w.y1);
  const [x2, y2] = toScreen(w.x2, w.y2);
  const fPx = Math.max(4, (footOf(w).w / 12) * tf.scale);
  const selected = !isPreview && sel && sel.type === "wall" && sel.id === w.id;
  const len = wallOutsideLen(w, geomWalls, (q) => q.thickness / 12);
  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
  let ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  let flip = false;
  if (ang > 90 || ang < -90) { ang += 180; flip = true; }
  const off = fPx / 2 + 12;
  const rad = Math.atan2(y2 - y1, x2 - x1);
  const nx = Math.sin(rad) * (flip ? 1 : -1);
  const ny = -Math.cos(rad) * (flip ? 1 : -1);
  const lx = midX + nx * off, ly = midY + ny * off;
  return (
    <g key={isPreview ? "pv" : "w" + w.id} opacity={vis}>
      {fPoly && <polygon points={ptsStr(fPoly, toScreen)} fill={hexToRgba(col, 0.25)} />}
      <polygon
        points={ptsStr(wPoly, toScreen)}
        fill={hexToRgba(col, isPreview ? 0.6 : 0.85)}
        stroke={selected ? SEL : shade(col, 0.6)}
        strokeWidth={selected ? 2.5 : 1}
      />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={shade(col, 0.55)} strokeWidth={1} strokeDasharray="5 4" opacity={0.6} />
      {(isPreview || showDims) && tf.scale > 3 && len > 0.4 && (
        <text x={lx} y={ly} transform={`rotate(${ang} ${lx} ${ly})`} textAnchor="middle" fontSize={11} fontFamily={mono} fill={selected || isPreview ? "#b35a1c" : "#5c646b"}>
          {formatFtIn(len)}
        </text>
      )}
    </g>
  );
}
