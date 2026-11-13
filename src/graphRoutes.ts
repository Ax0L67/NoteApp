import type {MapPoint} from './types';
import {snapGrid} from './gridGeometry';

type Box=MapPoint&{width:number;height:number};
type Port={anchor:MapPoint;exit:MapPoint};
type Edge={to:number;cost:number;via:MapPoint[]};
const clearance=32,attachmentGap=6;
const distance=(a:MapPoint,b:MapPoint)=>Math.abs(b.x-a.x)+Math.abs(b.y-a.y);

function crosses(a:MapPoint,b:MapPoint,box:Box) {
  if(a.x===b.x)return a.x>box.x&&a.x<box.x+box.width&&Math.max(a.y,b.y)>box.y&&Math.min(a.y,b.y)<box.y+box.height;
  return a.y>box.y&&a.y<box.y+box.height&&Math.max(a.x,b.x)>box.x&&Math.min(a.x,b.x)<box.x+box.width;
}
function simplify(points:MapPoint[]) {
  const result:MapPoint[]=[];
  for(const point of points){
    const last=result.at(-1),before=result.at(-2);
    if(last&&last.x===point.x&&last.y===point.y)continue;
    if(before&&last&&((before.x===last.x&&last.x===point.x)||(before.y===last.y&&last.y===point.y)))result.pop();
    result.push(point);
  }
  return result;
}
export function hierarchyBranchRoutes(source:Box,targets:Box[],step?:number):MapPoint[][] {
  if(!targets.length)return [];
  if(targets.length===1){
    const target=targets[0],left=Math.max(source.x,target.x),right=Math.min(source.x+source.width,target.x+target.width);
    if(right>left){
      const middle=(left+right)/2,x=step?snapGrid(middle,step):middle;
      if(x>left&&x<right)return [[{x,y:source.y+source.height},{x,y:target.y}]];
    }
  }
  const sourceY=source.y+source.height,lowestTargetY=Math.min(...targets.map(target=>target.y));
  const branchY=step?snapGrid((sourceY+lowestTargetY)/2,step):(sourceY+lowestTargetY)/2;
  const sourceX=source.x+source.width/2;
  return targets.map(target=>{
    const targetX=target.x+target.width/2;
    return simplify([{x:sourceX,y:sourceY},{x:sourceX,y:branchY},
      {x:targetX,y:branchY},{x:targetX,y:target.y}]);
  });
}
function joinNearby(points:MapPoint[],routes:MapPoint[][],clear:(a:MapPoint,b:MapPoint)=>boolean,step?:number) {
  const baseLength=points.slice(1).reduce((sum,point,index)=>sum+distance(points[index],point),0);
  let best=points,bestScore=baseLength;
  const tolerance=step?step*2.5:40,minShared=step?step:24;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],horizontal=a.y===b.y;
    if(!horizontal&&a.x!==b.x)continue;
    const low=Math.min(horizontal?a.x:a.y,horizontal?b.x:b.y),high=Math.max(horizontal?a.x:a.y,horizontal?b.x:b.y);
    for(const route of routes)for(let j=1;j<route.length;j++){
      const c=route[j-1],d=route[j],sameAxis=horizontal?c.y===d.y:c.x===d.x;
      if(!sameAxis)continue;
      const offset=horizontal?Math.abs(a.y-c.y):Math.abs(a.x-c.x);
      const start=Math.max(low,Math.min(horizontal?c.x:c.y,horizontal?d.x:d.y));
      const end=Math.min(high,Math.max(horizontal?c.x:c.y,horizontal?d.x:d.y));
      if(offset<1||offset>tolerance||end-start<minShared)continue;
      const forward=horizontal?b.x>a.x:b.y>a.y,first=forward?start:end,last=forward?end:start;
      if(forward!==(horizontal?d.x>c.x:d.y>c.y))continue;
      const branch=(coordinate:number,axis:number):MapPoint=>horizontal?{x:coordinate,y:axis}:{x:axis,y:coordinate};
      const candidate=simplify([...points.slice(0,i),branch(first,horizontal?a.y:a.x),branch(first,horizontal?c.y:c.x),branch(last,horizontal?c.y:c.x),branch(last,horizontal?a.y:a.x),...points.slice(i)]);
      const length=candidate.slice(1).reduce((sum,point,index)=>sum+distance(candidate[index],point),0);
      const score=length-(end-start)*3.5;
      if(score>=bestScore||candidate.slice(1).some((point,index)=>!clear(candidate[index],point)))continue;
      best=candidate;bestScore=score;
    }
  }
  return best;
}
function ports(box:Box,step?:number):Port[] {
  const align=(value:number)=>step?snapGrid(value,step):value;
  const gap=step?0:attachmentGap, margin=step?step*2:clearance;
  const candidates=[.5,.25,.75].flatMap(fraction=>[
    {x:align(box.x+box.width*fraction),y:box.y,dx:0,dy:-1},
    {x:box.x+box.width,y:align(box.y+box.height*fraction),dx:1,dy:0},
    {x:align(box.x+box.width*fraction),y:box.y+box.height,dx:0,dy:1},
    {x:box.x,y:align(box.y+box.height*fraction),dx:-1,dy:0},
  ]).map(({x,y,dx,dy})=>({
      anchor:{x:x+dx*gap,y:y+dy*gap},exit:{x:x+dx*margin,y:y+dy*margin},
    }));
  return candidates.filter((port,index)=>candidates.findIndex(other=>other.anchor.x===port.anchor.x&&other.anchor.y===port.anchor.y)===index);
}
export function createGraphRouter(boxes:Box[],step?:number) {
  const margin=step?step*2:clearance;
  const obstacles=boxes.map(box=>({x:box.x-margin,y:box.y-margin,width:box.width+margin*2,height:box.height+margin*2}));
  const inside=(p:MapPoint)=>obstacles.some(b=>p.x>b.x&&p.x<b.x+b.width&&p.y>b.y&&p.y<b.y+b.height);
  const clear=(a:MapPoint,b:MapPoint)=>!obstacles.some(box=>crosses(a,b,box));
  const corners=obstacles.flatMap(b=>[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}]).filter(p=>!inside(p));
  function connect(a:MapPoint,b:MapPoint,source?:Port,target?:Port) {
    const mx=step?snapGrid((a.x+b.x)/2,step):(a.x+b.x)/2,my=step?snapGrid((a.y+b.y)/2,step):(a.y+b.y)/2;
    const choices=[
      [a,{x:a.x,y:my},{x:b.x,y:my},b],
      [a,{x:mx,y:a.y},{x:mx,y:b.y},b],
      [a,{x:a.x,y:b.y},b],[a,{x:b.x,y:a.y},b],
    ];
    let best:MapPoint[]|null=null,cost=Infinity;
    for(const choice of choices){
      const path=simplify(choice);
      if(path.length<2||path.slice(1).some((p,i)=>!clear(path[i],p)))continue;
      // Enter and leave a widget outwards or at a right angle, never with a U-turn.
      if(source&&(path[1].x-a.x)*(a.x-source.anchor.x)+(path[1].y-a.y)*(a.y-source.anchor.y)<0)continue;
      const previous=path.at(-2)!;
      if(target&&(previous.x-b.x)*(b.x-target.anchor.x)+(previous.y-b.y)*(b.y-target.anchor.y)<0)continue;
      const nextCost=path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0)+(path.length-2)*12;
      if(nextCost<cost){best=path;cost=nextCost;}
    }
    return best?{via:best,cost}:null;
  }
  let shared:Edge[][]|undefined;
  const routed:MapPoint[][]=[];
  const route=(a:Box,b:Box,preferVertical=false):MapPoint[]=>{
    if(a===b)return [];
    const available=(box:Box)=>ports(box,step).filter(p=>!inside(p.exit)&&!boxes.some(other=>other!==box&&crosses(p.anchor,p.exit,other)));
    const sourcePorts=available(a),targetPorts=available(b);
    const sources=sourcePorts.length?sourcePorts:ports(a,step),targets=targetPorts.length?targetPorts:ports(b,step);
    const overlapX=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x);
    const separatedY=a.y+a.height<=b.y||b.y+b.height<=a.y;
    const dx=Math.abs(a.x+a.width/2-b.x-b.width/2),dy=Math.abs(a.y+a.height/2-b.y-b.height/2);
    const stacked=separatedY&&(overlapX>0||dy>=dx);
    const vertical=preferVertical||stacked,direction=Math.sign((b.y+b.height/2)-(a.y+a.height/2))||1;
    const verticalSources=sources.filter(port=>Math.sign(port.exit.y-port.anchor.y)===direction),verticalTargets=targets.filter(port=>Math.sign(port.exit.y-port.anchor.y)===-direction);
    const routeSources=vertical&&verticalSources.length?verticalSources:sources,routeTargets=vertical&&verticalTargets.length?verticalTargets:targets;
    const portCost=(p:Port,box:Box,other:Box)=>{
      const dx=other.x+other.width/2-box.x-box.width/2,dy=other.y+other.height/2-box.y-box.height/2;
      const preferY=vertical||Math.abs(dy)>=(box.height+other.height)/2+24;
      const facing=Math.sign(preferY?p.exit.y-p.anchor.y:p.exit.x-p.anchor.x)*Math.sign(preferY?dy:dx);
      const offset=Math.abs(preferY?p.anchor.x-(box.x+box.width/2):p.anchor.y-(box.y+box.height/2))*2;
      return (facing>0?0:facing===0?96:192)+offset;
    };
    const starts=routeSources.map(p=>portCost(p,a,b)),ends=routeTargets.map(p=>portCost(p,b,a));
    let bestDirect:MapPoint[]|undefined,bestDirectCost=Infinity;
    for(let i=0;i<routeSources.length;i++)for(let j=0;j<routeTargets.length;j++){
      const path=connect(routeSources[i].exit,routeTargets[j].exit,routeSources[i],routeTargets[j]);
      if(!path)continue;
      const cost=path.cost+starts[i]+ends[j];
      if(cost<bestDirectCost){bestDirect=simplify([routeSources[i].anchor,...path.via,routeTargets[j].anchor]);bestDirectCost=cost;}
    }
    if(bestDirect)return bestDirect;
    if(!shared){
      shared=corners.map(()=>[]);
      for(let i=0;i<corners.length;i++)for(let j=i+1;j<corners.length;j++){
        const path=connect(corners[i],corners[j]);
        if(!path)continue;
        shared[i].push({to:j,...path});shared[j].push({to:i,cost:path.cost,via:[...path.via].reverse()});
      }
    }
    const targetStart=corners.length+routeSources.length;
    const points=[...corners,...routeSources.map(p=>p.exit),...routeTargets.map(p=>p.exit)];
    const edges=shared.map(list=>[...list]);
    for(let i=corners.length;i<points.length;i++){
      edges.push([]);
      for(let j=0;j<i;j++){
        const source=i<targetStart?routeSources[i-corners.length]:undefined;
        const target=i>=targetStart?routeTargets[i-targetStart]:undefined;
        if(source){
          const path=connect(points[i],points[j],source);
          if(path)edges[i].push({to:j,...path});
        }else {
          const from=j>=corners.length&&j<targetStart?routeSources[j-corners.length]:undefined;
          const path=connect(points[j],points[i],from,target);
          if(path)edges[j].push({to:i,via:path.via,cost:path.cost+ends[i-targetStart]});
        }
      }
    }
    const costs=points.map(()=>Infinity),previous:(Edge&{from:number}|undefined)[]=points.map(()=>undefined),visited=new Set<number>();
    for(let i=corners.length;i<targetStart;i++)costs[i]=starts[i-corners.length];
    while(visited.size<points.length){
      let current=-1;
      for(let i=0;i<points.length;i++)if(!visited.has(i)&&(current<0||costs[i]<costs[current]))current=i;
      if(current<0||!Number.isFinite(costs[current]))break;
      if(current>=targetStart){
        const path=[routeTargets[current-targetStart].anchor];
        while(previous[current]){const edge=previous[current]!;path.unshift(...edge.via);current=edge.from;}
        return simplify([routeSources[current-corners.length].anchor,...path]);
      }
      visited.add(current);
      for(const edge of edges[current])if(costs[current]+edge.cost<costs[edge.to]){costs[edge.to]=costs[current]+edge.cost;previous[edge.to]={...edge,from:current};}
    }
    let fallback:MapPoint[]|undefined,bestCost=Infinity;
    const minX=Math.min(...obstacles.map(box=>box.x))-margin*2,maxX=Math.max(...obstacles.map(box=>box.x+box.width))+margin*2;
    const minY=Math.min(...obstacles.map(box=>box.y))-margin*2,maxY=Math.max(...obstacles.map(box=>box.y+box.height))+margin*2;
    for(let i=0;i<routeSources.length;i++)for(let j=0;j<routeTargets.length;j++){
      for(const lane of [
        [{x:routeSources[i].exit.x,y:minY},{x:routeTargets[j].exit.x,y:minY}],
        [{x:routeSources[i].exit.x,y:maxY},{x:routeTargets[j].exit.x,y:maxY}],
        [{x:minX,y:routeSources[i].exit.y},{x:minX,y:routeTargets[j].exit.y}],
        [{x:maxX,y:routeSources[i].exit.y},{x:maxX,y:routeTargets[j].exit.y}],
      ]){
        const middle=simplify([routeSources[i].exit,...lane,routeTargets[j].exit]);
        if(middle.slice(1).some((point,index)=>!clear(middle[index],point)))continue;
        const candidate=simplify([routeSources[i].anchor,...middle,routeTargets[j].anchor]);
        const cost=candidate.slice(1).reduce((sum,point,index)=>sum+distance(candidate[index],point),0)+starts[i]+ends[j];
        if(cost<bestCost){fallback=candidate;bestCost=cost;}
      }
    }
    if(fallback)return fallback;
    return [];
  };
  return (a:Box,b:Box,vertical=false):MapPoint[]=>{
    const points=route(a,b,vertical);
    if(points.length<2)return points;
    const joined=points.length===2?points:joinNearby(points,routed,clear,step);
    routed.push(joined);
    return joined;
  };
}
export function graphRoutePath(points:MapPoint[],_boxes:Box[]=[],step?:number) {
  if(points.length<2)return '';
  let path=`M${points[0].x} ${points[0].y}`;
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1],before=distance(a,b),after=distance(b,c);
    if(!before||!after)continue;
    const radius=Math.min(step?step*1.25:64,before/2,after/2);
    path+=`L${b.x+(a.x-b.x)*radius/before} ${b.y+(a.y-b.y)*radius/before}Q${b.x} ${b.y} ${b.x+(c.x-b.x)*radius/after} ${b.y+(c.y-b.y)*radius/after}`;
  }
  const last=points.at(-1)!;
  return path+`L${last.x} ${last.y}`;
}
