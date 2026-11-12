import { wallMeasuredLen, wallPolygon, dist } from "../geometry";
import { readDocument } from "./documents";

// Pure conversion profile for the company's legacy WALLDATA drawings.
// Coordinates in DXF inches become feet in Takeoff; no source file is uploaded.
export const MAX_CAD_BYTES = 10 * 1024 * 1024;
const EPS=1e-6;
const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const value=(entity,code)=>entity.tags.find(tag=>tag[0]===code)?.[1];

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
  const layout=result?.conversion.layouts?.find(item=>item.id===id);
  if(!layout)return null;
  const ids=new Set(layout.wallIds);
  return {...result,document:readDocument({...result.document,walls:result.document.walls.filter(wall=>ids.has(wall.id))}),
    conversion:{...result.conversion,wallCount:layout.wallCount,totalLF:layout.totalLF,
      selectedLayout:layout.name,trace:result.conversion.trace.filter(wall=>ids.has(wall.id))}};
}
export function convertLegacyCad(text,{units}={}) {
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
  const annotations=wallLayer.filter(e=>['TEXT','MTEXT','DIMENSION'].includes(e.type)
    && !e.tags.some(tag=>tag[0]===1001&&tag[1]==='WALLDATA'));
  const wallEntities=wallLayer.filter(e=>!annotations.includes(e));
  if(!wallEntities.length)throw Error('No model-space WALLS layer was found.');
  if(wallEntities.some(e=>e.type!=='LINE'))throw Error('The WALLS layer contains unsupported geometry. Review it before converting.');
  if(wallEntities.length>2000)throw Error('This DXF has too many wall faces for a single import. Export one foundation layout at a time.');
  const edges=wallEntities.map(e=>{
    const start=e.tags.findIndex(tag=>tag[0]===1001&&tag[1]==='WALLDATA');
    if(start<0)throw Error('The DXF is missing its legacy wall information (WALLDATA). Export a fresh copy from your CAD program.');
    let end=e.tags.findIndex((tag,index)=>index>start&&tag[0]===1001);if(end<0)end=e.tags.length;
    const data=e.tags.slice(start+1,end),numbers=data.filter(tag=>tag[0]===1040).map(tag=>Number(tag[1]));
    const [thickness,height,color]=numbers,face=Number(data.find(tag=>tag[0]===1030)?.[1]);
    const a={x:Number(value(e,10)),y:-Number(value(e,20))},b={x:Number(value(e,11)),y:-Number(value(e,21))};
    if(![a.x,a.y,b.x,b.y,thickness,height,color,face].every(Number.isFinite)||thickness<=0||height<=0||![0,99].includes(face)||distance(a,b)<EPS)throw Error('Some CAD walls have invalid dimensions or incomplete wall information. Review the walls in CAD before importing.');
    return{handle:value(e,5),a,b,thickness,height,color,face,key:numbers.join('|')};
  });
  const outer=edges.filter(e=>e.face===99),inner=edges.filter(e=>e.face===0),used=new Set(),pairs=[];
  for(const outside of outer){
    const length=distance(outside.a,outside.b),ux=(outside.b.x-outside.a.x)/length,uy=(outside.b.y-outside.a.y)/length;
    const candidates=[];
    for(const inside of inner){
      if(used.has(inside.handle)||inside.key!==outside.key)continue;
      let a=inside.a,b=inside.b;
      if((b.x-a.x)*ux+(b.y-a.y)*uy<0)[a,b]=[b,a];
      const lateral=p=>(p.x-outside.a.x)*(-uy)+(p.y-outside.a.y)*ux;
      const da=lateral(a),db=lateral(b),along=p=>(p.x-outside.a.x)*ux+(p.y-outside.a.y)*uy;
      const t0=along(a),t1=along(b);
      if(Math.abs(da-db)>EPS||Math.abs(Math.abs(da)-outside.thickness)>EPS||(length>=outside.thickness&&Math.min(length,t1)-Math.max(0,t0)<EPS))continue;
      const score=Math.abs(t0)+Math.abs(t1-length);
      if(score>outside.thickness*2+EPS)continue;
      candidates.push({inside,a,b,score});
    }
    candidates.sort((a,b)=>a.score-b.score);
    if(!candidates.length||candidates[1]&&Math.abs(candidates[1].score-candidates[0].score)<EPS)throw Error('Some wall faces could not be paired unambiguously. Review the WALLS layer in CAD before importing.');
    const match=candidates[0];used.add(match.inside.handle);
    pairs.push({outside,inside:match.inside,a:midpoint(outside.a,match.a),b:midpoint(outside.b,match.b),polygon:[outside.a,outside.b,match.b,match.a]});
  }
  if(used.size!==inner.length)throw Error('Some inside wall faces were not paired. Conversion stopped for review.');
  const points=edges.flatMap(e=>[e.a,e.b]),left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
  const feet=p=>({x:(p.x-left)/12,y:(p.y-top)/12});
  const seen=new Map(),walls=[],trace=[],duplicateFaces=[];
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
    walls.push(wall);trace.push({id:wall.id,sourceHandles:[outside.handle,pair.inside.handle],outsideLength:distance(outside.a,outside.b)/12,sourcePolygon:pair.polygon.map(feet)});
  }
  if (!walls.length) throw Error('No complete walls were found in this DXF.');
  // A plausible pairing is not enough: the existing editor must reproduce
  // each source footprint and its measured outside face before we accept it.
  const tolerance = 1 / 768; // 1/64 inch, in feet.
  for (let index = 0; index < walls.length; index++) {
    const wall = walls[index], sourcePolygon = trace[index].sourcePolygon;
    const polygon = wallPolygon(wall, walls, (w) => w.thickness / 12);
    if (!polygon || polygon.some((point) => !sourcePolygon.some((source) => dist(point.x, point.y, source.x, source.y) < tolerance))
      || sourcePolygon.some((source) => !polygon.some((point) => dist(point.x, point.y, source.x, source.y) < tolerance))
      || Math.abs(wallMeasuredLen(wall, walls, 'outside') - trace[index].outsideLength) > tolerance) {
      throw Error('Some CAD corners or wall lengths could not be preserved. Review the wall layout in CAD before importing.');
    }
  }
  const document = readDocument({walls});
  const layouts = cadLayouts(walls,trace);
  return { document, settings: {rowColors:{}}, conversion: {
    profile:'legacy-WALLDATA-v1', units:'inches', sourceWallEdges:edges.length,
    pairedRuns:pairs.length, duplicateSquareFacePairs:duplicateFaces.length,
    wallCount:walls.length, totalLF:trace.reduce((sum,wall)=>sum+wall.outsideLength,0),
    ignoredAnnotations:annotations.length, layouts,
    trace, warnings:[...(annotations.length ? [`${annotations.length} CAD annotation${annotations.length===1?' was':'s were'} left out of the wall import.`] : []),'Wall heights start with the CAD values. Select any wall to change its height.',
      'Footings use Takeoff defaults. Windows, pads, drain tile, ledges, and other CAD details are not included.']
  }};
}
