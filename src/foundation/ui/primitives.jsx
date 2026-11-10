import React from "react";
import { COLORS, MONO } from "../constants";

export const mono = MONO;

export const inputStyle = {
  background: COLORS.chromeDeep, border: `1px solid ${COLORS.border}`, borderRadius: 6,
  color: COLORS.text, padding: "5px 8px", fontFamily: mono, fontSize: 12,
};

export const Pill = ({ active, onClick, children, title }) => (
  <button
    title={title}
    onClick={onClick}
    style={{
      padding: "5px 10px", borderRadius: 6,
      border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
      background: active ? "rgba(255,138,61,0.16)" : "transparent",
      color: active ? COLORS.accent : COLORS.text,
      fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
    }}
  >
    {children}
  </button>
);

export const Label = ({ children }) => (
  <span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.textMut, fontWeight: 700 }}>{children}</span>
);

export const Swatch = ({ rowKey, color, onChange }) => (
  <input
    type="color"
    value={color}
    onClick={(e) => e.stopPropagation()}
    onChange={(e) => onChange(rowKey, e.target.value)}
    style={{ width: 18, height: 18, padding: 0, border: "none", borderRadius: 4, background: "none", cursor: "pointer" }}
    title="Change color"
  />
);

export const TakeoffRow = ({ rowKey, colorKey = rowKey, main, value, sub, subRight, active, dimmed, color, onSelectColor, onToggleSolo }) => (
  <div
    onClick={() => onToggleSolo(rowKey)}
    title="Click to show only this on the plan (click again to unfilter)"
    style={{
      padding: "8px 10px", marginBottom: 7, background: COLORS.chromeDeep,
      border: `1px solid ${active ? COLORS.accent : COLORS.border}`, borderRadius: 8,
      cursor: "pointer", opacity: dimmed ? 0.4 : 1,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Swatch rowKey={colorKey} color={color} onChange={onSelectColor} />
      <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{main}</span>
      <span style={{ fontFamily: mono, fontSize: 13, color: COLORS.accent }}>{value}</span>
    </div>
    {(sub || subRight) && (
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, paddingLeft: 26 }}>
        <span style={{ fontSize: 11, color: COLORS.textMut }}>{sub}</span>
        <span style={{ fontSize: 11, color: COLORS.textMut, fontFamily: mono }}>{subRight}</span>
      </div>
    )}
  </div>
);

