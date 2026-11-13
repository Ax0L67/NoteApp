import {widgetOutline} from './widgetOutline';
import {elementGridStep,elementScale,snapGridBounded} from './gridGeometry';
import {nextNoteLayer} from './noteLayers';
import {noteInsertMenu} from './noteInsertMenu';
import {paletteDragType,readPaletteDrop} from './appearance';
import {applyTextureClass,textureById} from './textures';
import {fitWidgetContent,refreshWidgetFit} from './widgetFit';
import type {EditorView} from '@codemirror/view';

export type NoteWidgetPosition={x:number;y:number;width:number;height:number;z:number;color?:string;fill?:string;texture?:string;scale?:number;borderWidth?:number};
export const widgetBorderWidth=(value?:number)=>Number.isFinite(value)?Math.max(0,Math.min(8,value!)):1.5;
export function widgetBorderControls(actions:HTMLElement,get:()=>number|undefined,save:(width:number)=>void) {
  const label=document.createElement('label');label.className='note-widget-scale';label.append('Толщина обводки');
  const output=document.createElement('output'),input=document.createElement('input');
  input.type='range';input.min='0';input.max='8';input.step='.5';input.value=String(widgetBorderWidth(get()));
  output.textContent=input.value+' px';input.oninput=()=>{output.textContent=input.value+' px';};input.onchange=()=>save(Number(input.value));
  label.append(output,input);actions.append(label);
}
export const widgetSizeLimits={min:64,width:1600,height:1200};
export function widgetSizeControls(actions:HTMLElement,get:()=>{width:number;height:number},save:(size:{width:number;height:number})=>void) {
 for(const key of ['width','height'] as const){const label=document.createElement('label');label.className='note-widget-color';label.append(key==='width'?'Ширина, px':'Высота, px');const input=document.createElement('input');input.type='number';input.min='64';input.max=String(widgetSizeLimits[key]);input.step='1';input.value=String(Math.round(get()[key]));input.setAttribute('aria-label',key==='width'?'Ширина виджета':'Высота виджета');input.onchange=()=>{const value=Number(input.value);if(!Number.isFinite(value)||!input.value)return;save({...get(),[key]:Math.max(64,Math.min(widgetSizeLimits[key],value))});input.value=String(Math.round(get()[key]));};label.append(input);actions.append(label);}
}

const joinedWidgets='.floating-note-text, .reading-floating-text, .note-feature-host.note-feature-widget, .visual-table-host.note-feature-widget, .note-image-box.floating-image, .graph-annotation';
const joinFrames=new WeakSet<HTMLElement>();

export function snapNoteWidgetPosition(element:HTMLElement,next:NoteWidgetPosition,root:HTMLElement,step:number):NoteWidgetPosition {
  const scale=elementScale(root),bounds=root.getBoundingClientRect(),tolerance=Math.min(6,step*.18);
  let x=next.x,y=next.y,dx=tolerance+1,dy=tolerance+1;
  for(const peer of root.querySelectorAll<HTMLElement>(joinedWidgets)){
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
    root.querySelectorAll('.note-widget-group-outline').forEach(outline=>outline.remove());
    const scale=elementScale(root),items=[...root.querySelectorAll<HTMLElement>(joinedWidgets)].filter(item=>item.getClientRects().length);
    type Side='left'|'right'|'top'|'bottom';
    const mark=(item:HTMLElement,side:Side)=>item.setAttribute(`data-note-join-${side}`,'');
    const mask=(item:HTMLElement,side:Side,start:number,length:number)=>{
      const element=document.createElement('span');element.className='note-widget-join-mask';element.dataset.edge=side;element.setAttribute('aria-hidden','true');item.append(element);
      const color=getComputedStyle(item).backgroundColor;
      element.style.backgroundColor=color==='rgba(0, 0, 0, 0)'?'var(--editor)':color;
      if(side==='left'||side==='right'){element.style.top=`${start}px`;element.style.height=`${length}px`;element.style.width='2px';element.style.left=side==='left'?'-1px':'auto';element.style.right=side==='right'?'-1px':'auto';}
      else {element.style.left=`${start}px`;element.style.width=`${length}px`;element.style.height='2px';element.style.top=side==='top'?'-1px':'auto';element.style.bottom=side==='bottom'?'-1px':'auto';}
    };
    for(const item of items){
      item.removeAttribute('data-note-joined');
      for(const side of ['left','right','top','bottom'] as const)item.removeAttribute(`data-note-join-${side}`);
      for(const corner of ['tl','tr','bl','br'])item.removeAttribute(`data-note-square-${corner}`);
      for(const element of item.querySelectorAll<HTMLElement>(':scope > .note-widget-join-mask'))element.remove();
      for(const element of item.querySelectorAll<HTMLElement>(':scope > .note-widget-join-corner'))element.remove();
    }
    const coversSide=(own:DOMRect,other:DOMRect,side:'left'|'right'|'top'|'bottom')=>{
      if(side==='left'||side==='right'){
        const edge=side==='left'?own.left:own.right;
        return other.top<=own.top&&other.bottom>=own.bottom&&other.left<edge&&other.right>edge;
      }
      const edge=side==='top'?own.top:own.bottom;
      return other.left<=own.left&&other.right>=own.right&&other.top<edge&&other.bottom>edge;
    };
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const a=items[i].getBoundingClientRect(),b=items[j].getBoundingClientRect(),tolerance=Math.max(1,2*scale);
      const overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left),overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
      const contains=(outer:DOMRect,inner:DOMRect)=>outer.left<=inner.left&&outer.top<=inner.top&&outer.right>=inner.right&&outer.bottom>=inner.bottom;
      if(overlapX>tolerance&&overlapY>tolerance){
        items[i].setAttribute('data-note-joined','');items[j].setAttribute('data-note-joined','');
        const containsA=contains(a,b),containsB=contains(b,a);
        if(containsA||containsB){const inner=containsA&&!containsB?items[j]:items[i];for(const side of ['left','right','top','bottom'] as const)mark(inner,side);continue;}
        const horizontal=overlapX<=overlapY,ac=horizontal?(a.left+a.right)/2:(a.top+a.bottom)/2,bc=horizontal?(b.left+b.right)/2:(b.top+b.bottom)/2;
        const sideA=horizontal?(ac<bc?'right':'left'):(ac<bc?'bottom':'top'),sideB=horizontal?(ac<bc?'left':'right'):(ac<bc?'top':'bottom');
        if(coversSide(a,b,sideA))mark(items[i],sideA);
        else if(horizontal)mask(items[i],sideA,(Math.max(a.top,b.top)-a.top)/scale,overlapY/scale);
        else mask(items[i],sideA,(Math.max(a.left,b.left)-a.left)/scale,overlapX/scale);
        if(coversSide(b,a,sideB))mark(items[j],sideB);
        else if(horizontal)mask(items[j],sideB,(Math.max(a.top,b.top)-b.top)/scale,overlapY/scale);
        else mask(items[j],sideB,(Math.max(a.left,b.left)-b.left)/scale,overlapX/scale);
      }else{
        const vertical=overlapY>Math.min(step*scale*.25,.1*Math.min(a.height,b.height)),horizontal=overlapX>Math.min(step*scale*.25,.1*Math.min(a.width,b.width));
        const alignedY=Math.abs(a.top-b.top)<=tolerance&&Math.abs(a.bottom-b.bottom)<=tolerance,alignedX=Math.abs(a.left-b.left)<=tolerance&&Math.abs(a.right-b.right)<=tolerance;
        const join=(first:HTMLElement,firstRect:DOMRect,sideA:Side,second:HTMLElement,secondRect:DOMRect,sideB:Side,from:number,to:number,axis:'x'|'y',full:boolean)=>{
          first.setAttribute('data-note-joined','');second.setAttribute('data-note-joined','');
          if(full){mark(first,sideA);mark(second,sideB);return;}
          const square=(item:HTMLElement,rect:DOMRect,side:Side)=>{
            const begin=axis==='y'?rect.top:rect.left,end=axis==='y'?rect.bottom:rect.right;
            const corners=side==='left'?['tl','bl']:side==='right'?['tr','br']:side==='top'?['tl','tr']:['bl','br'];
            if(Math.abs(from-begin)<=tolerance)item.setAttribute(`data-note-square-${corners[0]}`,'');
            if(Math.abs(to-end)<=tolerance)item.setAttribute(`data-note-square-${corners[1]}`,'');
          };
          square(first,firstRect,sideA);square(second,secondRect,sideB);
          const curve=(item:HTMLElement,rect:DOMRect,other:DOMRect,side:Side)=>{
            const begin=axis==='y'?rect.top:rect.left,end=axis==='y'?rect.bottom:rect.right;
            const otherBegin=axis==='y'?other.top:other.left,otherEnd=axis==='y'?other.bottom:other.right;
            const add=(start:boolean)=>{
              const available=(start?from-otherBegin:otherEnd-to)/scale;
              const radius=Math.min(16,available,(to-from)/scale/2);
              if(radius<2)return;
              const curve=document.createElement('span');curve.className='note-widget-join-corner';curve.setAttribute('aria-hidden','true');
              curve.style.width=curve.style.height=`${radius}px`;
              let center:string;
              if(axis==='y'){
                curve.style[side==='left'?'left':'right']='0';curve.style[start?'top':'bottom']=`-${radius}px`;
                center=`${side==='left'?'100%':'0%'} ${start?'0%':'100%'}`;
              }else{
                curve.style[side==='top'?'top':'bottom']='0';curve.style[start?'left':'right']=`-${radius}px`;
                center=`${start?'0%':'100%'} ${side==='top'?'100%':'0%'}`;
              }
              const style=getComputedStyle(item),fill=style.backgroundColor==='rgba(0, 0, 0, 0)'?'var(--editor)':style.backgroundColor;
              curve.style.background=`radial-gradient(circle at ${center}, transparent ${radius-.5}px, ${fill} ${radius+.5}px)`;
              item.append(curve);
            };
            if(Math.abs(from-begin)<=tolerance&&from>otherBegin+tolerance)add(true);
            if(Math.abs(to-end)<=tolerance&&to<otherEnd-tolerance)add(false);
          };
          curve(first,firstRect,secondRect,sideA);curve(second,secondRect,firstRect,sideB);
          const firstStart=(from-(axis==='y'?firstRect.top:firstRect.left))/scale,secondStart=(from-(axis==='y'?secondRect.top:secondRect.left))/scale,length=(to-from)/scale;
          mask(first,sideA,firstStart,length);mask(second,sideB,secondStart,length);
        };
        if(vertical&&Math.abs(a.right-b.left)<=tolerance)join(items[i],a,'right',items[j],b,'left',Math.max(a.top,b.top),Math.min(a.bottom,b.bottom),'y',alignedY);
        else if(vertical&&Math.abs(b.right-a.left)<=tolerance)join(items[j],b,'right',items[i],a,'left',Math.max(a.top,b.top),Math.min(a.bottom,b.bottom),'y',alignedY);
        if(horizontal&&Math.abs(a.bottom-b.top)<=tolerance)join(items[i],a,'bottom',items[j],b,'top',Math.max(a.left,b.left),Math.min(a.right,b.right),'x',alignedX);
        else if(horizontal&&Math.abs(b.bottom-a.top)<=tolerance)join(items[j],b,'bottom',items[i],a,'top',Math.max(a.left,b.left),Math.min(a.right,b.right),'x',alignedX);
      }
    }
    const joined=items.filter(item=>item.hasAttribute('data-note-joined'));
    if(joined.length){const bounds=root.getBoundingClientRect(),rects=joined.map(item=>{const r=item.getBoundingClientRect();return {x:(r.left-bounds.left)/scale,y:(r.top-bounds.top)/scale,width:r.width/scale,height:r.height/scale};});
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('note-widget-group-outline');svg.setAttribute('aria-hidden','true');svg.style.cssText='position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:1000000001;width:100%;height:100%;';
      const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',widgetOutline(rects));path.setAttribute('fill','none');path.setAttribute('stroke','none');path.setAttribute('stroke-width','1.5');path.setAttribute('stroke-linejoin','round');svg.append(path);
      joined.forEach((item,index)=>{const color=item.style.borderColor,width=getComputedStyle(item).borderTopWidth||'1.5px';const r=rects[index],id='widget-outline-'+crypto.randomUUID(),clip=document.createElementNS(svg.namespaceURI,'clipPath'),rect=document.createElementNS(svg.namespaceURI,'rect');clip.setAttribute('id',id);rect.setAttribute('x',String(r.x-16));rect.setAttribute('y',String(r.y-16));rect.setAttribute('width',String(r.width+32));rect.setAttribute('height',String(r.height+32));clip.append(rect);svg.append(clip);const colored=path.cloneNode() as SVGPathElement;colored.setAttribute('stroke',color.startsWith('#')||color.startsWith('rgb')?color:'var(--edge)');colored.setAttribute('stroke-width',String(parseFloat(width)));colored.setAttribute('clip-path','url(#'+id+')');svg.append(colored);});
      const owner=joined.reduce((a,b)=>Number(getComputedStyle(a).zIndex||0)>Number(getComputedStyle(b).zIndex||0)?a:b),ownerRect=owner.getBoundingClientRect();svg.style.left=`${-(ownerRect.left-bounds.left)/scale-owner.clientLeft}px`;svg.style.top=`${-(ownerRect.top-bounds.top)/scale-owner.clientTop}px`;owner.append(svg);
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
  host.classList.add('floating-note-text','note-feature-widget');host.contentEditable='false';host.append(viewport,menu);
  const dispose=fitWidgetContent(viewport,body,baseWidth,()=>position.scale??1);
  widgetSizeControls(actions,()=>position,size=>savePosition({...position,...size}));
  widgetBorderControls(actions,()=>position.borderWidth,borderWidth=>savePosition({...position,borderWidth}));
  const scaleLabel=document.createElement('label');scaleLabel.className='note-widget-scale';scaleLabel.append('Масштаб содержимого');
  const scaleOutput=document.createElement('output');
  const scaleInput=document.createElement('input');scaleInput.type='range';scaleInput.min='50';scaleInput.max='150';scaleInput.step='10';scaleInput.value=String(Math.round((position.scale??1)*100));
  scaleOutput.textContent=scaleInput.value+'%';scaleLabel.append(scaleOutput,scaleInput);actions.append(scaleLabel);
  scaleInput.oninput=()=>{position={...position,scale:Number(scaleInput.value)/100};scaleOutput.textContent=scaleInput.value+'%';refreshWidgetFit(viewport);};
  scaleInput.onchange=()=>savePosition(position);
  const colorAction=(labelText:string,key:'color'|'fill',fallback:string)=>{
    const label=document.createElement('label');label.className='note-widget-color';label.append(labelText);
    const input=document.createElement('input');input.type='color';input.value=position[key]??fallback;input.setAttribute('aria-label',labelText);label.append(input);actions.append(label);
    input.oninput=()=>{position={...position,[key]:input.value};place(position);};
    input.onchange=()=>savePosition(position);
    if(key==='color'){
      const reset=document.createElement('button');reset.type='button';reset.textContent='Вернуть обычный цвет рамки';
      reset.onclick=()=>{position={...position,color:undefined};input.value='#cba6ed';place(position);savePosition(position);};actions.append(reset);
    }
  };
  colorAction('Цвет окантовки','color','#cba6ed');colorAction('Цвет фона','fill','#39343f');
  remove.onclick=()=>{if(confirm('Удалить этот виджет?'))removeWidget();};
  const handles=(['n','e','s','w','ne','nw','se','sw'] as const).map(edge=>{
    const handle=document.createElement('div');handle.className=`floating-note-resize floating-note-resize-${edge}`;handle.setAttribute('role','separator');handle.setAttribute('aria-label',edge.length===2?'Изменить размер виджета':edge==='e'||edge==='w'?'Изменить ширину виджета':'Изменить высоту виджета');handle.tabIndex=editable?0:-1;handle.hidden=!editable;host.append(handle);return {edge,handle};
  });
  function place(next:NoteWidgetPosition) {
    const bounded=constrainNoteWidgetPosition(next,view.contentDOM,elementGridStep(view.contentDOM));
    host.style.setProperty('--note-widget-border-width',widgetBorderWidth(bounded.borderWidth)+'px');host.style.left=bounded.x+'px';host.style.top=bounded.y+'px';host.style.width=bounded.width+'px';host.style.height=bounded.height+'px';host.style.setProperty('--note-layer',String(bounded.z));host.style.borderColor=bounded.color??'var(--edge)';host.style.background=bounded.fill??'var(--editor)';
    applyTextureClass(host,next.texture);
    if(next.fill)host.style.setProperty('--accent',next.fill);else host.style.removeProperty('--accent');
    queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));
  }
  function savePosition(next:NoteWidgetPosition,joining=false){position=joining?snapNoteWidgetPosition(host,next,view.contentDOM,elementGridStep(view.contentDOM)):constrainNoteWidgetPosition(next,view.contentDOM,elementGridStep(view.contentDOM));place(position);save(position);queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));}
  place(position);
  queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));
  for(const {edge,handle} of handles){
    const resized=(dx:number,dy:number)=>{
      const step=elementGridStep(view.contentDOM),available=view.contentDOM.clientWidth||position.width,minWidth=Math.min(64,available),minHeight=64,width=position.width,height=position.height,next={...position};
      if(edge.includes('e'))next.width=Math.max(minWidth,Math.min(Math.min(1600,available),Math.round((width+dx)/step)*step));
      if(edge.includes('s'))next.height=Math.max(minHeight,Math.min(1200,Math.round((height+dy)/step)*step));
      if(edge.includes('w')){next.x=snapGridBounded(position.x+dx,Math.max(0,position.x+width-minWidth),step);next.width=position.x+width-next.x;}
      if(edge.includes('n')){next.y=snapGridBounded(position.y+dy,Math.max(0,position.y+height-minHeight),step);next.height=position.y+height-next.y;}
      return constrainNoteWidgetPosition(next,view.contentDOM,step);
    };
    handle.onpointerdown=event=>{
      if(event.button!==0||!editable)return;event.preventDefault();event.stopPropagation();const start={x:event.clientX,y:event.clientY},scale=elementScale(view.contentDOM);let next=position;handle.setPointerCapture(event.pointerId);
      handle.onpointermove=pointer=>{if(pointer.pointerId!==event.pointerId)return;pointer.preventDefault();next=resized((pointer.clientX-start.x)/scale,(pointer.clientY-start.y)/scale);place(next);};
      handle.onpointerup=pointer=>{if(pointer.pointerId!==event.pointerId)return;handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;savePosition(next);};
      handle.onpointercancel=()=>{handle.onpointermove=null;handle.onpointerup=null;place(position);};
    };
    handle.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();const step=elementGridStep(view.contentDOM),dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;savePosition(resized(dx,dy));};
  }
  host.onpointerdown=event=>{
    if(event.button!==0||!editable||(event.target instanceof Element&&event.target.closest('.note-insert-menu,.floating-note-resize,.visual-table-column-resize,.plot-widget,button,input,select,textarea,a,[draggable="true"],.task-card')))return;
    event.preventDefault();
    const start={x:event.clientX,y:event.clientY},scale=elementScale(view.contentDOM),step=elementGridStep(view.contentDOM),origin=constrainNoteWidgetPosition(position,view.contentDOM,step);let x=origin.x,y=origin.y,dragged=false;host.setPointerCapture(event.pointerId);
    host.onpointermove=pointer=>{if(pointer.pointerId!==event.pointerId)return;const dx=pointer.clientX-start.x,dy=pointer.clientY-start.y;if(!dragged&&Math.abs(dx)+Math.abs(dy)<4)return;dragged=true;host.dataset.dragging='';pointer.preventDefault();x=snapGridBounded(origin.x+dx/scale,Math.max(0,view.contentDOM.clientWidth-origin.width),step);y=snapGridBounded(origin.y+dy/scale,100000,step);const next=snapNoteWidgetPosition(host,{...origin,x,y},view.contentDOM,step);x=next.x;y=next.y;place(next);};
    host.onpointerup=pointer=>{if(pointer.pointerId!==event.pointerId)return;host.onpointermove=null;host.onpointerup=null;host.onpointercancel=null;delete host.dataset.dragging;if(dragged)savePosition({...position,x,y,z:nextNoteLayer(view.state.doc.toString())},true);};
    host.onpointercancel=()=>{host.onpointermove=null;host.onpointerup=null;host.onpointercancel=null;delete host.dataset.dragging;place(position);};
  };
  host.ondragover=event=>{if(event.dataTransfer?.types.includes(paletteDragType)){event.preventDefault();event.dataTransfer.dropEffect='copy';}};
  host.ondrop=event=>{const transfer=event.dataTransfer;if(!transfer)return;const value=readPaletteDrop(transfer.getData(paletteDragType));if(!value)return;event.preventDefault();event.stopPropagation();if(textureById(value.palette)){savePosition({...position,texture:value.palette});return;}const color=getComputedStyle(host).getPropertyValue(`--palette-color-${value.palette}`).trim();if(color&&CSS.supports('color',color))savePosition({...position,fill:color,texture:undefined});};
  return {body,actions,getPosition:()=>({...position}),place,dispose};
}
