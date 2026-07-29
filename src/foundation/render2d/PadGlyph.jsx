import React from "react";
import { MONO as mono } from "../constants";
import { padKey } from "../model";
import { hexToRgba, shade } from "../color";
import { SEL } from "../constants";

export function PadGlyph({ pad: p, tf, toScreen, sel, rowColor, shown }) {
  const key = padKey(p);
  const col = rowColor(key);
  const vis = shown(key) ? 1 : 0.06;
  const [cx, cy] = toScreen(p.x, p.y);
  const hw = (p.w / 24) * tf.scale, hl = (p.l / 24) * tf.scale;
  const selected = sel && sel.type === "pad" && sel.id === p.id;
  return (
    <g key={"p" + p.id} opacity={vis}>
      <rect x={cx - hw} y={cy - hl} width={hw * 2} height={hl * 2} fill={hexToRgba(col, 0.5)} stroke={selected ? SEL : shade(col, 0.6)} strokeWidth={selected ? 2.5 : 1.2} />
      <line x1={cx - hw} y1={cy - hl} x2={cx + hw} y2={cy + hl} stroke={shade(col, 0.6)} strokeWidth={0.8} opacity={0.6} />
      <line x1={cx + hw} y1={cy - hl} x2={cx - hw} y2={cy + hl} stroke={shade(col, 0.6)} strokeWidth={0.8} opacity={0.6} />
      {tf.scale > 5 && (
        <text x={cx} y={cy - hl - 4} textAnchor="middle" fontSize={10} fontFamily={mono} fill={shade(col, 0.5)}>
          {p.w}×{p.l}×{p.d}
        </text>
      )}
    </g>
  );
}
