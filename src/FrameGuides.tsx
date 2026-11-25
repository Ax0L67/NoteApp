import './frameGuides.css';

export type FrameGuideSettings = { type: 'grid' | 'columns' | 'rows'; size: number; count: number };
type Box = { x:number; y:number; width:number; height:number };

/** Snap the edges or centre of a moving object to its frame's visible guides. */
export function snapToFrameGuides(position:{x:number;y:number}, size:{width:number;height:number}, frame:Box, guides:FrameGuideSettings, threshold:number) {
 const count=Number.isFinite(guides.count)?Math.max(1,Math.min(24,Math.round(guides.count))):4;
 const spacing=Number.isFinite(guides.size)?Math.max(4,Math.min(200,guides.size)):24;
 const axis=(start:number,length:number,objectStart:number,objectLength:number,step:number)=>{
  let delta=Infinity,line:number|null=null;
  for(const offset of [0,objectLength/2,objectLength]){
   const edge=objectStart+offset,nearest=start+Math.max(0,Math.min(Math.floor(length/step),Math.round((edge-start)/step)))*step;
   if(Math.abs(nearest-edge)<Math.abs(delta)&&Math.abs(nearest-edge)<=threshold){delta=nearest-edge;line=nearest}
  }
  return {value:objectStart+(line===null?0:delta),line};
 };
 const x=guides.type==='rows'?{value:position.x,line:null}:axis(frame.x,frame.width,position.x,size.width,guides.type==='grid'?spacing:frame.width/count);
 const y=guides.type==='columns'?{value:position.y,line:null}:axis(frame.y,frame.height,position.y,size.height,guides.type==='grid'?spacing:frame.height/count);
 return {x:x.value,y:y.value,guideX:x.line,guideY:y.line};
}

const defaults: FrameGuideSettings = { type: 'grid', size: 24, count: 4 };

export function FrameGuideControls({value, change}:{value?:FrameGuideSettings; change:(value:FrameGuideSettings|undefined)=>void}) {
 const guide=value??defaults;
 return <>
  <label className="canvas-frame-guide-toggle"><span>Направляющие</span><input type="checkbox" checked={!!value} onChange={event=>change(event.target.checked?defaults:undefined)}/></label>
  {value&&<>
   <label className="note-widget-color">Тип направляющих<select value={guide.type} onChange={event=>change({...guide,type:event.target.value as FrameGuideSettings['type']})}><option value="grid">Сетка</option><option value="columns">Столбцы</option><option value="rows">Строки</option></select></label>
   {guide.type==='grid'?<label className="note-widget-color">Шаг сетки, px<input type="number" min={4} max={200} value={guide.size} onChange={event=>{if(event.target.value)change({...guide,size:Math.max(4,Math.min(200,Number(event.target.value)))})}}/></label>:<label className="note-widget-color">Количество<input type="number" min={1} max={24} value={guide.count} onChange={event=>{if(event.target.value)change({...guide,count:Math.max(1,Math.min(24,Math.round(Number(event.target.value))))})}}/></label>}
  </>}
 </>;
}

export function FrameGuideOverlay({value}:{value?:FrameGuideSettings}) {
 if(!value)return null;
 const size=Number.isFinite(value.size)?Math.max(4,Math.min(200,value.size)):24;
 const count=Number.isFinite(value.count)?Math.max(1,Math.min(24,Math.round(value.count))):4;
 const color='color-mix(in srgb, var(--accent) 38%, transparent)';
 const vertical=`linear-gradient(to right, ${color} 1px, transparent 1px)`;
 const horizontal=`linear-gradient(to bottom, ${color} 1px, transparent 1px)`;
 return <div aria-hidden="true" className="canvas-frame-guides" style={{backgroundImage:value.type==='grid'?`${vertical}, ${horizontal}`:value.type==='columns'?vertical:horizontal,backgroundSize:value.type==='grid'?`${size}px ${size}px`:value.type==='columns'?`${100/count}% 100%`:`100% ${100/count}%`}}/>;
}
