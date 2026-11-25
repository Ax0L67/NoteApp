import {useId,useRef,type CSSProperties,type PointerEvent} from 'react';

export const canvasShapes:Record<string,string>={
 'Прямоугольник':'M5 5H95V95H5Z', 'Круг':'M50 4A46 46 0 1 1 49.99 4Z',
 'Треугольник':'M50 5L96 94H4Z','Ромб':'M50 3L97 50 50 97 3 50Z',
 'Пятиугольник':'M50 4L96 37 78 94H22L4 37Z','Шестиугольник':'M26 5H74L98 50 74 95H26L2 50Z',
 'Восьмиугольник':'M30 4H70L96 30V70L70 96H30L4 70V30Z','Звезда':'M50 4L61 36H95L67 57 78 92 50 71 22 92 33 57 5 36H39Z',
 'Сердце':'M50 92C38 82 4 59 4 29C4 4 35 -2 50 20C65 -2 96 4 96 29C96 59 62 82 50 92Z',
 'Стрелка':'M4 35H57V10L96 50 57 90V65H4Z','Стрелка в обе стороны':'M3 50L28 20V35H72V20L97 50 72 80V65H28V80Z',
 'Крест':'M35 5H65V35H95V65H65V95H35V65H5V35H35Z','Трапеция':'M24 7H76L98 93H2Z',
 'Параллелограмм':'M25 6H97L75 94H3Z','Выноска':'M4 5H96V73H60L35 95V73H4Z',
};
export type ShapePoint=[number,number,number?];
const shapeBounds:Record<string,[number,number,number,number]>={'Прямоугольник':[5,5,90,90],'Круг':[4,4,92,92],'Треугольник':[4,5,92,89],'Ромб':[3,3,94,94],'Пятиугольник':[4,4,92,90],'Шестиугольник':[2,5,96,90],'Восьмиугольник':[4,4,92,92],'Звезда':[5,4,90,88],'Стрелка':[4,10,92,80],'Стрелка в обе стороны':[3,20,94,60],'Крест':[5,5,90,90],'Трапеция':[2,7,96,86],'Параллелограмм':[3,6,94,88],'Выноска':[4,5,92,90]};
export const shapeViewBox=(name:string)=>shapeBounds[name]??[0,0,100,100];
export function shapePoints(name:string,tight=false):ShapePoint[]{
 const path=canvasShapes[name]??canvasShapes['Прямоугольник'];
 const normalize=(points:ShapePoint[])=>{if(!tight)return points;const [x,y,w,h]=shapeViewBox(name);return points.map(([px,py,r]):ShapePoint=>[(px-x)/w*100,(py-y)/h*100,r])};
 if(/[AC]/.test(path)){
  const node=document.createElementNS('http://www.w3.org/2000/svg','path');node.setAttribute('d',path);
  const length=node.getTotalLength();return normalize(Array.from({length:96},(_,i):ShapePoint=>{const p=node.getPointAtLength(length*i/96);return [p.x,p.y]}));
 }
 const tokens=path.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g)??[],points:ShapePoint[]=[];let command='',x=0,y=0;
 for(let i=0;i<tokens.length;){if(/^[A-Za-z]$/.test(tokens[i])){command=tokens[i++];if(command==='Z')break}if(command==='H')x=Number(tokens[i++]);else if(command==='V')y=Number(tokens[i++]);else{x=Number(tokens[i++]);y=Number(tokens[i++]);if(command==='M')command='L'}points.push([x,y])}
 return normalize(points);
}
export function insertShapePoint(points:ShapePoint[],point:ShapePoint,midpoint=false):ShapePoint[]{
 let best=Infinity,index=0,insert:ShapePoint=point;
 points.forEach((a,i)=>{const b=points[(i+1)%points.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1))),p:ShapePoint=[a[0]+dx*t,a[1]+dy*t],distance=Math.hypot(point[0]-p[0],point[1]-p[1]);if(distance<best){best=distance;index=i;insert=midpoint?[(a[0]+b[0])/2,(a[1]+b[1])/2]:p}});
 return [...points.slice(0,index+1),insert,...points.slice(index+1)];
}
function cornerGeometry(points:ShapePoint[],index:number,width:number,height:number){
 const p=points[index],prev=points[(index+points.length-1)%points.length],next=points[(index+1)%points.length],w=Math.max(1,width),h=Math.max(1,height);
 const ax=(prev[0]-p[0])*w/100,ay=(prev[1]-p[1])*h/100,bx=(next[0]-p[0])*w/100,by=(next[1]-p[1])*h/100,a=Math.hypot(ax,ay),b=Math.hypot(bx,by),limit=Math.min(a,b)/2;
 const ux=a?ax/a:0,uy=a?ay/a:0,vx=b?bx/b:0,vy=b?by/b:0,dx=ux+vx,dy=uy+vy,length=Math.hypot(dx,dy);
 return {w,h,ux,uy,vx,vy,dx:length?dx/length:0,dy:length?dy/length:0,limit,radius:Math.max(0,Math.min(limit,p[2]??0))};
}
export function fitShapeContour(points:ShapePoint[],rect:{x:number;y:number;width:number;height:number;rotation:number;inset:number}){
 const coords=points.map(([x,y])=>[rect.inset+x*Math.max(1,rect.width-2*rect.inset)/100,rect.inset+y*Math.max(1,rect.height-2*rect.inset)/100]),left=Math.min(...coords.map(p=>p[0])),top=Math.min(...coords.map(p=>p[1])),right=Math.max(...coords.map(p=>p[0])),bottom=Math.max(...coords.map(p=>p[1])),width=Math.max(1,right-left),height=Math.max(1,bottom-top),angle=rect.rotation*Math.PI/180,dx=left+width/2-rect.width/2,dy=top+height/2-rect.height/2;
 return {x:rect.x+rect.width/2+Math.cos(angle)*dx-Math.sin(angle)*dy-width/2,y:rect.y+rect.height/2+Math.sin(angle)*dx+Math.cos(angle)*dy-height/2,width,height,contourTight:true,shapePoints:points.map((p,i):ShapePoint=>[(coords[i][0]-left)/width*100,(coords[i][1]-top)/height*100,p[2]])};
}
export function shapeContourPath(points:ShapePoint[],width:number,height:number){
 if(!points.length)return '';
 const corners=points.map((p,i)=>{const c=cornerGeometry(points,i,width,height);return {point:p,from:[p[0]+c.ux*c.radius/c.w*100,p[1]+c.uy*c.radius/c.h*100],to:[p[0]+c.vx*c.radius/c.w*100,p[1]+c.vy*c.radius/c.h*100]}});
 return `M${corners[0].from.join(' ')}${corners.map(c=>`L${c.from.join(' ')}Q${c.point[0]} ${c.point[1]} ${c.to.join(' ')}`).join('')}Z`;
}
export function snapShapeScreenPoint(x:number,y:number,svg:SVGSVGElement,index:number,world:HTMLElement,threshold=8){
 const nodes=Array.from(svg.querySelectorAll<SVGCircleElement>('.canvas-contour-point > circle:last-child')),matrix=svg.getScreenCTM();let sx=x,sy=y,dx=threshold+1,dy=threshold+1;const own=matrix?nodes.map(node=>new DOMPoint(Number(node.getAttribute('cx')),Number(node.getAttribute('cy'))).matrixTransform(matrix)):[];
 const offerX=(value:number)=>{const d=Math.abs(value-x);if(d<=threshold&&d<dx){dx=d;sx=value}};const offerY=(value:number)=>{const d=Math.abs(value-y);if(d<=threshold&&d<dy){dy=d;sy=value}};
 own.forEach((p,i)=>{if(i!==index){offerX(p.x);offerY(p.y)}});
 const enclosing=svg.closest('.canvas-widget');for(const other of enclosing?.querySelectorAll<SVGSVGElement>('.canvas-boolean-points > svg')??[]){if(other===svg)continue;const transform=other.getScreenCTM();if(!transform)continue;for(const node of other.querySelectorAll<SVGCircleElement>('.canvas-contour-point > circle:last-child')){const p=new DOMPoint(Number(node.getAttribute('cx')),Number(node.getAttribute('cy'))).matrixTransform(transform);offerX(p.x);offerY(p.y)}}
 if(own.length>=3)for(const direction of [-1,1]){const n=own.length,near=own[(index+direction+n)%n],other=own[(index+2*direction+n*2)%n],vx=near.x-other.x,vy=near.y-other.y,den=vx*vx+vy*vy||1,t=((x-near.x)*(-vy)+(y-near.y)*vx)/den,px=near.x-vy*t,py=near.y+vx*t;if(Math.hypot(px-x,py-y)<=threshold){offerX(px);offerY(py)}}
 for(let i=0;i<own.length;i++){if(i===index||(i+1)%own.length===index)continue;const a=own[i],b=own[(i+1)%own.length],vx=b.x-a.x,vy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*vx+(y-a.y)*vy)/(vx*vx+vy*vy||1))),px=a.x+t*vx,py=a.y+t*vy;if(Math.hypot(px-x,py-y)<=threshold){offerX(px);offerY(py)}}
 const current=svg.closest('.canvas-widget');for(const item of world.querySelectorAll<HTMLElement>(':scope > .canvas-widget')){if(item===current)continue;const box=item.getBoundingClientRect();if(y>=box.top-threshold&&y<=box.bottom+threshold)for(const v of [box.left,(box.left+box.right)/2,box.right])offerX(v);if(x>=box.left-threshold&&x<=box.right+threshold)for(const v of [box.top,(box.top+box.bottom)/2,box.bottom])offerY(v)}
 return {x:sx,y:sy,snappedX:dx<=threshold,snappedY:dy<=threshold};
}
export function CanvasShape({name,fill,stroke,strokeWidth,opacity,points,radius=0,width=100,height=100,tight=false}:{name:string;fill:string;stroke:string;strokeWidth:number;opacity:number;points?:ShapePoint[];radius?:number;width?:number;height?:number;tight?:boolean}){
 const id=useId().replace(/:/g,''),w=Math.max(1,width-(tight?0:10)),h=Math.max(1,height-(tight?0:10)),r=Math.min(radius,Math.max(0,Math.min(w,h)/2)),rx=r/w*100,ry=r/h*100,path=points?.length?shapeContourPath(points,w,h):name==='Прямоугольник'&&r>0?`M${5+rx*.9} 5H${95-rx*.9}Q95 5 95 ${5+ry*.9}V${95-ry*.9}Q95 95 ${95-rx*.9} 95H${5+rx*.9}Q5 95 5 ${95-ry*.9}V${5+ry*.9}Q5 5 ${5+rx*.9} 5Z`:canvasShapes[name]??canvasShapes['Прямоугольник'];
 return <svg viewBox={tight&&!points?.length?shapeViewBox(name).join(' '):'0 0 100 100'} preserveAspectRatio="none" aria-label={name} style={{width:'100%',height:'100%',overflow:'visible'} as CSSProperties}><defs><clipPath id={id}><path d={path}/></clipPath></defs><foreignObject width="100" height="100" clipPath={`url(#${id})`} opacity={opacity/100}><div style={{width:'100%',height:'100%',background:fill}}/></foreignObject><path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity/100} vectorEffect="non-scaling-stroke"/></svg>;
}

export function ShapePointHandles({points,width,height,scale,snap,onChange,onFinish}:{points:ShapePoint[];width:number;height:number;scale:number;snap?:(x:number,y:number,index:number,svg:SVGSVGElement)=>[number,number];onChange:(points:ShapePoint[],kind:'point'|'radius')=>void;onFinish:()=>void}){
 const drag=useRef<{index:number;kind:'point'|'radius';x:number;y:number;radius:number;dx:number;dy:number;limit:number}|null>(null);
 const position=(event:PointerEvent<SVGCircleElement>,snapped=false)=>{const svg=event.currentTarget.ownerSVGElement,matrix=svg?.getScreenCTM(),[x,y]=snapped&&snap&&!event.ctrlKey&&svg?snap(event.clientX,event.clientY,drag.current?.index??0,svg):[event.clientX,event.clientY];return matrix?new DOMPoint(x,y).matrixTransform(matrix.inverse()):null};
 const move=(event:PointerEvent<SVGCircleElement>)=>{const d=drag.current,point=position(event,d?.kind==='point');if(!d||!point)return;event.stopPropagation();onChange(points.map((p,i):ShapePoint=>{if(i!==d.index)return p;if(d.kind==='point')return [point.x,point.y,p[2]];const delta=(point.x-d.x)*Math.max(1,width)/100*d.dx+(point.y-d.y)*Math.max(1,height)/100*d.dy;return [p[0],p[1],Math.round(Math.max(0,Math.min(d.limit,d.radius+delta)))]}),d.kind)};
 const finish=(event:PointerEvent<SVGCircleElement>)=>{if(!drag.current)return;event.stopPropagation();drag.current=null;onFinish()};
 return <svg className="canvas-shape-points" viewBox="0 0 100 100" preserveAspectRatio="none">{points.map((p,i)=>{const c=cornerGeometry(points,i,width,height),offset=Math.min(c.limit,Math.max(12/scale,c.radius)),x=p[0]+c.dx*offset/c.w*100,y=p[1]+c.dy*offset/c.h*100;return <g className="canvas-contour-point" key={i}>
  {c.limit>0&&Math.hypot(c.dx,c.dy)>0&&<><line className="canvas-contour-radius-area" x1={p[0]} y1={p[1]} x2={x} y2={y} vectorEffect="non-scaling-stroke"/><circle className="canvas-contour-radius" cx={x} cy={y} r="1.7" vectorEffect="non-scaling-stroke" aria-label="Изменить скругление угла" onPointerDown={event=>{const start=position(event);if(!start)return;event.preventDefault();event.stopPropagation();drag.current={index:i,kind:'radius',x:start.x,y:start.y,radius:c.radius,dx:c.dx,dy:c.dy,limit:c.limit};event.currentTarget.setPointerCapture(event.pointerId)}} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}><title>Скругление: {Math.round(c.radius)} px</title></circle></>}
  <circle cx={p[0]} cy={p[1]} r="1.7" vectorEffect="non-scaling-stroke" onPointerDown={event=>{event.preventDefault();event.stopPropagation();drag.current={index:i,kind:'point',x:0,y:0,radius:0,dx:0,dy:0,limit:0};event.currentTarget.setPointerCapture(event.pointerId)}} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onDoubleClick={event=>{event.stopPropagation();if(points.length>3){onChange(points.filter((_,index)=>index!==i),'point');onFinish()}}}/>
 </g>})}</svg>;
}

export function CornerRadiusHandles({radius,width,height,scale,onChange,onFinish}:{radius:number;width:number;height:number;scale:number;onChange:(radius:number)=>void;onFinish:()=>void}){
 const drag=useRef<{x:number;y:number;radius:number;direction:number}|null>(null),offset=Math.max(12/scale,Math.min(radius,Math.min(width,height)/2));
 return <>{(['nw','ne','sw','se'] as const).map(corner=><button key={corner} type="button" className={`canvas-radius-handle canvas-radius-${corner}`} style={{[corner.includes('n')?'top':'bottom']:offset,[corner.includes('w')?'left':'right']:offset,'--radius-handle-scale':1/scale} as CSSProperties} aria-label="Изменить скругление углов" title={`Скругление: ${Math.round(radius)} px`} onPointerDown={event=>{event.preventDefault();event.stopPropagation();drag.current={x:event.clientX,y:event.clientY,radius,direction:corner.includes('w')?1:-1};event.currentTarget.setPointerCapture(event.pointerId)}} onPointerMove={event=>{const d=drag.current;if(!d)return;event.stopPropagation();const delta=((event.clientX-d.x)*d.direction+(event.clientY-d.y)*(corner.includes('n')?1:-1))/(2*scale);onChange(Math.round(Math.max(0,Math.min(Math.min(width,height)/2,d.radius+delta))))}} onPointerUp={event=>{if(!drag.current)return;event.stopPropagation();drag.current=null;onFinish()}} onPointerCancel={()=>{drag.current=null;onFinish()}} onKeyDown={event=>{if(!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(event.key))return;event.preventDefault();event.stopPropagation();onChange(Math.max(0,Math.min(Math.min(width,height)/2,radius+(['ArrowUp','ArrowRight'].includes(event.key)?1:-1)*(event.shiftKey?10:1))));onFinish()}}/> )}</>;
}
