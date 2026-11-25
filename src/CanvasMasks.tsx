import {canvasShapes,shapeContourPath,shapeViewBox,type ShapePoint} from './CanvasShapes';

type MaskObject={id:string;x:number;y:number;width?:number;height?:number;kind?:string;text:string;radius?:number;shapePoints?:ShapePoint[];contourTight?:boolean;maskId?:string};
export const canvasMaskId=(id:string)=>`canvas-mask-${id.replace(/[^a-zA-Z0-9_-]/g,'-')}`;

export function CanvasMasks({widgets}:{widgets:MaskObject[]}){
 const byId=new Map(widgets.map(item=>[item.id,item]));
 return <svg className="canvas-strokes" aria-hidden="true"><defs>{widgets.map(target=>{const source=target.maskId?byId.get(target.maskId):undefined;if(!source||source.kind!=='shape'&&source.kind!=='frame')return null;const width=source.width??300,height=source.height??140,x=source.x-target.x,y=source.y-target.y,inset=source.contourTight?0:5,w=Math.max(1,width-inset*2),h=Math.max(1,height-inset*2),path=source.shapePoints?.length?shapeContourPath(source.shapePoints,w,h):canvasShapes[source.text]??canvasShapes['Прямоугольник'];
  const [vx,vy,vw,vh]=source.contourTight&&!source.shapePoints?.length?shapeViewBox(source.text):[0,0,100,100];
  return <clipPath key={target.id} id={canvasMaskId(target.id)} clipPathUnits="userSpaceOnUse">{source.kind==='frame'?<rect x={x} y={y} width={width} height={height} rx={source.radius??0}/>:source.text==='Прямоугольник'&&!source.shapePoints&&source.radius?<rect x={x+inset+(5-vx)*w/vw} y={y+inset+(5-vy)*h/vh} width={90*w/vw} height={90*h/vh} rx={source.radius*.9}/>:<path d={path} transform={`translate(${x+inset-vx*w/vw} ${y+inset-vy*h/vh}) scale(${w/vw} ${h/vh})`}/>}</clipPath>;
 })}</defs></svg>;
}
