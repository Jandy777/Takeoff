import React from "react";
import { MONO as mono } from "../constants";
import { shoelace } from "../geometry";
import { areaKey } from "../model";
import { hexToRgba, shade } from "../color";
import { SEL } from "../constants";
import { ptsStr } from "./screenUtils";

export function AreaGlyph({ area: a, tf, toScreen, sel, rowColor, shown }) {
  const key = areaKey(a);
  const col = rowColor(key);
  const vis = shown(key) ? 1 : 0.06;
  const selected = sel && sel.type === "area" && sel.id === a.id;
  const c = a.pts.reduce((s, p) => ({ x: s.x + p.x / a.pts.length, y: s.y + p.y / a.pts.length }), { x: 0, y: 0 });
  const [cx, cy] = toScreen(c.x, c.y);
  return (
    <g key={"a" + a.id} opacity={vis}>
      <polygon points={ptsStr(a.pts, toScreen)} fill={hexToRgba(col, 0.22)} stroke={selected ? SEL : col} strokeWidth={selected ? 2.5 : 1.5} strokeDasharray={selected ? "" : "7 5"} />
      {tf.scale > 3 && (
        <text x={cx} y={cy} textAnchor="middle" fontSize={12} fontWeight={700} fontFamily={mono} fill={shade(col, 0.55)}>
          {a.name} · {Math.round(Math.abs(shoelace(a.pts)))} SF
        </text>
      )}
    </g>
  );
}
