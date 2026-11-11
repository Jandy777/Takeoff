import React from "react";
import { Pill } from "./primitives";

export function DrawingViewerToolbar({ view, setView, onFit, onPrint, showFootings, setShowFootings }) {
  return <div style={{ display: "flex", gap: 9, alignItems: "center", padding: "12px 14px", background: "#20262d", borderBottom: "1px solid #39424c" }}>
    <Pill active={view === "2d"} onClick={() => setView("2d")}>2D Plan</Pill><Pill active={view === "3d"} onClick={() => setView("3d")}>3D View</Pill>
    <Pill onClick={onFit}>Fit</Pill><Pill active={showFootings} onClick={() => setShowFootings(!showFootings)}>Footings</Pill><Pill onClick={onPrint}>Print</Pill>
    <span style={{ color: "#98a3ae", fontSize: 11, marginLeft: "auto" }}>View only · drag to pan · scroll to zoom</span>
  </div>;
}
