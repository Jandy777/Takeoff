import React from "react";
import { SEL } from "../constants";
import { MONO as mono } from "../constants";
import { wallLen, windowPose, centerlineOpenWallRun } from "../geometry";
import { slabKey } from "../model";
import { Grid } from "./Grid";
import { WallGlyph } from "./WallGlyph";
import { PadGlyph } from "./PadGlyph";
import { WindowGlyph } from "./WindowGlyph";
import { AreaGlyph } from "./AreaGlyph";
import { DimGlyph } from "./DimGlyph";
import { ptsStr } from "./screenUtils";
import { selected } from "../selection";

// The 2D plan: grid + committed entities + every in-progress drawing preview
// (wall run, ruler, area trace, window/well placement). Purely presentational —
// all interaction state and handlers are owned by useEditorInteractions.
export function PlanCanvas({
  svgRef, size, tf, toScreen, toWorld, viewBox,
  doc, sel, selWall,
  groupSelection, selectionBox,
  filletFirst,
  rowColor, shown, showDims,
  mode, areaMode, start, tracePts, rulerPt, pendingWin, mouse, snapInfo,
  curT, curD, winSpec,
  wallLengthBasis,
  faceSide = 1,
  drainPts, drainKind, ledgeStart,
  reference,
  showFootings = false,
  onMouseDown, onMouseMove, onMouseUp, onWheel,
}) {
  const { walls, pads, windows, areas, dims } = doc;
  const selFor = (type, id) => selected(groupSelection, type, id) || (type === "wall" && filletFirst?.id === id) ? { type, id } : sel;

  return (
    <svg
      ref={svgRef} width={size.w} height={size.h} viewBox={viewBox}
      style={{ display: "block", cursor: mode === "view" ? "grab" : mode === "select" ? "default" : "crosshair", userSelect: "none", touchAction: mode === "view" ? "none" : "auto" }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
      onWheel={onWheel} onContextMenu={(e) => e.preventDefault()}
    >
      <g id="underlay-layer" />
      <Grid tf={tf} size={size} toWorld={toWorld} toScreen={toScreen} />
      <g>{areas.map((a) => <AreaGlyph key={a.id} area={a} tf={tf} toScreen={toScreen} sel={selFor("area", a.id)} rowColor={rowColor} shown={shown} />)}</g>
      {showFootings && <g>{walls.map((w) => <WallGlyph key={w.id} wall={w} walls={walls} tf={tf} toScreen={toScreen} sel={selFor("wall", w.id)} rowColor={rowColor} shown={shown} showDims={false} footingOnly />)}</g>}
      <g>{walls.map((w) => <WallGlyph key={w.id} wall={w} walls={walls} tf={tf} toScreen={toScreen} sel={selFor("wall", w.id)} rowColor={rowColor} shown={shown} showDims={showDims} />)}</g>
      {filletFirst && (() => {
        const wall = walls.find((w) => w.id === filletFirst.id); if (!wall) return null;
        const [x, y] = toScreen(filletFirst.end === 1 ? wall.x1 : wall.x2, filletFirst.end === 1 ? wall.y1 : wall.y2);
        return <g pointerEvents="none"><circle cx={x} cy={y} r={9} fill="#fff" stroke={SEL} strokeWidth={3} /><circle cx={x} cy={y} r={3} fill={SEL} /></g>;
      })()}
      <g>{pads.map((p) => <PadGlyph key={p.id} pad={p} tf={tf} toScreen={toScreen} sel={selFor("pad", p.id)} rowColor={rowColor} shown={shown} />)}</g>
      <g>{(doc.slabs || []).map((s) => {
        const [x, y] = toScreen(s.x, s.y), w = s.w / 12 * tf.scale, h = s.l / 12 * tf.scale;
        const active = selFor("slab", s.id)?.type === "slab" && selFor("slab", s.id)?.id === s.id;
        return <g key={s.id} opacity={shown(slabKey(s)) ? 1 : 0.06}><rect x={x - w / 2} y={y - h / 2} width={w} height={h} transform={`rotate(${s.rotation || 0} ${x} ${y})`} fill={rowColor(slabKey(s))} fillOpacity={0.35} stroke={active ? SEL : rowColor(slabKey(s))} strokeWidth={active ? 3 : 1.5} /><text x={x} y={y} textAnchor="middle" fontSize={10} fill="#26313b" fontFamily={mono}>TS {s.w}×{s.l}×{s.d}″</text></g>;
      })}</g>
      <g>{(doc.wings || []).map((w) => {
        const p = windowPose(w, walls); if (!p) return null;
        const [x, y] = toScreen(p.x, p.y), angle = p.ang * 180 / Math.PI;
        const active = selFor("wing", w.id)?.type === "wing" && selFor("wing", w.id)?.id === w.id;
        const side = w.side || 1, wallThick = (p.thickness || 8) / 12 * tf.scale, armLength = 2 * tf.scale;
        return <g key={w.id} transform={`translate(${x} ${y}) rotate(${angle})`}><rect x={-wallThick / 2} y={side > 0 ? wallThick / 2 : -wallThick / 2 - armLength} width={wallThick} height={armLength} fill="#b3a2c5" stroke={active ? SEL : "#734c99"} strokeWidth={active ? 2.5 : 1.5} /><text x={wallThick / 2 + 4} y={side * (wallThick / 2 + armLength)} fontSize={10} fill="#553373">WA</text></g>;
      })}</g>
      <g>{(doc.texts || []).map((t) => { const [x, y] = toScreen(t.x, t.y); const active = selFor("text", t.id)?.type === "text" && selFor("text", t.id)?.id === t.id; return <text key={t.id} x={x} y={y} fontSize={Math.max(1, t.size / 12 * tf.scale)} fill={t.color || "#20262d"} stroke={active ? SEL : "none"} strokeWidth={active ? 2 : 0} paintOrder="stroke" fontFamily="sans-serif">{t.text}</text>; })}</g>
      <g>{windows.map((w) => <WindowGlyph key={w.id} win={w} walls={walls} tf={tf} toScreen={toScreen} sel={selFor("window", w.id)} rowColor={rowColor} shown={shown} />)}</g>
      <g>{dims.map((m) => <DimGlyph key={m.id} dim={m} toScreen={toScreen} sel={selFor("dim", m.id)} />)}</g>
      <g>{(doc.drains || []).map((drain) => (
        <polyline key={drain.id} points={ptsStr(drain.pts, toScreen)} fill="none"
          stroke={(sel?.type === "drain" && sel.id === drain.id) || selected(groupSelection, "drain", drain.id) ? SEL : drain.kind === "exterior" ? "#1572a1" : "#9a42aa"}
          strokeWidth={4} strokeDasharray={drain.kind === "interior" ? "7 4" : undefined} strokeLinecap="round" strokeLinejoin="round" />
      ))}</g>
      <g>{(doc.ledges || []).filter((ledge) => ledge.pts.length === 2).map((ledge) => (
        <polyline key={ledge.id} points={ptsStr(ledge.pts, toScreen)} fill="none"
          stroke={(sel?.type === "ledge" && sel.id === ledge.id) || selected(groupSelection, "ledge", ledge.id) ? SEL : ledge.kind === "brick" ? "#b64a35" : "#937132"}
          strokeWidth={5} strokeLinecap="round" />
      ))}</g>
      {selectionBox && (() => {
        const [x1, y1] = toScreen(selectionBox.a.x, selectionBox.a.y), [x2, y2] = toScreen(selectionBox.b.x, selectionBox.b.y);
        return <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} fill="rgba(255,138,61,0.13)" stroke={SEL} strokeWidth={1.5} strokeDasharray="6 4" pointerEvents="none" />;
      })()}
      {reference?.corner && (() => {
        const [cx, cy] = toScreen(reference.corner.x, reference.corner.y);
        return <circle cx={cx} cy={cy} r={7} fill="#fff" stroke="#e5571b" strokeWidth={3} pointerEvents="none" />;
      })()}
      {(reference?.face || snapInfo?.type === "reference face") && (() => {
        const face = reference?.face || snapInfo.face;
        const [ax, ay] = toScreen(face.origin.x, face.origin.y), [bx, by] = toScreen(face.end.x, face.end.y);
        return <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#e5571b" strokeWidth={4} strokeDasharray="7 4" opacity={0.9} pointerEvents="none" />;
      })()}
      {reference?.point && (() => {
        const [x, y] = toScreen(reference.point.x, reference.point.y);
        return <g pointerEvents="none"><circle cx={x} cy={y} r={9} fill="#fff" stroke="#e5571b" strokeWidth={3} /><circle cx={x} cy={y} r={3} fill="#e5571b" /><text x={x + 14} y={y - 10} fontSize={11} fontWeight={700} fill="#9b3b11" stroke="#fff" strokeWidth={3} paintOrder="stroke">Wall start</text></g>;
      })()}
      {mode === "ledge" && ledgeStart && snapInfo && <line x1={toScreen(ledgeStart.x, ledgeStart.y)[0]} y1={toScreen(ledgeStart.x, ledgeStart.y)[1]} x2={toScreen(snapInfo.x, snapInfo.y)[0]} y2={toScreen(snapInfo.x, snapInfo.y)[1]} stroke="#b64a35" strokeWidth={3} strokeDasharray="6 4" />}
      {mode === "drain" && drainPts.length > 0 && (
        <g>
          <polyline points={ptsStr(snapInfo ? [...drainPts, snapInfo] : drainPts, toScreen)} fill="none"
            stroke={drainKind === "exterior" ? "#1572a1" : "#9a42aa"} strokeWidth={3} strokeDasharray="7 4" />
          {drainPts.map((p, i) => { const [x, y] = toScreen(p.x, p.y); return <circle key={i} cx={x} cy={y} r={4} fill="#fff" stroke="#1572a1" strokeWidth={2} />; })}
        </g>
      )}

      {/* ruler in-progress preview */}
      {mode === "ruler" && rulerPt && snapInfo && (
        <DimGlyph dim={{ x1: rulerPt.x, y1: rulerPt.y, x2: snapInfo.x, y2: snapInfo.y }} isPreview toScreen={toScreen} sel={sel} />
      )}
      {mode === "ruler" && rulerPt && (() => { const [sx, sy] = toScreen(rulerPt.x, rulerPt.y); return <circle cx={sx} cy={sy} r={4} fill="#4a6fa5" />; })()}

      {/* wall endpoint handles */}
      {selWall && ["a", "b"].map((end) => {
        const px = end === "a" ? selWall.x1 : selWall.x2;
        const py = end === "a" ? selWall.y1 : selWall.y2;
        const [hx, hy] = toScreen(px, py);
        return <rect key={end} x={hx - 5} y={hy - 5} width={10} height={10} fill="#fff" stroke={SEL} strokeWidth={2} style={{ cursor: "move" }} />;
      })}

      {/* wall drawing preview */}
      {mode === "draw" && start && snapInfo && (
        <WallGlyph
          wall={(() => { const w = { id: -1, x1: start.x, y1: start.y, x2: snapInfo.x, y2: snapInfo.y, thickness: curT, depth: curD, footing: null, lengthBasis: wallLengthBasis }; return wallLengthBasis === "centerline" ? w : (centerlineOpenWallRun([w], faceSide)?.[0] || w); })()}
          isPreview walls={walls} tf={tf} toScreen={toScreen} sel={sel} rowColor={rowColor} shown={shown} showDims={showDims}
        />
      )}
      {mode === "draw" && start && (() => { const [sx, sy] = toScreen(start.x, start.y); return <circle cx={sx} cy={sy} r={4} fill={SEL} />; })()}
      {(mode === "draw" || mode === "ruler" || mode === "drain" || mode === "ledge" || (mode === "area" && areaMode === "trace")) && snapInfo && ["endpoint", "wall corner", "wall face"].includes(snapInfo.type) && (() => {
        const [sx, sy] = toScreen(snapInfo.x, snapInfo.y);
        const label = snapInfo.type === "wall face" ? "WALL FACE" : "CORNER";
        return <g pointerEvents="none" aria-label={`${label} snap`}>
          <circle cx={sx} cy={sy} r={13} fill="rgba(255,255,255,0.9)" stroke={SEL} strokeWidth={3} />
          <circle cx={sx} cy={sy} r={3.5} fill={SEL} />
          <path d={`M ${sx - 18} ${sy} h 5 M ${sx + 13} ${sy} h 5 M ${sx} ${sy - 18} v 5 M ${sx} ${sy + 13} v 5`} stroke={SEL} strokeWidth={2} />
          <rect x={sx + 17} y={sy - 29} width={label === "CORNER" ? 58 : 72} height={20} rx={5} fill="#25313b" />
          <text x={sx + 23} y={sy - 15} fill="#fff" fontSize={10} fontWeight={700} fontFamily={mono}>{label}</text>
        </g>;
      })()}

      {/* trace preview */}
      {mode === "area" && areaMode === "trace" && tracePts.length > 0 && (
        <g>
          <polyline points={ptsStr(tracePts, toScreen)} fill="none" stroke={SEL} strokeWidth={2} strokeDasharray="6 4" />
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
  );
}

