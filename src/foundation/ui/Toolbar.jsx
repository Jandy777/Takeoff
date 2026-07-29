import React from "react";
import { COLORS, THICKNESS_PRESETS, DEPTH_PRESETS } from "../constants";
import { parseLength } from "../geometry";
import { Pill, Label, inputStyle } from "./primitives";

export function Toolbar({
  mode, setMode, areaMode, setAreaMode,
  showDims, setShowDims,
  curT, setCurT, customT, setCustomT,
  curD, setCurD, customD, setCustomD,
  padSpec, winSpec, setModal,
  doUndo, doRedo, onFit, clearAll, confirmClear,
  view, setView,
}) {
  return (
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
          <Pill active={areaMode === "pick"} onClick={() => setAreaMode("pick")}>Pick enclosed</Pill>
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
        <Pill onClick={onFit} title="Zoom to drawing">Fit</Pill>
        <Pill onClick={clearAll}>{confirmClear ? "Really clear?" : "Clear"}</Pill>
        <div style={{ width: 1, height: 22, background: COLORS.border, margin: "0 4px" }} />
        <Pill active={view === "2d"} onClick={() => setView("2d")}>2D Plan</Pill>
        <Pill active={view === "3d"} onClick={() => setView("3d")}>3D View</Pill>
      </div>
    </div>
  );
}
