import React from "react";
import { formatFtIn } from "../geometry";
import "./print.css";

export function PrintSheet({ snapshot, takeoff }) {
  if (!snapshot) return null;
  return <section className="print-sheet">
    <header><h1>Foundation Takeoff</h1><span>Drawing and quantity summary</span></header>
    <div className="print-views">
      <div><h2>2D Plan</h2><div className="print-plan" dangerouslySetInnerHTML={{ __html: snapshot.plan }} /></div>
      <div><h2>3D View</h2><img src={snapshot.three} alt="3D foundation view" /></div>
    </div>
    <h2>Bill of materials</h2>
    <table><thead><tr><th>Item</th><th>Quantity</th></tr></thead><tbody>
      {takeoff.wallRows.map((r) => <tr key={r.key}><td>{r.thickness}″ × {formatFtIn(r.depth)} wall ({r.basis})</td><td>{formatFtIn(r.len)}</td></tr>)}
      {takeoff.footingRows.map((r) => <tr key={r.key}><td>Footing {r.width}″ × {r.height}″ ({r.basis})</td><td>{formatFtIn(r.len)}</td></tr>)}
      {takeoff.padRows.map((r) => <tr key={r.key}><td>Pad {r.w}″ × {r.l}″ × {r.d}″</td><td>{r.count}</td></tr>)}
      {takeoff.slabRows.map((r) => <tr key={r.key}><td>Thickened slab {r.w}″ × {r.l}″ × {r.d}″</td><td>{r.count} · {r.cy.toFixed(2)} gross CY</td></tr>)}
      {takeoff.winRows.map((r) => <tr key={r.key}><td>{r.kind === "well" ? "Window well" : "Peek window"} {r.width}″</td><td>{r.count}</td></tr>)}
      {takeoff.areaRows.map((r) => <tr key={r.key}><td>{r.name}</td><td>{Math.round(r.sf)} SF</td></tr>)}
      {takeoff.drainRows.map((r) => <tr key={r.kind}><td>{r.kind} drain tile</td><td>{formatFtIn(r.len)}</td></tr>)}
      {takeoff.ledgeRows.map((r) => <tr key={`${r.kind}-${r.size}`}><td>{r.kind} ledge {r.size}</td><td>{formatFtIn(r.len)}</td></tr>)}
      {takeoff.wingCount > 0 && <tr><td>Wing arms (markers)</td><td>{takeoff.wingCount}</td></tr>}
    </tbody></table>
    <p className="print-note">Thickened slab volume is gross; overlap with other slabs is not deducted. Wing arms and drain elevations in 3D are illustrative.</p>
  </section>;
}
