import {elementGridStep,elementScale,snapGridBounded} from './gridGeometry';
import {nextNoteLayer} from './noteLayers';
import {noteInsertMenu} from './noteInsertMenu';
import {paletteDragType,readPaletteDrop} from './appearance';
import {applyTextureClass,textureById} from './textures';
import type {EditorView} from '@codemirror/view';

export type NoteWidgetPosition={x:number;y:number;width:number;height:number;z:number;color?:string;fill?:string;texture?:string};
const joinedWidgets='.floating-note-text, .note-feature-host.note-feature-widget, .visual-table-host.note-feature-widget, .note-image-box.floating-image, .graph-annotation';
const joinFrames=new WeakSet<HTMLElement>();

export function snapNoteWidgetPosition(element:HTMLElement,next:NoteWidgetPosition,root:HTMLElement,step:number):NoteWidgetPosition {
  const scale=elementScale(root),bounds=root.getBoundingClientRect(),tolerance=step*.65;
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
  return {...next,x,y};
}

export function queueNoteWidgetJoinSync(root:HTMLElement,step:number) {
  if(joinFrames.has(root))return;joinFrames.add(root);
  requestAnimationFrame(()=>{
    joinFrames.delete(root);if(!root.isConnected)return;
    const scale=elementScale(root),items=[...root.querySelectorAll<HTMLElement>(joinedWidgets)].filter(item=>item.getClientRects().length);
    type Side='left'|'right'|'top'|'bottom';
    const mark=(item:HTMLElement,side:Side)=>item.setAttribute(`data-note-join-${side}`,'');
    const mask=(item:HTMLElement,side:Side,start:number,length:number)=>{
      const element=document.createElement('span');element.className='note-widget-join-mask';element.dataset.edge=side;element.setAttribute('aria-hidden','true');item.append(element);
      const color=getComputedStyle(item).backgroundColor;
      element.style.backgroundColor=color==='rgba(0, 0, 0, 0)'?'var(--editor)':color;
      if(side==='left'||side==='right'){element.style.top=`${start}px`;element.style.height=`${length}px`;element.style.width='3px';element.style.left=side==='left'?'0':'auto';element.style.right=side==='right'?'0':'auto';}
      else {element.style.left=`${start}px`;element.style.width=`${length}px`;element.style.height='3px';element.style.top=side==='top'?'0':'auto';element.style.bottom=side==='bottom'?'0':'auto';}
    };
    for(const item of items){
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
      const a=items[i].getBoundingClientRect(),b=items[j].getBoundingClientRect(),tolerance=Math.max(2,step*scale*.12);
      const overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left),overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
      const contains=(outer:DOMRect,inner:DOMRect)=>outer.left<=inner.left&&outer.top<=inner.top&&outer.right>=inner.right&&outer.bottom>=inner.bottom;
      if(overlapX>tolerance&&overlapY>tolerance){
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
              const radius=Math.min(12,available,(to-from)/scale/2);
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
              curve.style.background=`radial-gradient(circle at ${center}, transparent ${radius-1}px, ${style.borderTopColor} ${radius-1}px, ${style.borderTopColor} ${radius}px, ${fill} ${radius}px)`;
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
  });
}

// WidgetType.toDOM runs during CodeMirror updates, where reading editor layout throws.
export function defaultNoteWidgetPosition(width=420,height=260):NoteWidgetPosition {return {x:16,y:16,width,height,z:2};}

export function initialNoteWidget(view:EditorView,at:number,width=420,height=260):NoteWidgetPosition {
  const content=view.contentDOM,bounds=content.getBoundingClientRect(),coords=view.coordsAtPos(at),scale=elementScale(content),step=elementGridStep(content);
  return {x:snapGridBounded(coords?(coords.left-bounds.left)/scale:step/2,Math.max(0,content.clientWidth-width),step),y:snapGridBounded(coords?(coords.top-bounds.top)/scale:0,100000,step),width,height,z:nextNoteLayer(view.state.doc.toString())};
}

export function noteWidgetChrome(host:HTMLElement,view:EditorView,initial:NoteWidgetPosition,label:string,save:(position:NoteWidgetPosition)=>void,removeWidget:()=>void,editable=true) {
  let position={...initial};
  const body=document.createElement('div');body.className='note-widget-body';
  const {menu,actions,move,remove}=noteInsertMenu(`Действия: ${label}`,false);move.hidden=true;
  host.classList.add('floating-note-text','note-feature-widget');host.contentEditable='false';host.append(body,menu);
  const colorAction=(labelText:string,key:'color'|'fill',fallback:string)=>{
    const label=document.createElement('label');label.className='note-widget-color';label.append(labelText);
    const input=document.createElement('input');input.type='color';input.value=position[key]??fallback;input.setAttribute('aria-label',labelText);label.append(input);actions.append(label);
    input.oninput=()=>{position={...position,[key]:input.value};place(position);};
    input.onchange=()=>savePosition(position);
  };
  colorAction('Цвет окантовки','color','#cba6ed');colorAction('Цвет фона','fill','#39343f');
  remove.onclick=()=>{if(confirm('Удалить этот виджет?'))removeWidget();};
  const handles=(['n','e','s','w','ne','nw','se','sw'] as const).map(edge=>{
    const handle=document.createElement('div');handle.className=`floating-note-resize floating-note-resize-${edge}`;handle.setAttribute('role','separator');handle.setAttribute('aria-label',edge.length===2?'Изменить размер виджета':edge==='e'||edge==='w'?'Изменить ширину виджета':'Изменить высоту виджета');handle.tabIndex=editable?0:-1;handle.hidden=!editable;host.append(handle);return {edge,handle};
  });
  function place(next:NoteWidgetPosition) {
    host.style.left=`min(${next.x}px, max(0px, 100% - ${next.width}px))`;host.style.top=next.y+'px';host.style.width=next.width+'px';host.style.height=next.height+'px';host.style.setProperty('--note-layer',String(next.z));host.style.borderColor=next.color??'var(--edge)';host.style.background=next.fill??'var(--editor)';
    applyTextureClass(host,next.texture);
    if(next.fill)host.style.setProperty('--accent',next.fill);else host.style.removeProperty('--accent');
    queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));
  }
  function savePosition(next:NoteWidgetPosition,joining=false){position=joining?snapNoteWidgetPosition(host,next,view.contentDOM,elementGridStep(view.contentDOM)):{...next};place(position);save(position);queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));}
  place(position);
  queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));
  for(const {edge,handle} of handles){
    const resized=(dx:number,dy:number)=>{
      const step=elementGridStep(view.contentDOM),minWidth=step*4,minHeight=step*3,width=position.width,height=position.height,next={...position};
      if(edge.includes('e'))next.width=Math.max(minWidth,Math.min(Math.min(1600,view.contentDOM.clientWidth),Math.round((width+dx)/step)*step));
      if(edge.includes('s'))next.height=Math.max(minHeight,Math.min(1200,Math.round((height+dy)/step)*step));
      if(edge.includes('w')){next.x=snapGridBounded(position.x+dx,Math.max(0,position.x+width-minWidth),step);next.width=position.x+width-next.x;}
      if(edge.includes('n')){next.y=snapGridBounded(position.y+dy,Math.max(0,position.y+height-minHeight),step);next.height=position.y+height-next.y;}
      return next;
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
    if(event.button!==0||!editable||(event.target instanceof Element&&event.target.closest('.note-insert-menu,.floating-note-resize,.visual-table-column-resize,button,input,select,textarea,a,[draggable="true"],.task-card')))return;
    const start={x:event.clientX,y:event.clientY},scale=elementScale(view.contentDOM),step=elementGridStep(view.contentDOM),bounds=view.contentDOM.getBoundingClientRect(),rect=host.getBoundingClientRect();let x=(rect.left-bounds.left)/scale,y=(rect.top-bounds.top)/scale,dragged=false;host.setPointerCapture(event.pointerId);
    host.onpointermove=pointer=>{if(pointer.pointerId!==event.pointerId)return;const dx=pointer.clientX-start.x,dy=pointer.clientY-start.y;if(!dragged&&Math.abs(dx)+Math.abs(dy)<4)return;dragged=true;host.dataset.dragging='';pointer.preventDefault();x=snapGridBounded((rect.left-bounds.left+dx)/scale,Math.max(0,view.contentDOM.clientWidth-position.width),step);y=snapGridBounded((rect.top-bounds.top+dy)/scale,100000,step);const next=snapNoteWidgetPosition(host,{...position,x,y},view.contentDOM,step);x=next.x;y=next.y;place(next);};
    host.onpointerup=pointer=>{if(pointer.pointerId!==event.pointerId)return;host.onpointermove=null;host.onpointerup=null;host.onpointercancel=null;delete host.dataset.dragging;if(dragged)savePosition({...position,x,y,z:nextNoteLayer(view.state.doc.toString())},true);};
    host.onpointercancel=()=>{host.onpointermove=null;host.onpointerup=null;host.onpointercancel=null;delete host.dataset.dragging;place(position);};
  };
  host.ondragover=event=>{if(event.dataTransfer?.types.includes(paletteDragType)){event.preventDefault();event.dataTransfer.dropEffect='copy';}};
  host.ondrop=event=>{const transfer=event.dataTransfer;if(!transfer)return;const value=readPaletteDrop(transfer.getData(paletteDragType));if(!value)return;event.preventDefault();event.stopPropagation();if(textureById(value.palette)){savePosition({...position,texture:value.palette});return;}const color=getComputedStyle(host).getPropertyValue(`--palette-color-${value.palette}`).trim();if(color&&CSS.supports('color',color))savePosition({...position,fill:color,texture:undefined});};
  return {body,actions,getPosition:()=>({...position}),place};
}
