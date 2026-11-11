import { useEffect, useRef } from "react";

// Field viewers can pan with one finger and pinch to zoom without entering any
// drawing tool. Coordinates stay in CSS pixels, just like the mouse viewport.
export function usePlanTouchNavigation({ enabled, svgRef, tf, setTf }) {
  const currentTf = useRef(tf);
  currentTf.current = tf;
  useEffect(() => {
    const svg = svgRef.current;
    if (!enabled || !svg) return;
    let gesture = null;
    const points = (event) => {
      const bounds = svg.getBoundingClientRect();
      return [...event.touches].map((touch) => ({ x: touch.clientX - bounds.left, y: touch.clientY - bounds.top }));
    };
    const start = (event) => {
      event.preventDefault();
      const p = points(event);
      gesture = p.length ? { points: p, tf: { ...currentTf.current } } : null;
    };
    const move = (event) => {
      event.preventDefault();
      if (!gesture) return;
      const p = points(event), a = gesture.points;
      if (p.length !== a.length || !p.length) { gesture = null; return; }
      if (p.length === 1) setTf({ ...gesture.tf, ox: gesture.tf.ox + p[0].x - a[0].x, oy: gesture.tf.oy + p[0].y - a[0].y });
      else {
        const before = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
        const after = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
        const ratio = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / Math.max(1, Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y));
        const scale = Math.max(1.5, Math.min(120, gesture.tf.scale * ratio));
        const k = scale / gesture.tf.scale;
        setTf({ scale, ox: after.x - (before.x - gesture.tf.ox) * k, oy: after.y - (before.y - gesture.tf.oy) * k });
      }
    };
    svg.addEventListener("touchstart", start, { passive: false });
    svg.addEventListener("touchmove", move, { passive: false });
    svg.addEventListener("touchend", start, { passive: false });
    svg.addEventListener("touchcancel", start, { passive: false });
    return () => {
      svg.removeEventListener("touchstart", start); svg.removeEventListener("touchmove", move);
      svg.removeEventListener("touchend", start); svg.removeEventListener("touchcancel", start);
    };
  }, [enabled, svgRef, setTf]);
}
