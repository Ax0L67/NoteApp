/** Geometry helpers for canvas guides, in canvas coordinates. */
export type CanvasBox={x:number;y:number;width:number;height:number};
export function snapEqualSpacing(position:{x:number;y:number},size:{width:number;height:number},others:CanvasBox[],threshold:number){
 const result={x:position.x,y:position.y,guideX:null as number|null,guideY:null as number|null};
 for(const [axis,length,cross,crossLength] of [['x','width','y','height'],['y','height','x','width']] as const){
  const items=others.filter(box=>box[cross]<position[cross]+size[crossLength]&&box[cross]+box[crossLength]>position[cross]).sort((a,b)=>a[axis]-b[axis]);let best=threshold+1;
  const offer=(value:number,guide:number)=>{const delta=Math.abs(value-position[axis]);if(delta<=threshold&&delta<best){best=delta;result[axis]=value;result[axis==='x'?'guideX':'guideY']=guide}};
  for(let i=1;i<items.length;i++){const a=items[i-1],b=items[i],gap=b[axis]-a[axis]-a[length];if(gap<0)continue;offer(b[axis]+b[length]+gap,b[axis]+b[length]);offer(a[axis]-gap-size[length],a[axis]);const middle=(b[axis]-a[axis]-a[length]-size[length])/2;if(middle>=0)offer(a[axis]+a[length]+middle,a[axis]+a[length])}
 }
 return result;
}
export function equalSpacingLines(moving:CanvasBox,others:CanvasBox[],threshold:number){
 const lines:{x1:number;y1:number;x2:number;y2:number;gap:number}[]=[];
 for(const [axis,length,cross,crossLength] of [['x','width','y','height'],['y','height','x','width']] as const){
  const row=[moving,...others.filter(box=>box[cross]<moving[cross]+moving[crossLength]&&box[cross]+box[crossLength]>moving[cross])].sort((a,b)=>a[axis]-b[axis]);const index=row.indexOf(moving);
  for(const i of [index-2,index-1,index]){if(i<0||i+2>=row.length)continue;const [a,b,c]=row.slice(i,i+3),first=b[axis]-a[axis]-a[length],second=c[axis]-b[axis]-b[length];if(first<0||second<0||Math.abs(first-second)>threshold)continue;const center=moving[cross]+moving[crossLength]/2;for(const [start,end] of [[a[axis]+a[length],b[axis]],[b[axis]+b[length],c[axis]]])lines.push(axis==='x'?{x1:start,y1:center,x2:end,y2:center,gap:end-start}:{x1:center,y1:start,x2:center,y2:end,gap:end-start});break}
 }
 return lines;
}
export function snapCanvasFrameSpacing(position:{x:number;y:number},size:{width:number;height:number},frame:CanvasBox,others:CanvasBox[],threshold:number){
 const axis=(key:'x'|'y',length:'width'|'height')=>{
  const original=position[key],extent=size[length],lo=frame[key],hi=lo+frame[length];
  const crossKey=key==='x'?'y':'x',crossLength=length==='width'?'height':'width';
  const objects=others.filter(box=>box[key]>=lo&&box[key]+box[length]<=hi&&box[crossKey]<position[crossKey]+size[crossLength]&&box[crossKey]+box[crossLength]>position[crossKey]).sort((a,b)=>a[key]-b[key]);
  const gaps:number[]=others.flatMap(box=>[box.x-frame.x,frame.x+frame.width-box.x-box.width,box.y-frame.y,frame.y+frame.height-box.y-box.height]).filter(gap=>gap>=0);
  for(let i=1;i<objects.length;i++){const gap=objects[i][key]-(objects[i-1][key]+objects[i-1][length]);if(gap>=0)gaps.push(gap)}
  if(objects.length){gaps.push(Math.max(0,objects[0][key]-lo),Math.max(0,hi-objects[objects.length-1][key]-objects[objects.length-1][length]))}
  let best=original,distance=threshold+1,guide:number|null=null;
  const offer=(candidate:number,mark:number)=>{const delta=Math.abs(candidate-original);if(candidate>=lo&&candidate+extent<=hi&&delta<=threshold&&delta<distance){best=candidate;distance=delta;guide=mark}};
  offer(lo+(hi-lo-extent)/2,lo+(hi-lo)/2);
  for(const gap of gaps){offer(lo+gap,lo);offer(hi-gap-extent,hi);for(const box of objects){offer(box[key]+box[length]+gap,box[key]+box[length]);offer(box[key]-gap-extent,box[key])}}
  for(let i=1;i<objects.length;i++){const first=objects[i-1],second=objects[i],gap=(second[key]-first[key]-first[length]-extent)/2;if(gap>=0)offer(first[key]+first[length]+gap,first[key]+first[length])}
  return {value:best,guide};
 };
 const x=axis('x','width'),y=axis('y','height');return {x:x.value,y:y.value,guideX:x.guide,guideY:y.guide};
}
/** Snap a line endpoint to edges or center of nearby objects. */
export function snapCanvasLinePoint(point:[number,number],boxes:CanvasBox[],threshold:number){
 let x=point[0],y=point[1],dx=threshold+1,dy=threshold+1;let guideX:number|null=null,guideY:number|null=null;
 for(const box of boxes){if(point[1]>=box.y-threshold&&point[1]<=box.y+box.height+threshold)for(const candidate of [box.x,box.x+box.width/2,box.x+box.width]){const d=Math.abs(candidate-point[0]);if(d<=threshold&&d<dx){dx=d;x=candidate;guideX=candidate}}if(point[0]>=box.x-threshold&&point[0]<=box.x+box.width+threshold)for(const candidate of [box.y,box.y+box.height/2,box.y+box.height]){const d=Math.abs(candidate-point[1]);if(d<=threshold&&d<dy){dy=d;y=candidate;guideY=candidate}}}
 return {point:[x,y] as [number,number],guideX,guideY};
}
