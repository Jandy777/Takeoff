import React from "react";
import { COLORS, THICKNESS_PRESETS, DEPTH_PRESETS } from "../constants";
import { parseLength } from "../geometry";
import { Pill, Label, inputStyle } from "./primitives";

export function Toolbar({
  mode, setMode, areaMode, setAreaMode,
  showDims, setShowDims,
  curT, setCurT, customT, setCustomT,
  curD, setCurD, customD, setCustomD,
  wallLengthBasis, setWallLengthBasis,
  faceSide, chooseFaceSide,
  reference, beginReference,
  drainKind, setDrainKind, drainPts,
  ledgeKind, setLedgeKind, ledgeSize, setLedgeSize, ledgeStart,
  padSpec, winSpec, setModal,
  slabSpec, onPrint,
  showFootings, setShowFootings,
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
        <Pill active={mode === "fillet"} onClick={() => setMode("fillet")} title="Join two wall ends at their intersection">Fillet</Pill>
        <Pill active={mode === "select"} onClick={() => setMode("select")}>⬚ Select</Pill>
        <Pill active={mode === "pad"} onClick={() => setMode("pad")}>▦ Pad</Pill>
        <Pill active={mode === "slab"} onClick={() => setMode("slab")}>Thickened slab</Pill>
        <Pill active={mode === "text"} onClick={() => setMode("text")}>DTEXT</Pill>
        <Pill active={mode === "wing"} onClick={() => setMode("wing")}>Wing arm</Pill>
        <Pill active={mode === "window"} onClick={() => setMode("window")}>◫ Window</Pill>
        <Pill active={mode === "area"} onClick={() => setMode("area")}>▱ Sq Ft</Pill>
        <Pill active={mode === "ruler"} onClick={() => setMode("ruler")}>⟷ Ruler</Pill>
        <Pill active={mode === "drain"} onClick={() => setMode("drain")}>Drain tile</Pill>
        <Pill active={mode === "ledge"} onClick={() => setMode("ledge")}>Ledges</Pill>
      </div>
      {mode === "ruler" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Label>Auto wall dims</Label>
          <Pill active={showDims} onClick={() => setShowDims((s) => !s)}>{showDims ? "On" : "Off"}</Pill>
        </div>
      )}
      {mode === "drain" && (
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Label>Drain tile</Label>
          <select value={drainKind} disabled={drainPts.length > 0} onChange={(e) => setDrainKind(e.target.value)} style={inputStyle}>
            <option value="exterior">Exterior</option>
            <option value="interior">Interior</option>
          </select>
        </label>
      )}
      {mode === "ledge" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Label>Ledge</Label>
          <select value={ledgeKind} disabled={!!ledgeStart} onChange={(e) => setLedgeKind(e.target.value)} style={inputStyle} aria-label="Ledge type">
            <option value="brick">Brick</option><option value="slab">Slab</option>
          </select>
          <select value={ledgeSize} disabled={!!ledgeStart} onChange={(e) => setLedgeSize(e.target.value)} style={inputStyle} aria-label="Ledge size">
            <option value="2x4">2×4</option><option value="2x6">2×6</option><option value="4x6">4×6</option>
          </select>
          <span style={{ fontSize: 10, color: COLORS.textMut }}>drop × width (in)</span>
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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Label>Length</Label>
            <Pill active={wallLengthBasis === "outside"} onClick={() => setWallLengthBasis("outside")} title="Entered dimensions describe the outside face of a closed wall run">Outside</Pill>
            <Pill active={wallLengthBasis === "centerline"} onClick={() => setWallLengthBasis("centerline")} title="Entered dimensions describe wall centerlines">Center</Pill>
            <Pill active={wallLengthBasis === "inside"} onClick={() => setWallLengthBasis("inside")} title="Entered dimensions describe the inside face of a closed wall run">Inside</Pill>
          </div>
        </>
      )}
      {mode === "draw" && <Pill active={!!reference} onClick={beginReference} title="Start a wall at an exact distance from an existing wall-face corner">Reference start</Pill>}
      {mode === "draw" && wallLengthBasis !== "centerline" && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Label>Wall side</Label>
        <Pill active={faceSide === -1} onClick={() => chooseFaceSide(-1)} title="Wall material lies to the left as you draw">Left</Pill>
        <Pill active={faceSide === 1} onClick={() => chooseFaceSide(1)} title="Wall material lies to the right as you draw">Right</Pill>
      </div>}
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
      {mode === "slab" && <Pill onClick={() => setModal("slab")}>{slabSpec.w}″×{slabSpec.l}″×{slabSpec.d}″ — change</Pill>}
      {mode === "text" && <Pill onClick={() => setModal("text")}>Edit text</Pill>}
      {mode === "window" && (
        <Pill onClick={() => setModal("window")} title="Change window type">
          {winSpec.kind === "peek" ? "Peek window" : "Window well"} {winSpec.width}" — change
        </Pill>
      )}
      <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
        <Pill onClick={doUndo} title="Undo (Ctrl+Z)">↶</Pill>
        <Pill onClick={doRedo} title="Redo (Ctrl+Shift+Z)">↷</Pill>
        <Pill onClick={onFit} title="Zoom to drawing">Fit</Pill>
        <Pill active={showFootings} onClick={() => setShowFootings((v) => !v)} title="Show or hide footing bands in the 2D plan">Footings {showFootings ? "on" : "off"}</Pill>
        <Pill onClick={onPrint} title="Print both views and takeoff">Print</Pill>
        <Pill onClick={clearAll}>{confirmClear ? "Really clear?" : "Clear"}</Pill>
        <div style={{ width: 1, height: 22, background: COLORS.border, margin: "0 4px" }} />
        <Pill active={view === "2d"} onClick={() => setView("2d")}>2D Plan</Pill>
        <Pill active={view === "3d"} onClick={() => setView("3d")}>3D View</Pill>
      </div>
    </div>
  );
}

