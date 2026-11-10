import React from "react";
import { COLORS } from "../constants";
import { formatFtIn } from "../geometry";
import { mono } from "./primitives";

function hintFor({ mode, start, sel, pendingWin, winSpec, areaMode, rulerPt }) {
  switch (mode) {
    case "draw":
      return start
        ? "Click to place endpoint — or type a length + Enter · right-click ends the run · hold Alt to ignore snap"
        : "Click to start a wall run";
    case "select":
      return sel ? "Drag to move · Delete removes · edit in the panel" : "Click any wall, footing, pad, window, or area to select · drag empty space to pan";
    case "pad":
      return "Click to stamp pads · right-click when done";
    case "window":
      if (pendingWin) return "Now click the side the well faces — the arrow points outside the foundation";
      return winSpec.kind === "well"
        ? "Click a wall to position the well, then a second click sets which way it faces"
        : "Click on or near a wall to place · right-click when done";
    case "area":
      return areaMode === "pick"
        ? "Click inside a closed wall loop to measure it"
        : "Click to trace an outline · type lengths + Enter works too · right-click or click the first point to close";
    case "ruler":
      return rulerPt ? "Click the second point to set the measurement" : "Click two points to measure — dimensions stay on the plan until deleted · right-click exits";
    case "drain":
      return "Click anchor points along the drain path · Enter or right-click finishes · Esc cancels";
    case "ledge":
      return "Click wall-face corners or points for each segment · right-click finishes · Esc cancels";
    default:
      return "";
  }
}

export function StatusBar({ view, mouse, snapLabel, altFree, mode, start, sel, pendingWin, winSpec, areaMode, rulerPt }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "6px 14px", background: COLORS.chromeDeep, borderTop: `1px solid ${COLORS.border}`, fontSize: 11, color: COLORS.textMut }}>
      <span style={{ fontFamily: mono }}>{mouse && view === "2d" ? `${formatFtIn(mouse.x)}, ${formatFtIn(mouse.y)}` : ""}</span>
      {view === "2d" && (
        <span style={{ fontFamily: mono }} title="Snap increment — zoom in for finer control">
          snap <span style={{ color: COLORS.accent, fontWeight: 700 }}>{snapLabel}</span>
        </span>
      )}
      {altFree && view === "2d" && <span style={{ color: COLORS.accent }}>snap off — free angle</span>}
      <span style={{ marginLeft: "auto" }}>{view === "2d" ? hintFor({ mode, start, sel, pendingWin, winSpec, areaMode, rulerPt }) : "3D is view-only · Drain tile elevation is illustrative"}</span>
    </div>
  );
}

