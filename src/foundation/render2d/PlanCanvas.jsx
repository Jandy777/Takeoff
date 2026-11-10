import React from "react";
import { SEL } from "../constants";
import { MONO as mono } from "../constants";
import { wallLen } from "../geometry";
import { Grid } from "./Grid";
import { WallGlyph } from "./WallGlyph";
import { PadGlyph } from "./PadGlyph";
import { WindowGlyph } from "./WindowGlyph";
import { AreaGlyph } from "./AreaGlyph";
import { DimGlyph } from "./DimGlyph";
import { ptsStr } from "./screenUtils";

// The 2D plan: grid + committed entities + every in-progress drawing preview
// (wall run, ruler, area trace, window/well placement). Purely presentational —
// all interaction state and handlers are owned by useEditorInteractions.
export function PlanCanvas({
  svgRef, size, tf, toScreen, toWorld,
  doc, sel, selWall,
  rowColor, shown, showDims,
  mode, areaMode, start, tracePts, rulerPt, pendingWin, mouse, snapInfo,
  curT, curD, winSpec,
  wallLengthBasis,
  drainPts, drainKind, ledgeStart,
  onMouseDown, onMouseMove, onMouseUp, onWheel,
}) {
  const { walls, pads, windows, areas, dims } = doc;

  return (
    <svg
      ref={svgRef} width={size.w} height={size.h}
      style={{ display: "block", cursor: mode === "select" ? "default" : "crosshair", userSelect: "none" }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
      onWheel={onWheel} onContextMenu={(e) => e.preventDefault()}
    >
      <g id="underlay-layer" />
      <Grid tf={tf} size={size} toWorld={toWorld} toScreen={toScreen} />
      <g>{areas.map((a) => <AreaGlyph key={a.id} area={a} tf={tf} toScreen={toScreen} sel={sel} rowColor={rowColor} shown={shown} />)}</g>
      <g>{walls.map((w) => <WallGlyph key={w.id} wall={w} walls={walls} tf={tf} toScreen={toScreen} sel={sel} rowColor={rowColor} shown={shown} showDims={showDims} />)}</g>
      <g>{pads.map((p) => <PadGlyph key={p.id} pad={p} tf={tf} toScreen={toScreen} sel={sel} rowColor={rowColor} shown={shown} />)}</g>
      <g>{windows.map((w) => <WindowGlyph key={w.id} win={w} walls={walls} tf={tf} toScreen={toScreen} sel={sel} rowColor={rowColor} shown={shown} />)}</g>
      <g>{dims.map((m) => <DimGlyph key={m.id} dim={m} toScreen={toScreen} sel={sel} />)}</g>
      <g>{(doc.drains || []).map((drain) => (
        <polyline key={drain.id} points={ptsStr(drain.pts, toScreen)} fill="none"
          stroke={sel?.type === "drain" && sel.id === drain.id ? SEL : drain.kind === "exterior" ? "#1572a1" : "#9a42aa"}
          strokeWidth={4} strokeDasharray={drain.kind === "interior" ? "7 4" : undefined} strokeLinecap="round" strokeLinejoin="round" />
      ))}</g>
      <g>{(doc.ledges || []).filter((ledge) => ledge.pts.length === 2).map((ledge) => (
        <polyline key={ledge.id} points={ptsStr(ledge.pts, toScreen)} fill="none"
          stroke={sel?.type === "ledge" && sel.id === ledge.id ? SEL : ledge.kind === "brick" ? "#b64a35" : "#937132"}
          strokeWidth={5} strokeLinecap="round" />
      ))}</g>
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
          wall={{ id: -1, x1: start.x, y1: start.y, x2: snapInfo.x, y2: snapInfo.y, thickness: curT, depth: curD, footing: null, lengthBasis: wallLengthBasis }}
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

