import {widgetJoinGroups,widgetOutline} from './widgetOutline';
import {elementGridStep,elementScale,snapGridBounded} from './gridGeometry';
import {nextNoteLayer} from './noteLayers';
import {noteInsertMenu} from './noteInsertMenu';
import {paletteDragType,readPaletteDrop} from './appearance';
import {applyTextureClass,textureById} from './textures';
import {fitWidgetContent,refreshWidgetFit} from './widgetFit';
import type {EditorView} from '@codemirror/view';

export type NoteWidgetPosition={x:number;y:number;width:number;height:number;z:number;color?:string;fill?:string;texture?:string;scale?:number;borderWidth?:number;autoSize?:boolean};
export const widgetBorderWidth=(value?:number)=>Number.isFinite(value)?Math.max(0,Math.min(8,value!)):1.5;
export function widgetBorderControls(actions:HTMLElement,get:()=>number|undefined,save:(width:number)=>void) {
  const label=document.createElement('label');label.className='note-widget-scale';label.append('Толщина обводки');
  const output=document.createElement('output'),input=document.createElement('input');
  input.type='range';input.min='0';input.max='8';input.step='.5';input.value=String(widgetBorderWidth(get()));
  output.textContent=input.value+' px';input.oninput=()=>{output.textContent=input.value+' px';};input.onchange=()=>save(Number(input.value));
  label.append(output,input);actions.append(label);
}
export const widgetSizeLimits={min:64,width:1600,height:1200};
export function tableMinimumSize(host:HTMLElement|null):[number,number] {
  const table=host?.querySelector<HTMLTableElement>('.visual-table-overflow table');
  if(!table)return [108,60];
  const rows=Array.from(table.rows);
  const height=rows.reduce((sum,row)=>sum+Math.max(30,...Array.from(row.cells,cell=>Math.ceil((cell.querySelector<HTMLElement>('.cm-content,.reading-table-cell')?.scrollHeight??30)+2))),0);
  return [Math.max(108,(rows[0]?.cells.length??1)*90),Math.max(60,height)];
}
export function widgetSizeControls(actions:HTMLElement,get:()=>{width:number;height:number},save:(size:{width:number;height:number})=>void) {
  for(const key of ['width','height'] as const){const label=document.createElement('label');label.className='note-widget-color';label.append(key==='width'?'Ширина, px':'Высота, px');const input=document.createElement('input');input.type='number';input.min='64';input.max=String(widgetSizeLimits[key]);input.step='1';input.value=String(Math.round(get()[key]));input.setAttribute('aria-label',key==='width'?'Ширина виджета':'Высота виджета');input.onchange=()=>{const value=Number(input.value);if(!Number.isFinite(value)||!input.value)return;const step=elementGridStep(actions);save({...get(),[key]:Math.max(Math.ceil(64/step)*step,Math.min(widgetSizeLimits[key],Math.round(value/step)*step))});input.value=String(Math.round(get()[key]));};label.append(input);actions.append(label);}
}

const joinedWidgets='.floating-note-text, .reading-floating-text, .note-feature-host.note-feature-widget, .visual-table-host.note-feature-widget, .note-image-box.floating-image, .reading-floating-image, .graph-annotation, .canvas-widget';
const joinFrames=new WeakSet<HTMLElement>();
const joinRoots='.cm-content,.reading,.canvas-world,.graph-canvas';
const tableWidgets='.visual-table-host,.reading-table-widget,.graph-table-annotation,.canvas-widget:has(> .canvas-widget-table)';
function joinableWidgets(root:HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(joinedWidgets)].filter(item=>
    !item.matches(tableWidgets)&&item.parentElement?.closest(joinRoots)===root&&item.getClientRects().length);
}

export function snapNoteWidgetPosition(element:HTMLElement,next:NoteWidgetPosition,root:HTMLElement,step:number):NoteWidgetPosition {
  if(element.matches(tableWidgets))return constrainNoteWidgetPosition(next,root,step);
  const scale=elementScale(root),bounds=root.getBoundingClientRect(),tolerance=Math.min(6,step*.18);
  let x=next.x,y=next.y,dx=tolerance+1,dy=tolerance+1;
  for(const peer of joinableWidgets(root)){
    if(peer===element||!peer.getClientRects().length)continue;
    const rect=peer.getBoundingClientRect(),px=(rect.left-bounds.left)/scale,py=(rect.top-bounds.top)/scale,pw=rect.width/scale,ph=rect.height/scale;
    if(Math.min(y+next.height,py+ph)-Math.max(y,py)>Math.min(step*.25,.1*Math.min(next.height,ph))){
      const left=Math.abs(x-(px+pw)),right=Math.abs(x+next.width-px);
      if(left<dx){x=px+pw;dx=left;}if(right<dx){x=px-next.width;dx=right;}
    }
    if(Math.min(x+next.width,px+pw)-Math.max(x,px)>Math.min(step*.25,.1*Math.min(next.width,pw))){
      const above=Math.abs(y-(py+ph)),below=Math.abs(y+next.height-py);
      if(above<dy){y=py+ph;dy=above;}if(below<dy){y=py-next.height;dy=below;}
    }
  }
  return constrainNoteWidgetPosition({...next,x,y},root,step);
}

export function constrainNoteWidgetPosition(next:NoteWidgetPosition,root:HTMLElement,step=elementGridStep(root)):NoteWidgetPosition {
  const available=root.clientWidth||next.width,minWidth=Math.min(64,available),width=Math.max(minWidth,Math.min(next.width,available,1600));
  return {...next,width,height:Math.max(64,Math.min(next.height,1200)),x:Math.max(0,Math.min(next.x,available-width)),y:Math.max(0,Math.min(next.y,100000))};
}

export function queueNoteWidgetJoinSync(root:HTMLElement,step:number) {
  if(joinFrames.has(root))return;joinFrames.add(root);
  requestAnimationFrame(()=>{
    joinFrames.delete(root);if(!root.isConnected)return;
    const all=[...root.querySelectorAll<HTMLElement>(joinedWidgets)].filter(item=>item.parentElement?.closest(joinRoots)===root);
    for(const item of all){
      item.removeAttribute('data-note-joined');
      item.querySelectorAll(':scope > .note-widget-join-surface').forEach(surface=>surface.remove());
    }
    const items=joinableWidgets(root),scale=elementScale(root),bounds=root.getBoundingClientRect();
    const rects=items.map(item=>{const r=item.getBoundingClientRect();return {x:(r.left-bounds.left)/scale,y:(r.top-bounds.top)/scale,width:r.width/scale,height:r.height/scale};});
    // Read the original appearance before hiding any backgrounds or borders.
    const styles=items.map(item=>{
      const s=getComputedStyle(item),graph=item.classList.contains('graph-annotation');
      const background=item.style.background||(graph?'var(--graph-note-fill)':item.classList.contains('reading-floating-image')?'transparent':'var(--panel-fill)');
      const color=item.style.borderColor||(graph?'var(--edge)':item.classList.contains('canvas-widget-active')?'color-mix(in srgb,var(--accent) 42%,var(--panel))':'color-mix(in srgb,var(--editor) 72%,var(--base))');
      return {background,color,image:item.className.includes('palette-texture-')?'var(--texture-surface)':s.backgroundImage,size:s.backgroundSize,position:s.backgroundPosition,width:parseFloat(s.borderTopWidth)||0,left:parseFloat(s.borderLeftWidth)||0,top:parseFloat(s.borderTopWidth)||0,z:parseFloat(s.zIndex)||0};
    });
    const ns='http://www.w3.org/2000/svg',padding=16;
    const svgElement=(tag:string,attrs:Record<string,string|number>={})=>{
      const element=document.createElementNS(ns,tag);
      for(const [name,value] of Object.entries(attrs))element.setAttribute(name,String(value));
      return element;
    };
    for(const group of widgetJoinGroups(rects,step)){
      group.sort((a,b)=>styles[a].z-styles[b].z||a-b);
      const path=widgetOutline(group.map(index=>rects[index]),12);
      for(const [order,index] of group.entries()){
        const item=items[index],own=rects[index],style=styles[index];
        const local=group.map(i=>({...rects[i],x:rects[i].x-own.x+padding,y:rects[i].y-own.y+padding}));
        const width=own.width+padding*2,height=own.height+padding*2,transform=`translate(${padding-own.x} ${padding-own.y})`;
        const id='widget-join-'+crypto.randomUUID();
        const svg=svgElement('svg',{width,height,'aria-hidden':'true'});
        svg.classList.add('note-widget-join-surface');
        svg.style.left=(-padding-style.left)+'px';svg.style.top=(-padding-style.top)+'px';
        const clip=svgElement('clipPath',{id:id+'-shape'});clip.append(svgElement('path',{d:path,transform}));
        // Keep each widget's fill and stacking order, including translucent backgrounds.
        const mask=svgElement('mask',{id:id+'-owner',maskUnits:'userSpaceOnUse',x:0,y:0,width,height});
        mask.append(svgElement('rect',{width,height,fill:'white'}));
        local.forEach((r,peer)=>{if(peer===order)return;const margin=peer>order?padding:0;mask.append(svgElement('rect',{x:r.x-margin,y:r.y-margin,width:r.width+margin*2,height:r.height+margin*2,fill:'black'}));});
        mask.append(svgElement('rect',{x:padding,y:padding,width:own.width,height:own.height,fill:'white'}));
        const defs=svgElement('defs');defs.append(clip,mask);svg.append(defs);
        const surface=svgElement('g',{mask:'url(#'+id+'-owner)'});
        const fill=svgElement('foreignObject',{width,height,'clip-path':'url(#'+id+'-shape)'});
        const background=document.createElement('div');background.style.cssText='width:100%;height:100%;background:'+style.background+';';
        background.style.backgroundImage=style.image;background.style.backgroundSize=style.size;background.style.backgroundPosition=style.position;
        fill.append(background);surface.append(fill);
        surface.append(svgElement('path',{d:path,transform,fill:'none',stroke:style.color,'stroke-width':style.width,'stroke-linejoin':'round'}));
        svg.append(surface);item.append(svg);item.setAttribute('data-note-joined','');
      }
    }
  });
}
// WidgetType.toDOM runs during CodeMirror updates, where reading editor layout throws.
export function defaultNoteWidgetPosition(width=420,height=260):NoteWidgetPosition {return {x:16,y:16,width,height,z:2};}

export function initialNoteWidget(view:EditorView,at:number,width=420,height=260):NoteWidgetPosition {
  const content=view.contentDOM,bounds=content.getBoundingClientRect(),coords=view.coordsAtPos(at),scale=elementScale(content),step=elementGridStep(content);
  return constrainNoteWidgetPosition({x:coords?(coords.left-bounds.left)/scale:step/2,y:coords?(coords.top-bounds.top)/scale:0,width:Math.min(width,content.clientWidth||width),height,z:nextNoteLayer(view.state.doc.toString())},content,step);
}

export function noteWidgetChrome(host:HTMLElement,view:EditorView,initial:NoteWidgetPosition,label:string,save:(position:NoteWidgetPosition)=>void,removeWidget:()=>void,editable=true,baseWidth=initial.width-52) {
  let position=constrainNoteWidgetPosition({...initial},view.contentDOM,elementGridStep(view.contentDOM));
  const viewport=document.createElement('div');viewport.className='note-widget-body widget-fit-viewport';
  const body=document.createElement('div');body.className='widget-fit-content';viewport.append(body);
  const {menu,actions,move,remove}=noteInsertMenu(`Действия: ${label}`,false);move.hidden=true;
  const heading=document.createElement('div');heading.className='note-widget-heading';heading.textContent=label;if(label==='Таблица')heading.title='Перетащите таблицу';
  host.classList.add('floating-note-text','note-feature-widget');host.contentEditable='false';host.append(heading,viewport,menu);
  const dispose=label==='Таблица'?()=>{}:fitWidgetContent(viewport,body,baseWidth,()=>position.scale??1);
  widgetSizeControls(actions,()=>position,size=>savePosition({...position,...size,...(label==='Доска задач'?{autoSize:false}:{})}));
  widgetBorderControls(actions,()=>label==='Таблица'?(position.borderWidth??1):position.borderWidth,borderWidth=>savePosition({...position,borderWidth}));
  const scaleLabel=document.createElement('label');scaleLabel.className='note-widget-scale';scaleLabel.append('Масштаб содержимого');
  const scaleOutput=document.createElement('output');
  const scaleInput=document.createElement('input');scaleInput.type='range';scaleInput.min='0';scaleInput.max='300';scaleInput.step='5';scaleInput.value=String(Math.round((position.scale??1)*100));
  scaleOutput.textContent=scaleInput.value+'%';scaleLabel.append(scaleOutput,scaleInput);actions.append(scaleLabel);
  scaleInput.oninput=()=>{position={...position,scale:Number(scaleInput.value)/100};scaleOutput.textContent=scaleInput.value+'%';refreshWidgetFit(viewport);};
  scaleInput.onchange=()=>savePosition(position);
  if(label==='Таблица')scaleLabel.remove();
  const colorAction=(labelText:string,key:'color'|'fill',fallback:string)=>{
    const label=document.createElement('label');label.className='note-widget-color';label.append(labelText);
    const input=document.createElement('input');input.type='color';input.value=position[key]??fallback;input.setAttribute('aria-label',labelText);label.append(input);actions.append(label);
    input.oninput=()=>{position={...position,[key]:input.value};place(position);};
    input.onchange=()=>savePosition(position);
    if(key==='color'){
      const reset=document.createElement('button');reset.type='button';reset.textContent='Вернуть обычный цвет рамки';
      reset.onclick=()=>{position={...position,color:undefined};input.value='#b0b0b0';place(position);savePosition(position);};actions.append(reset);
    }
  };
  colorAction('Цвет окантовки','color','#b0b0b0');colorAction('Цвет фона','fill','#2c2c2c');
  remove.onclick=()=>{if(confirm('Удалить этот виджет?'))removeWidget();};
  const handles=(['n','e','s','w','ne','nw','se','sw'] as const).map(edge=>{
    const handle=document.createElement('div');handle.className=`floating-note-resize floating-note-resize-${edge}`;handle.setAttribute('role','separator');handle.setAttribute('aria-label',edge.length===2?'Изменить размер виджета':edge==='e'||edge==='w'?'Изменить ширину виджета':'Изменить высоту виджета');handle.tabIndex=editable?0:-1;handle.hidden=!editable;host.append(handle);return {edge,handle};
  });
  function place(next:NoteWidgetPosition) {
    const bounded=constrainNoteWidgetPosition(next,view.contentDOM,elementGridStep(view.contentDOM));
    host.style.setProperty('--note-widget-border-width',(label==='Таблица'&&bounded.borderWidth===undefined?1:widgetBorderWidth(bounded.borderWidth))+'px');host.style.left=bounded.x+'px';host.style.top=bounded.y+'px';host.style.width=bounded.width+'px';host.style.height=bounded.height+'px';host.style.setProperty('--note-layer',String(bounded.z));host.style.borderColor=bounded.color??(label==='Таблица'?'color-mix(in srgb,var(--editor) 65%,var(--edge))':`color-mix(in srgb,${bounded.fill??'var(--panel)'} 72%,var(--base))`);host.style.background=bounded.fill??(label==='Таблица'?'var(--editor-fill)':'var(--panel-fill)');
    applyTextureClass(host,next.texture);
    if(next.fill)host.style.setProperty('--accent',next.fill);else host.style.removeProperty('--accent');
    queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));
  }
  function savePosition(next:NoteWidgetPosition,joining=false){const [minWidth,minHeight]=label==='Таблица'?tableMinimumSize(host):[64,64];next={...next,width:Math.max(minWidth,next.width),height:Math.max(minHeight,next.height)};position=joining?snapNoteWidgetPosition(host,next,view.contentDOM,elementGridStep(view.contentDOM)):constrainNoteWidgetPosition(next,view.contentDOM,elementGridStep(view.contentDOM));place(position);save(position);queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));}
  place(position);
  queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));
  for(const {edge,handle} of handles){
    const resized=(dx:number,dy:number)=>{
      const step=elementGridStep(view.contentDOM),available=view.contentDOM.clientWidth||position.width,[tableMinWidth,tableMinHeight]=label==='Таблица'?tableMinimumSize(host):[64,64],minWidth=Math.min(tableMinWidth,available),minHeight=tableMinHeight,width=position.width,height=position.height,next={...position};
      if(edge.includes('e'))next.width=Math.max(minWidth,Math.min(Math.min(1600,available),Math.round((width+dx)/step)*step));
      if(edge.includes('s'))next.height=Math.max(minHeight,Math.min(1200,Math.round((height+dy)/step)*step));
      if(edge.includes('w')){next.x=snapGridBounded(position.x+dx,Math.max(0,position.x+width-minWidth),step);next.width=position.x+width-next.x;}
      if(edge.includes('n')){next.y=snapGridBounded(position.y+dy,Math.max(0,position.y+height-minHeight),step);next.height=position.y+height-next.y;}
      return constrainNoteWidgetPosition(next,view.contentDOM,step);
    };
    handle.onpointerdown=event=>{
      if(event.button!==0||!editable)return;event.preventDefault();event.stopPropagation();const start={x:event.clientX,y:event.clientY},scale=elementScale(view.contentDOM);let next=position;handle.setPointerCapture(event.pointerId);
      if(label==='Таблица'&&edge.length===1){handle.onpointermove=pointer=>{if(pointer.pointerId!==event.pointerId)return;const step=elementGridStep(view.contentDOM);next={...position,x:Math.max(0,Math.round((position.x+(pointer.clientX-start.x)/scale)/step)*step),y:Math.max(0,Math.round((position.y+(pointer.clientY-start.y)/scale)/step)*step)};place(next)};handle.onpointerup=pointer=>{if(pointer.pointerId!==event.pointerId)return;handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;savePosition(next)};handle.onpointercancel=()=>{handle.onpointermove=null;handle.onpointerup=null;place(position)};return;}
      handle.onpointermove=pointer=>{if(pointer.pointerId!==event.pointerId)return;pointer.preventDefault();next=resized((pointer.clientX-start.x)/scale,(pointer.clientY-start.y)/scale);place(next);};
      handle.onpointerup=pointer=>{if(pointer.pointerId!==event.pointerId)return;handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;savePosition({...next,...(label==='Доска задач'?{autoSize:false}:{})});};
      handle.onpointercancel=()=>{handle.onpointermove=null;handle.onpointerup=null;place(position);};
    };
    handle.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();const step=elementGridStep(view.contentDOM),dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;savePosition(label==='Таблица'&&edge.length===1?{...position,x:position.x+dx,y:position.y+dy}:{...resized(dx,dy),...(label==='Доска задач'?{autoSize:false}:{})});};
  }
  host.onpointerdown=event=>{
    if(event.button!==0||!editable||(event.target instanceof Element&&event.target.closest('.note-insert-menu,.floating-note-resize,.visual-table-column-resize,.visual-table-row-resize,.visual-table-cell,.plot-widget,button,input,select,textarea,a,[draggable="true"],.task-card')))return;
    event.preventDefault();
    const start={x:event.clientX,y:event.clientY},scale=elementScale(view.contentDOM),step=elementGridStep(view.contentDOM),origin=constrainNoteWidgetPosition(position,view.contentDOM,step);let x=origin.x,y=origin.y,dragged=false;host.setPointerCapture(event.pointerId);
    host.onpointermove=pointer=>{if(pointer.pointerId!==event.pointerId)return;const dx=pointer.clientX-start.x,dy=pointer.clientY-start.y;if(!dragged&&Math.abs(dx)+Math.abs(dy)<4)return;dragged=true;host.dataset.dragging='';pointer.preventDefault();x=snapGridBounded(origin.x+dx/scale,Math.max(0,view.contentDOM.clientWidth-origin.width),step);y=snapGridBounded(origin.y+dy/scale,100000,step);const next=snapNoteWidgetPosition(host,{...origin,x,y},view.contentDOM,step);x=next.x;y=next.y;place(next);};
    host.onpointerup=pointer=>{if(pointer.pointerId!==event.pointerId)return;host.onpointermove=null;host.onpointerup=null;host.onpointercancel=null;delete host.dataset.dragging;if(dragged)savePosition({...position,x,y,z:nextNoteLayer(view.state.doc.toString())},true);};
    host.onpointercancel=()=>{host.onpointermove=null;host.onpointerup=null;host.onpointercancel=null;delete host.dataset.dragging;place(position);};
  };
  host.ondragover=event=>{if(event.dataTransfer?.types.includes(paletteDragType)){event.preventDefault();event.dataTransfer.dropEffect='copy';}};
  host.ondrop=event=>{const transfer=event.dataTransfer;if(!transfer)return;const value=readPaletteDrop(transfer.getData(paletteDragType));if(!value)return;event.preventDefault();event.stopPropagation();if(textureById(value.palette)){savePosition({...position,texture:value.palette});return;}const color=getComputedStyle(host).getPropertyValue(`--palette-color-${value.palette}`).trim();if(color&&CSS.supports('color',color))savePosition({...position,fill:color,texture:undefined});};
  return {body,actions,getPosition:()=>({...position}),place,setPosition:(next:NoteWidgetPosition)=>{position=next;place(next);},dispose};
}
