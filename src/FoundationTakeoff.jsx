import React, { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { COLORS } from "./foundation/constants";
import { collectFitPoints, resolveDrainRuns, resolveLedges } from "./foundation/geometry";
import { useUndoableDoc } from "./foundation/hooks/useUndoableDoc";
import { useViewport } from "./foundation/hooks/useViewport";
import { useRowVisibility } from "./foundation/hooks/useRowVisibility";
import { useSnapping } from "./foundation/hooks/useSnapping";
import { useEditorInteractions } from "./foundation/hooks/useEditorInteractions";
import { useTakeoff } from "./foundation/hooks/useTakeoff";
import { useThreeScene } from "./foundation/hooks/useThreeScene";
import { PlanCanvas } from "./foundation/render2d/PlanCanvas";
import { PlanOverlays } from "./foundation/ui/PlanOverlays";
import { Toolbar } from "./foundation/ui/Toolbar";
import { TakeoffPanel } from "./foundation/ui/TakeoffPanel";
import { StatusBar } from "./foundation/ui/StatusBar";
import { PlacementModal } from "./foundation/ui/PlacementModal";
import { selectionDocument } from "./foundation/selection";
import { computeTakeoff } from "./foundation/takeoff";
import { capturePrintView } from "./foundation/render3d/capturePrintView";
import { PrintSheet } from "./foundation/ui/PrintSheet";

// Orchestrator only: wires the document/view/interaction hooks together and
// composes the presentational pieces. New tools/panels should be built as
// their own hook + component under src/foundation and wired in here — see
// CLAUDE.md for the module map and where new features belong.
export default function FoundationTakeoff() {
  const [view, setView] = useState("2d");
  const [printSnapshot, setPrintSnapshot] = useState(null);
  const printSvgRef = useRef(null);

  const docState = useUndoableDoc();
  const doc = useMemo(() => ({ ...docState.doc, drains: resolveDrainRuns(docState.doc.drains, docState.doc.walls), ledges: resolveLedges(docState.doc.ledges, docState.doc.walls) }), [docState.doc]);

  const viewport = useViewport(view);
  const visibility = useRowVisibility();
  const snapping = useSnapping(doc.walls, viewport.tf.scale);

  const editor = useEditorInteractions(
    { ...docState, doc, onClear: () => visibility.setSolo([]) },
    viewport,
    snapping
  );

  const takeoff = useTakeoff(doc);
  const groupTakeoff = useMemo(() => editor.groupSelection.length > 1 ? computeTakeoff({ ...selectionDocument(doc, editor.groupSelection), wallGeometry: doc.walls }) : null, [doc, editor.groupSelection]);
  const { threeWrap } = useThreeScene({ view, doc, sel: editor.sel, shown: visibility.shown, rowColor: visibility.rowColor });

  const onFit = () => viewport.fitView(collectFitPoints(doc));

  const printTransform = useMemo(() => {
    const points = collectFitPoints(doc);
    if (!points.length) return { scale: 12, ox: 140, oy: 120 };
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(80, 880 / Math.max(maxX - minX, 1), 580 / Math.max(maxY - minY, 1));
    return { scale, ox: 500 - (minX + maxX) / 2 * scale, oy: 350 - (minY + maxY) / 2 * scale };
  }, [doc]);
  const printToScreen = (x, y) => [printTransform.ox + x * printTransform.scale, printTransform.oy + y * printTransform.scale];
  const printToWorld = (x, y) => [(x - printTransform.ox) / printTransform.scale, (y - printTransform.oy) / printTransform.scale];
  const onPrint = async () => {
    try {
      const svg = printSvgRef.current.cloneNode(true);
      svg.setAttribute("viewBox", "0 0 1000 700");
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const snapshot = { plan: new XMLSerializer().serializeToString(svg), three: capturePrintView(doc, visibility.rowColor) };
      const image = new Image(); image.src = snapshot.three;
      await image.decode();
      flushSync(() => setPrintSnapshot(snapshot));
      window.print();
    } catch (error) {
      editor.showToast("Could not prepare print views. Check 3D graphics support and try again.");
    }
  };

  return (
    <>
    <div className="takeoff-app" style={{ display: "flex", flexDirection: "column", height: "100vh", background: COLORS.chrome, color: COLORS.text, fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <Toolbar
        mode={editor.mode} setMode={editor.setMode}
        areaMode={editor.areaMode} setAreaMode={editor.setAreaMode}
        showDims={editor.showDims} setShowDims={editor.setShowDims}
        curT={editor.curT} setCurT={editor.setCurT} customT={editor.customT} setCustomT={editor.setCustomT}
        curD={editor.curD} setCurD={editor.setCurD} customD={editor.customD} setCustomD={editor.setCustomD}
        wallLengthBasis={editor.wallLengthBasis} setWallLengthBasis={editor.setWallLengthBasis}
        drainKind={editor.drainKind} setDrainKind={editor.setDrainKind} drainPts={editor.drainPts}
        ledgeKind={editor.ledgeKind} setLedgeKind={editor.setLedgeKind} ledgeSize={editor.ledgeSize} setLedgeSize={editor.setLedgeSize} ledgeStart={editor.ledgeStart}
        padSpec={editor.padSpec} winSpec={editor.winSpec} setModal={editor.setModal}
        slabSpec={editor.slabSpec} onPrint={onPrint}
        doUndo={editor.doUndo} doRedo={editor.doRedo} onFit={onFit}
        clearAll={editor.clearAll} confirmClear={editor.confirmClear}
        view={view} setView={setView}
      />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div ref={viewport.wrapRef} style={{ flex: 1, position: "relative", overflow: "hidden", background: COLORS.canvas }}>
          {view === "2d" ? (
            <PlanCanvas
              svgRef={viewport.svgRef} size={viewport.size} tf={viewport.tf}
              toScreen={viewport.toScreen} toWorld={viewport.toWorld}
              doc={doc} sel={editor.sel} selWall={editor.selWall}
              groupSelection={editor.groupSelection} selectionBox={editor.selectionBox}
              rowColor={visibility.rowColor} shown={visibility.shown} showDims={editor.showDims}
              mode={editor.mode} areaMode={editor.areaMode}
              start={editor.start} tracePts={editor.tracePts} rulerPt={editor.rulerPt}
              pendingWin={editor.pendingWin} mouse={editor.mouse} snapInfo={editor.snapInfo}
              curT={editor.curT} curD={editor.curD} winSpec={editor.winSpec}
              wallLengthBasis={editor.wallLengthBasis}
              drainPts={editor.drainPts} drainKind={editor.drainKind}
              ledgeStart={editor.ledgeStart}
              onMouseDown={editor.onMouseDown} onMouseMove={editor.onMouseMove} onMouseUp={editor.onMouseUp}
              onWheel={viewport.onWheel}
            />
          ) : (
            <div ref={threeWrap} style={{ position: "absolute", inset: 0 }} />
          )}

          <PlanOverlays
            view={view} mode={editor.mode} areaMode={editor.areaMode}
            start={editor.start} tracePts={editor.tracePts} typed={editor.typed}
            soloSet={visibility.soloSet} setSolo={visibility.setSolo} toast={editor.toast}
          />
        </div>

        <TakeoffPanel
          takeoff={takeoff}
          rowColor={visibility.rowColor} setRowColors={visibility.setRowColors}
          soloSet={visibility.soloSet} toggleSolo={visibility.toggleSolo} setSolo={visibility.setSolo}
          selWall={editor.selWall} selPad={editor.selPad} selWin={editor.selWin} selArea={editor.selArea} selDim={editor.selDim}
          updateWall={editor.updateWall} updatePad={editor.updatePad} updateWin={editor.updateWin} updateArea={editor.updateArea}
          deleteSel={editor.deleteSel}
          lenDraft={editor.lenDraft} setLenDraft={editor.setLenDraft} setSelLength={editor.setSelLength}
          selectedWallLengths={editor.selectedWallLengths}
          selDrain={editor.selDrain}
          selLedge={editor.selLedge}
          selSlab={editor.selSlab} selText={editor.selText} selWing={editor.selWing} updateSlab={editor.updateSlab} updateText={editor.updateText}
          groupSelection={editor.groupSelection} groupTakeoff={groupTakeoff}
        />
      </div>

      <StatusBar
        view={view} mouse={editor.mouse} snapLabel={snapping.snapLabel} altFree={editor.altFree}
        mode={editor.mode} start={editor.start} sel={editor.sel} pendingWin={editor.pendingWin}
        winSpec={editor.winSpec} areaMode={editor.areaMode} rulerPt={editor.rulerPt}
      />

      <PlacementModal
        modal={editor.modal} setModal={editor.setModal} setMode={editor.setMode}
        padSpec={editor.padSpec} setPadSpec={editor.setPadSpec}
        winSpec={editor.winSpec} setWinSpec={editor.setWinSpec}
        slabSpec={editor.slabSpec} setSlabSpec={editor.setSlabSpec} textSpec={editor.textSpec} setTextSpec={editor.setTextSpec}
      />
    </div>
    <div className="print-source" aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, width: 1000, height: 700, pointerEvents: "none" }}>
      <PlanCanvas svgRef={printSvgRef} size={{ w: 1000, h: 700 }} tf={printTransform} toScreen={printToScreen} toWorld={printToWorld}
        doc={doc} sel={null} selWall={null} groupSelection={[]} selectionBox={null} rowColor={visibility.rowColor} shown={() => true} showDims={true}
        mode="select" areaMode="pick" start={null} tracePts={[]} rulerPt={null} pendingWin={null} mouse={null} snapInfo={null}
        curT={8} curD={8} winSpec={{}} wallLengthBasis="outside" drainPts={[]} drainKind="exterior" ledgeStart={null} />
    </div>
    <PrintSheet snapshot={printSnapshot} takeoff={takeoff} />
    </>
  );
}

