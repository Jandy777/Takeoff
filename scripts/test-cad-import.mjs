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
  const {CadImportCard}=await server.ssrLoadModule("/src/foundation/ui/CadImportCard.jsx");
  const review=renderToStaticMarkup(React.createElement(CadImportCard,{canEdit:true,cad:{preview:multiple,result:null,layouts:multiple.conversion.layouts,layoutId:"",sourceName:"Sample.dxf"},onClose(){},onContinue(){}}));
  assert.match(review,/Layout to import/);
  assert.match(review,/<button[^>]*disabled=""[^>]*>Continue to drawing details/);
  console.log("CAD import tests passed: face pairing, units, exact dimensions, round-trip, editable heights, square deduplication, invalid/ambiguous files, and size limits.");
} finally {await server.close();}
