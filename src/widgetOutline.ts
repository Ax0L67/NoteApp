export type WidgetRect={x:number;y:number;width:number;height:number};
export function widgetOutline(rects:WidgetRect[],radius=16,squareBottom=false):string {
 const normalize=(values:number[])=>{const stops:number[]=[];for(const value of values.sort((a,b)=>a-b))if(!stops.length||value-stops[stops.length-1]>2)stops.push(value);return (value:number)=>stops.find(stop=>Math.abs(value-stop)<=2)??value;};
 const nx=normalize(rects.flatMap(r=>[r.x,r.x+r.width])),ny=normalize(rects.flatMap(r=>[r.y,r.y+r.height]));
 rects=rects.map(r=>({x:nx(r.x),y:ny(r.y),width:nx(r.x+r.width)-nx(r.x),height:ny(r.y+r.height)-ny(r.y)}));
 const xs=[...new Set(rects.flatMap(r=>[r.x,r.x+r.width]))].sort((a,b)=>a-b),ys=[...new Set(rects.flatMap(r=>[r.y,r.y+r.height]))].sort((a,b)=>a-b);
 const filled=(x:number,y:number)=>x>=0&&y>=0&&x<xs.length-1&&y<ys.length-1&&rects.some(r=>(xs[x]+xs[x+1])/2>=r.x&&(xs[x]+xs[x+1])/2<r.x+r.width&&(ys[y]+ys[y+1])/2>=r.y&&(ys[y]+ys[y+1])/2<r.y+r.height);
 type Point=[number,number];const edges=new Map<string,Point[]>(),key=(p:Point)=>p.join(',');
 const add=(a:Point,b:Point)=>{const list=edges.get(key(a))??[];list.push(b);edges.set(key(a),list);};
 for(let x=0;x<xs.length-1;x++)for(let y=0;y<ys.length-1;y++)if(filled(x,y)){const l=xs[x],r=xs[x+1],t=ys[y],b=ys[y+1];if(!filled(x,y-1))add([l,t],[r,t]);if(!filled(x+1,y))add([r,t],[r,b]);if(!filled(x,y+1))add([r,b],[l,b]);if(!filled(x-1,y))add([l,b],[l,t]);}
 const paths:string[]=[];
 while(edges.size){const start=edges.keys().next().value!,points:Point[]=[start.split(',').map(Number) as Point];let current=start;
 do{const list=edges.get(current);if(!list?.length)break;const next=list.pop()!;if(!list.length)edges.delete(current);current=key(next);if(current!==start)points.push(next);}while(current!==start);
 const corners=points.filter((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0]);});
 if(corners.length<3)continue;
 const rounded=corners.map((p,i)=>{const a=corners[(i+corners.length-1)%corners.length],b=corners[(i+1)%corners.length],before=Math.hypot(p[0]-a[0],p[1]-a[1]),after=Math.hypot(p[0]-b[0],p[1]-b[1]),r=squareBottom&&p[1]===ys[ys.length-1]?0:Math.min(radius,before/2,after/2);return {r,sweep:(p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0])>0?1:0,entry:[p[0]+(a[0]-p[0])*r/before,p[1]+(a[1]-p[1])*r/before],exit:[p[0]+(b[0]-p[0])*r/after,p[1]+(b[1]-p[1])*r/after]};});
 paths.push('M'+rounded[0].entry.join(' ')+rounded.map(c=>'L'+c.entry.join(' ')+'A'+c.r+' '+c.r+' 0 0 '+c.sweep+' '+c.exit.join(' ')).join('')+'Z');
 }
 return paths.join('');
}
