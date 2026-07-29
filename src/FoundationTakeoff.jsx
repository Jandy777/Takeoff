import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import * as THREE from "three";

// ---------- constants ----------
const THICKNESS_PRESETS = [8, 10, 12]; // inches
const DEPTH_PRESETS = [4, 8, 9]; // feet
const COLORS = {
  chrome: "#20262d",
  chromeDeep: "#181d23",
  panel: "#262d35",
  border: "#39424c",
  text: "#e8eaed",
  textMut: "#98a3ae",
  accent: "#ff8a3d",
  canvas: "#f6f6f2",
  gridMinor: "#e4e7df",
  gridMajor: "#cdd3c8",
};
const SEL = "#ff8a3d";
const EP = 0.005; // ft tolerance for coincident points
const PALETTE = [
  "#d05252", "#3f8fd6", "#4aa768", "#b06fd6", "#d69a3f", "#3fb8ad",
  "#7079d6", "#c2b03e", "#d6699e", "#5f8f4a", "#8a6f52", "#5470a0",
];

// ---------- helpers ----------
const defFootW = (t) => t * 2;
const defFootH = (t) => t;

function parseLength(s) {
  if (s == null) return null;
  s = String(s).trim();
  if (!s) return null;
  let m = s.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in)?\s*)?$/);
  if (m) return parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 12 : 0);
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:"|in)$/);
  if (m) return parseFloat(m[1]) / 12;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function formatFtIn(ft) {
  if (!Number.isFinite(ft)) return "—";
  const neg = ft < 0;
  ft = Math.abs(ft);
  let f = Math.floor(ft);
  let i = Math.round((ft - f) * 12);
  if (i === 12) { f += 1; i = 0; }
  return `${neg ? "-" : ""}${f}'-${i}"`;
}

const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const wallLen = (w) => dist(w.x1, w.y1, w.x2, w.y2);
const same = (ax, ay, bx, by) => Math.abs(ax - bx) < EP && Math.abs(ay - by) < EP;
const clone = (o) => JSON.parse(JSON.stringify(o));

function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

const footOf = (w) => (w.footing ? w.footing : { w: defFootW(w.thickness), h: defFootH(w.thickness) });

const rot90 = (d) => ({ x: -d.y, y: d.x });

function lineIntersect(p1, d1, p2, d2) {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-9) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / cross;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

// Corners of a wall band at endpoint P. d = unit vector pointing from P into the wall.
function endCorners(P, d, halfW, allWalls, w, widthOf) {
  const n = rot90(d);
  const butt = [
    { x: P.x + n.x * halfW, y: P.y + n.y * halfW },
    { x: P.x - n.x * halfW, y: P.y - n.y * halfW },
  ];
  const conn = allWalls.filter(
    (q) => q.id !== w.id && (same(q.x1, q.y1, P.x, P.y) || same(q.x2, q.y2, P.x, P.y))
  );
  if (conn.length !== 1) return butt;
  const q = conn[0];
  const qOther = same(q.x1, q.y1, P.x, P.y) ? { x: q.x2, y: q.y2 } : { x: q.x1, y: q.y1 };
  const qlen = dist(P.x, P.y, qOther.x, qOther.y);
  if (qlen < 0.01) return butt;
  const dq = { x: (qOther.x - P.x) / qlen, y: (qOther.y - P.y) / qlen };
  if (Math.abs(d.x * dq.y - d.y * dq.x) < 1e-6) return butt;
  const nq = rot90(dq);
  const halfQ = widthOf(q) / 2;
  const maxMiter = Math.max(halfW, halfQ) * 8;
  return butt.map((c, i) => {
    const side = i === 0 ? 1 : -1;
    const oA = { x: n.x * halfW * side, y: n.y * halfW * side };
    const s1 = oA.x * dq.x + oA.y * dq.y;
    const nqd = nq.x * d.x + nq.y * d.y;
    const sB = (s1 >= 0 ? 1 : -1) * (nqd >= 0 ? 1 : -1);
    const oB = { x: nq.x * halfQ * sB, y: nq.y * halfQ * sB };
    const X = lineIntersect(
      { x: P.x + oA.x, y: P.y + oA.y }, d,
      { x: P.x + oB.x, y: P.y + oB.y }, dq
    );
    if (!X || dist(X.x, X.y, P.x, P.y) > maxMiter) return c;
    return X;
  });
}

function wallPolygon(w, allWalls, widthOf) {
  const len = wallLen(w);
  if (len < 0.01) return null;
  const d = { x: (w.x2 - w.x1) / len, y: (w.y2 - w.y1) / len };
  const halfW = widthOf(w) / 2;
  const ca = endCorners({ x: w.x1, y: w.y1 }, d, halfW, allWalls, w, widthOf);
  const cb = endCorners({ x: w.x2, y: w.y2 }, { x: -d.x, y: -d.y }, halfW, allWalls, w, widthOf);
  return [ca[0], cb[1], cb[0], ca[1]];
}

// Plan polygon for the piece of a wall between stations s0..s1 (ft along the wall).
// Outer ends keep the mitered corners; interior cuts are square.
function wallSubPoly(w, allWalls, widthOf, s0, s1) {
  const len = wallLen(w);
  if (len < 0.01 || s1 - s0 < 0.02) return null;
  const d = { x: (w.x2 - w.x1) / len, y: (w.y2 - w.y1) / len };
  const n = rot90(d);
  const halfW = widthOf(w) / 2;
  const ca = endCorners({ x: w.x1, y: w.y1 }, d, halfW, allWalls, w, widthOf);
  const cb = endCorners({ x: w.x2, y: w.y2 }, { x: -d.x, y: -d.y }, halfW, allWalls, w, widthOf);
  const at = (s, side) => {
    if (s <= 0.011) return side > 0 ? ca[0] : ca[1];
    if (s >= len - 0.011) return side > 0 ? cb[1] : cb[0];
    return { x: w.x1 + d.x * s + n.x * halfW * side, y: w.y1 + d.y * s + n.y * halfW * side };
  };
  return [at(s0, 1), at(s1, 1), at(s1, -1), at(s0, -1)];
}

// Opening height for a window cut into a wall (ft): peek ~16", well ~48",
// never taller than the wall minus 6" of remaining stem.
const openingHFor = (win, depth) => Math.min(win.kind === "peek" ? 16 / 12 : 4, Math.max(0.5, depth - 0.5));

function shoelace(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Planar face walk: find the smallest closed wall loop containing (px, py).
function detectRegion(walls, px, py) {
  const nodes = [];
  const nodeKey = (x, y) => {
    for (let i = 0; i < nodes.length; i++) if (same(nodes[i].x, nodes[i].y, x, y)) return i;
    nodes.push({ x, y });
    return nodes.length - 1;
  };
  const half = [];
  walls.forEach((w) => {
    if (wallLen(w) < 0.01) return;
    const a = nodeKey(w.x1, w.y1), b = nodeKey(w.x2, w.y2);
    if (a === b) return;
    const A = nodes[a], B = nodes[b];
    half.push({ from: a, to: b, ang: Math.atan2(B.y - A.y, B.x - A.x) });
    half.push({ from: b, to: a, ang: Math.atan2(A.y - B.y, A.x - B.x) });
  });
  if (!half.length) return null;
  const out = new Map();
  half.forEach((h, i) => {
    if (!out.has(h.from)) out.set(h.from, []);
    out.get(h.from).push(i);
  });
  out.forEach((list) => list.sort((i, j) => half[i].ang - half[j].ang));
  const twin = (i) => i ^ 1;
  const nextHE = (i) => {
    const t = twin(i);
    const list = out.get(half[t].from);
    const idx = list.indexOf(t);
    return list[(idx - 1 + list.length) % list.length];
  };
  const used = new Array(half.length).fill(false);
  let best = null, bestA = Infinity;
  for (let s = 0; s < half.length; s++) {
    if (used[s]) continue;
    const poly = [];
    let i = s, guard = 0;
    while (!used[i] && guard++ < 20000) {
      used[i] = true;
      poly.push(nodes[half[i].from]);
      i = nextHE(i);
    }
    if (poly.length < 3) continue;
    if (!pointInPoly(px, py, poly)) continue;
    const a = Math.abs(shoelace(poly));
    if (a > 0.5 && a < bestA) { bestA = a; best = poly; }
  }
  return best ? best.map((p) => ({ x: p.x, y: p.y })) : null;
}

function hexToRgba(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
function shade(hex, f) {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.round(((v >> 16) & 255) * f), g = Math.round(((v >> 8) & 255) * f), b = Math.round((v & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
function hashColor(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

let _id = 1;
const nid = () => _id++;

const wallKey = (w) => {
  const f = footOf(w);
  return `wall|${w.thickness}|${w.depth}|${f.w}|${f.h}`;
};
const padKey = (p) => `pad|${p.w}x${p.l}x${p.d}`;
const winKey = (w) => `win|${w.kind}|${w.width}`;
const areaKey = (a) => `area|${a.id}`;

const EMPTY_DOC = { walls: [], pads: [], windows: [], areas: [], dims: [] };

// ---------- component ----------
export default function FoundationTakeoff() {
  const [doc, setDoc] = useState(EMPTY_DOC);
  const { walls, pads, windows, areas } = doc;
  const dims = doc.dims || [];

  const [mode, setMode] = useState("draw"); // draw | select | pad | window | area
  const [areaMode, setAreaMode] = useState("pick"); // pick | trace
  const [view, setView] = useState("2d");
  const [curT, setCurT] = useState(8);
  const [curD, setCurD] = useState(8);
  const [customT, setCustomT] = useState("");
  const [customD, setCustomD] = useState("");
  const [sel, setSel] = useState(null); // {type, id}
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState(null);

  const [padSpec, setPadSpec] = useState({ w: 24, l: 24, d: 12 }); // inches
  const [winSpec, setWinSpec] = useState({ kind: "peek", width: 32 }); // inches
  const [modal, setModal] = useState(null); // 'pad' | 'window' | null
  const [pendingWin, setPendingWin] = useState(null); // well placement step 1 done, awaiting direction click

  const [rowColors, setRowColors] = useState({});
  const [solo, setSolo] = useState([]); // array of row keys; empty = show all

  // drawing state
  const [start, setStart] = useState(null);
  const [runStart, setRunStart] = useState(null);
  const [tracePts, setTracePts] = useState([]);
  const [rulerPt, setRulerPt] = useState(null);
  const [showDims, setShowDims] = useState(true);
  const [mouse, setMouse] = useState(null);
  const [snapInfo, setSnapInfo] = useState(null);
  const [typed, setTyped] = useState("");
  const [altFree, setAltFree] = useState(false);

  const [tf, setTf] = useState({ scale: 12, ox: 140, oy: 120 });
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // undo/redo (whole document snapshots)
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const pushUndo = useCallback((snapshot) => {
    undoRef.current.push(clone(snapshot));
    if (undoRef.current.length > 50) undoRef.current.shift();
    redoRef.current = [];
  }, []);
  const apply = useCallback(
    (fn) => {
      pushUndo(doc);
      setDoc((d) => fn(clone(d)) || d);
    },
    [doc, pushUndo]
  );
  const doUndo = useCallback(() => {
    if (!undoRef.current.length) return;
    setDoc((cur) => {
      redoRef.current.push(cur);
      return undoRef.current.pop();
    });
    setSel(null);
  }, []);
  const doRedo = useCallback(() => {
    if (!redoRef.current.length) return;
    setDoc((cur) => {
      undoRef.current.push(cur);
      return redoRef.current.pop();
    });
    setSel(null);
  }, []);

  const panRef = useRef(null);
  const dragRef = useRef(null); // wall endpoint drag
  const dragEntRef = useRef(null); // pad/window drag

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
  const svgPoint = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  // ---------- colors / visibility ----------
  const rowColor = useCallback((key) => rowColors[key] || hashColor(key), [rowColors]);
  const soloSet = useMemo(() => new Set(solo), [solo]);
  const shown = useCallback((key) => soloSet.size === 0 || soloSet.has(key), [soloSet]);
  const toggleSolo = (key) =>
    setSolo((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  // ---------- snapping ----------
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
    for (const inc of ladder) if (inc * tf.scale >= MIN_SNAP_PX) return inc;
    return ladder[ladder.length - 1];
  }, [tf.scale]);

  const snapLabel = useMemo(() => {
    const inches = snapInc * 12;
    return inches < 12 ? `${Math.round(inches)}"` : `${snapInc}'`;
  }, [snapInc]);

  // round a distance/coordinate (ft) to the active snap increment
  const snapTo = useCallback((v) => Math.round(v / snapInc) * snapInc, [snapInc]);

  const snapPreview = useCallback(
    (from, wx, wy, alt) => {
      const tol = 12 / tf.scale;
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
    [endpoints, tf.scale, snapTo]
  );

  // nearest wall snap for windows
  const findWallSnap = useCallback(
    (wx, wy) => {
      const tol = Math.max(16 / tf.scale, 2);
      let best = null, bd = tol;
      for (const w of walls) {
        const len = wallLen(w);
        if (len < 0.1) continue;
        const dx = (w.x2 - w.x1) / len, dy = (w.y2 - w.y1) / len;
        let t = ((wx - w.x1) * dx + (wy - w.y1) * dy) / len;
        t = Math.max(0.02, Math.min(0.98, t));
        const cx = w.x1 + dx * len * t, cy = w.y1 + dy * len * t;
        const d = dist(wx, wy, cx, cy);
        if (d < bd) {
          bd = d;
          const cross = (wx - cx) * dy - (wy - cy) * dx;
          best = { wallId: w.id, t, side: cross >= 0 ? -1 : 1, x: cx, y: cy, ang: Math.atan2(dy, dx) };
        }
      }
      return best;
    },
    [walls, tf.scale]
  );

  const windowPose = useCallback(
    (win) => {
      if (win.wallId != null) {
        const w = walls.find((q) => q.id === win.wallId);
        if (!w) return null;
        const len = wallLen(w);
        if (len < 0.01) return null;
        const dx = (w.x2 - w.x1) / len, dy = (w.y2 - w.y1) / len;
        return {
          x: w.x1 + dx * len * win.t,
          y: w.y1 + dy * len * win.t,
          ang: Math.atan2(dy, dx),
          thickness: w.thickness,
          depth: w.depth,
          footH: footOf(w).h,
        };
      }
      return { x: win.x, y: win.y, ang: win.ang || 0, thickness: 8, depth: 8, footH: 8 };
    },
    [walls]
  );

  // ---------- placement / drawing ----------
  const addWall = useCallback(
    (x1, y1, x2, y2) => {
      if (dist(x1, y1, x2, y2) < 0.01) return false;
      apply((d) => {
        d.walls.push({ id: nid(), x1, y1, x2, y2, thickness: curT, depth: curD, footing: null });
        return d;
      });
      return true;
    },
    [apply, curT, curD]
  );

  const commitWallPoint = useCallback(
    (pt) => {
      if (!start) {
        setStart({ x: pt.x, y: pt.y });
        setRunStart({ x: pt.x, y: pt.y });
        setTyped("");
        return;
      }
      if (!addWall(start.x, start.y, pt.x, pt.y)) return;
      setTyped("");
      if (runStart && same(pt.x, pt.y, runStart.x, runStart.y)) {
        setStart(null);
        setRunStart(null);
      } else {
        setStart({ x: pt.x, y: pt.y });
      }
    },
    [start, runStart, addWall]
  );

  const closeTrace = useCallback(() => {
    if (tracePts.length >= 3) {
      const n = doc.areas.length + 1;
      apply((d) => {
        d.areas.push({ id: nid(), name: `Area ${n}`, pts: clone(tracePts) });
        return d;
      });
    }
    setTracePts([]);
    setTyped("");
  }, [tracePts, apply, doc.areas.length]);

  const commitTracePoint = useCallback(
    (pt) => {
      if (tracePts.length >= 3) {
        const [fx, fy] = toScreen(tracePts[0].x, tracePts[0].y);
        const [px, py] = toScreen(pt.x, pt.y);
        if (Math.hypot(fx - px, fy - py) < 12) { closeTrace(); return; }
      }
      setTracePts((p) => [...p, { x: pt.x, y: pt.y }]);
      setTyped("");
    },
    [tracePts, toScreen, closeTrace]
  );

  // ---------- hit testing ----------
  const hitTest = (wx, wy) => {
    for (const m of dims) {
      if (pointSegDist(wx, wy, m.x1, m.y1, m.x2, m.y2) < 6 / tf.scale) return { type: "dim", id: m.id };
    }
    for (const win of windows) {
      const pose = windowPose(win);
      if (pose && dist(wx, wy, pose.x, pose.y) < Math.max(14 / tf.scale, win.width / 24)) return { type: "window", id: win.id };
    }
    for (const p of pads) {
      if (Math.abs(wx - p.x) <= p.w / 24 && Math.abs(wy - p.y) <= p.l / 24) return { type: "pad", id: p.id };
    }
    let hitW = null, hd = Infinity;
    for (const w of walls) {
      const d = pointSegDist(wx, wy, w.x1, w.y1, w.x2, w.y2);
      const tolFt = Math.max(8 / tf.scale, footOf(w).w / 24); // footing band is clickable too
      if (d < tolFt && d < hd) { hd = d; hitW = w.id; }
    }
    if (hitW != null) return { type: "wall", id: hitW };
    for (const a of areas) {
      if (pointInPoly(wx, wy, a.pts)) return { type: "area", id: a.id };
    }
    return null;
  };

  // ---------- mouse ----------
  const onMouseDown = (e) => {
    const [sx, sy] = svgPoint(e);
    if (e.button === 1) {
      panRef.current = { sx, sy, ox: tf.ox, oy: tf.oy };
      e.preventDefault();
      return;
    }
    if (e.button === 2) {
      if (mode === "draw") { setStart(null); setRunStart(null); setTyped(""); }
      else if (mode === "area" && areaMode === "trace") closeTrace();
      else if (mode === "ruler") { rulerPt ? setRulerPt(null) : setMode("select"); }
      else if (mode === "window") { pendingWin ? setPendingWin(null) : setMode("select"); }
      else if (mode === "pad") setMode("select");
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const [wx, wy] = toWorld(sx, sy);

    if (mode === "draw") {
      commitWallPoint(snapPreview(start, wx, wy, e.altKey));
      return;
    }
    if (mode === "ruler") {
      const pt = snapPreview(rulerPt, wx, wy, e.altKey);
      if (!rulerPt) setRulerPt({ x: pt.x, y: pt.y });
      else {
        if (dist(rulerPt.x, rulerPt.y, pt.x, pt.y) > 0.05) {
          const p0 = rulerPt;
          apply((d) => {
            d.dims = d.dims || [];
            d.dims.push({ id: nid(), x1: p0.x, y1: p0.y, x2: pt.x, y2: pt.y });
            return d;
          });
        }
        setRulerPt(null);
      }
      return;
    }
    if (mode === "pad") {
      const gx = snapTo(wx), gy = snapTo(wy);
      apply((d) => {
        d.pads.push({ id: nid(), x: gx, y: gy, w: padSpec.w, l: padSpec.l, d: padSpec.d });
        return d;
      });
      return;
    }
    if (mode === "window") {
      if (winSpec.kind === "peek") {
        const snap = findWallSnap(wx, wy);
        apply((d) => {
          if (snap) d.windows.push({ id: nid(), wallId: snap.wallId, t: snap.t, side: 1, kind: "peek", width: winSpec.width });
          else d.windows.push({ id: nid(), wallId: null, x: snapTo(wx), y: snapTo(wy), ang: 0, side: 1, kind: "peek", width: winSpec.width });
          return d;
        });
        return;
      }
      // wells: click 1 = position, click 2 = facing direction
      if (!pendingWin) {
        const snap = findWallSnap(wx, wy);
        if (snap) setPendingWin({ wallId: snap.wallId, t: snap.t });
        else setPendingWin({ wallId: null, x: snapTo(wx), y: snapTo(wy) });
        return;
      }
      const pw = pendingWin;
      if (pw.wallId != null) {
        const w = walls.find((q) => q.id === pw.wallId);
        if (w) {
          const len = wallLen(w);
          const dx = (w.x2 - w.x1) / len, dy = (w.y2 - w.y1) / len;
          const cx0 = w.x1 + dx * len * pw.t, cy0 = w.y1 + dy * len * pw.t;
          const cross = (wx - cx0) * dy - (wy - cy0) * dx;
          const side = cross > 0 ? -1 : 1;
          apply((d) => {
            d.windows.push({ id: nid(), wallId: pw.wallId, t: pw.t, side, kind: "well", width: winSpec.width });
            return d;
          });
        }
      } else {
        const dxm = wx - pw.x, dym = wy - pw.y;
        const L = Math.hypot(dxm, dym) || 1;
        const ang = Math.atan2(-(dxm / L), dym / L);
        apply((d) => {
          d.windows.push({ id: nid(), wallId: null, x: pw.x, y: pw.y, ang, side: 1, kind: "well", width: winSpec.width });
          return d;
        });
      }
      setPendingWin(null);
      return;
    }
    if (mode === "area") {
      if (areaMode === "pick") {
        const poly = detectRegion(walls, wx, wy);
        if (poly) {
          const n = areas.length + 1;
          apply((d) => {
            d.areas.push({ id: nid(), name: `Area ${n}`, pts: poly });
            return d;
          });
        } else {
          showToast("No enclosed wall loop found here — close the loop or use Trace.");
        }
      } else {
        commitTracePoint(snapPreview(tracePts.length ? tracePts[tracePts.length - 1] : null, wx, wy, e.altKey));
      }
      return;
    }

    // ---- select mode ----
    if (sel && sel.type === "wall") {
      const w = walls.find((q) => q.id === sel.id);
      if (w) {
        for (const end of ["a", "b"]) {
          const px = end === "a" ? w.x1 : w.x2;
          const py = end === "a" ? w.y1 : w.y2;
          const [hx, hy] = toScreen(px, py);
          if (Math.hypot(sx - hx, sy - hy) < 10) {
            const ids = [];
            walls.forEach((q) => {
              if (same(q.x1, q.y1, px, py)) ids.push({ id: q.id, end: "a" });
              if (same(q.x2, q.y2, px, py)) ids.push({ id: q.id, end: "b" });
            });
            dragRef.current = { ids, snapshot: clone(doc), moved: false };
            e.preventDefault();
            return;
          }
        }
      }
    }
    const hit = hitTest(wx, wy);
    if (hit) {
      setSel(hit);
      if (hit.type === "pad" || hit.type === "window") {
        dragEntRef.current = { ...hit, snapshot: clone(doc), moved: false };
      }
    } else {
      setSel(null);
      panRef.current = { sx, sy, ox: tf.ox, oy: tf.oy };
    }
  };

  const onMouseMove = (e) => {
    const [sx, sy] = svgPoint(e);
    if (panRef.current) {
      const p = panRef.current;
      setTf((t) => ({ ...t, ox: p.ox + (sx - p.sx), oy: p.oy + (sy - p.sy) }));
      return;
    }
    const [wx, wy] = toWorld(sx, sy);
    setMouse({ x: wx, y: wy });
    setAltFree(e.altKey);

    if (dragRef.current) {
      const tol = 12 / tf.scale;
      let nx = snapTo(wx), ny = snapTo(wy);
      const cluster = new Set(dragRef.current.ids.map((c) => c.id + c.end));
      let best = null, bd = tol;
      for (const w of walls) {
        if (!cluster.has(w.id + "a")) {
          const d = dist(wx, wy, w.x1, w.y1);
          if (d < bd) { bd = d; best = [w.x1, w.y1]; }
        }
        if (!cluster.has(w.id + "b")) {
          const d = dist(wx, wy, w.x2, w.y2);
          if (d < bd) { bd = d; best = [w.x2, w.y2]; }
        }
      }
      if (best) { nx = best[0]; ny = best[1]; }
      dragRef.current.moved = true;
      setDoc((d) => ({
        ...d,
        walls: d.walls.map((w) => {
          let n = w;
          dragRef.current.ids.forEach((c) => {
            if (c.id === w.id) {
              n = { ...n };
              if (c.end === "a") { n.x1 = nx; n.y1 = ny; }
              else { n.x2 = nx; n.y2 = ny; }
            }
          });
          return n;
        }),
      }));
      return;
    }

    if (dragEntRef.current) {
      const de = dragEntRef.current;
      de.moved = true;
      if (de.type === "pad") {
        const gx = snapTo(wx), gy = snapTo(wy);
        setDoc((d) => ({ ...d, pads: d.pads.map((p) => (p.id === de.id ? { ...p, x: gx, y: gy } : p)) }));
      } else if (de.type === "window") {
        const snap = findWallSnap(wx, wy);
        setDoc((d) => ({
          ...d,
          windows: d.windows.map((w) => {
            if (w.id !== de.id) return w;
            if (snap) return { ...w, wallId: snap.wallId, t: snap.t, side: w.wallId === snap.wallId ? w.side : snap.side, x: undefined, y: undefined };
            return { ...w, wallId: null, x: snapTo(wx), y: snapTo(wy), ang: 0 };
          }),
        }));
      }
      return;
    }

    if (mode === "draw") setSnapInfo(snapPreview(start, wx, wy, e.altKey));
    else if (mode === "ruler") setSnapInfo(snapPreview(rulerPt, wx, wy, e.altKey));
    else if (mode === "area" && areaMode === "trace")
      setSnapInfo(snapPreview(tracePts.length ? tracePts[tracePts.length - 1] : null, wx, wy, e.altKey));
    else if (mode === "window") setSnapInfo(pendingWin ? null : findWallSnap(wx, wy));
    else setSnapInfo(null);
  };

  const onMouseUp = () => {
    if (panRef.current) panRef.current = null;
    if (dragRef.current) {
      if (dragRef.current.moved) pushUndo(dragRef.current.snapshot);
      dragRef.current = null;
    }
    if (dragEntRef.current) {
      if (dragEntRef.current.moved) pushUndo(dragEntRef.current.snapshot);
      dragEntRef.current = null;
    }
  };

  const onWheel = (e) => {
    e.preventDefault();
    const [sx, sy] = svgPoint(e);
    const factor = Math.pow(1.0015, -e.deltaY);
    setTf((t) => {
      const ns = Math.min(120, Math.max(1.5, t.scale * factor));
      const k = ns / t.scale;
      return { scale: ns, ox: sx - (sx - t.ox) * k, oy: sy - (sy - t.oy) * k };
    });
  };

  // ---------- delete helpers ----------
  const deleteSel = useCallback(() => {
    if (!sel) return;
    apply((d) => {
      if (sel.type === "wall") {
        d.walls = d.walls.filter((w) => w.id !== sel.id);
        d.windows = d.windows.filter((w) => w.wallId !== sel.id);
      } else if (sel.type === "pad") d.pads = d.pads.filter((p) => p.id !== sel.id);
      else if (sel.type === "window") d.windows = d.windows.filter((w) => w.id !== sel.id);
      else if (sel.type === "area") d.areas = d.areas.filter((a) => a.id !== sel.id);
      else if (sel.type === "dim") d.dims = (d.dims || []).filter((m) => m.id !== sel.id);
      return d;
    });
    setSel(null);
  }, [sel, apply]);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? doRedo() : doUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        doRedo();
        return;
      }
      if (e.key === "Escape") {
        setStart(null); setRunStart(null); setTracePts([]); setRulerPt(null); setPendingWin(null); setTyped("");
        setSel(null); setConfirmClear(false); setModal(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && mode === "select" && sel) {
        e.preventDefault();
        deleteSel();
        return;
      }
      const tracing = mode === "area" && areaMode === "trace" && tracePts.length > 0;
      const drawing = mode === "draw" && start;
      if (drawing || tracing) {
        const from = drawing ? start : tracePts[tracePts.length - 1];
        if (e.key === "Enter") {
          const len = parseLength(typed);
          if (len && len > 0) {
            let ang = 0;
            if (snapInfo && snapInfo.ang != null) ang = snapInfo.ang;
            else if (mouse) ang = Math.atan2(mouse.y - from.y, mouse.x - from.x);
            if (!e.altKey && (!snapInfo || snapInfo.ang == null) && mouse) {
              const step = Math.PI / 4;
              ang = Math.round(ang / step) * step;
            }
            const pt = { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len };
            drawing ? commitWallPoint(pt) : commitTracePoint(pt);
          } else if (tracing) closeTrace();
          return;
        }
        if (e.key === "Backspace") { setTyped((t) => t.slice(0, -1)); return; }
        if (/^[\d.'" ]$/.test(e.key)) setTyped((t) => (t + e.key).slice(0, 12));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, areaMode, start, tracePts, typed, snapInfo, mouse, sel, doUndo, doRedo, commitWallPoint, commitTracePoint, closeTrace, deleteSel]);

  // mode switching side effects
  useEffect(() => {
    setStart(null); setRunStart(null); setTracePts([]); setRulerPt(null); setPendingWin(null); setTyped("");
    if (mode !== "select") setSel(null);
    if (mode === "pad") setModal("pad");
    else if (mode === "window") setModal("window");
    else setModal(null);
  }, [mode]);

  // ---------- takeoff ----------
  const takeoff = useMemo(() => {
    const wallGroups = new Map();
    let totalLF = 0;
    for (const w of walls) {
      const f = footOf(w);
      const key = wallKey(w);
      const len = wallLen(w);
      totalLF += len;
      if (!wallGroups.has(key)) wallGroups.set(key, { key, thickness: w.thickness, depth: w.depth, fw: f.w, fh: f.h, len: 0, count: 0 });
      const g = wallGroups.get(key);
      g.len += len;
      g.count++;
    }
    const padGroups = new Map();
    for (const p of pads) {
      const key = padKey(p);
      if (!padGroups.has(key)) padGroups.set(key, { key, w: p.w, l: p.l, d: p.d, count: 0 });
      padGroups.get(key).count++;
    }
    const winGroups = new Map();
    for (const w of windows) {
      const key = winKey(w);
      if (!winGroups.has(key)) winGroups.set(key, { key, kind: w.kind, width: w.width, count: 0 });
      winGroups.get(key).count++;
    }
    const areaRows = areas.map((a) => ({ key: areaKey(a), name: a.name, sf: Math.abs(shoelace(a.pts)) }));
    const totalSF = areaRows.reduce((s, r) => s + r.sf, 0);
    return {
      wallRows: [...wallGroups.values()].sort((a, b) => a.thickness - b.thickness || a.depth - b.depth),
      padRows: [...padGroups.values()].sort((a, b) => a.w - b.w || a.l - b.l),
      winRows: [...winGroups.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.width - b.width),
      areaRows,
      totalLF,
      totalSF,
    };
  }, [walls, pads, windows, areas]);

  // ---------- fit view ----------
  const fitView = () => {
    const pts = [];
    walls.forEach((w) => { pts.push([w.x1, w.y1], [w.x2, w.y2]); });
    pads.forEach((p) => { pts.push([p.x - p.w / 24, p.y - p.l / 24], [p.x + p.w / 24, p.y + p.l / 24]); });
    areas.forEach((a) => a.pts.forEach((p) => pts.push([p.x, p.y])));
    if (!pts.length) { setTf({ scale: 12, ox: 140, oy: 120 }); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(([x, y]) => {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
    const pad = 40;
    const scale = Math.min(120, Math.max(1.5, Math.min((size.w - pad * 2) / Math.max(1, maxX - minX), (size.h - pad * 2) / Math.max(1, maxY - minY))));
    setTf({ scale, ox: size.w / 2 - ((minX + maxX) / 2) * scale, oy: size.h / 2 - ((minY + maxY) / 2) * scale });
  };

  // ---------- selected entity ----------
  const selWall = sel && sel.type === "wall" ? walls.find((w) => w.id === sel.id) : null;
  const selPad = sel && sel.type === "pad" ? pads.find((p) => p.id === sel.id) : null;
  const selWin = sel && sel.type === "window" ? windows.find((w) => w.id === sel.id) : null;
  const selArea = sel && sel.type === "area" ? areas.find((a) => a.id === sel.id) : null;
  const selDim = sel && sel.type === "dim" ? dims.find((m) => m.id === sel.id) : null;

  const updateWall = (patch) => selWall && apply((d) => { d.walls = d.walls.map((w) => (w.id === selWall.id ? { ...w, ...patch } : w)); return d; });
  const updatePad = (patch) => selPad && apply((d) => { d.pads = d.pads.map((p) => (p.id === selPad.id ? { ...p, ...patch } : p)); return d; });
  const updateWin = (patch) => selWin && apply((d) => { d.windows = d.windows.map((w) => (w.id === selWin.id ? { ...w, ...patch } : w)); return d; });
  const updateArea = (patch) => selArea && apply((d) => { d.areas = d.areas.map((a) => (a.id === selArea.id ? { ...a, ...patch } : a)); return d; });

  const [lenDraft, setLenDraft] = useState("");
  useEffect(() => setLenDraft(selWall ? formatFtIn(wallLen(selWall)) : ""), [sel, doc]); // eslint-disable-line

  const setSelLength = (str) => {
    const len = parseLength(str);
    if (!selWall || !len || len <= 0) return;
    const cur = wallLen(selWall);
    if (Math.abs(cur - len) < 1e-6) return;
    const ux = (selWall.x2 - selWall.x1) / cur, uy = (selWall.y2 - selWall.y1) / cur;
    const nx = selWall.x1 + ux * len, ny = selWall.y1 + uy * len;
    const ox = selWall.x2, oy = selWall.y2;
    apply((d) => {
      d.walls = d.walls.map((w) => {
        const n = { ...w };
        if (same(w.x1, w.y1, ox, oy)) { n.x1 = nx; n.y1 = ny; }
        if (same(w.x2, w.y2, ox, oy)) { n.x2 = nx; n.y2 = ny; }
        return n;
      });
      return d;
    });
  };

  // ---------- 2D render ----------
  const gridLines = useMemo(() => {
    const lines = [];
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
      lines.push(<line key={"vx" + x} x1={sx} y1={0} x2={sx} y2={size.h} stroke={major ? COLORS.gridMajor : COLORS.gridMinor} strokeWidth={major ? 1.2 : 1} />);
    }
    for (let y = y0; y <= wy1; y += step) {
      const major = Math.round(y) % 10 === 0;
      if (!showMinor && !major) continue;
      const [, sy] = toScreen(0, y);
      lines.push(<line key={"hz" + y} x1={0} y1={sy} x2={size.w} y2={sy} stroke={major ? COLORS.gridMajor : COLORS.gridMinor} strokeWidth={major ? 1.2 : 1} />);
    }
    return lines;
  }, [tf, size, toWorld, toScreen]);

  const ptsStr = (poly) => poly.map((p) => toScreen(p.x, p.y).join(",")).join(" ");
  const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

  const renderWall = (w, isPreview = false) => {
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
    const len = wallLen(w);
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
        {fPoly && <polygon points={ptsStr(fPoly)} fill={hexToRgba(col, 0.25)} />}
        <polygon
          points={ptsStr(wPoly)}
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
  };

  const renderPad = (p) => {
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
  };

  const renderWindow = (win) => {
    const pose = windowPose(win);
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
  };

  const renderArea = (a) => {
    const key = areaKey(a);
    const col = rowColor(key);
    const vis = shown(key) ? 1 : 0.06;
    const selected = sel && sel.type === "area" && sel.id === a.id;
    const c = a.pts.reduce((s, p) => ({ x: s.x + p.x / a.pts.length, y: s.y + p.y / a.pts.length }), { x: 0, y: 0 });
    const [cx, cy] = toScreen(c.x, c.y);
    return (
      <g key={"a" + a.id} opacity={vis}>
        <polygon points={ptsStr(a.pts)} fill={hexToRgba(col, 0.22)} stroke={selected ? SEL : col} strokeWidth={selected ? 2.5 : 1.5} strokeDasharray={selected ? "" : "7 5"} />
        {tf.scale > 3 && (
          <text x={cx} y={cy} textAnchor="middle" fontSize={12} fontWeight={700} fontFamily={mono} fill={shade(col, 0.55)}>
            {a.name} · {Math.round(Math.abs(shoelace(a.pts)))} SF
          </text>
        )}
      </g>
    );
  };

  const renderDim = (m, isPreview = false) => {
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
  };

  // ---------- 3D ----------
  const threeWrap = useRef(null);
  const threeRef = useRef(null);

  const rebuild3D = useCallback(() => {
    const T = threeRef.current;
    if (!T) return;
    while (T.group.children.length) {
      const c = T.group.children[0];
      T.group.remove(c);
      c.geometry && c.geometry.dispose();
      c.material && c.material.dispose();
    }
    const mkGeo = (poly, h) => {
      const shape = new THREE.Shape();
      shape.moveTo(poly[0].x, -poly[0].y);
      for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i].x, -poly[i].y);
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    };
    const cInt = (hex) => parseInt(hex.slice(1), 16);

    walls.forEach((w) => {
      const len = wallLen(w);
      if (len < 0.01) return;
      const key = wallKey(w);
      if (!shown(key)) return;
      const f = footOf(w);
      const fhFt = f.h / 12;
      const selMat = sel && sel.type === "wall" && sel.id === w.id;
      const col = selMat ? "#ff8a3d" : rowColor(key);
      const widthOfWall = (q) => q.thickness / 12;
      const mat = () => new THREE.MeshLambertMaterial({ color: cInt(col) });
      const addPiece = (poly, h) => {
        if (!poly || h < 0.05) return;
        const geo = mkGeo(poly, h);
        const mesh = new THREE.Mesh(geo, mat());
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = fhFt;
        T.group.add(mesh);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: cInt(shade(col, 0.55)) }));
        edges.rotation.copy(mesh.rotation);
        edges.position.copy(mesh.position);
        T.group.add(edges);
      };

      // window cutouts along this wall
      const cuts = windows
        .filter((v) => v.wallId === w.id)
        .map((v) => {
          const c = v.t * len, half = v.width / 24;
          return { s0: Math.max(0.02, c - half), s1: Math.min(len - 0.02, c + half), oh: openingHFor(v, w.depth) };
        })
        .filter((c) => c.s1 - c.s0 > 0.05)
        .sort((a, b) => a.s0 - b.s0);

      if (!cuts.length) {
        addPiece(wallPolygon(w, walls, widthOfWall), w.depth);
      } else {
        let cursor = 0;
        cuts.forEach((c) => {
          if (c.s0 - cursor > 0.02) addPiece(wallSubPoly(w, walls, widthOfWall, cursor, c.s0), w.depth);
          const bandH = w.depth - c.oh;
          if (bandH > 0.05) addPiece(wallSubPoly(w, walls, widthOfWall, c.s0, c.s1), bandH);
          cursor = Math.max(cursor, c.s1);
        });
        if (len - cursor > 0.02) addPiece(wallSubPoly(w, walls, widthOfWall, cursor, len), w.depth);
      }

      const fPoly = wallPolygon(w, walls, (q) => footOf(q).w / 12);
      if (fPoly) {
        const footGeo = mkGeo(fPoly, fhFt);
        const footMesh = new THREE.Mesh(footGeo, new THREE.MeshLambertMaterial({ color: cInt(shade(col, 0.65)) }));
        footMesh.rotation.x = -Math.PI / 2;
        T.group.add(footMesh);
      }
    });

    pads.forEach((p) => {
      const key = padKey(p);
      if (!shown(key)) return;
      const selMat = sel && sel.type === "pad" && sel.id === p.id;
      const col = cInt(selMat ? "#ff8a3d" : rowColor(key));
      const geo = new THREE.BoxGeometry(p.w / 12, p.d / 12, p.l / 12);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col }));
      mesh.position.set(p.x, p.d / 24, p.y);
      T.group.add(mesh);
    });

    windows.forEach((win) => {
      const key = winKey(win);
      if (!shown(key)) return;
      const pose = windowPose(win);
      if (!pose) return;
      const selMat = sel && sel.type === "window" && sel.id === win.id;
      const col = cInt(selMat ? "#ff8a3d" : rowColor(key));
      const tFt = pose.thickness / 12;
      const wFt = win.width / 12;
      const fhFt = pose.footH / 12;
      const oh = openingHFor(win, pose.depth);
      // translucent pane sitting in the opening (color-coded)
      const paneGeo = new THREE.BoxGeometry(wFt, oh, 0.08);
      const pane = new THREE.Mesh(paneGeo, new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.55 }));
      pane.position.set(pose.x, fhFt + pose.depth - oh / 2, pose.y);
      pane.rotation.y = -pose.ang;
      T.group.add(pane);

      if (win.kind === "well") {
        // open half-cylinder hugging the outside face, bulging away from the wall
        const shellH = oh + 0.8;
        const wellGeo = new THREE.CylinderGeometry(wFt / 2, wFt / 2, shellH, 20, 1, true, 0, Math.PI);
        const wellMesh = new THREE.Mesh(wellGeo, new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
        // outward normal in plan for this side, mapped to world x/z
        const ox = -win.side * Math.sin(pose.ang);
        const oz = win.side * Math.cos(pose.ang);
        const d0 = tFt / 2 + 0.03;
        wellMesh.position.set(pose.x + ox * d0, fhFt + pose.depth - oh / 2 + 0.4, pose.y + oz * d0);
        // 2D bump direction in plan is (-side·sin θ, side·cos θ); the half-shell
        // bulges toward local +X, so rotate local +X onto that same direction.
        wellMesh.rotation.y = -pose.ang - win.side * (Math.PI / 2);
        T.group.add(wellMesh);
      }
    });

    areas.forEach((a) => {
      const key = areaKey(a);
      if (!shown(key)) return;
      const selMat = sel && sel.type === "area" && sel.id === a.id;
      const col = cInt(selMat ? "#ff8a3d" : rowColor(key));
      const shape = new THREE.Shape();
      shape.moveTo(a.pts[0].x, -a.pts[0].y);
      for (let i = 1; i < a.pts.length; i++) shape.lineTo(a.pts[i].x, -a.pts[i].y);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.04;
      T.group.add(mesh);
    });
  }, [walls, pads, windows, areas, sel, rowColor, shown, windowPose]);

  useEffect(() => {
    if (view !== "3d") return;
    const el = threeWrap.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef0ea);
    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(60, 100, 30);
    scene.add(dir);
    scene.add(new THREE.GridHelper(300, 300, 0xb9c0b6, 0xd8dcd2));
    const group = new THREE.Group();
    scene.add(group);

    let tx = 0, tz = 0, radius = 80;
    if (walls.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      walls.forEach((w) => {
        minX = Math.min(minX, w.x1, w.x2); maxX = Math.max(maxX, w.x1, w.x2);
        minY = Math.min(minY, w.y1, w.y2); maxY = Math.max(maxY, w.y1, w.y2);
      });
      tx = (minX + maxX) / 2; tz = (minY + maxY) / 2;
      radius = Math.max(30, Math.max(maxX - minX, maxY - minY) * 1.4);
    }
    const cam = { theta: -Math.PI / 4, phi: Math.PI / 3.4, radius, target: new THREE.Vector3(tx, 4, tz) };
    const updateCam = () => {
      camera.position.set(
        cam.target.x + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta),
        cam.target.y + cam.radius * Math.cos(cam.phi),
        cam.target.z + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta)
      );
      camera.lookAt(cam.target);
    };
    updateCam();

    let down = null;
    const dom = renderer.domElement;
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey }; e.preventDefault(); };
    const onMove = (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      down.x = e.clientX; down.y = e.clientY;
      if (down.btn === 2 || down.shift) {
        const panScale = cam.radius * 0.0016;
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
        cam.target.addScaledVector(right, dx * panScale);
        cam.target.y += dy * panScale;
      } else {
        cam.theta += dx * 0.006;
        cam.phi = Math.min(Math.PI / 2 - 0.03, Math.max(0.08, cam.phi - dy * 0.006));
      }
      updateCam();
    };
    const onUp = () => { down = null; };
    const onWheel3 = (e) => {
      e.preventDefault();
      cam.radius = Math.min(600, Math.max(6, cam.radius * Math.pow(1.0015, e.deltaY)));
      updateCam();
    };
    const onCtx = (e) => e.preventDefault();
    dom.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    dom.addEventListener("wheel", onWheel3, { passive: false });
    dom.addEventListener("contextmenu", onCtx);

    let raf;
    const loop = () => { renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();

    const ro = new ResizeObserver(() => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);

    threeRef.current = { scene, camera, renderer, group };
    rebuild3D();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dom.removeEventListener("wheel", onWheel3);
      dom.removeEventListener("contextmenu", onCtx);
      el.removeChild(dom);
      renderer.dispose();
      threeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (view === "3d") rebuild3D();
  }, [doc, sel, solo, rowColors, view, rebuild3D]);

  // ---------- UI primitives ----------
  const Pill = ({ active, onClick, children, title }) => (
    <button
      title={title}
      onClick={onClick}
      style={{
        padding: "5px 10px", borderRadius: 6,
        border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
        background: active ? "rgba(255,138,61,0.16)" : "transparent",
        color: active ? COLORS.accent : COLORS.text,
        fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
  const Label = ({ children }) => (
    <span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.textMut, fontWeight: 700 }}>{children}</span>
  );
  const inputStyle = {
    background: COLORS.chromeDeep, border: `1px solid ${COLORS.border}`, borderRadius: 6,
    color: COLORS.text, padding: "5px 8px", fontFamily: mono, fontSize: 12,
  };

  const Swatch = ({ rowKey }) => (
    <input
      type="color"
      value={rowColor(rowKey)}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setRowColors((c) => ({ ...c, [rowKey]: e.target.value }))}
      style={{ width: 18, height: 18, padding: 0, border: "none", borderRadius: 4, background: "none", cursor: "pointer" }}
      title="Change color"
    />
  );

  const TakeoffRow = ({ rowKey, main, value, sub, subRight }) => {
    const active = soloSet.has(rowKey);
    const dimmed = soloSet.size > 0 && !active;
    return (
      <div
        onClick={() => toggleSolo(rowKey)}
        title="Click to show only this on the plan (click again to unfilter)"
        style={{
          padding: "8px 10px", marginBottom: 7, background: COLORS.chromeDeep,
          border: `1px solid ${active ? COLORS.accent : COLORS.border}`, borderRadius: 8,
          cursor: "pointer", opacity: dimmed ? 0.4 : 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Swatch rowKey={rowKey} />
          <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{main}</span>
          <span style={{ fontFamily: mono, fontSize: 13, color: COLORS.accent }}>{value}</span>
        </div>
        {(sub || subRight) && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, paddingLeft: 26 }}>
            <span style={{ fontSize: 11, color: COLORS.textMut }}>{sub}</span>
            <span style={{ fontSize: 11, color: COLORS.textMut, fontFamily: mono }}>{subRight}</span>
          </div>
        )}
      </div>
    );
  };

  const clearAll = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    apply(() => clone(EMPTY_DOC));
    setSel(null); setStart(null); setRunStart(null); setTracePts([]);
    setSolo([]);
    setConfirmClear(false);
  };

  const hints = {
    draw: start
      ? "Click to place endpoint — or type a length + Enter · right-click ends the run · hold Alt to ignore snap"
      : "Click to start a wall run",
    select: sel ? "Drag to move · Delete removes · edit in the panel" : "Click any wall, footing, pad, window, or area to select · drag empty space to pan",
    pad: "Click to stamp pads · right-click when done",
    window: pendingWin
      ? "Now click the side the well faces — the arrow points outside the foundation"
      : winSpec.kind === "well"
      ? "Click a wall to position the well, then a second click sets which way it faces"
      : "Click on or near a wall to place · right-click when done",
    area: areaMode === "pick" ? "Click inside a closed wall loop to measure it" : "Click to trace an outline · type lengths + Enter works too · right-click or click the first point to close",
    ruler: rulerPt ? "Click the second point to set the measurement" : "Click two points to measure — dimensions stay on the plan until deleted · right-click exits",
  };

  const hasDoc = walls.length || pads.length || windows.length || areas.length;

  // ---------- render ----------
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: COLORS.chrome, color: COLORS.text, fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: COLORS.chromeDeep, borderBottom: `1px solid ${COLORS.border}`, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginRight: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>FOUNDATION TAKEOFF</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Pill active={mode === "draw"} onClick={() => setMode("draw")}>✏ Wall</Pill>
          <Pill active={mode === "select"} onClick={() => setMode("select")}>⬚ Select</Pill>
          <Pill active={mode === "pad"} onClick={() => setMode("pad")}>▦ Pad</Pill>
          <Pill active={mode === "window"} onClick={() => setMode("window")}>◫ Window</Pill>
          <Pill active={mode === "area"} onClick={() => setMode("area")}>▱ Sq Ft</Pill>
          <Pill active={mode === "ruler"} onClick={() => setMode("ruler")}>⟷ Ruler</Pill>
        </div>
        {mode === "ruler" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Label>Auto wall dims</Label>
            <Pill active={showDims} onClick={() => setShowDims((s) => !s)}>{showDims ? "On" : "Off"}</Pill>
          </div>
        )}
        {(mode === "draw" || mode === "select") && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Label>Wall</Label>
              {THICKNESS_PRESETS.map((t) => <Pill key={t} active={curT === t} onClick={() => setCurT(t)}>{t}"</Pill>)}
              <input
                placeholder="cust" value={customT}
                onChange={(e) => { setCustomT(e.target.value); const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) setCurT(v); }}
                style={{ ...inputStyle, width: 44, borderColor: !THICKNESS_PRESETS.includes(curT) ? COLORS.accent : COLORS.border }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Label>Depth</Label>
              {DEPTH_PRESETS.map((d) => <Pill key={d} active={curD === d} onClick={() => setCurD(d)}>{d}'</Pill>)}
              <input
                placeholder="cust" value={customD}
                onChange={(e) => { setCustomD(e.target.value); const v = parseLength(e.target.value); if (v && v > 0) setCurD(v); }}
                style={{ ...inputStyle, width: 44, borderColor: !DEPTH_PRESETS.includes(curD) ? COLORS.accent : COLORS.border }}
              />
            </div>
          </>
        )}
        {mode === "area" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Label>Method</Label>
            <Pill active={areaMode === "pick"} onClick={() => { setAreaMode("pick"); setTracePts([]); }}>Pick enclosed</Pill>
            <Pill active={areaMode === "trace"} onClick={() => setAreaMode("trace")}>Trace</Pill>
          </div>
        )}
        {mode === "pad" && (
          <Pill onClick={() => setModal("pad")} title="Change pad size">
            {padSpec.w}"×{padSpec.l}"×{padSpec.d}" — change
          </Pill>
        )}
        {mode === "window" && (
          <Pill onClick={() => setModal("window")} title="Change window type">
            {winSpec.kind === "peek" ? "Peek window" : "Window well"} {winSpec.width}" — change
          </Pill>
        )}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
          <Pill onClick={doUndo} title="Undo (Ctrl+Z)">↶</Pill>
          <Pill onClick={doRedo} title="Redo (Ctrl+Shift+Z)">↷</Pill>
          <Pill onClick={fitView} title="Zoom to drawing">Fit</Pill>
          <Pill onClick={clearAll}>{confirmClear ? "Really clear?" : "Clear"}</Pill>
          <div style={{ width: 1, height: 22, background: COLORS.border, margin: "0 4px" }} />
          <Pill active={view === "2d"} onClick={() => setView("2d")}>2D Plan</Pill>
          <Pill active={view === "3d"} onClick={() => setView("3d")}>3D View</Pill>
        </div>
      </div>

      {/* main */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div ref={wrapRef} style={{ flex: 1, position: "relative", overflow: "hidden", background: COLORS.canvas }}>
          {view === "2d" ? (
            <svg
              ref={svgRef} width={size.w} height={size.h}
              style={{ display: "block", cursor: mode === "select" ? "default" : "crosshair", userSelect: "none" }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
              onWheel={onWheel} onContextMenu={(e) => e.preventDefault()}
            >
              <g id="underlay-layer" />
              <g>{gridLines}</g>
              <g>{areas.map(renderArea)}</g>
              <g>{walls.map((w) => renderWall(w))}</g>
              <g>{pads.map(renderPad)}</g>
              <g>{windows.map(renderWindow)}</g>
              <g>{dims.map((m) => renderDim(m))}</g>

              {/* ruler in-progress preview */}
              {mode === "ruler" && rulerPt && snapInfo &&
                renderDim({ x1: rulerPt.x, y1: rulerPt.y, x2: snapInfo.x, y2: snapInfo.y }, true)}
              {mode === "ruler" && rulerPt && (() => { const [sx, sy] = toScreen(rulerPt.x, rulerPt.y); return <circle cx={sx} cy={sy} r={4} fill="#4a6fa5" />; })()}

              {/* wall endpoint handles */}
              {selWall && ["a", "b"].map((end) => {
                const px = end === "a" ? selWall.x1 : selWall.x2;
                const py = end === "a" ? selWall.y1 : selWall.y2;
                const [hx, hy] = toScreen(px, py);
                return <rect key={end} x={hx - 5} y={hy - 5} width={10} height={10} fill="#fff" stroke={SEL} strokeWidth={2} style={{ cursor: "move" }} />;
              })}

              {/* wall drawing preview */}
              {mode === "draw" && start && snapInfo && renderWall({ id: -1, x1: start.x, y1: start.y, x2: snapInfo.x, y2: snapInfo.y, thickness: curT, depth: curD, footing: null }, true)}
              {mode === "draw" && start && (() => { const [sx, sy] = toScreen(start.x, start.y); return <circle cx={sx} cy={sy} r={4} fill={SEL} />; })()}
              {(mode === "draw" || mode === "ruler" || (mode === "area" && areaMode === "trace")) && snapInfo && snapInfo.type === "endpoint" && (() => {
                const [sx, sy] = toScreen(snapInfo.x, snapInfo.y);
                return <rect x={sx - 6} y={sy - 6} width={12} height={12} fill="none" stroke={SEL} strokeWidth={2} />;
              })()}

              {/* trace preview */}
              {mode === "area" && areaMode === "trace" && tracePts.length > 0 && (
                <g>
                  <polyline points={ptsStr(tracePts)} fill="none" stroke={SEL} strokeWidth={2} strokeDasharray="6 4" />
                  {snapInfo && (
                    <line
                      x1={toScreen(tracePts[tracePts.length - 1].x, tracePts[tracePts.length - 1].y)[0]}
                      y1={toScreen(tracePts[tracePts.length - 1].x, tracePts[tracePts.length - 1].y)[1]}
                      x2={toScreen(snapInfo.x, snapInfo.y)[0]} y2={toScreen(snapInfo.x, snapInfo.y)[1]}
                      stroke={SEL} strokeWidth={1.5} strokeDasharray="4 4"
                    />
                  )}
                  {tracePts.map((p, i) => {
                    const [px, py] = toScreen(p.x, p.y);
                    return <circle key={i} cx={px} cy={py} r={i === 0 ? 5 : 3} fill={i === 0 ? "#fff" : SEL} stroke={SEL} strokeWidth={2} />;
                  })}
                </g>
              )}

              {/* window placement preview */}
              {mode === "window" && !pendingWin && snapInfo && snapInfo.wallId != null && (() => {
                const [sx, sy] = toScreen(snapInfo.x, snapInfo.y);
                return <circle cx={sx} cy={sy} r={6} fill="none" stroke={SEL} strokeWidth={2} />;
              })()}

              {/* pending well: live direction arrow toward the cursor side */}
              {mode === "window" && pendingWin && mouse && (() => {
                let cx0, cy0, thetaAng, side, thick;
                if (pendingWin.wallId != null) {
                  const w = walls.find((q) => q.id === pendingWin.wallId);
                  if (!w) return null;
                  const len = wallLen(w);
                  if (len < 0.01) return null;
                  const dx = (w.x2 - w.x1) / len, dy = (w.y2 - w.y1) / len;
                  cx0 = w.x1 + dx * len * pendingWin.t;
                  cy0 = w.y1 + dy * len * pendingWin.t;
                  thetaAng = Math.atan2(dy, dx);
                  thick = w.thickness;
                  const cross = (mouse.x - cx0) * dy - (mouse.y - cy0) * dx;
                  side = cross > 0 ? -1 : 1;
                } else {
                  cx0 = pendingWin.x; cy0 = pendingWin.y; thick = 8;
                  const dxm = mouse.x - cx0, dym = mouse.y - cy0;
                  const L = Math.hypot(dxm, dym) || 1;
                  thetaAng = Math.atan2(-(dxm / L), dym / L);
                  side = 1;
                }
                const [sx, sy] = toScreen(cx0, cy0);
                const halfWpx = ((winSpec.width / 12) / 2) * tf.scale;
                const tPx = Math.max(4, (thick / 12) * tf.scale);
                const deg = (thetaAng * 180) / Math.PI;
                const bump = Math.max(halfWpx * 0.7, ((18 / 12) / 2) * tf.scale) * 2;
                const arrowLen = Math.max(30, tPx * 2);
                const tipY = sy + side * (tPx / 2 + arrowLen);
                const baseY = tipY - side * 8;
                return (
                  <g opacity={0.9} transform={`rotate(${deg} ${sx} ${sy})`}>
                    <path d={`M ${sx - halfWpx} ${sy + (side * tPx) / 2} A ${halfWpx} ${bump / 2} 0 0 ${side > 0 ? 1 : 0} ${sx + halfWpx} ${sy + (side * tPx) / 2}`} fill="rgba(255,138,61,0.25)" stroke={SEL} strokeWidth={1.6} />
                    <rect x={sx - halfWpx} y={sy - tPx / 2} width={halfWpx * 2} height={tPx} fill="#fff" stroke={SEL} strokeWidth={1.6} />
                    <line x1={sx} y1={sy + (side * tPx) / 2} x2={sx} y2={baseY} stroke={SEL} strokeWidth={2.4} />
                    <path d={`M ${sx} ${tipY} L ${sx - 6} ${baseY} L ${sx + 6} ${baseY} Z`} fill={SEL} />
                  </g>
                );
              })()}

              {/* scale bar */}
              <g>
                <rect x={16} y={size.h - 34} width={tf.scale * 10} height={4} fill="#5c646b" />
                <text x={16} y={size.h - 40} fontSize={10} fontFamily={mono} fill="#5c646b">10 ft</text>
              </g>
            </svg>
          ) : (
            <div ref={threeWrap} style={{ position: "absolute", inset: 0 }} />
          )}

          {/* typed length chip */}
          {view === "2d" && ((mode === "draw" && start) || (mode === "area" && areaMode === "trace" && tracePts.length > 0)) && (
            <div style={{ position: "absolute", left: 16, top: 14, background: COLORS.chromeDeep, border: `1px solid ${typed ? COLORS.accent : COLORS.border}`, borderRadius: 8, padding: "7px 12px", fontFamily: mono, fontSize: 13, color: typed ? COLORS.accent : COLORS.textMut, boxShadow: "0 2px 8px rgba(0,0,0,0.35)" }}>
              {typed ? typed : "type length…"} <span style={{ color: COLORS.textMut, fontSize: 11 }}>⏎</span>
            </div>
          )}

          {view === "3d" && (
            <div style={{ position: "absolute", left: 16, top: 14, background: "rgba(24,29,35,0.85)", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: COLORS.textMut }}>
              drag = orbit · scroll = zoom · right-drag / shift-drag = pan
            </div>
          )}

          {/* filter banner */}
          {soloSet.size > 0 && (
            <div style={{ position: "absolute", right: 16, top: 14, display: "flex", alignItems: "center", gap: 8, background: "rgba(24,29,35,0.9)", border: `1px solid ${COLORS.accent}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: COLORS.text }}>
              Showing {soloSet.size} takeoff item{soloSet.size > 1 ? "s" : ""}
              <button onClick={() => setSolo([])} style={{ background: "transparent", border: "none", color: COLORS.accent, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Show all</button>
            </div>
          )}

          {toast && (
            <div style={{ position: "absolute", left: "50%", bottom: 20, transform: "translateX(-50%)", background: "rgba(24,29,35,0.95)", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, color: COLORS.text }}>
              {toast}
            </div>
          )}
        </div>

        {/* right panel */}
        <div style={{ width: 300, background: COLORS.panel, borderLeft: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Label>Takeoff</Label>
            {soloSet.size > 0 && (
              <button onClick={() => setSolo([])} style={{ background: "transparent", border: "none", color: COLORS.accent, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Show all</button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
            {!hasDoc && (
              <div style={{ fontSize: 12, color: COLORS.textMut, lineHeight: 1.6 }}>
                Nothing drawn yet. Draw walls, stamp pier pads and windows, or measure square footage — every item shows up here, color-matched to the plan. Click a row to isolate it on the drawing.
              </div>
            )}

            {takeoff.wallRows.length > 0 && (
              <>
                <div style={{ margin: "2px 0 6px" }}><Label>Walls — lineal feet</Label></div>
                {takeoff.wallRows.map((r) => (
                  <TakeoffRow key={r.key} rowKey={r.key}
                    main={`${r.thickness}" × ${formatFtIn(r.depth)} wall`}
                    value={formatFtIn(r.len)}
                    sub={`footing ${r.fw}" × ${r.fh}"`}
                    subRight={`${r.count} wall${r.count > 1 ? "s" : ""}`}
                  />
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px 10px" }}>
                  <span style={{ fontSize: 11, fontWeight: 800 }}>TOTAL LF</span>
                  <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: COLORS.accent }}>{formatFtIn(takeoff.totalLF)}</span>
                </div>
              </>
            )}

            {takeoff.padRows.length > 0 && (
              <>
                <div style={{ margin: "6px 0 6px" }}><Label>Pier pads</Label></div>
                {takeoff.padRows.map((r) => (
                  <TakeoffRow key={r.key} rowKey={r.key}
                    main={`Pad ${r.w}" × ${r.l}" × ${r.d}"`}
                    value={`× ${r.count}`}
                  />
                ))}
              </>
            )}

            {takeoff.winRows.length > 0 && (
              <>
                <div style={{ margin: "6px 0 6px" }}><Label>Windows</Label></div>
                {takeoff.winRows.map((r) => (
                  <TakeoffRow key={r.key} rowKey={r.key}
                    main={`${r.kind === "peek" ? "Peek window" : "Window well"} ${r.width}"`}
                    value={`× ${r.count}`}
                  />
                ))}
              </>
            )}

            {takeoff.areaRows.length > 0 && (
              <>
                <div style={{ margin: "6px 0 6px" }}><Label>Square footage</Label></div>
                {takeoff.areaRows.map((r) => (
                  <TakeoffRow key={r.key} rowKey={r.key} main={r.name} value={`${Math.round(r.sf)} SF`} />
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px 10px" }}>
                  <span style={{ fontSize: 11, fontWeight: 800 }}>TOTAL SF</span>
                  <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: COLORS.accent }}>{Math.round(takeoff.totalSF)} SF</span>
                </div>
              </>
            )}

            {hasDoc && (
              <div style={{ fontSize: 10, color: COLORS.textMut, marginTop: 4, lineHeight: 1.5 }}>
                LF measured along wall centerlines. Auto-picked SF areas measure to centerlines too. Click any row to isolate it on the plan; click its swatch to recolor.
              </div>
            )}
          </div>

          {/* selected entity editors */}
          {selWall && (
            <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Label>Selected wall</Label>
                <button onClick={deleteSel} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: "#e07b7b", borderRadius: 6, fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>Delete</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "8px 8px", alignItems: "center", fontSize: 12 }}>
                <span style={{ color: COLORS.textMut }}>Length</span>
                <input value={lenDraft} onChange={(e) => setLenDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") setSelLength(lenDraft); }}
                  onBlur={() => setSelLength(lenDraft)} style={inputStyle} />
                <span style={{ color: COLORS.textMut }}>Thickness</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {THICKNESS_PRESETS.map((t) => <Pill key={t} active={selWall.thickness === t} onClick={() => updateWall({ thickness: t })}>{t}"</Pill>)}
                  <input value={THICKNESS_PRESETS.includes(selWall.thickness) ? "" : selWall.thickness} placeholder="…"
                    onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) updateWall({ thickness: v }); }}
                    style={{ ...inputStyle, width: 36 }} />
                </div>
                <span style={{ color: COLORS.textMut }}>Depth</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {DEPTH_PRESETS.map((d) => <Pill key={d} active={selWall.depth === d} onClick={() => updateWall({ depth: d })}>{d}'</Pill>)}
                  <input value={DEPTH_PRESETS.includes(selWall.depth) ? "" : selWall.depth} placeholder="…"
                    onChange={(e) => { const v = parseLength(e.target.value); if (v && v > 0) updateWall({ depth: v }); }}
                    style={{ ...inputStyle, width: 36 }} />
                </div>
                <span style={{ color: COLORS.textMut }}>Footing</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: COLORS.textMut, cursor: "pointer" }}>
                    <input type="checkbox" checked={!selWall.footing}
                      onChange={(e) => updateWall({ footing: e.target.checked ? null : { w: defFootW(selWall.thickness), h: defFootH(selWall.thickness) } })} />
                    auto
                  </label>
                  <input disabled={!selWall.footing} value={footOf(selWall).w}
                    onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) updateWall({ footing: { ...footOf(selWall), w: v } }); }}
                    style={{ ...inputStyle, width: 40, color: selWall.footing ? COLORS.text : COLORS.textMut }} />
                  <span style={{ color: COLORS.textMut, fontSize: 11 }}>w ×</span>
                  <input disabled={!selWall.footing} value={footOf(selWall).h}
                    onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) updateWall({ footing: { ...footOf(selWall), h: v } }); }}
                    style={{ ...inputStyle, width: 40, color: selWall.footing ? COLORS.text : COLORS.textMut }} />
                  <span style={{ color: COLORS.textMut, fontSize: 11 }}>d in</span>
                </div>
              </div>
            </div>
          )}

          {selPad && (
            <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Label>Selected pier pad</Label>
                <button onClick={deleteSel} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: "#e07b7b", borderRadius: 6, fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>Delete</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                {["w", "l", "d"].map((k, i) => (
                  <React.Fragment key={k}>
                    {i > 0 && <span style={{ color: COLORS.textMut }}>×</span>}
                    <input value={selPad[k]}
                      onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) updatePad({ [k]: v }); }}
                      style={{ ...inputStyle, width: 48 }} />
                  </React.Fragment>
                ))}
                <span style={{ color: COLORS.textMut, fontSize: 11 }}>in (W × L × D)</span>
              </div>
              <div style={{ fontSize: 10, color: COLORS.textMut, marginTop: 6 }}>Drag the pad on the plan to move it.</div>
            </div>
          )}

          {selWin && (
            <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Label>Selected window</Label>
                <button onClick={deleteSel} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: "#e07b7b", borderRadius: 6, fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>Delete</button>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <Pill active={selWin.kind === "peek"} onClick={() => updateWin({ kind: "peek" })}>Peek window</Pill>
                <Pill active={selWin.kind === "well"} onClick={() => updateWin({ kind: "well" })}>Window well</Pill>
                <Pill onClick={() => updateWin({ side: -(selWin.side || 1) })} title="Flip which side the well faces">⇅ Flip</Pill>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <span style={{ color: COLORS.textMut }}>Width</span>
                <input value={selWin.width}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) updateWin({ width: v }); }}
                  style={{ ...inputStyle, width: 48 }} />
                <span style={{ color: COLORS.textMut, fontSize: 11 }}>in</span>
              </div>
              <div style={{ fontSize: 10, color: COLORS.textMut, marginTop: 6 }}>Drag along a wall to reposition — it snaps to the nearest wall.</div>
            </div>
          )}

          {selArea && (
            <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Label>Selected area</Label>
                <button onClick={deleteSel} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: "#e07b7b", borderRadius: 6, fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>Delete</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ color: COLORS.textMut }}>Name</span>
                <input value={selArea.name} onChange={(e) => updateArea({ name: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ fontFamily: mono, fontSize: 13, color: COLORS.accent, marginTop: 8 }}>
                {Math.round(Math.abs(shoelace(selArea.pts)))} SF
              </div>
            </div>
          )}
          {selDim && (
            <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Label>Selected measurement</Label>
                <button onClick={deleteSel} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: "#e07b7b", borderRadius: 6, fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>Delete</button>
              </div>
              <div style={{ fontFamily: mono, fontSize: 14, color: COLORS.accent, marginTop: 8 }}>
                {formatFtIn(dist(selDim.x1, selDim.y1, selDim.x2, selDim.y2))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* status bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "6px 14px", background: COLORS.chromeDeep, borderTop: `1px solid ${COLORS.border}`, fontSize: 11, color: COLORS.textMut }}>
        <span style={{ fontFamily: mono }}>{mouse && view === "2d" ? `${formatFtIn(mouse.x)}, ${formatFtIn(mouse.y)}` : ""}</span>
        {view === "2d" && (
          <span style={{ fontFamily: mono }} title="Snap increment — zoom in for finer control">
            snap <span style={{ color: COLORS.accent, fontWeight: 700 }}>{snapLabel}</span>
          </span>
        )}
        {altFree && view === "2d" && <span style={{ color: COLORS.accent }}>snap off — free angle</span>}
        <span style={{ marginLeft: "auto" }}>{view === "2d" ? hints[mode] : "3D is view-only — switch to 2D Plan to edit"}</span>
      </div>

      {/* modals */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
          onClick={() => setModal(null)}>
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}>
            {modal === "pad" && (
              <>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>Pier pad size</div>
                <div style={{ fontSize: 11, color: COLORS.textMut, marginBottom: 12 }}>Set the size, then click the plan to stamp pads.</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                  {["w", "l", "d"].map((k, i) => (
                    <React.Fragment key={k}>
                      {i > 0 && <span style={{ color: COLORS.textMut }}>×</span>}
                      <input value={padSpec[k]}
                        onChange={(e) => { const v = parseFloat(e.target.value); setPadSpec((s) => ({ ...s, [k]: Number.isFinite(v) && v > 0 ? v : s[k] })); }}
                        style={{ ...inputStyle, width: 56, textAlign: "center" }} />
                    </React.Fragment>
                  ))}
                  <span style={{ color: COLORS.textMut, fontSize: 11 }}>in</span>
                </div>
                <div style={{ fontSize: 10, color: COLORS.textMut, marginBottom: 14 }}>Width × Length × Depth, in inches.</div>
              </>
            )}
            {modal === "window" && (
              <>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>Window type</div>
                <div style={{ fontSize: 11, color: COLORS.textMut, marginBottom: 12 }}>Pick the type, then click on a wall to place. It snaps to the nearest wall.</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <Pill active={winSpec.kind === "peek"} onClick={() => setWinSpec({ kind: "peek", width: 32 })}>Peek window</Pill>
                  <Pill active={winSpec.kind === "well"} onClick={() => setWinSpec({ kind: "well", width: 48 })}>Window well</Pill>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                  <span style={{ color: COLORS.textMut, fontSize: 12 }}>Width</span>
                  <input value={winSpec.width}
                    onChange={(e) => { const v = parseFloat(e.target.value); setWinSpec((s) => ({ ...s, width: Number.isFinite(v) && v > 0 ? v : s.width })); }}
                    style={{ ...inputStyle, width: 56, textAlign: "center" }} />
                  <span style={{ color: COLORS.textMut, fontSize: 11 }}>in</span>
                </div>
              </>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => { setModal(null); setMode("select"); }} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.textMut, borderRadius: 6, fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => setModal(null)} style={{ background: COLORS.accent, border: "none", color: "#1a1a1a", fontWeight: 700, borderRadius: 6, fontSize: 12, padding: "6px 14px", cursor: "pointer" }}>Start placing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
