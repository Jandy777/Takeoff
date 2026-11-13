import React, { useMemo } from "react";
import { readDocument } from "../library/documents";
import { collectFitPoints, resolveDrainRuns, resolveLedges } from "../geometry";
import { PlanCanvas } from "../render2d/PlanCanvas";

export function DrawingPreview({ record, focusDetail }) {
  const preview = useMemo(() => {
    if (!record) return null;
    try {
      const source = readDocument(record.document);
      const doc = { ...source, drains: resolveDrainRuns(source.drains, source.walls), ledges: resolveLedges(source.ledges, source.walls) };
      const pts = collectFitPoints(doc).filter(([x,y]) => Number.isFinite(x) && Number.isFinite(y));
      if (!pts.length) return { empty: true };
      const xs = pts.map(([x]) => x), ys = pts.map(([,y]) => y);
      let left = Math.min(...xs), top = Math.min(...ys), width = Math.max(...xs)-left, height = Math.max(...ys)-top;
      if(focusDetail) {
        width=height=Math.max(4,focusDetail.lengthInches/12+2);
        left=(focusDetail.a.x+focusDetail.b.x)/2-width/2;
        top=(focusDetail.a.y+focusDetail.b.y)/2-height/2;
      }
      const scale = Math.min(270/Math.max(width,1),190/Math.max(height,1));
      const tf = { scale, ox: 160-(left+width/2)*scale, oy: 115-(top+height/2)*scale };
      return { doc, tf };
    } catch { return { error: true }; }
  }, [record,focusDetail]);
  if (!preview || preview.empty || preview.error) return <div className="drawing-preview-empty">{preview?.error ? "Preview unavailable" : "No drawing geometry yet"}</div>;
  const { doc, tf } = preview;
  return <div className="drawing-preview-plan" role="img" aria-label={focusDetail?"CAD end/junction close-up":"Saved foundation plan preview"}>
    <PlanCanvas doc={doc} size={{w:320,h:230}} viewBox="0 0 320 230" tf={tf} toScreen={(x,y)=>[tf.ox+x*tf.scale,tf.oy+y*tf.scale]} toWorld={(x,y)=>[(x-tf.ox)/tf.scale,(y-tf.oy)/tf.scale]} mode="view" groupSelection={[]} tracePts={[]} drainPts={[]} rowColor={(key)=>record.settings?.rowColors?.[key] || "#b9cad6"} shown={()=>true} showDims={false}>
      {(record.conversion?.junctionDetails||[]).map(detail=><g key={detail.handle} stroke="#ff9855" fill="none" strokeWidth={2.5}>
        <line x1={tf.ox+detail.a.x*tf.scale} y1={tf.oy+detail.a.y*tf.scale} x2={tf.ox+detail.b.x*tf.scale} y2={tf.oy+detail.b.y*tf.scale}/>
        <circle cx={tf.ox+(detail.a.x+detail.b.x)/2*tf.scale} cy={tf.oy+(detail.a.y+detail.b.y)/2*tf.scale} r={5}><title>{`End/junction detail excluded from wall LF: ${Number(detail.lengthInches.toFixed(3))} inches`}</title></circle>
      </g>)}
      {(record.conversion?.repairs||[]).filter(repair=>repair.location).map((repair,index)=><circle key={index} cx={tf.ox+repair.location.x*tf.scale} cy={tf.oy+repair.location.y*tf.scale} r={7} fill="none" stroke="#ff9855" strokeWidth={2.5}><title>Closed CAD corner gap: {repair.gapInches} inches</title></circle>)}
    </PlanCanvas>
  </div>;
}
