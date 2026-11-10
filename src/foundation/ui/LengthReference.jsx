import React from "react";
import { COLORS } from "../constants";
import { mono } from "./primitives";

// Rounded decimal equivalents are a reference; direct feet-and-inches entry
// avoids converting dimensions by hand.
export function LengthReference() {
  return (
    <details open style={{ marginBottom: 14, border: `1px solid ${COLORS.border}`, borderRadius: 7, background: COLORS.chromeDeep }}>
      <summary style={{ cursor: "pointer", padding: "9px 10px", fontSize: 11, fontWeight: 800, color: COLORS.text }}>INCHES → DECIMAL FEET</summary>
      <div style={{ padding: "0 10px 10px", fontSize: 11, color: COLORS.textMut, lineHeight: 1.5 }}>
        <div>Type feet + inches directly: <span style={{ color: COLORS.text, fontFamily: mono }}>15'7.5"</span></div>
        <div style={{ margin: "4px 0 8px" }}>Or add the decimal below to whole feet. Decimals are rounded.</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono, fontSize: 11 }}>
          <thead><tr style={{ color: COLORS.text }}><th style={{ textAlign: "left" }}>Inches</th><th style={{ textAlign: "right" }}>Feet</th><th style={{ textAlign: "right" }}>Inches</th><th style={{ textAlign: "right" }}>Feet</th></tr></thead>
          <tbody>{Array.from({ length: 12 }, (_, i) => {
            const whole = i + 1, half = i + 0.5;
            return <tr key={whole} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <td>{whole}″</td><td style={{ textAlign: "right", color: COLORS.text }}>{(whole / 12).toFixed(4)}</td>
              <td style={{ textAlign: "right" }}>{half}″</td><td style={{ textAlign: "right", color: COLORS.text }}>{(half / 12).toFixed(4)}</td>
            </tr>;
          })}</tbody>
        </table>
        <div style={{ marginTop: 8 }}>Example: 15′ 7″ ≈ <span style={{ color: COLORS.text, fontFamily: mono }}>15.5833</span> ft</div>
      </div>
    </details>
  );
}
