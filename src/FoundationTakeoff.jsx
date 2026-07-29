import React, { useState } from "react";
import { COLORS } from "./foundation/constants";
import { collectFitPoints } from "./foundation/geometry";
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

// Orchestrator only: wires the document/view/interaction hooks together and
// composes the presentational pieces. New tools/panels should be built as
// their own hook + component under src/foundation and wired in here — see
// CLAUDE.md for the module map and where new features belong.
export default function FoundationTakeoff() {
  const [view, setView] = useState("2d");

  const docState = useUndoableDoc();
  const { doc, setDoc } = docState;

  const viewport = useViewport(view);
  const visibility = useRowVisibility();
  const snapping = useSnapping(doc.walls, viewport.tf.scale);

  const editor = useEditorInteractions(
    { ...docState, onClear: () => visibility.setSolo([]) },
    viewport,
    snapping
  );

  const takeoff = useTakeoff(doc);
  const { threeWrap } = useThreeScene({ view, doc, sel: editor.sel, shown: visibility.shown, rowColor: visibility.rowColor });

  const onFit = () => viewport.fitView(collectFitPoints(doc));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: COLORS.chrome, color: COLORS.text, fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <Toolbar
        mode={editor.mode} setMode={editor.setMode}
        areaMode={editor.areaMode} setAreaMode={editor.setAreaMode}
        showDims={editor.showDims} setShowDims={editor.setShowDims}
        curT={editor.curT} setCurT={editor.setCurT} customT={editor.customT} setCustomT={editor.setCustomT}
        curD={editor.curD} setCurD={editor.setCurD} customD={editor.customD} setCustomD={editor.setCustomD}
        padSpec={editor.padSpec} winSpec={editor.winSpec} setModal={editor.setModal}
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
              rowColor={visibility.rowColor} shown={visibility.shown} showDims={editor.showDims}
              mode={editor.mode} areaMode={editor.areaMode}
              start={editor.start} tracePts={editor.tracePts} rulerPt={editor.rulerPt}
              pendingWin={editor.pendingWin} mouse={editor.mouse} snapInfo={editor.snapInfo}
              curT={editor.curT} curD={editor.curD} winSpec={editor.winSpec}
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
      />
    </div>
  );
}
