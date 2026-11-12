import { dist, lineIntersect, pointSegDist } from "../geometry";

// Close only small, unambiguous corner gaps between tagged wall faces.
// Parallel omissions and spans covered by untagged linework are left alone:
// those may intentionally exclude material from the CAD takeoff.
export function repairCadCorners(edges,excludedLines,maxGap=2) {
  const epsilon=1e-6, repairs=[];
  const endpoints=edges.flatMap(edge=>["a","b"].map(end=>({edge,end})));
  const distance=(a,b)=>dist(a.x,a.y,b.x,b.y);
  const blocked=(a,b)=>{
    const length=distance(a,b);
    if(length<epsilon)return false;
    const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
    return excludedLines.some(line=>{
      const lateral=p=>Math.abs((p.x-a.x)*uy-(p.y-a.y)*ux);
      if(lateral(line.a)<epsilon&&lateral(line.b)<epsilon) {
        const t0=(line.a.x-a.x)*ux+(line.a.y-a.y)*uy,t1=(line.b.x-a.x)*ux+(line.b.y-a.y)*uy;
        return Math.min(length,Math.max(t0,t1))-Math.max(0,Math.min(t0,t1))>epsilon;
      }
      return pointSegDist((a.x+b.x)/2,(a.y+b.y)/2,line.a.x,line.a.y,line.b.x,line.b.y)<epsilon;
    });
  };
  for(const first of endpoints) {
    const a=first.edge[first.end],opposite=first.edge[first.end==="a"?"b":"a"];
    if(endpoints.some(second=>second.edge!==first.edge&&second.edge.face===first.edge.face&&distance(a,second.edge[second.end])<epsilon))continue;
    const choices=[];
    for(const second of endpoints) {
      if(second.edge===first.edge||second.edge.face!==first.edge.face)continue;
      const b=second.edge[second.end],other=second.edge[second.end==="a"?"b":"a"];
      const gap=distance(a,b);
      if(gap>maxGap||gap<1/64)continue;
      const da={x:opposite.x-a.x,y:opposite.y-a.y},db={x:other.x-b.x,y:other.y-b.y};
      const point=lineIntersect(a,da,b,db);
      if(!point)continue;
      const moveA=distance(a,point),moveB=distance(b,point);
      if(moveA>maxGap||moveB>maxGap||blocked(a,point)||blocked(b,point))continue;
      if((opposite.x-point.x)*da.x+(opposite.y-point.y)*da.y<=epsilon
        ||(other.x-point.x)*db.x+(other.y-point.y)*db.y<=epsilon)continue;
      // Do not move a corner already attached to a third wall face.
      if(endpoints.some(third=>third.edge!==second.edge&&third.edge!==first.edge&&third.edge.face===second.edge.face&&distance(b,third.edge[third.end])<epsilon))continue;
      choices.push({second,point,gap,score:moveA+moveB});
    }
    choices.sort((a,b)=>a.score-b.score);
    if(!choices.length||(choices[1]&&Math.abs(choices[0].score-choices[1].score)<epsilon))continue;
    const {second,point,gap}=choices[0];
    repairs.push({handles:[first.edge.handle,second.edge.handle],gapInches:gap,
      before:[{...a},{...second.edge[second.end]}],after:{...point}});
    first.edge[first.end]={...point};second.edge[second.end]={...point};
  }
  return repairs;
}
