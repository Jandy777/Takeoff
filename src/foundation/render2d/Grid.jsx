import React, { useMemo } from "react";
import { COLORS } from "../constants";

export function Grid({ tf, size, toWorld, toScreen }) {
  const lines = useMemo(() => {
    const out = [];
    const [wx0, wy0] = toWorld(0, 0);
    const [wx1, wy1] = toWorld(size.w, size.h);
    const showMinor = tf.scale >= 6;
    const step = showMinor ? 1 : 10;
    const x0 = Math.floor(wx0 / step) * step;
    const y0 = Math.floor(wy0 / step) * step;
    for (let x = x0; x <= wx1; x += step) {
      const major = Math.round(x) % 10 === 0;
      if (!showMinor && !major) continue;
      const [sx] = toScreen(x, 0);
      out.push(<line key={"vx" + x} x1={sx} y1={0} x2={sx} y2={size.h} stroke={major ? COLORS.gridMajor : COLORS.gridMinor} strokeWidth={major ? 1.2 : 1} />);
    }
    for (let y = y0; y <= wy1; y += step) {
      const major = Math.round(y) % 10 === 0;
      if (!showMinor && !major) continue;
      const [, sy] = toScreen(0, y);
      out.push(<line key={"hz" + y} x1={0} y1={sy} x2={size.w} y2={sy} stroke={major ? COLORS.gridMajor : COLORS.gridMinor} strokeWidth={major ? 1.2 : 1} />);
    }
    return out;
  }, [tf, size, toWorld, toScreen]);

  return <g>{lines}</g>;
}
