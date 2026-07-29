import { useCallback, useMemo } from "react";
import { dist, same } from "../geometry";

// Endpoint/angle/grid snapping for the drawing tools (walls, ruler, area trace).
export function useSnapping(walls, scale) {
  const endpoints = useMemo(() => {
    const pts = [];
    walls.forEach((w) => {
      pts.push({ x: w.x1, y: w.y1 });
      pts.push({ x: w.x2, y: w.y2 });
    });
    return pts;
  }, [walls]);

  // Snap increment follows the zoom: pick the finest step that is still at least
  // MIN_SNAP_PX wide on screen, so zooming in unlocks inch-by-inch control and
  // zooming out keeps the cursor from getting twitchy.
  const snapInc = useMemo(() => {
    const MIN_SNAP_PX = 5;
    const ladder = [1 / 12, 0.25, 0.5, 1, 2]; // 1", 3", 6", 1', 2'
    for (const inc of ladder) if (inc * scale >= MIN_SNAP_PX) return inc;
    return ladder[ladder.length - 1];
  }, [scale]);

  const snapLabel = useMemo(() => {
    const inches = snapInc * 12;
    return inches < 12 ? `${Math.round(inches)}"` : `${snapInc}'`;
  }, [snapInc]);

  // round a distance/coordinate (ft) to the active snap increment
  const snapTo = useCallback((v) => Math.round(v / snapInc) * snapInc, [snapInc]);

  const snapPreview = useCallback(
    (from, wx, wy, alt) => {
      const tol = 12 / scale;
      let best = null, bd = tol;
      for (const p of endpoints) {
        const d = dist(wx, wy, p.x, p.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (from && best && same(best.x, best.y, from.x, from.y)) best = null;
      if (best) return { x: best.x, y: best.y, type: "endpoint" };
      if (!from) return { x: snapTo(wx), y: snapTo(wy), type: "grid" };
      const dx = wx - from.x, dy = wy - from.y;
      let ang = Math.atan2(dy, dx);
      let d = Math.hypot(dx, dy);
      if (!alt) {
        const step = Math.PI / 4;
        ang = Math.round(ang / step) * step;
        d = snapTo(d);
      }
      return { x: from.x + Math.cos(ang) * d, y: from.y + Math.sin(ang) * d, type: alt ? "free" : "angle", ang };
    },
    [endpoints, scale, snapTo]
  );

  return { endpoints, snapInc, snapLabel, snapTo, snapPreview };
}
