import { wallMeasuredLen, wallPolygon, dist } from "../geometry";
import { readDocument } from "./documents";
import { repairCadCorners } from "./cadCornerRepair";
import { pairCadWallFaces, cadEndCuts } from "./cadWallPairing";

// Pure conversion profile for the company's legacy WALLDATA drawings.
// Coordinates in DXF inches become feet in Takeoff; no source file is uploaded.
export const MAX_CAD_BYTES = 10 * 1024 * 1024;
const EPS=1e-6;
const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
const value=(entity,code)=>entity.tags.find(tag=>tag[0]===code)?.[1];
const hasWallData=entity=>entity.tags.some(tag=>tag[0]===1001&&tag[1]==='WALLDATA');

function conversionWarnings(conversion) {
  const notes=[];
  if(conversion.ignoredAnnotations)notes.push(`${conversion.ignoredAnnotations} CAD annotation${conversion.ignoredAnnotations===1?' was':'s were'} left out of the wall import.`);
  if(conversion.excludedLines)notes.push(`${conversion.excludedLines} CAD line${conversion.excludedLines===1?' has':'s have'} no wall takeoff data and ${conversion.excludedLines===1?'was':'were'} excluded from wall quantities.`);
  if(conversion.ignoredZeroLengthLines)notes.push(`${conversion.ignoredZeroLengthLines} zero-length CAD wall ${conversion.ignoredZeroLengthLines===1?'remnant was':'remnants were'} ignored. These points have no wall length and do not define a layout.`);
  if(conversion.junctionDetails?.length)notes.push(`${conversion.junctionDetails.length} short, one-sided CAD end or junction ${conversion.junctionDetails.length===1?'line was':'lines were'} found. They are highlighted in orange and excluded from wall LF. Review these locations before continuing; they have no opposing face defining a separate wall.`);
  if(conversion.preservedCadEnds)notes.push(`Original CAD corner cuts were retained on ${conversion.preservedCadEnds} wall${conversion.preservedCadEnds===1?'':'s'} to preserve their exact face lengths.`);
  if(conversion.repairs.length) {
    const gaps=conversion.repairs.map(repair=>Number(repair.gapInches.toFixed(3))).join('″, ');
    const change=conversion.trace.reduce((sum,wall)=>sum+(wall.outsideLength-wall.originalOutsideLength)*12,0);
    const lengthNote=Math.abs(change)<1e-6?'did not change':`${change<0?'decreased':'increased'} by ${Number(Math.abs(change).toFixed(3))}″`;
    notes.push(`Closed ${conversion.repairs.length} small CAD corner gap${conversion.repairs.length===1?'':'s'} (${gaps}″). Total wall length ${lengthNote}. Review the corrected layout before creating the drawing.`);
  }
  notes.push('Wall heights start with the CAD values. Select any wall to change its height.',
    'Footings use Takeoff defaults. Windows, pads, drain tile, ledges, and other CAD details are not included.');
  return notes;
}

// Group touching wall footprints, so separate layouts/revisions in one DXF
// can be imported independently. SAT also handles angled wall bands.
function cadLayouts(walls,trace) {
  const tolerance=1/768;
  const bounds=points=>({left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))});
  const boxes=trace.map(w=>bounds(w.sourcePolygon));
  function touch(i,j) {
    const a=boxes[i],b=boxes[j];
    if(a.left>b.right+tolerance||b.left>a.right+tolerance||a.top>b.bottom+tolerance||b.top>a.bottom+tolerance)return false;
    const p=trace[i].sourcePolygon,q=trace[j].sourcePolygon;
    for(const poly of [p,q])for(let k=0;k<poly.length;k++) {
      const first=poly[k],next=poly[(k+1)%poly.length],length=dist(first.x,first.y,next.x,next.y);
      if(length<1e-9)continue;
      const nx=(first.y-next.y)/length,ny=(next.x-first.x)/length;
      const pa=p.map(point=>point.x*nx+point.y*ny),pb=q.map(point=>point.x*nx+point.y*ny);
      if(Math.min(...pa)>Math.max(...pb)+tolerance||Math.min(...pb)>Math.max(...pa)+tolerance)return false;
    }
    return true;
  }
  const seen=new Set(),groups=[];
  for(let i=0;i<walls.length;i++) {
    if(seen.has(i))continue;
    const queue=[i],indices=[];seen.add(i);
    while(queue.length) {
      const current=queue.pop();indices.push(current);
      for(let j=0;j<walls.length;j++)if(!seen.has(j)&&touch(current,j)){seen.add(j);queue.push(j);}
    }
    groups.push({wallIds:indices.map(index=>walls[index].id),wallCount:indices.length,
      totalLF:indices.reduce((sum,index)=>sum+trace[index].outsideLength,0),
      thicknesses:[...new Set(indices.map(index=>walls[index].thickness))].sort((a,b)=>a-b),
      bounds:bounds(indices.flatMap(index=>trace[index].sourcePolygon))});
  }
  return groups.sort((a,b)=>a.bounds.left-b.bounds.left||a.bounds.top-b.bounds.top)
    .map((group,index)=>({...group,id:`layout-${index+1}`,name:`Layout ${index+1}`}));
}

export function selectCadLayout(result,id) {
  if(id==='all')return result;
  const selectedIds=[...new Set(Array.isArray(id)?id:[id])];
  const layouts=selectedIds.map(selectedId=>result?.conversion.layouts?.find(item=>item.id===selectedId));
  if(!layouts.length||layouts.some(layout=>!layout))return null;
  const ids=new Set(layouts.flatMap(layout=>layout.wallIds));
  const trace=result.conversion.trace.filter(wall=>ids.has(wall.id));
  const handles=new Set(trace.flatMap(wall=>wall.sourceHandles));
  const conversion={...result.conversion,wallCount:ids.size,totalLF:trace.reduce((sum,wall)=>sum+wall.outsideLength,0),
    selectedLayout:layouts.map(layout=>layout.name).join(' + '),trace,repairs:result.conversion.repairs.filter(repair=>repair.handles.some(handle=>handles.has(handle))),
    junctionDetails:(result.conversion.junctionDetails||[]).filter(detail=>detail.wallHandles.some(handle=>handles.has(handle))),
    preservedCadEnds:result.document.walls.filter(wall=>ids.has(wall.id)&&wall.cadEndCuts).length};
  conversion.warnings=conversionWarnings(conversion);
  return {...result,document:readDocument({...result.document,walls:result.document.walls.filter(wall=>ids.has(wall.id))}),
    conversion};
}
export function convertLegacyCad(text,{units,repairSmallGaps=true}={}) {
  if (typeof text === 'string' && text.length > MAX_CAD_BYTES) throw Error('Choose a DXF smaller than 10 MB.');
  if(typeof text!=='string'||text.startsWith('AutoCAD Binary DXF'))throw Error('Export an ASCII DXF from the original CAD program.');
  const source=text.replace(/^\uFEFF/,'').split(/\r?\n/),sections=Object.create(null);let section=null,ended=false;
  for(let i=0;i+1<source.length;i+=2){
    const code=Number(source[i].trim()),v=source[i+1].trim();
    if(!Number.isInteger(code))throw Error('This file could not be read as a DXF drawing. Export a fresh copy from CAD.');
    if(code===0&&v==='EOF'){ended=true;break;}
    if(code===0&&v==='SECTION'){if(Number(source[i+2]?.trim())!==2)throw Error('Invalid DXF section.');section=source[i+3]?.trim();if(sections[section])throw Error('This DXF contains repeated drawing sections.');sections[section]=[];i+=2;}
    else if(code===0&&v==='ENDSEC')section=null;
    else if(section)sections[section].push([code,v]);
  }
  if (!ended || section !== null) throw Error('This DXF is incomplete. Export a fresh copy from CAD.');
  if(!sections.ENTITIES||!sections.HEADER)throw Error('DXF has no model-space entities or header.');
  let insertionUnits=0;const header=sections.HEADER;
  for(let i=0;i<header.length;i++)if(header[i][0]===9&&header[i][1]==='$INSUNITS')insertionUnits=Number(header[i+1]?.[1]);
  if(insertionUnits!==0&&insertionUnits!==1)throw Error('This archive profile currently supports inch drawings only.');
  if(insertionUnits===0&&units!=='inches')throw Error('This DXF has no assigned units. Confirm inches before conversion.');
  const entities=[];let entity=null;
  for(const [code,v]of sections.ENTITIES){if(code===0){entity={type:v,tags:[]};entities.push(entity);}else if(entity)entity.tags.push([code,v]);}
  const wallLayer=entities.filter(e=>value(e,8)?.toUpperCase()==='WALLS'&&value(e,67)!=='1');
  if(!wallLayer.length)throw Error('No model-space WALLS layer was found.');
  const annotations=wallLayer.filter(e=>['TEXT','MTEXT','DIMENSION'].includes(e.type)
    && !hasWallData(e));
  const untagged=wallLayer.filter(e=>e.type==='LINE'&&!hasWallData(e));
  const wallEntities=wallLayer.filter(e=>!annotations.includes(e)&&!untagged.includes(e));
  if(!wallEntities.length)throw Error('No walls carrying legacy takeoff data (WALLDATA) were found in this DXF.');
  if(wallEntities.some(e=>e.type!=='LINE'))throw Error('The WALLS layer contains unsupported geometry. Review it before converting.');
  if(wallEntities.length>2000)throw Error('This DXF has too many wall faces for a single import. Export one foundation layout at a time.');
  let ignoredZeroLengthLines=0;
  const edges=wallEntities.map(e=>{
    const start=e.tags.findIndex(tag=>tag[0]===1001&&tag[1]==='WALLDATA');
    if(start<0)throw Error('The DXF is missing its legacy wall information (WALLDATA). Export a fresh copy from your CAD program.');
    let end=e.tags.findIndex((tag,index)=>index>start&&tag[0]===1001);if(end<0)end=e.tags.length;
    const data=e.tags.slice(start+1,end),numbers=data.filter(tag=>tag[0]===1040).map(tag=>Number(tag[1]));
    const [thickness,height,color]=numbers,face=Number(data.find(tag=>tag[0]===1030)?.[1]);
    const a={x:Number(value(e,10)),y:-Number(value(e,20))},b={x:Number(value(e,11)),y:-Number(value(e,21))};
    if(![a.x,a.y,b.x,b.y,thickness,height,color,face].every(Number.isFinite)||thickness<=0||height<=0||![0,99].includes(face))throw Error('Some CAD walls have invalid dimensions or incomplete wall information. Review the walls in CAD before importing.');
    if(distance(a,b)<EPS){ignoredZeroLengthLines++;return null;}
    return{handle:value(e,5),a,b,originalA:{...a},originalB:{...b},thickness,height,color,face,key:numbers.join('|')};
  }).filter(Boolean);
  if(!edges.length)throw Error('No complete walls were found in this DXF after ignoring zero-length lines.');
  const excluded=untagged.map(e=>({a:{x:Number(value(e,10)),y:-Number(value(e,20))},b:{x:Number(value(e,11)),y:-Number(value(e,21))}}))
    .filter(line=>[line.a.x,line.a.y,line.b.x,line.b.y].every(Number.isFinite));
  const repairs=repairSmallGaps?repairCadCorners(edges,excluded):[];
  const {pairs,details}=pairCadWallFaces(edges);
  const points=edges.flatMap(e=>[e.a,e.b]),left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
  const feet=p=>({x:(p.x-left)/12,y:(p.y-top)/12});
  const seen=new Map(),walls=[],trace=[],duplicateFaces=[],sourcePairs=[];
  for(const pair of pairs){
    const key=pair.polygon.map(p=>`${p.x.toFixed(5)},${p.y.toFixed(5)}`).sort().join('|');
    if(seen.has(key)){
      const previous=seen.get(key);
      if(previous.outside.key!==pair.outside.key)throw Error('Overlapping source walls have conflicting specifications.');
      duplicateFaces.push([pair.outside.handle,pair.inside.handle]);continue;
    }
    seen.set(key,pair);
    const a=feet(pair.a),b=feet(pair.b),outside=pair.outside,origin=feet(outside.a),finish=feet(outside.b);
    const cross=(b.x-a.x)*(origin.y-a.y)-(b.y-a.y)*(origin.x-a.x);
    const wall={id:walls.length+1,x1:a.x,y1:a.y,x2:b.x,y2:b.y,thickness:outside.thickness,depth:outside.height/12,footing:null,lengthBasis:'outside',pendingFace:true,traceSide:cross>0?-1:1,faceStart:origin,faceEnd:finish};
    walls.push(wall);sourcePairs.push(pair);trace.push({id:wall.id,sourceHandles:[outside.handle,pair.inside.handle],outsideLength:distance(outside.a,outside.b)/12,originalOutsideLength:distance(outside.originalA,outside.originalB)/12,sourcePolygon:pair.polygon.map(feet)});
  }
  if (!walls.length) throw Error('No complete walls were found in this DXF.');
  // A plausible pairing is not enough: the existing editor must reproduce
  // each source footprint and its measured outside face before we accept it.
  const tolerance = 1 / 768; // 1/64 inch, in feet.
  const matchesSource = (wall,index) => {
    const sourcePolygon=trace[index].sourcePolygon;
    const polygon = wallPolygon(wall, walls, (w) => w.thickness / 12);
    return polygon && !polygon.some(point=>!sourcePolygon.some(source=>dist(point.x,point.y,source.x,source.y)<tolerance))
      && !sourcePolygon.some(source=>!polygon.some(point=>dist(point.x,point.y,source.x,source.y)<tolerance))
      && Math.abs(wallMeasuredLen(wall,walls,'outside')-trace[index].outsideLength)<=tolerance;
  };
  for(let index=0;index<walls.length;index++)if(!matchesSource(walls[index],index)) {
    const cuts=cadEndCuts(sourcePairs[index],edges);
    if(cuts)walls[index]={...walls[index],cadEndCuts:cuts};
  }
  if(walls.some((wall,index)=>!matchesSource(wall,index)))throw Error('Some CAD corners or wall lengths could not be preserved. Review the wall layout in CAD before importing.');
  const document = readDocument({walls});
  const layouts = cadLayouts(walls,trace);
  const conversion={
    profile:'legacy-WALLDATA-v1', units:'inches', sourceWallEdges:wallEntities.length,ignoredZeroLengthLines,
    pairedRuns:pairs.length, duplicateSquareFacePairs:duplicateFaces.length,
    wallCount:walls.length, totalLF:trace.reduce((sum,wall)=>sum+wall.outsideLength,0),
    ignoredAnnotations:annotations.length,excludedLines:untagged.length,layouts,repairs:repairs.map(repair=>({...repair,location:feet(repair.after)})),trace,
    junctionDetails:details.map(detail=>({...detail,a:feet(detail.a),b:feet(detail.b)})),
    preservedCadEnds:walls.filter(wall=>wall.cadEndCuts).length
  };
  conversion.warnings=conversionWarnings(conversion);
  return {document,settings:{rowColors:{}},conversion};
}
