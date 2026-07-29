import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_TF = { scale: 12, ox: 140, oy: 120 };

// Owns the 2D plan <-> screen transform (pan/zoom), the SVG container's
// measured size, and the pan gesture. `view` is passed in only to
// re-measure the wrapper when switching between the 2D/3D tabs.
export function useViewport(view) {
  const [tf, setTf] = useState(DEFAULT_TF);
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const panRef = useRef(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [view]);

  const toScreen = useCallback((x, y) => [tf.ox + x * tf.scale, tf.oy + y * tf.scale], [tf]);
  const toWorld = useCallback((sx, sy) => [(sx - tf.ox) / tf.scale, (sy - tf.oy) / tf.scale], [tf]);
  const svgPoint = useCallback((e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }, []);

  const beginPan = useCallback((sx, sy) => {
    panRef.current = { sx, sy, ox: tf.ox, oy: tf.oy };
  }, [tf.ox, tf.oy]);

  const updatePan = useCallback((sx, sy) => {
    const p = panRef.current;
    if (!p) return false;
    setTf((t) => ({ ...t, ox: p.ox + (sx - p.sx), oy: p.oy + (sy - p.sy) }));
    return true;
  }, []);

  const endPan = useCallback(() => {
    const was = !!panRef.current;
    panRef.current = null;
    return was;
  }, []);

  const isPanning = useCallback(() => !!panRef.current, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const [sx, sy] = svgPoint(e);
    const factor = Math.pow(1.0015, -e.deltaY);
    setTf((t) => {
      const ns = Math.min(120, Math.max(1.5, t.scale * factor));
      const k = ns / t.scale;
      return { scale: ns, ox: sx - (sx - t.ox) * k, oy: sy - (sy - t.oy) * k };
    });
  }, [svgPoint]);

  // Frame the drawing: walls, pad footprints, and traced areas.
  const fitView = useCallback((points) => {
    if (!points.length) { setTf(DEFAULT_TF); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(([x, y]) => {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
    const pad = 40;
    const scale = Math.min(120, Math.max(1.5, Math.min((size.w - pad * 2) / Math.max(1, maxX - minX), (size.h - pad * 2) / Math.max(1, maxY - minY))));
    setTf({ scale, ox: size.w / 2 - ((minX + maxX) / 2) * scale, oy: size.h / 2 - ((minY + maxY) / 2) * scale });
  }, [size]);

  return {
    tf, setTf, size, svgRef, wrapRef,
    toScreen, toWorld, svgPoint,
    beginPan, updatePan, endPan, isPanning,
    onWheel, fitView,
  };
}
