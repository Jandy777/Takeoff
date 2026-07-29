import React from "react";
import { windowPose } from "../geometry";
import { winKey } from "../model";
import { hexToRgba, shade } from "../color";
import { SEL } from "../constants";

export function WindowGlyph({ win, walls, tf, toScreen, sel, rowColor, shown }) {
  const pose = windowPose(win, walls);
  if (!pose) return null;
  const key = winKey(win);
  const col = rowColor(key);
  const vis = shown(key) ? 1 : 0.06;
  const selected = sel && sel.type === "window" && sel.id === win.id;
  const [cx, cy] = toScreen(pose.x, pose.y);
  const halfWpx = ((win.width / 12) / 2) * tf.scale;
  const tPx = Math.max(4, (pose.thickness / 12) * tf.scale);
  const degrees = (pose.ang * 180) / Math.PI;
  const bump = Math.max(halfWpx * 0.7, ((18 / 12) / 2) * tf.scale) * 2; // well projection ~18"
  return (
    <g key={"win" + win.id} opacity={vis} transform={`rotate(${degrees} ${cx} ${cy})`}>
      {win.kind === "well" && (
        <path
          d={`M ${cx - halfWpx} ${cy + (win.side * tPx) / 2} A ${halfWpx} ${bump / 2} 0 0 ${win.side > 0 ? 1 : 0} ${cx + halfWpx} ${cy + (win.side * tPx) / 2}`}
          fill={hexToRgba(col, 0.35)}
          stroke={selected ? SEL : shade(col, 0.6)}
          strokeWidth={selected ? 2.5 : 1.4}
        />
      )}
      <rect
        x={cx - halfWpx} y={cy - tPx / 2} width={halfWpx * 2} height={tPx}
        fill="#ffffff" stroke={selected ? SEL : shade(col, 0.6)} strokeWidth={selected ? 2.5 : 1.4}
      />
      <line x1={cx - halfWpx} y1={cy} x2={cx + halfWpx} y2={cy} stroke={shade(col, 0.6)} strokeWidth={1} />
    </g>
  );
}
