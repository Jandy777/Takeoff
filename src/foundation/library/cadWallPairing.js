import { pointSegDist } from "../geometry";

const EPS=1e-6, JOIN_TOLERANCE=1/32;
const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
const onEdge=(point,edge)=>pointSegDist(point.x,point.y,edge.a.x,edge.a.y,edge.b.x,edge.b.y)<=JOIN_TOLERANCE;
const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const pairingError=()=>Error('Some wall faces could not be paired unambiguously. Review the WALLS layer in CAD before importing.');

// Pair real wall faces first. A short one-sided line may describe an end cap
// or a shared junction, but only when both ends touch already-paired walls.
// These details require explicit review; they never become guessed wall runs.
export function pairCadWallFaces(edges) {
  const outer=edges.filter(e=>e.face===99),inner=edges.filter(e=>e.face===0),used=new Set(),pairs=[],unmatched=[];
  const maxCornerWidth=Math.max(...edges.map(edge=>edge.thickness));
  for(const outside of outer) {
    const length=distance(outside.a,outside.b),ux=(outside.b.x-outside.a.x)/length,uy=(outside.b.y-outside.a.y)/length,candidates=[];
    for(const inside of inner) {
      if(inside.key!==outside.key)continue;
      let a=inside.a,b=inside.b;
      if((b.x-a.x)*ux+(b.y-a.y)*uy<0)[a,b]=[b,a];
      const lateral=p=>(p.x-outside.a.x)*(-uy)+(p.y-outside.a.y)*ux;
      const da=lateral(a),db=lateral(b),along=p=>(p.x-outside.a.x)*ux+(p.y-outside.a.y)*uy,t0=along(a),t1=along(b);
      if(Math.abs(da-db)>EPS||Math.abs(Math.abs(da)-outside.thickness)>EPS||(length>=outside.thickness&&Math.min(length,t1)-Math.max(0,t0)<EPS))continue;
      const score=Math.abs(t0)+Math.abs(t1-length);
      if(score<=maxCornerWidth*2+EPS)candidates.push({inside,a,b,score});
    }
    const available=candidates.filter(candidate=>!used.has(candidate.inside.handle)).sort((a,b)=>a.score-b.score);
    if(!available.length) {
      if(candidates.length)throw pairingError();
      unmatched.push(outside);continue;
    }
    if(available[1]&&Math.abs(available[1].score-available[0].score)<EPS)throw pairingError();
    const match=available[0];used.add(match.inside.handle);
    pairs.push({outside,inside:match.inside,a:midpoint(outside.a,match.a),b:midpoint(outside.b,match.b),polygon:[outside.a,outside.b,match.b,match.a]});
  }
  if(used.size!==inner.length)throw Error('Some inside wall faces were not paired. Conversion stopped for review.');
  const details=unmatched.map(edge=>{
    const length=distance(edge.a,edge.b);
    if(length>edge.thickness*2+JOIN_TOLERANCE)throw pairingError();
    const attachments=[edge.a,edge.b].map(point=>pairs.filter(pair=>onEdge(point,pair.outside)||onEdge(point,pair.inside)));
    // End/junction details can retain an old height or color after a wall edit.
    // Their thickness must still match an attached, completely paired wall.
    if(attachments.some(items=>!items.length)||!attachments.flat().some(pair=>Math.abs(pair.outside.thickness-edge.thickness)<EPS))throw pairingError();
    // A connector must cross at least one real wall face, rather than simply
    // continuing its direction. This rejects stray parallel wall fragments.
    const dx=(edge.b.x-edge.a.x)/length,dy=(edge.b.y-edge.a.y)/length;
    if(!attachments.flat().some(pair=>{
      const run=distance(pair.a,pair.b);
      return run>EPS&&Math.abs(dx*(pair.b.x-pair.a.x)/run+dy*(pair.b.y-pair.a.y)/run)<EPS;
    }))throw pairingError();
    return {handle:edge.handle,a:edge.a,b:edge.b,lengthInches:length,
      wallHandles:[...new Set(attachments.flat().flatMap(pair=>[pair.outside.handle,pair.inside.handle]))]};
  });
  return {pairs,details};
}

// CAD can contain genuine butt/miter ends at T intersections whose centerline
// endpoints do not coincide. Retain their cut angles only if every source end
// touches other tagged linework. An unexplained gap remains an import error.
export function cadEndCuts(pair,edges) {
  if(![pair.outside,pair.inside].every(edge=>[edge.a,edge.b].every(point=>edges.some(other=>other!==edge&&onEdge(point,other)))))return null;
  const length=distance(pair.a,pair.b),dx=(pair.b.x-pair.a.x)/length,dy=(pair.b.y-pair.a.y)/length;
  const slope=(point,center)=>{
    const x=point.x-center.x,y=point.y-center.y;
    return (x*dx+y*dy)/(-x*dy+y*dx);
  };
  const cuts={start:slope(pair.outside.a,pair.a),end:slope(pair.outside.b,pair.b)};
  return Object.values(cuts).every(value=>Number.isFinite(value)&&Math.abs(value)<=8)?cuts:null;
}
