import {useId} from 'react';
import {canvasShapes,shapeViewBox,shapeContourPath,shapePoints,insertShapePoint,ShapePointHandles,type ShapePoint} from './CanvasShapes';

export type BooleanOperation = 'union'|'subtract'|'intersect'|'exclude';
export const booleanOperationLabels:Record<BooleanOperation,string> = {union:'Объединить фигуры',subtract:'Вычесть верхние',intersect:'Пересечение',exclude:'Исключить пересечение'};
export type BooleanOperand = {id:string;kind?:string;x:number;y:number;width?:number;height?:number;text:string;shapePoints?:ShapePoint[];contourTight?:boolean};
export type BooleanShapeData<T extends BooleanOperand=BooleanOperand> = {operation:BooleanOperation;operands:T[];width:number;height:number};

export function createBooleanShape<T extends BooleanOperand>(operands:T[],operation:BooleanOperation): (T & {booleanShape:BooleanShapeData<T>}) | null {
 if(operands.length<2||operands.some(item=>item.kind!=='shape'))return null;
 const left=Math.min(...operands.map(item=>item.x)),top=Math.min(...operands.map(item=>item.y));
 const right=Math.max(...operands.map(item=>item.x+(item.width??240))),bottom=Math.max(...operands.map(item=>item.y+(item.height??180)));
 const width=right-left,height=bottom-top;
 return {...operands[0],id:crypto.randomUUID(),x:left,y:top,width,height,contourTight:true,booleanShape:{operation,width,height,operands:operands.map(item=>({...item,x:item.x-left,y:item.y-top}))}};
}

export function restoreBooleanShapes<T extends BooleanOperand>(shape:T & {booleanShape?:BooleanShapeData<T>}):T[] {
 const data=shape.booleanShape;if(!data)return [];
 const sx=(shape.width??data.width)/data.width,sy=(shape.height??data.height)/data.height;
 return data.operands.map(item=>({...item,x:shape.x+item.x*sx,y:shape.y+item.y*sy,width:Math.max(item.contourTight?1:32,(item.width??240)*sx),height:Math.max(item.contourTight?1:32,(item.height??180)*sy)}));
}
export function insertBooleanPoint<T extends BooleanOperand>(data:BooleanShapeData<T>,point:ShapePoint,midpoint=false):BooleanShapeData<T>{
 let best=Infinity,index=-1,local:ShapePoint=[0,0];
 data.operands.forEach((item,i)=>{const inset=item.contourTight?0:5,w=Math.max(1,(item.width??240)-2*inset),h=Math.max(1,(item.height??180)-2*inset),p:ShapePoint=[(point[0]-item.x-inset)/w*100,(point[1]-item.y-inset)/h*100],vertices=item.shapePoints??shapePoints(item.text,item.contourTight);vertices.forEach((a,n)=>{const b=vertices[(n+1)%vertices.length],dx=(b[0]-a[0])*w/100,dy=(b[1]-a[1])*h/100,ax=(p[0]-a[0])*w/100,ay=(p[1]-a[1])*h/100,t=Math.max(0,Math.min(1,(ax*dx+ay*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(ax-dx*t,ay-dy*t);if(d<best){best=d;index=i;local=p}})});
 if(index<0)return data;return {...data,operands:data.operands.map((item,i)=>i===index?{...item,shapePoints:insertShapePoint(item.shapePoints??shapePoints(item.text,item.contourTight),local,midpoint)}:item)};
}
export function CanvasBooleanHandles<T extends BooleanOperand>({data,scale,snap,change,finish}:{data:BooleanShapeData<T>;scale:number;snap?:(x:number,y:number,index:number,svg:SVGSVGElement)=>[number,number];change:(data:BooleanShapeData<T>)=>void;finish:()=>void}){
 return <>{data.operands.map((item,index)=>{const inset=item.contourTight?0:5,width=Math.max(1,(item.width??240)-2*inset),height=Math.max(1,(item.height??180)-2*inset);return <div key={item.id} className="canvas-boolean-points" style={{left:`${(item.x+inset)/data.width*100}%`,top:`${(item.y+inset)/data.height*100}%`,width:`${width/data.width*100}%`,height:`${height/data.height*100}%`}}><ShapePointHandles points={item.shapePoints??shapePoints(item.text,item.contourTight)} width={width} height={height} scale={scale} snap={snap} onChange={points=>change({...data,operands:data.operands.map((operand,i)=>i===index?{...operand,shapePoints:points}:operand)})} onFinish={finish}/></div>})}</>;
}

export function CanvasBooleanShape({data,fill,opacity}:{data:BooleanShapeData;fill:string;opacity:number}){
 const prefix=useId().replace(/:/g,''),w=data.width,h=data.height;
 const id=(name:string)=>`${prefix}-${name}`;
 const rect=(mask:string,color='white')=><rect x="0" y="0" width={w} height={h} fill={color} mask={`url(#${id(mask)})`}/>;
 return <svg data-canvas-boolean="" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width:'100%',height:'100%',overflow:'visible'}} aria-label={booleanOperationLabels[data.operation]}>
  <defs>
   {data.operands.map((item,index)=><mask key={index} id={id(`part${index}`)} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}>
    <svg x={item.x+(item.contourTight?0:5)} y={item.y+(item.contourTight?0:5)} width={Math.max(0,(item.width??240)-(item.contourTight?0:10))} height={Math.max(0,(item.height??180)-(item.contourTight?0:10))} viewBox={item.contourTight&&!item.shapePoints?.length?shapeViewBox(item.text).join(' '):'0 0 100 100'} preserveAspectRatio="none" overflow="visible"><path d={item.shapePoints?.length?shapeContourPath(item.shapePoints,Math.max(1,(item.width??240)-(item.contourTight?0:10)),Math.max(1,(item.height??180)-(item.contourTight?0:10))):canvasShapes[item.text]??canvasShapes['Прямоугольник']} fill="white"/></svg>
   </mask>)}
   {data.operands.map((_,index)=>index===0?<mask key={index} id={id('result0')} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}>{rect('part0')}</mask>:<g key={index}>
    {data.operation==='exclude'&&<mask id={id(`inverse${index}`)} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}><rect width={w} height={h} fill="white"/>{rect(`result${index-1}`,'black')}</mask>}
    <mask id={id(`result${index}`)} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}>
     {data.operation==='union'?<>{rect(`result${index-1}`)}{rect(`part${index}`)}</>:data.operation==='subtract'?<>{rect(`result${index-1}`)}{rect(`part${index}`,'black')}</>:data.operation==='intersect'?<g mask={`url(#${id(`part${index}`)})`}>{rect(`result${index-1}`)}</g>:<>{rect(`result${index-1}`)}{rect(`part${index}`,'black')}<g mask={`url(#${id(`inverse${index}`)})`}>{rect(`part${index}`)}</g></>}
    </mask>
   </g>)}
  </defs>
  <foreignObject width={w} height={h} opacity={opacity/100} mask={`url(#${id(`result${data.operands.length-1}`)})`}><div style={{width:'100%',height:'100%',background:fill}}/></foreignObject>
 </svg>;
}
