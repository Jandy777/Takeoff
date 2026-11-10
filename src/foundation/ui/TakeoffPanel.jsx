import React from "react";
import { COLORS, THICKNESS_PRESETS, DEPTH_PRESETS } from "../constants";
import { dist, formatFtIn, shoelace } from "../geometry";
import { footOf, defFootW, defFootH } from "../model";
import { Pill, Label, TakeoffRow, inputStyle, mono } from "./primitives";
import { LengthReference } from "./LengthReference";

export function TakeoffPanel({
  takeoff, rowColor, setRowColors, soloSet, toggleSolo, setSolo,
  selWall, selPad, selWin, selArea, selDim,
  updateWall, updatePad, updateWin, updateArea, deleteSel,
  lenDraft, setLenDraft, setSelLength,
  selectedWallLengths,
  selDrain,
  selLedge,
  groupSelection, groupTakeoff,
}) {
  const hasDoc = Boolean(takeoff.wallRows.length || takeoff.padRows.length || takeoff.winRows.length || takeoff.areaRows.length || takeoff.drainRows.length || takeoff.ledgeRows.length);
  const onSelectColor = (key, color) => setRowColors((c) => ({ ...c, [key]: color }));
  const rowProps = (key, colorKey = key) => ({
    active: soloSet.has(key), dimmed: soloSet.size > 0 && !soloSet.has(key),
    color: rowColor(colorKey), colorKey, onSelectColor, onToggleSolo: toggleSolo,
  });

  return (
    <div style={{ width: 300, background: COLORS.panel, borderLeft: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Label>Takeoff</Label>
        {soloSet.size > 0 && (
          <button onClick={() => setSolo([])} style={{ background: "transparent", border: "none", color: COLORS.accent, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Show all</button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
        <LengthReference />
        {groupTakeoff && <div style={{ border: `1px solid ${COLORS.accent}`, borderRadius: 7, padding: 10, marginBottom: 14, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Label>Selected group · {groupSelection.length} items</Label>
            <button onClick={deleteSel} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: "#e07b7b", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Delete group</button>
          </div>
          <div style={{ color: COLORS.textMut, fontSize: 10, marginBottom: 8 }}>Shift-click adds or removes items. Drag a highlighted item to move the group. Middle-drag pans.</div>
          {groupTakeoff.wallRows.map((r) => <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>{r.thickness}″ × {formatFtIn(r.depth)} wall ({r.basis})</span><span>{formatFtIn(r.len)}</span></div>)}
          {groupTakeoff.footingRows.map((r) => <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>Footing {r.width}″ × {r.height}″ ({r.basis})</span><span>{formatFtIn(r.len)}</span></div>)}
          {groupTakeoff.padRows.map((r) => <div key={r.key}>Pad {r.w}″ × {r.l}″ × {r.d}″: {r.count}</div>)}
          {groupTakeoff.winRows.map((r) => <div key={r.key}>{r.kind === "well" ? "Window well" : "Peek window"} {r.width}″: {r.count}</div>)}
          {groupTakeoff.areaRows.map((r) => <div key={r.key}>{r.name}: {Math.round(r.sf)} SF</div>)}
          {groupTakeoff.drainRows.map((r) => <div key={r.kind}>{r.kind} drain tile: {formatFtIn(r.len)}</div>)}
          {groupTakeoff.ledgeRows.map((r) => <div key={`${r.kind}-${r.size}`}>{r.kind} ledge {r.size}: {formatFtIn(r.len)}</div>)}
          {groupSelection.some((s) => s.type === "dim") && <div>Measurements: {groupSelection.filter((s) => s.type === "dim").length}</div>}
        </div>}
        {!hasDoc && (
          <div style={{ fontSize: 12, color: COLORS.textMut, lineHeight: 1.6 }}>
            Nothing drawn yet. Draw walls, stamp pier pads and windows, or measure square footage — every item shows up here, color-matched to the plan. Click a row to isolate it on the drawing.
          </div>
        )}

        {takeoff.wallRows.length > 0 && (
          <>
            <div style={{ margin: "2px 0 6px" }}><Label>Walls — lineal feet</Label></div>
            {takeoff.wallRows.map((r) => (
              <TakeoffRow key={r.key} rowKey={r.key} {...rowProps(r.key, r.colorKey)}
                main={`${r.thickness}" × ${formatFtIn(r.depth)} wall`}
                value={formatFtIn(r.len)}
                sub={`${r.basis === "outside" ? "outside-face" : r.basis === "inside" ? "inside-face" : "centerline"} LF`}
                subRight={`${r.count} wall${r.count > 1 ? "s" : ""}`}
              />
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px 10px" }}>
              <span style={{ fontSize: 11, fontWeight: 800 }}>TOTAL LF</span>
              <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: COLORS.accent }}>{formatFtIn(takeoff.totalLF)}</span>
            </div>
          </>
        )}

        {takeoff.footingRows.length > 0 && <>
          <div style={{ margin: "6px 0 6px" }}><Label>Footings — lineal feet</Label></div>
          {takeoff.footingRows.map((r) => <TakeoffRow key={r.key} rowKey={r.key} {...rowProps(r.key, r.colorKey)}
            main={`Footing ${r.width}" × ${r.height}"`} value={formatFtIn(r.len)}
            sub={`${r.basis === "outside" ? "outside-face" : r.basis === "inside" ? "inside-face" : "centerline"} LF · assumed from wall`} subRight={`${r.count} run${r.count === 1 ? "" : "s"}`} />)}
        </>}

        {takeoff.padRows.length > 0 && (
          <>
            <div style={{ margin: "6px 0 6px" }}><Label>Pier pads</Label></div>
            {takeoff.padRows.map((r) => (
              <TakeoffRow key={r.key} rowKey={r.key} {...rowProps(r.key)}
                main={`Pad ${r.w}" × ${r.l}" × ${r.d}"`}
                value={`× ${r.count}`}
              />
            ))}
          </>
        )}

        {takeoff.winRows.length > 0 && (
          <>
            <div style={{ margin: "6px 0 6px" }}><Label>Windows</Label></div>
            {takeoff.winRows.map((r) => (
              <TakeoffRow key={r.key} rowKey={r.key} {...rowProps(r.key)}
                main={`${r.kind === "peek" ? "Peek window" : "Window well"} ${r.width}"`}
                value={`× ${r.count}`}
              />
            ))}
          </>
        )}

        {takeoff.areaRows.length > 0 && (
          <>
            <div style={{ margin: "6px 0 6px" }}><Label>Square footage</Label></div>
            {takeoff.areaRows.map((r) => (
              <TakeoffRow key={r.key} rowKey={r.key} {...rowProps(r.key)} main={r.name} value={`${Math.round(r.sf)} SF`} />
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px 10px" }}>
              <span style={{ fontSize: 11, fontWeight: 800 }}>TOTAL SF</span>
              <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: COLORS.accent }}>{Math.round(takeoff.totalSF)} SF</span>
            </div>
          </>
        )}
        {takeoff.drainRows.length > 0 && (
          <>
            <div style={{ margin: "6px 0 6px" }}><Label>Drain tile — lineal feet</Label></div>
            {takeoff.drainRows.map((r) => (
              <div key={r.kind} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", fontSize: 12 }}>
                <span>{r.kind === "exterior" ? "Exterior" : "Interior"}</span>
                <span style={{ fontFamily: mono }}>{formatFtIn(r.len)}</span>
              </div>
            ))}
          </>
        )}
        {takeoff.ledgeRows.length > 0 && <>
          <div style={{ margin: "6px 0 6px" }}><Label>Ledges — lineal feet</Label></div>
          {takeoff.ledgeRows.map((r) => <div key={`${r.kind}-${r.size}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", fontSize: 12 }}>
            <span>{r.kind === "brick" ? "Brick" : "Slab"} {r.size.replace("x", "×")}</span><span style={{ fontFamily: mono }}>{formatFtIn(r.len)}</span>
          </div>)}
        </>}

        {hasDoc && (
          <div style={{ fontSize: 10, color: COLORS.textMut, marginTop: 4, lineHeight: 1.5 }}>
            Wall LF follows each wall's selected length basis. Auto-picked SF areas measure between inside wall faces. Click any row to isolate it on the plan; click its swatch to recolor.
          </div>
        )}
      </div>

      {selWall && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Label>Selected wall</Label>
            <button onClick={deleteSel} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: "#e07b7b", borderRadius: 6, fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>Delete</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "8px 8px", alignItems: "center", fontSize: 12 }}>
            <span style={{ color: COLORS.textMut }}>Length</span>
            <input value={lenDraft} onChange={(e) => setLenDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setSelLength(lenDraft); }}
              onBlur={() => setSelLength(lenDraft)} style={inputStyle} />
            <span style={{ color: COLORS.textMut }}>Basis</span>
            <div style={{ display: "flex", gap: 4 }}>
              <Pill active={(selWall.lengthBasis || "centerline") === "outside"} onClick={() => updateWall({ lengthBasis: "outside" })}>Outside</Pill>
              <Pill active={(selWall.lengthBasis || "centerline") === "centerline"} onClick={() => updateWall({ lengthBasis: "centerline" })}>Center</Pill>
              <Pill active={(selWall.lengthBasis || "centerline") === "inside"} onClick={() => updateWall({ lengthBasis: "inside" })}>Inside</Pill>
            </div>
            {selectedWallLengths && (
              <>
                <span style={{ color: COLORS.textMut }}>Faces</span>
                <div style={{ fontFamily: mono, fontSize: 11, lineHeight: 1.55, color: COLORS.textMut }}>
                  Outside {formatFtIn(selectedWallLengths.outside)} · Center {formatFtIn(selectedWallLengths.centerline)} · Inside {formatFtIn(selectedWallLengths.inside)}
                  {!selectedWallLengths.resolved && <div style={{ color: "#d18b47" }}>Close the wall loop to resolve inside and outside.</div>}
                </div>
              </>
            )}
            <span style={{ color: COLORS.textMut }}>Thickness</span>
            <div style={{ display: "flex", gap: 4 }}>
              {THICKNESS_PRESETS.map((t) => <Pill key={t} active={selWall.thickness === t} onClick={() => updateWall({ thickness: t })}>{t}"</Pill>)}
              <input value={THICKNESS_PRESETS.includes(selWall.thickness) ? "" : selWall.thickness} placeholder="…"
                onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) updateWall({ thickness: v }); }}
                style={{ ...inputStyle, width: 36 }} />
            </div>
            <span style={{ color: COLORS.textMut }}>Depth</span>
            <div style={{ display: "flex", gap: 4 }}>
              {DEPTH_PRESETS.map((d) => <Pill key={d} active={selWall.depth === d} onClick={() => updateWall({ depth: d })}>{d}'</Pill>)}
              <input value={DEPTH_PRESETS.includes(selWall.depth) ? "" : selWall.depth} placeholder="…"
                onChange={(e) => { const v = parseFloat(e.target.value); if (v && v > 0) updateWall({ depth: v }); }}
                style={{ ...inputStyle, width: 36 }} />
            </div>
            <span style={{ color: COLORS.textMut }}>Footing</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: COLORS.textMut, cursor: "pointer" }}>
                <input type="checkbox" checked={!selWall.footing}
                  onChange={(e) => updateWall({ footing: e.target.checked ? null : { w: defFootW(selWall.thickness), h: defFootH(selWall.thickness) } })} />
                auto
              </label>
              <input disabled={!selWall.footing} value={footOf(selWall).w}
                onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) updateWall({ footing: { ...footOf(selWall), w: v } }); }}
                style={{ ...inputStyle, width: 40, color: selWall.footing ? COLORS.text : COLORS.textMut }} />
              <span style={{ color: COLORS.textMut, fontSize: 11 }}>w ×</span>
              <input disabled={!selWall.footing} value={footOf(selWall).h}
                onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) updateWall({ footing: { ...footOf(selWall), h: v } }); }}
                style={{ ...inputStyle, width: 40, color: selWall.footing ? COLORS.text : COLORS.textMut }} />
              <span style={{ color: COLORS.textMut, fontSize: 11 }}>d in</span>
            </div>
          </div>
        </div>
      )}

      {selPad && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Label>Selected pier pad</Label>
            <button onClick={deleteSel} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: "#e07b7b", borderRadius: 6, fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>Delete</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            {["w", "l", "d"].map((k, i) => (
              <React.Fragment key={k}>
                {i > 0 && <span style={{ color: COLORS.textMut }}>×</span>}
                <input value={selPad[k]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) updatePad({ [k]: v }); }}
                  style={{ ...inputStyle, width: 48 }} />
              </React.Fragment>
            ))}
            <span style={{ color: COLORS.textMut, fontSize: 11 }}>in (W × L × D)</span>
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMut, marginTop: 6 }}>Drag the pad on the plan to move it.</div>
        </div>
      )}

      {selWin && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Label>Selected window</Label>
            <button onClick={deleteSel} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: "#e07b7b", borderRadius: 6, fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>Delete</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <Pill active={selWin.kind === "peek"} onClick={() => updateWin({ kind: "peek" })}>Peek window</Pill>
            <Pill active={selWin.kind === "well"} onClick={() => updateWin({ kind: "well" })}>Window well</Pill>
            <Pill onClick={() => updateWin({ side: -(selWin.side || 1) })} title="Flip which side the well faces">⇅ Flip</Pill>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ color: COLORS.textMut }}>Width</span>
            <input value={selWin.width}
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) updateWin({ width: v }); }}
              style={{ ...inputStyle, width: 48 }} />
            <span style={{ color: COLORS.textMut, fontSize: 11 }}>in</span>
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMut, marginTop: 6 }}>Drag along a wall to reposition — it snaps to the nearest wall.</div>
        </div>
      )}

      {selArea && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Label>Selected area</Label>
            <button onClick={deleteSel} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: "#e07b7b", borderRadius: 6, fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>Delete</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ color: COLORS.textMut }}>Name</span>
            <input value={selArea.name} onChange={(e) => updateArea({ name: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
          </div>
          <div style={{ fontFamily: mono, fontSize: 13, color: COLORS.accent, marginTop: 8 }}>
            {Math.round(Math.abs(shoelace(selArea.pts)))} SF
          </div>
        </div>
      )}
      {selDim && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Label>Selected measurement</Label>
            <button onClick={deleteSel} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: "#e07b7b", borderRadius: 6, fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>Delete</button>
          </div>
          <div style={{ fontFamily: mono, fontSize: 14, color: COLORS.accent, marginTop: 8 }}>
            {formatFtIn(dist(selDim.x1, selDim.y1, selDim.x2, selDim.y2))}
          </div>
        </div>
      )}
      {selDrain && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Label>{selDrain.kind === "exterior" ? "Exterior" : "Interior"} drain tile</Label>
            <button onClick={deleteSel} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: "#e07b7b", borderRadius: 6, fontSize: 12, padding: "3px 8px", cursor: "pointer" }}>Delete run</button>
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMut, marginTop: 6 }}>Delete and redraw to change the path.</div>
        </div>
      )}
      {selLedge && <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px", display: "flex", justifyContent: "space-between" }}>
        <Label>{selLedge.kind} ledge {selLedge.size.replace("x", "×")}</Label>
        <button onClick={deleteSel} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: "#e07b7b", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Delete segment</button>
      </div>}
    </div>
  );
}

