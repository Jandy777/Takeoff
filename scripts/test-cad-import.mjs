import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Synthetic geometry only; customer CAD files remain outside the repository.
function edge(handle,a,b,face,thickness=8,height=96,color=190) {
  return [0,"LINE",5,handle,8,"WALLS",10,a[0],20,a[1],11,b[0],21,b[1],1001,"WALLDATA",1000,"WDATA",1030,face,1040,thickness,1040,height,1040,color];
}
const outside=[[0,0],[120,0],[120,-120],[0,-120]],inside=[[8,-8],[112,-8],[112,-112],[8,-112]];
const edges=outside.flatMap((a,i)=>[edge(`A${i}`,a,outside[(i+1)%4],99),edge(`B${i}`,inside[i],inside[(i+1)%4],0)]);
function dxf(entities=edges,units=0) {
  return [0,"SECTION",2,"HEADER",9,"$INSUNITS",70,units,0,"ENDSEC",0,"SECTION",2,"ENTITIES",...entities.flat(),0,"ENDSEC",0,"EOF",""].join("\n");
}
function transformEdges(entities,angle,dx,dy) {
  const c=Math.cos(angle),s=Math.sin(angle);
  return entities.map(entity=>{
    const result=[...entity];
    for(const [xc,yc] of [[10,20],[11,21]]) {
      const ix=entity.findIndex((value,index)=>index%2===0&&value===xc)+1,iy=entity.findIndex((value,index)=>index%2===0&&value===yc)+1;
      result[ix]=entity[ix]*c-entity[iy]*s+dx;result[iy]=entity[ix]*s+entity[iy]*c+dy;
    }
    return result;
  });
}
const server=await createServer({configFile:false,root:process.cwd(),cacheDir:".tools/vite-test-cache",logLevel:"silent",appType:"custom",resolve:{preserveSymlinks:true},server:{middlewareMode:true}});
try {
  const {convertLegacyCad,selectCadLayout,MAX_CAD_BYTES}=await server.ssrLoadModule("/src/foundation/library/legacyCad.js");
  const {wallPolygon,wallMeasuredLen}=await server.ssrLoadModule("/src/foundation/geometry.js");
  const {computeTakeoff}=await server.ssrLoadModule("/src/foundation/takeoff.js");
  const {drawingPayload,readDocument}=await server.ssrLoadModule("/src/foundation/library/documents.js");
  const result=convertLegacyCad(dxf(),{units:"inches"}),walls=result.document.walls;
  assert.equal(walls.length,4);
  assert.equal(computeTakeoff(result.document).totalLF,40);
  assert.equal(result.conversion.layouts.length,1);
  assert.ok(walls.every(w=>w.thickness===8&&w.depth===8&&w.lengthBasis==="outside"));
  assert.ok(walls.every(w=>Math.abs(wallMeasuredLen(w,walls,"outside")-10)<1e-7));
  assert.deepEqual(readDocument(drawingPayload(result.document,{}).document),result.document);
  const changed=walls.map((wall,index)=>({...wall,depth:index%2?4:9}));
  assert.equal(computeTakeoff({...result.document,walls:changed}).totalLF,40);
  assert.deepEqual(changed.map(w=>wallPolygon(w,changed,q=>q.thickness/12)),walls.map(w=>wallPolygon(w,walls,q=>q.thickness/12)));
  assert.equal(convertLegacyCad(dxf([...edges].reverse()),{units:"inches"}).conversion.totalLF,40,"entity order does not define pairing");
  for(const face of [0,99]) {
    const withPoint=convertLegacyCad(dxf([...edges,edge("ZERO",[9000,9000],[9000,9000],face)]),{units:"inches"});
    assert.equal(withPoint.conversion.ignoredZeroLengthLines,1);
    assert.equal(withPoint.conversion.sourceWallEdges,9);
    assert.equal(withPoint.conversion.layouts.length,1,"a distant zero-length remnant cannot become another layout");
    assert.deepEqual(withPoint.document,result.document,"zero-length remnants cannot shift the plan origin, add walls or change lengths");
    assert.match(withPoint.conversion.warnings.join(" "),/zero-length CAD wall remnant/);
  }
  assert.throws(()=>convertLegacyCad(dxf([edge("ONLY-POINT",[0,0],[0,0],0)]),{units:"inches"}),/No complete walls/);
  assert.throws(()=>convertLegacyCad(dxf([...edges,edge("INVALID-POINT",[0,0],[0,0],0,8,0)]),{units:"inches"}),/invalid dimensions/,"zero length does not bypass invalid specification checks");
  assert.throws(()=>convertLegacyCad(dxf([...edges,edge("INVALID-WALL",[240,0],[360,0],99,8,0)]),{units:"inches"}),/invalid dimensions/,"real walls with invalid dimensions remain blocked");
  assert.equal(convertLegacyCad(dxf(edges,1)).conversion.units,"inches");
  assert.throws(()=>convertLegacyCad(dxf()),/Confirm inches/);
  assert.throws(()=>convertLegacyCad(dxf(edges,2),{units:"inches"}),/inch drawings/);
  assert.throws(()=>convertLegacyCad(dxf().replace(/0\nEOF\n$/,""),{units:"inches"}),/incomplete/);
  assert.throws(()=>convertLegacyCad("AutoCAD Binary DXF"),/ASCII DXF/);
  assert.throws(()=>convertLegacyCad("x".repeat(MAX_CAD_BYTES+1)),/10 MB/);
  assert.throws(()=>convertLegacyCad(dxf(edges.slice(0,-1)),{units:"inches"}),/paired/);
  assert.throws(()=>convertLegacyCad(dxf().replaceAll("WALLDATA","OTHERDATA"),{units:"inches"}),/WALLDATA/);
  assert.throws(()=>convertLegacyCad(dxf().replace("LINE","ARC"),{units:"inches"}),/unsupported geometry/);
  assert.throws(()=>convertLegacyCad(dxf().replaceAll("WALLS","NOTWALLS"),{units:"inches"}),/No model-space WALLS/);
  const square=[edge("C1",[240,-60],[240,-78],99,18,42),edge("C2",[222,-60],[222,-78],0,18,42),edge("C3",[240,-78],[222,-78],99,18,42),edge("C4",[240,-60],[222,-60],0,18,42)];
  const withSquare=convertLegacyCad(dxf([...edges,...square]),{units:"inches"});
  assert.equal(withSquare.document.walls.length,5,"two descriptions of a square section become one wall");
  assert.equal(withSquare.conversion.duplicateSquareFacePairs,1);
  assert.equal(computeTakeoff(withSquare.document).totalLF,41.5);
  const ambiguous=[...edges,edge("Bextra",[8,-8],[112,-8],0)];
  assert.throws(()=>convertLegacyCad(dxf(ambiguous),{units:"inches"}),/unambiguously/);
  const cappedRun=[edge("RUN-O",[0,0],[120,0],99),edge("RUN-I",[0,-8],[120,-8],0),edge("CAP",[120,0],[120,-8],99)];
  const capped=convertLegacyCad(dxf(cappedRun),{units:"inches"});
  assert.equal(capped.document.walls.length,1,"an end cap does not become another wall");
  assert.equal(capped.conversion.totalLF,10);
  assert.equal(computeTakeoff(capped.document).totalLF,10);
  assert.equal(capped.conversion.junctionDetails.length,1);
  const staleCap=convertLegacyCad(dxf([...cappedRun.slice(0,2),edge("OLD-CAP",[120,0],[120,-8],99,8,42,230)]),{units:"inches"});
  assert.equal(staleCap.conversion.junctionDetails.length,1,"a connected cap can retain an old height/color after wall edits");
  assert.equal(staleCap.conversion.totalLF,10);
  assert.throws(()=>convertLegacyCad(dxf([...cappedRun.slice(0,2),edge("WRONG-WIDTH-CAP",[120,0],[120,-8],99,12,42,230)]),{units:"inches"}),/unambiguously/,"an unmatched detail must still agree with an attached wall thickness");
  assert.match(capped.conversion.warnings.join(" "),/excluded from wall LF/);
  assert.throws(()=>convertLegacyCad(dxf([...cappedRun,edge("DUPLICATE-O",[0,0],[120,0],99)]),{units:"inches"}),/unambiguously/,"a second outside face cannot be discarded as a cap");
  assert.throws(()=>convertLegacyCad(dxf([...edges,edge("ORPHAN",[240,0],[248,0],99)]),{units:"inches"}),/unambiguously/,"a short unmatched line away from paired walls still stops conversion");
  const junction=[...edges,edge("BRANCH-O",[0,-8],[0,48],99),edge("BRANCH-I",[8,0],[8,48],0),edge("BRANCH-CAP",[0,48],[8,48],99)];
  const joined=convertLegacyCad(dxf(junction),{units:"inches"});
  assert.equal(joined.document.walls.length,5);
  assert.equal(joined.conversion.junctionDetails.length,1);
  assert.ok(joined.conversion.preservedCadEnds>0,"shared source junctions retain their actual cut angles");
  const expectedJunctionLF=40+56/12;
  assert.ok(Math.abs(computeTakeoff(joined.document).totalLF-expectedJunctionLF)<1e-7);
  for(const trace of joined.conversion.trace) {
    const wall=joined.document.walls.find(w=>w.id===trace.id),poly=wallPolygon(wall,joined.document.walls,q=>q.thickness/12);
    assert.ok(Math.abs(wallMeasuredLen(wall,joined.document.walls,"outside")-trace.outsideLength)<1e-7);
    assert.ok(trace.sourcePolygon.every(p=>poly.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<1e-7)),"all source corners survive the junction conversion");
  }
  assert.ok(Math.abs(convertLegacyCad(dxf([...junction].reverse()),{units:"inches"}).conversion.totalLF-expectedJunctionLF)<1e-7,"cap recognition works before or after its wall entities");
  const rotatedJunction=convertLegacyCad(dxf(transformEdges(junction,Math.PI/6,5000,4000)),{units:"inches"});
  assert.ok(Math.abs(rotatedJunction.conversion.totalLF-expectedJunctionLF)<1e-7,"shared cuts and end details also work in rotated drawings at large CAD coordinates");
  assert.equal(rotatedJunction.conversion.junctionDetails.length,1);
  const separateCap=convertLegacyCad(dxf([...edges,...transformEdges(cappedRun,0,240,240)]),{units:"inches"});
  const plainLayout=separateCap.conversion.layouts.find(layout=>layout.wallCount===4),capLayout=separateCap.conversion.layouts.find(layout=>layout.wallCount===1);
  assert.equal(selectCadLayout(separateCap,plainLayout.id).conversion.junctionDetails.length,0,"selecting another layout does not retain unrelated detail warnings");
  assert.equal(selectCadLayout(separateCap,capLayout.id).conversion.junctionDetails.length,1);
  const reopenedJunction=readDocument(drawingPayload(joined.document,{}).document);
  assert.deepEqual(reopenedJunction,joined.document,"CAD corner cuts survive saved-file round trips");
  assert.ok(Math.abs(computeTakeoff({...reopenedJunction,walls:reopenedJunction.walls.map(w=>({...w,depth:5}))}).totalLF-expectedJunctionLF)<1e-7,"height edits cannot change the imported wall LF");
  const {resizeWallToMeasuredLength}=await server.ssrLoadModule("/src/foundation/geometry.js");
  const cutWall=joined.document.walls.find(w=>w.cadEndCuts),originalMeasured=wallMeasuredLen(cutWall,joined.document.walls,"outside");
  const resized=resizeWallToMeasuredLength(cutWall.id,joined.document.walls,originalMeasured+2,"outside");
  assert.ok(Math.abs(wallMeasuredLen(resized.find(w=>w.id===cutWall.id),resized,"outside")-originalMeasured-2)<1e-4,"wall length remains editable with a preserved CAD cut");
  const {filletWalls}=await server.ssrLoadModule("/src/foundation/fillet.js");
  const filleted=filletWalls({walls:[{id:1,x1:0,y1:0,x2:10,y2:0,thickness:8,cadEndCuts:{start:0,end:1}},{id:2,x1:12,y1:3,x2:12,y2:10,thickness:8,cadEndCuts:{start:1,end:0}}]}, {id:1,end:2}, {id:2,end:1});
  assert.equal(filleted.error,undefined);
  assert.deepEqual(filleted.walls[0].cadEndCuts,{start:0},"filleting replaces only the CAD cut at the joined end");
  assert.deepEqual(filleted.walls[1].cadEndCuts,{end:0});
  const notes=[0,"TEXT",5,"NOTE1",8,"WALLS",10,20,20,20,1,"Wing note"];
  const multiNote=[0,"MTEXT",5,"NOTE2",8,"WALLS",10,20,20,20,1,"CAD note"];
  const dimension=[0,"DIMENSION",5,"NOTE3",8,"WALLS",10,20,20,20];
  const annotated=convertLegacyCad(dxf([...edges,notes,multiNote,dimension]),{units:"inches"});
  assert.equal(annotated.document.walls.length,4,"ordinary annotations on WALLS do not block or add wall length");
  assert.equal(annotated.conversion.totalLF,40);
  assert.equal(annotated.conversion.ignoredAnnotations,3);
  assert.deepEqual(annotated.document,result.document);
  assert.throws(()=>convertLegacyCad(dxf([...edges,[...notes,1001,"WALLDATA"]]),{units:"inches"}),/unsupported geometry/,"annotations carrying wall metadata are not silently dropped");
  const shifted=outside.flatMap((a,i)=>{
    const move=p=>[p[0]+360,p[1]];
    return [edge(`D${i}`,move(a),move(outside[(i+1)%4]),99),edge(`E${i}`,move(inside[i]),move(inside[(i+1)%4]),0)];
  });
  const multiple=convertLegacyCad(dxf([...edges,...shifted,notes]),{units:"inches"});
  assert.equal(multiple.conversion.layouts.length,2);
  assert.equal(selectCadLayout(multiple,"") ,null,"multiple layouts require an explicit choice");
  for(const layout of multiple.conversion.layouts){
    const selected=selectCadLayout(multiple,layout.id);
    assert.equal(selected.document.walls.length,4);
    assert.equal(selected.conversion.totalLF,40);
    assert.equal(computeTakeoff(selected.document).totalLF,40,"the other layout cannot double quantities");
  }
  assert.equal(selectCadLayout(multiple,"all").document.walls.length,8);
  const threeGroups=convertLegacyCad(dxf([...edges,...shifted,...transformEdges(cappedRun,0,720,240),edge("ZERO-BETWEEN",[600,100],[600,100],0)]),{units:"inches"});
  assert.equal(threeGroups.conversion.layouts.length,3);
  const selectedGroups=selectCadLayout(threeGroups,["layout-1","layout-3"]);
  assert.equal(selectedGroups.document.walls.length,5,"a detached component can be included without importing the other revision");
  assert.equal(selectedGroups.conversion.totalLF,50);
  assert.equal(computeTakeoff(selectedGroups.document).totalLF,50);
  assert.equal(selectedGroups.conversion.junctionDetails.length,1);
  assert.equal(selectCadLayout(threeGroups,["layout-2"]).conversion.junctionDetails.length,0);
  assert.equal(selectCadLayout(threeGroups,["layout-1","layout-1","layout-3"]).conversion.totalLF,50,"selected groups cannot be double counted");
  assert.equal(selectCadLayout(threeGroups,[]),null);
  assert.equal(selectCadLayout(threeGroups,["layout-1","missing"]),null,"invalid selections cannot silently become partial imports");
  const mixedInside=[[12,-10],[108,-10],[108,-110],[12,-110]],widths=[10,12,10,12];
  const mixedEdges=outside.flatMap((point,i)=>[edge(`M${i}`,point,outside[(i+1)%4],99,widths[i]),edge(`N${i}`,mixedInside[i],mixedInside[(i+1)%4],0,widths[i])]);
  const mixed=convertLegacyCad(dxf(mixedEdges),{units:"inches"});
  assert.equal(mixed.document.walls.length,4);
  assert.equal(computeTakeoff(mixed.document).totalLF,40,"mixed-thickness corners retain the source outside dimensions");
  const gappedEdges=[...edges];gappedEdges[0]=edge("A0",[0.5,0],[120,0],99);
  assert.throws(()=>convertLegacyCad(dxf(gappedEdges),{units:"inches",repairSmallGaps:false}),/corners or wall lengths/,"strict conversion detects real CAD endpoint gaps");
  const repaired=convertLegacyCad(dxf(gappedEdges),{units:"inches"});
  assert.equal(repaired.conversion.repairs.length,1);
  assert.equal(repaired.conversion.repairs[0].gapInches,0.5);
  assert.equal(computeTakeoff(repaired.document).totalLF,40);
  assert.match(repaired.conversion.warnings.join(" "),/increased by 0.5/);
  const changedHeights=repaired.document.walls.map(wall=>({...wall,depth:9}));
  assert.equal(computeTakeoff({...repaired.document,walls:changedHeights}).totalLF,40);
  const largeGap=[...edges];largeGap[0]=edge("A0",[3,0],[120,0],99);
  assert.throws(()=>convertLegacyCad(dxf(largeGap),{units:"inches"}),/corners or wall lengths/,"large gaps still need manual review");
  const untagged=[0,"LINE",5,"PLAIN1",8,"WALLS",10,20,20,-20,11,30,21,-20];
  const nonBillable=convertLegacyCad(dxf([...edges,untagged]),{units:"inches"});
  assert.equal(nonBillable.conversion.excludedLines,1);
  assert.equal(computeTakeoff(nonBillable.document).totalLF,40,"untagged linework never adds billable walls");
  assert.deepEqual(nonBillable.document,result.document);
  const omittedSpan=[0,"LINE",5,"OMITTED",8,"WALLS",10,0,20,0,11,0.5,21,0];
  assert.throws(()=>convertLegacyCad(dxf([...gappedEdges,omittedSpan]),{units:"inches"}),/corners or wall lengths/,"repairs do not bridge deliberately untagged spans");
  const partialOmission=[0,"LINE",5,"OMITTED-PART",8,"WALLS",10,0,20,0,11,0.1,21,0];
  assert.throws(()=>convertLegacyCad(dxf([...gappedEdges,partialOmission]),{units:"inches"}),/corners or wall lengths/,"even a partial overlap with excluded material blocks an automatic repair");
  const {CadImportCard}=await server.ssrLoadModule("/src/foundation/ui/CadImportCard.jsx");
  const combinedReview=renderToStaticMarkup(React.createElement(CadImportCard,{canEdit:true,cad:{preview:threeGroups,result:selectedGroups,layouts:threeGroups.conversion.layouts,layoutId:"layout-1",extraLayoutIds:["layout-3"],sourceName:"Detached garage.dxf"},onClose(){},onContinue(){}}));
  assert.match(combinedReview,/Include other wall groups with this drawing/);
  assert.match(combinedReview,/detached garages/);
  assert.match(combinedReview,/5 editable walls/);
  assert.match(combinedReview,/<input[^>]*checked=""/,"additional selected wall groups are visible in the review");
  const junctionReview=renderToStaticMarkup(React.createElement(CadImportCard,{canEdit:true,cad:{preview:joined,result:joined,layouts:joined.conversion.layouts,layoutId:"all",sourceName:"Junction.dxf"},onClose(){},onContinue(){}}));
  assert.match(junctionReview,/I reviewed the highlighted end\/junction details/);
  assert.match(junctionReview,/<button[^>]*disabled=""[^>]*>Continue to drawing details/,"one-sided junction details need explicit review before import");
  const {DrawingPreview}=await server.ssrLoadModule("/src/foundation/ui/DrawingPreview.jsx");
  assert.match(renderToStaticMarkup(React.createElement(DrawingPreview,{record:joined})),/End\/junction detail excluded from wall LF/,"the review preview marks the source detail locations");
  const review=renderToStaticMarkup(React.createElement(CadImportCard,{canEdit:true,cad:{preview:multiple,result:null,layouts:multiple.conversion.layouts,layoutId:"",sourceName:"Sample.dxf"},onClose(){},onContinue(){}}));
  assert.match(review,/Layout to import/);
  assert.match(review,/<button[^>]*disabled=""[^>]*>Continue to drawing details/);
  console.log("CAD import tests passed: face pairing, units, exact dimensions, round-trip, editable heights, square deduplication, invalid/ambiguous files, and size limits.");
} finally {await server.close();}
