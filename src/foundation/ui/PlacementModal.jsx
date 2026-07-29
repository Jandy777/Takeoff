import React from "react";
import { COLORS } from "../constants";
import { Pill, inputStyle } from "./primitives";

export function PlacementModal({ modal, setModal, setMode, padSpec, setPadSpec, winSpec, setWinSpec }) {
  if (!modal) return null;
  return (
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
  );
}
