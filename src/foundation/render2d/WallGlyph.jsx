import React from "react";
import { SEL } from "../constants";
import { MONO as mono } from "../constants";
import { wallPolygon, wallFaceLengths, formatFtIn } from "../geometry";
import { footOf, wallKey, wallColorKey, footingKey, footingColorKey } from "../model";
import { hexToRgba, shade } from "../color";
import { ptsStr } from "./screenUtils";

export function WallGlyph({ wall: w, isPreview = false, walls, tf, toScreen, sel, rowColor, shown, showDims, footingOnly = false }) {
  const geomWalls = isPreview ? [w] : walls;
  const wPoly = wallPolygon(w, geomWalls, (q) => q.thickness / 12);
  const fPoly = wallPolygon(w, geomWalls, (q) => footOf(q).w / 12);
  if (!wPoly) return null;
  const key = wallKey(w);
  const col = isPreview ? SEL : rowColor(wallColorKey(w));
  const footCol = isPreview ? SEL : rowColor(footingColorKey(w));
  const vis = isPreview ? 1 : shown(key) ? 1 : 0.06;
  const footVis = isPreview ? 1 : shown(footingKey(w)) ? 1 : 0.06;
  if (footingOnly) return fPoly ? <polygon points={ptsStr(fPoly, toScreen)} fill={hexToRgba(footCol, 0.38)} stroke={footCol} strokeWidth={1} opacity={footVis} /> : null;
  const [x1, y1] = toScreen(w.x1, w.y1);
  const [x2, y2] = toScreen(w.x2, w.y2);
  const selected = !isPreview && sel && sel.type === "wall" && sel.id === w.id;
  const basis = w.lengthBasis || "centerline";
  const faces = wallFaceLengths(w, geomWalls, (q) => q.thickness / 12);
  const len = faces[basis];
  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
  let ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  if (ang > 90 || ang < -90) ang += 180;
  const rad = Math.atan2(y2 - y1, x2 - x1);
  const nx = -Math.sin(rad), ny = Math.cos(rad);
  // A closed perimeter determines the interior. Open runs have no reliable
  // inside/outside yet, so keep their label on a consistent provisional side.
  const side = faces.resolved ? faces.interiorSide * (basis === "outside" ? -1 : 1) : -1;
  const offset = basis === "centerline" ? 0 : (w.thickness / 24) * tf.scale + 15;
  const lx = midX + nx * side * offset, ly = midY + ny * side * offset;
  return (
    <g key={isPreview ? "pv" : "w" + w.id}>
      <g opacity={vis}>
      <polygon
        points={ptsStr(wPoly, toScreen)}
        fill={hexToRgba(col, isPreview ? 0.6 : 0.85)}
        stroke={selected ? SEL : shade(col, 0.6)}
        strokeWidth={selected ? 2.5 : 1}
      />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={shade(col, 0.55)} strokeWidth={1} strokeDasharray="5 4" opacity={0.6} />
      {(isPreview || showDims) && tf.scale > 3 && len > 0.4 && (
        <text x={lx} y={ly} transform={`rotate(${ang} ${lx} ${ly})`} textAnchor="middle" dominantBaseline="central" fontSize={11} fontFamily={mono} fill={selected || isPreview ? "#b35a1c" : "#5c646b"} stroke={basis === "centerline" ? "#fff" : "none"} strokeWidth={3} paintOrder="stroke">
          {formatFtIn(len)}
        </text>
      )}
      </g>
    </g>
  );
}

