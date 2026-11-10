import { useCallback, useEffect, useRef, useState } from "react";
import {
  dist, same, clone, pointSegDist, wallLen, formatFtIn, parseLength,
  findWallSnap, windowPose, pointInPoly, detectClearRegion, centerlineClosedWallRun,
  wallFaceLengths, wallMeasuredLen, resizeWallToMeasuredLength,
  snapToWallFace, ledgeOnWallFace,
} from "../geometry";
import { nid, footOf } from "../model";

// The interaction "engine": current tool/mode, in-progress drawing state,
// selection, pointer + keyboard handling, and the document-mutating actions
// they trigger. This is the one place in the app that is inherently a single
// coupled state machine — splitting it further just moves the coupling
// around without reducing it. Pure geometry/model logic it calls lives in
// ../geometry and ../model; anything reusable outside the editor should be
// pulled out to there, not grown here.
export function useEditorInteractions({ doc, apply, pushUndo, doUndo: undo1, doRedo: redo1, clearDoc, setDoc, onClear }, viewport, snapping) {
  const { tf, toWorld, svgPoint, beginPan, updatePan, endPan } = viewport;
  const { snapTo, snapPreview } = snapping;
  const { walls, pads, windows, areas } = doc;
  const dims = doc.dims || [];
  const drains = doc.drains || [];
  const ledges = doc.ledges || [];

  const [mode, setMode] = useState("draw"); // draw | select | pad | window | area | ruler
  const [areaMode, setAreaMode] = useState("pick"); // pick | trace
  const [drainKind, setDrainKind] = useState("exterior");
  const [drainPts, setDrainPts] = useState([]);
  const [ledgeKind, setLedgeKind] = useState("brick");
  const [ledgeSize, setLedgeSize] = useState("2x4");
  const [ledgeStart, setLedgeStart] = useState(null);
  const [curT, setCurT] = useState(8);
  const [curD, setCurD] = useState(8);
  const [wallLengthBasis, setWallLengthBasis] = useState("outside");
  const [customT, setCustomT] = useState("");
  const [customD, setCustomD] = useState("");
  const [sel, setSel] = useState(null); // {type, id}
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState(null);

  const [padSpec, setPadSpec] = useState({ w: 24, l: 24, d: 12 }); // inches
  const [winSpec, setWinSpec] = useState({ kind: "peek", width: 32 }); // inches
  const [modal, setModal] = useState(null); // 'pad' | 'window' | null
  const [pendingWin, setPendingWin] = useState(null); // well placement step 1 done, awaiting direction click

  const [start, setStart] = useState(null);
  const [runStart, setRunStart] = useState(null);
  const [tracePts, setTracePts] = useState([]);
  const [rulerPt, setRulerPt] = useState(null);
  const [showDims, setShowDims] = useState(true);
  const [mouse, setMouse] = useState(null);
  const [snapInfo, setSnapInfo] = useState(null);
  const [typed, setTyped] = useState("");
  const [altFree, setAltFree] = useState(false);

  const dragRef = useRef(null); // wall endpoint drag
  const dragEntRef = useRef(null); // pad/window drag
  const runWallIdsRef = useRef([]);
  const runBasisRef = useRef("outside");

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const doUndo = useCallback(() => { if (undo1()) setSel(null); }, [undo1]);
  const doRedo = useCallback(() => { if (redo1()) setSel(null); }, [redo1]);

  const selectAreaMode = useCallback((next) => {
    setAreaMode(next);
    if (next === "pick") setTracePts([]);
  }, []);

  // ---------- placement / drawing ----------
  const addWall = useCallback(
    (x1, y1, x2, y2, lengthBasis) => {
      if (dist(x1, y1, x2, y2) < 0.01) return false;
      const id = nid();
      apply((d) => {
        d.walls.push({ id, x1, y1, x2, y2, thickness: curT, depth: curD, footing: null, lengthBasis });
        return d;
      });
      return id;
    },
    [apply, curT, curD]
  );

  const commitWallPoint = useCallback(
    (pt) => {
      if (!start) {
        setStart({ x: pt.x, y: pt.y });
        setRunStart({ x: pt.x, y: pt.y });
        runWallIdsRef.current = [];
        runBasisRef.current = wallLengthBasis;
        setTyped("");
        return;
      }
      const closesRun = Boolean(runStart && same(pt.x, pt.y, runStart.x, runStart.y));
      const basis = runBasisRef.current;
      if (closesRun && runWallIdsRef.current.length >= 2 && basis !== "centerline") {
        const id = nid();
        const priorIds = [...runWallIdsRef.current, id];
        apply((d) => {
          d.walls.push({ id, x1: start.x, y1: start.y, x2: pt.x, y2: pt.y, thickness: curT, depth: curD, footing: null, lengthBasis: basis });
          const ordered = priorIds.map((wallId) => d.walls.find((w) => w.id === wallId)).filter(Boolean);
          const centered = centerlineClosedWallRun(ordered, basis);
          const byId = new Map(centered.map((w) => [w.id, w]));
          d.walls = d.walls.map((w) => byId.get(w.id) || w);
          return d;
        });
      } else {
        const id = addWall(start.x, start.y, pt.x, pt.y, basis);
        if (!id) return;
        runWallIdsRef.current.push(id);
      }
      setTyped("");
      if (closesRun) {
        setStart(null);
        setRunStart(null);
        runWallIdsRef.current = [];
      } else {
        setStart({ x: pt.x, y: pt.y });
      }
    },
    [start, runStart, wallLengthBasis, addWall, apply, curT, curD]
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
        const first = tracePts[0];
        if (dist(first.x, first.y, pt.x, pt.y) * tf.scale < 12) { closeTrace(); return; }
      }
      setTracePts((p) => [...p, { x: pt.x, y: pt.y }]);
      setTyped("");
    },
    [tracePts, tf.scale, closeTrace]
  );

  const finishDrain = useCallback(() => {
    if (drainPts.length >= 2) {
      apply((d) => { d.drains = [...(d.drains || []), { id: nid(), kind: drainKind, pts: clone(drainPts) }]; return d; });
    }
    setDrainPts([]);
  }, [drainPts, drainKind, apply]);

  // ---------- hit testing ----------
  const hitTest = useCallback(
    (wx, wy) => {
      for (const ledge of ledges) {
        if (ledge.pts.length === 2 && pointSegDist(wx, wy, ledge.pts[0].x, ledge.pts[0].y, ledge.pts[1].x, ledge.pts[1].y) < 7 / tf.scale) return { type: "ledge", id: ledge.id };
      }
      for (const drain of drains) {
        for (let i = 1; i < drain.pts.length; i++) {
          const a = drain.pts[i - 1], b = drain.pts[i];
          if (pointSegDist(wx, wy, a.x, a.y, b.x, b.y) < 8 / tf.scale) return { type: "drain", id: drain.id };
        }
      }
      for (const m of dims) {
        if (pointSegDist(wx, wy, m.x1, m.y1, m.x2, m.y2) < 6 / tf.scale) return { type: "dim", id: m.id };
      }
      for (const win of windows) {
        const pose = windowPose(win, walls);
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
    },
    [ledges, drains, dims, windows, walls, pads, areas, tf.scale]
  );

  // ---------- mouse ----------
  const onMouseDown = useCallback(
    (e) => {
      const [sx, sy] = svgPoint(e);
      if (e.button === 1) {
        beginPan(sx, sy);
        e.preventDefault();
        return;
      }
      if (e.button === 2) {
        if (mode === "ledge") { setLedgeStart(null); e.preventDefault(); return; }
        if (mode === "drain") { finishDrain(); e.preventDefault(); return; }
        if (mode === "draw") { setStart(null); setRunStart(null); setTyped(""); runWallIdsRef.current = []; }
        else if (mode === "area" && areaMode === "trace") closeTrace();
        else if (mode === "ruler") { rulerPt ? setRulerPt(null) : setMode("select"); }
        else if (mode === "window") { pendingWin ? setPendingWin(null) : setMode("select"); }
        else if (mode === "pad") setMode("select");
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      const [wx, wy] = toWorld(sx, sy);

      if (mode === "ledge") {
        const pt = snapToWallFace(wx, wy, walls, 12 / tf.scale);
        if (!pt) { showToast("Select a wall face or corner for the ledge."); return; }
        if (!ledgeStart) { setLedgeStart({ x: pt.x, y: pt.y }); return; }
        const span = ledgeOnWallFace(ledgeStart, pt, walls, 0.02);
        if (!span) { showToast("Select the next point on the same wall face. Place separate segments around corners."); return; }
        const wall = walls.find((w) => w.id === span.wallId);
        const [drop, width] = ledgeSize.split("x").map(Number);
        if (width >= wall.thickness || drop / 12 >= wall.depth) { showToast("Ledge must be smaller than the wall thickness and height."); return; }
        const low = Math.min(span.t0, span.t1), high = Math.max(span.t0, span.t1);
        if (ledges.some((l) => l.wallId === span.wallId && l.start === span.start && Math.max(low, Math.min(l.t0, l.t1)) < Math.min(high, Math.max(l.t0, l.t1)) - 1e-6)) {
          showToast("A ledge already occupies part of this wall face."); return;
        }
        if (ledges.some((l) => l.wallId === span.wallId && l.start !== span.start && width + Number(l.size.split("x")[1]) >= wall.thickness && Math.max(low, Math.min(l.t0, l.t1)) < Math.min(high, Math.max(l.t0, l.t1)) - 1e-6)) {
          showToast("Opposite ledges would remove the entire wall thickness."); return;
        }
        apply((d) => { d.ledges = [...(d.ledges || []), { id: nid(), kind: ledgeKind, size: ledgeSize, wallId: span.wallId, start: span.start, end: span.end, t0: span.t0, t1: span.t1 }]; return d; });
        setLedgeStart({ x: pt.x, y: pt.y });
        return;
      }

      if (mode === "drain") {
        const pt = snapToWallFace(wx, wy, walls, 12 / tf.scale) || { x: snapTo(wx), y: snapTo(wy) };
        if (!drainPts.length || dist(drainPts[drainPts.length - 1].x, drainPts[drainPts.length - 1].y, pt.x, pt.y) > 0.01)
          setDrainPts((points) => [...points, { x: pt.x, y: pt.y, ...(pt.anchor ? { anchor: pt.anchor } : {}) }]);
        return;
      }

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
        const wallTol = Math.max(16 / tf.scale, 2);
        if (winSpec.kind === "peek") {
          const snap = findWallSnap(wx, wy, walls, wallTol);
          apply((d) => {
            if (snap) d.windows.push({ id: nid(), wallId: snap.wallId, t: snap.t, side: 1, kind: "peek", width: winSpec.width });
            else d.windows.push({ id: nid(), wallId: null, x: snapTo(wx), y: snapTo(wy), ang: 0, side: 1, kind: "peek", width: winSpec.width });
            return d;
          });
          return;
        }
        // wells: click 1 = position, click 2 = facing direction
        if (!pendingWin) {
          const snap = findWallSnap(wx, wy, walls, wallTol);
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
          const poly = detectClearRegion(walls, wx, wy);
          if (poly) {
            const n = areas.length + 1;
            apply((d) => {
              d.areas.push({ id: nid(), name: `Area ${n}`, pts: poly });
              return d;
            });
          } else {
            showToast("Could not resolve a clear interior here — check the wall loop or use Trace.");
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
            const hx = tf.ox + px * tf.scale, hy = tf.oy + py * tf.scale;
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
        beginPan(sx, sy);
      }
    },
    [svgPoint, beginPan, tf, mode, areaMode, rulerPt, pendingWin, toWorld, commitWallPoint, snapPreview, start, apply, snapTo, padSpec, winSpec, walls, areas, sel, doc, hitTest, closeTrace, commitTracePoint, tracePts, showToast, drainPts, finishDrain, ledgeStart, ledgeSize, ledgeKind, ledges]
  );

  const onMouseMove = useCallback(
    (e) => {
      const [sx, sy] = svgPoint(e);
      if (updatePan(sx, sy)) return;

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
          const snap = findWallSnap(wx, wy, walls, Math.max(16 / tf.scale, 2));
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
      else if (mode === "ledge") setSnapInfo(snapToWallFace(wx, wy, walls, 12 / tf.scale));
      else if (mode === "drain") setSnapInfo(snapToWallFace(wx, wy, walls, 12 / tf.scale) || { x: snapTo(wx), y: snapTo(wy), type: "grid" });
      else if (mode === "ruler") setSnapInfo(snapPreview(rulerPt, wx, wy, e.altKey));
      else if (mode === "area" && areaMode === "trace")
        setSnapInfo(snapPreview(tracePts.length ? tracePts[tracePts.length - 1] : null, wx, wy, e.altKey));
      else if (mode === "window") setSnapInfo(pendingWin ? null : findWallSnap(wx, wy, walls, Math.max(16 / tf.scale, 2)));
      else setSnapInfo(null);
    },
    [svgPoint, updatePan, toWorld, tf.scale, snapTo, walls, setDoc, mode, snapPreview, start, rulerPt, areaMode, tracePts, pendingWin, drainPts]
  );

  const onMouseUp = useCallback(() => {
    endPan();
    if (dragRef.current) {
      if (dragRef.current.moved) pushUndo(dragRef.current.snapshot);
      dragRef.current = null;
    }
    if (dragEntRef.current) {
      if (dragEntRef.current.moved) pushUndo(dragEntRef.current.snapshot);
      dragEntRef.current = null;
    }
  }, [endPan, pushUndo]);

  // ---------- delete helpers ----------
  const deleteSel = useCallback(() => {
    if (!sel) return;
    apply((d) => {
      if (sel.type === "wall") {
        // Freeze points at their current visible positions before removing the
        // host wall, so its deleted anchors never jump back to old coordinates.
        d.drains = (d.drains || []).map((run) => {
          const visible = drains.find((item) => item.id === run.id);
          return { ...run, pts: run.pts.map((p, i) => p.anchor?.wallId === sel.id ? { x: visible.pts[i].x, y: visible.pts[i].y } : p) };
        });
        d.walls = d.walls.filter((w) => w.id !== sel.id);
        d.ledges = (d.ledges || []).filter((l) => l.wallId !== sel.id);
        d.windows = d.windows.filter((w) => w.wallId !== sel.id);
      } else if (sel.type === "pad") d.pads = d.pads.filter((p) => p.id !== sel.id);
      else if (sel.type === "window") d.windows = d.windows.filter((w) => w.id !== sel.id);
      else if (sel.type === "area") d.areas = d.areas.filter((a) => a.id !== sel.id);
      else if (sel.type === "dim") d.dims = (d.dims || []).filter((m) => m.id !== sel.id);
      else if (sel.type === "drain") d.drains = (d.drains || []).filter((m) => m.id !== sel.id);
      else if (sel.type === "ledge") d.ledges = (d.ledges || []).filter((m) => m.id !== sel.id);
      return d;
    });
    setSel(null);
  }, [sel, apply, drains]);

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
        setDrainPts([]);
        setLedgeStart(null);
        setStart(null); setRunStart(null); setTracePts([]); setRulerPt(null); setPendingWin(null); setTyped("");
        runWallIdsRef.current = [];
        setSel(null); setConfirmClear(false); setModal(null);
        return;
      }
      if (mode === "drain" && e.key === "Enter") { e.preventDefault(); finishDrain(); return; }
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
  }, [mode, areaMode, start, tracePts, typed, snapInfo, mouse, sel, doUndo, doRedo, commitWallPoint, commitTracePoint, closeTrace, deleteSel, finishDrain]);

  // mode switching side effects
  useEffect(() => {
    setStart(null); setRunStart(null); setTracePts([]); setRulerPt(null); setPendingWin(null); setTyped("");
    setDrainPts([]);
    setLedgeStart(null);
    runWallIdsRef.current = [];
    if (mode !== "select") setSel(null);
    if (mode === "pad") setModal("pad");
    else if (mode === "window") setModal("window");
    else setModal(null);
  }, [mode]);

  // ---------- selected entity ----------
  const selWall = sel && sel.type === "wall" ? walls.find((w) => w.id === sel.id) : null;
  const selPad = sel && sel.type === "pad" ? pads.find((p) => p.id === sel.id) : null;
  const selWin = sel && sel.type === "window" ? windows.find((w) => w.id === sel.id) : null;
  const selArea = sel && sel.type === "area" ? areas.find((a) => a.id === sel.id) : null;
  const selDim = sel && sel.type === "dim" ? dims.find((m) => m.id === sel.id) : null;
  const selDrain = sel && sel.type === "drain" ? drains.find((m) => m.id === sel.id) : null;
  const selLedge = sel && sel.type === "ledge" ? ledges.find((m) => m.id === sel.id) : null;

  const updateWall = useCallback((patch) => {
    if (!selWall) return;
    const updated = { ...selWall, ...patch };
    const attached = ledges.filter((l) => l.wallId === selWall.id);
    if (attached.some((l) => Number(l.size.split("x")[1]) >= updated.thickness || Number(l.size.split("x")[0]) / 12 >= updated.depth) || attached.some((a) => attached.some((b) => a.start !== b.start && Number(a.size.split("x")[1]) + Number(b.size.split("x")[1]) >= updated.thickness && Math.max(Math.min(a.t0, a.t1), Math.min(b.t0, b.t1)) < Math.min(Math.max(a.t0, a.t1), Math.max(b.t0, b.t1)) - 1e-6))) {
      showToast("Wall is too small for the attached ledge. Delete the ledge first."); return;
    }
    apply((d) => { d.walls = d.walls.map((w) => (w.id === selWall.id ? { ...w, ...patch } : w)); return d; });
  }, [selWall, apply, ledges, showToast]);
  const updatePad = useCallback((patch) => selPad && apply((d) => { d.pads = d.pads.map((p) => (p.id === selPad.id ? { ...p, ...patch } : p)); return d; }), [selPad, apply]);
  const updateWin = useCallback((patch) => selWin && apply((d) => { d.windows = d.windows.map((w) => (w.id === selWin.id ? { ...w, ...patch } : w)); return d; }), [selWin, apply]);
  const updateArea = useCallback((patch) => selArea && apply((d) => { d.areas = d.areas.map((a) => (a.id === selArea.id ? { ...a, ...patch } : a)); return d; }), [selArea, apply]);

  const selectedWallLengths = selWall ? wallFaceLengths(selWall, walls, (q) => q.thickness / 12) : null;
  const [lenDraft, setLenDraft] = useState("");
  useEffect(() => {
    setLenDraft(selWall ? formatFtIn(wallMeasuredLen(selWall, walls, selWall.lengthBasis || "centerline")) : "");
  }, [sel, doc]); // eslint-disable-line

  const setSelLength = useCallback(
    (str) => {
      const len = parseLength(str);
      if (!selWall || !len || len <= 0) return;
      const basis = selWall.lengthBasis || "centerline";
      if (Math.abs(wallMeasuredLen(selWall, walls, basis) - len) < 1e-6) return;
      apply((d) => {
        d.walls = resizeWallToMeasuredLength(selWall.id, d.walls, len, basis);
        return d;
      });
    },
    [selWall, walls, apply]
  );

  const clearAll = useCallback(() => {
    if (!confirmClear) { setConfirmClear(true); return; }
    clearDoc();
    setSel(null); setStart(null); setRunStart(null); setTracePts([]);
    runWallIdsRef.current = [];
    onClear && onClear();
    setConfirmClear(false);
  }, [confirmClear, clearDoc, onClear]);

  return {
    mode, setMode, areaMode, setAreaMode: selectAreaMode,
    drainKind, setDrainKind, drainPts, selDrain,
    ledgeKind, setLedgeKind, ledgeSize, setLedgeSize, ledgeStart, selLedge,
    curT, setCurT, curD, setCurD, customT, setCustomT, customD, setCustomD,
    wallLengthBasis, setWallLengthBasis,
    sel, setSel, selWall, selPad, selWin, selArea, selDim,
    confirmClear, toast, showToast,
    padSpec, setPadSpec, winSpec, setWinSpec, modal, setModal,
    pendingWin,
    start, tracePts, rulerPt, showDims, setShowDims, mouse, snapInfo, typed, altFree,
    lenDraft, setLenDraft, setSelLength, selectedWallLengths,
    onMouseDown, onMouseMove, onMouseUp,
    deleteSel, clearAll,
    updateWall, updatePad, updateWin, updateArea,
    doUndo, doRedo,
  };
}

