import React from "react";
import { COLORS } from "../constants";
import { mono } from "./primitives";

// Small absolutely-positioned overlays that float over the plan/3D canvas:
// the typed-length chip while drawing, the 3D orbit hint, the "solo filter"
// banner, and toast messages.
export function PlanOverlays({ view, mode, areaMode, start, tracePts, typed, soloSet, setSolo, toast }) {
  return (
    <>
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
    </>
  );
}
