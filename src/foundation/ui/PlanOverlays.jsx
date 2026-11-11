import React from "react";
import { COLORS } from "../constants";
import { mono } from "./primitives";

// Small absolutely-positioned overlays that float over the plan/3D canvas:
// the typed-length chip while drawing, the 3D orbit hint, the "solo filter"
// banner, and toast messages.
export function PlanOverlays({ view, mode, areaMode, start, tracePts, typed, soloSet, setSolo, toast, reference, referenceOffset, setReferenceOffset, referenceError, confirmReference, cancelReference }) {
  return (
    <>
      {view === "2d" && ((mode === "draw" && start) || (mode === "area" && areaMode === "trace" && tracePts.length > 0)) && (
        <div style={{ position: "absolute", left: 16, top: 14, background: COLORS.chromeDeep, border: `1px solid ${typed ? COLORS.accent : COLORS.border}`, borderRadius: 8, padding: "7px 12px", fontFamily: mono, fontSize: 13, color: typed ? COLORS.accent : COLORS.textMut, boxShadow: "0 2px 8px rgba(0,0,0,0.35)" }}>
          {typed ? typed : "type length…"} <span style={{ color: COLORS.textMut, fontSize: 11 }}>⏎</span>
        </div>
      )}

      {view === "2d" && reference && reference.stage !== "placed" && <div style={{ position: "absolute", left: 16, top: 14, background: COLORS.chromeDeep, border: `1px solid ${COLORS.accent}`, borderRadius: 8, padding: 12, width: 260, color: COLORS.text, boxShadow: "0 3px 12px rgba(0,0,0,.3)", fontSize: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 800 }}><span>REFERENCE START</span><button type="button" onClick={cancelReference} aria-label="Cancel reference start" style={{ background: "none", border: 0, color: COLORS.text, cursor: "pointer", fontSize: 18 }}>×</button></div>
        {reference.stage === "corner" && <p style={{ margin: "8px 0 0", color: COLORS.textMut }}>1. Click the wall-face corner you want to measure from.</p>}
        {reference.stage === "face" && <p style={{ margin: "8px 0 0", color: COLORS.textMut }}>2. Click along the wall face in the direction you want to measure.</p>}
        {reference.stage === "offset" && <form onSubmit={(e) => { e.preventDefault(); confirmReference(); }}>
          <label htmlFor="reference-offset" style={{ display: "block", margin: "8px 0 5px", color: COLORS.textMut }}>3. Distance from corner (feet and inches)</label>
          <div style={{ display: "flex", gap: 6 }}><input id="reference-offset" autoFocus value={referenceOffset} onChange={(e) => setReferenceOffset(e.target.value)} placeholder={`e.g. 5' or 5'6.5"`} style={{ flex: 1, minWidth: 0, padding: 6, background: COLORS.panel, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 4 }} /><button type="submit" style={{ background: COLORS.accent, border: 0, borderRadius: 4, padding: "5px 10px", fontWeight: 700, cursor: "pointer" }}>Set start</button></div>
          {referenceError && <div role="alert" style={{ color: "#ffad80", marginTop: 6 }}>{referenceError}</div>}
          <div style={{ color: COLORS.textMut, fontSize: 10, marginTop: 6 }}>Measured along the highlighted face, from the selected corner.</div>
        </form>}
      </div>}

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

