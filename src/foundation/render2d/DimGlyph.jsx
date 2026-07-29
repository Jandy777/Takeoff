import React from "react";
import { MONO as mono } from "../constants";
import { dist, formatFtIn } from "../geometry";
import { SEL } from "../constants";

export function DimGlyph({ dim: m, isPreview = false, toScreen, sel }) {
  const [x1, y1] = toScreen(m.x1, m.y1);
  const [x2, y2] = toScreen(m.x2, m.y2);
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 2) return null;
  const selected = !isPreview && sel && sel.type === "dim" && sel.id === m.id;
  const col = selected ? SEL : "#4a6fa5";
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  const px = -uy, py = ux;
  const len = dist(m.x1, m.y1, m.x2, m.y2);
  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
  let ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  let flipSign = 1;
  if (ang > 90 || ang < -90) { ang += 180; flipSign = -1; }
  const lx = midX - px * 11 * flipSign, ly = midY - py * 11 * flipSign;
  return (
    <g key={isPreview ? "dpv" : "dim" + m.id} opacity={isPreview ? 0.8 : 1}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={selected ? 2.2 : 1.4} />
      <line x1={x1 - px * 6} y1={y1 - py * 6} x2={x1 + px * 6} y2={y1 + py * 6} stroke={col} strokeWidth={1.4} />
      <line x1={x2 - px * 6} y1={y2 - py * 6} x2={x2 + px * 6} y2={y2 + py * 6} stroke={col} strokeWidth={1.4} />
      <text x={lx} y={ly} transform={`rotate(${ang} ${lx} ${ly})`} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily={mono} fill={col}>
        {formatFtIn(len)}
      </text>
    </g>
  );
}
