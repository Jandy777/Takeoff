import React, { useEffect, useRef } from "react";
import { DrawingPreview } from "./DrawingPreview";
import { formatFtIn } from "../geometry";

export function CadImportCard({cad,canEdit,error,onClose,onContinue}) {
  const card = useRef(null), fileInput = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    fileInput.current?.focus();
    const key = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const items = [...card.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')];
      if (document.activeElement === (event.shiftKey ? items[0] : items[items.length-1])) {
        event.preventDefault(); (event.shiftKey ? items[items.length-1] : items[0])?.focus();
      }
    };
    document.addEventListener("keydown",key);
    return () => {document.removeEventListener("keydown",key);previous?.focus();};
  },[onClose]);
  return <div className="library-scrim" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <section ref={card} className="drawing-card cad-import-card" role="dialog" aria-modal="true" aria-labelledby="cad-import-title">
      <div className="card-heading"><span className="library-eyebrow">CAD ARCHIVE · STEP 1 OF 2</span><button type="button" className="library-icon-button" aria-label="Close CAD import" onClick={onClose}>×</button></div>
      <h2 id="cad-import-title">Import CAD drawing</h2>
      <p className="library-muted">Start a new drawing from an existing foundation DXF made with your legacy CAD workflow.</p>
      <label className="cad-file-label">DXF file<input ref={fileInput} type="file" accept=".dxf" disabled={!canEdit} onClick={(event)=>{if(cad.error)event.currentTarget.value="";}} onChange={(event)=>cad.readFile(event.target.files?.[0])}/></label>
      <p className="cad-import-note">Units: inches. Conversion happens on this device; the original CAD file stays in your existing storage.</p>
      {cad.busy && <p className="library-muted" role="status">Reading walls and checking their dimensions…</p>}
      {(cad.error || error) && <p className="library-error" role="alert">{cad.error || error}</p>}
      {cad.error && canEdit && <button type="button" className="library-button" onClick={()=>cad.readFile(fileInput.current.files?.[0])}>Retry conversion</button>}
      {!canEdit && <p className="library-error" role="alert">Editing access is required to import a drawing.</p>}
      {cad.preview && <>
        {cad.layouts.length>1 && <label className="cad-layout-label">Choose the layout to import
          <select aria-label="Layout to import" value={cad.layoutId} onChange={(event)=>cad.chooseLayout(event.target.value)}>
            <option value="" disabled>Choose a layout…</option>
            {cad.layouts.map(layout=><option key={layout.id} value={layout.id}>{layout.name} · {layout.wallCount} walls · {layout.thicknesses.join(" / ")}″ thick · {formatFtIn(layout.totalLF)} LF</option>)}
            <option value="all">Keep all layouts together ({cad.preview.conversion.wallCount} walls)</option>
          </select>
          <small>Separate wall groups were found. They may be different layouts or revisions. Layouts are numbered from left to right.</small>
        </label>}
        <div className="cad-import-summary"><strong>{cad.sourceName}</strong><span>{cad.result ? `${cad.result.conversion.wallCount} editable walls · ${formatFtIn(cad.result.conversion.totalLF)} wall LF` : `${cad.layouts.length} layouts found — choose one above to continue`}</span></div>
        {(cad.result||cad.preview).conversion.repairs?.length>0 && <p className="cad-repair-notice">Small CAD corner gaps were closed. Orange markers show the adjusted corners; the length changes are listed below.</p>}
        <div className="drawing-preview cad-import-preview"><DrawingPreview record={cad.result || cad.preview}/></div>
        <div className="cad-review-notes"><strong>Before you continue</strong><ul>{(cad.result||cad.preview).conversion.warnings.map(note=><li key={note}>{note}</li>)}</ul></div>
      </>}
      <div className="drawing-card-footer"><button type="button" className="library-button" onClick={onClose}>Cancel</button><button type="button" className="library-button primary" disabled={!cad.result||cad.busy||!canEdit} onClick={()=>onContinue({...cad.result,sourceName:cad.sourceName})}>Continue to drawing details →</button></div>
    </section>
  </div>;
}
