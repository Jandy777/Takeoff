import React, { useMemo } from "react";
import { readDocument } from "../library/documents";
import { collectFitPoints, resolveDrainRuns, resolveLedges } from "../geometry";
import { PlanCanvas } from "../render2d/PlanCanvas";

export function DrawingPreview({ record }) {
  const preview = useMemo(() => {
    if (!record) return null;
    try {
      const source = readDocument(record.document);
      const doc = { ...source, drains: resolveDrainRuns(source.drains, source.walls), ledges: resolveLedges(source.ledges, source.walls) };
      const pts = collectFitPoints(doc).filter(([x,y]) => Number.isFinite(x) && Number.isFinite(y));
      if (!pts.length) return { empty: true };
      const xs = pts.map(([x]) => x), ys = pts.map(([,y]) => y);
      const left = Math.min(...xs), top = Math.min(...ys), width = Math.max(...xs)-left, height = Math.max(...ys)-top;
      const scale = Math.min(270/Math.max(width,1),190/Math.max(height,1));
      const tf = { scale, ox: 160-(left+width/2)*scale, oy: 115-(top+height/2)*scale };
      return { doc, tf };
    } catch { return { error: true }; }
  }, [record]);
  if (!preview || preview.empty || preview.error) return <div className="drawing-preview-empty">{preview?.error ? "Preview unavailable" : "No drawing geometry yet"}</div>;
  const { doc, tf } = preview;
  return <div className="drawing-preview-plan" role="img" aria-label="Saved foundation plan preview">
    <PlanCanvas doc={doc} size={{w:320,h:230}} viewBox="0 0 320 230" tf={tf} toScreen={(x,y)=>[tf.ox+x*tf.scale,tf.oy+y*tf.scale]} toWorld={(x,y)=>[(x-tf.ox)/tf.scale,(y-tf.oy)/tf.scale]} mode="view" groupSelection={[]} tracePts={[]} drainPts={[]} rowColor={(key)=>record.settings?.rowColors?.[key] || "#b9cad6"} shown={()=>true} showDims={false}>
      {(record.conversion?.repairs||[]).filter(repair=>repair.location).map((repair,index)=><circle key={index} cx={tf.ox+repair.location.x*tf.scale} cy={tf.oy+repair.location.y*tf.scale} r={7} fill="none" stroke="#ff9855" strokeWidth={2.5}><title>Closed CAD corner gap: {repair.gapInches} inches</title></circle>)}
    </PlanCanvas>
  </div>;
}
