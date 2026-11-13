import {StateField} from '@codemirror/state';
import {Decoration,EditorView,WidgetType} from '@codemirror/view';
import {noteInsertMenu} from './noteInsertMenu';
import {nextNoteLayer} from './noteLayers';
import {elementGridStep,elementScale,snapGridBounded} from './gridGeometry';
import {loadNoteImage} from './noteImages';
import {parseReference} from './noteReferences';
import {paletteDragType,readPaletteDrop} from './appearance';
import {applyTextureClass,textureById} from './textures';
import {widgetBorderControls,widgetBorderWidth,widgetSizeControls,constrainNoteWidgetPosition,queueNoteWidgetJoinSync,snapNoteWidgetPosition} from './noteWidgetChrome';
import {fitWidgetContent,refreshWidgetFit} from './widgetFit';
const fitDisposers=new WeakMap<HTMLElement,()=>void>();
import type {ReferenceActions} from './ReferenceChip';

type WidgetKind='text'|'image'|'link';
type WidgetPosition={x:number;y:number;z:number;width?:number;height?:number;color?:string;fill?:string;kind?:WidgetKind;texture?:string;scale?:number;borderWidth?:number};
type WidgetActions={attach?:(files:File[],position:number)=>void;references?:ReferenceActions;editable:boolean};
const textMarker=/^noteapp-(?:text|widget)-(\d{1,6})-(\d{1,6})(?:-w(\d{1,4})-h(\d{1,4}))?(?:-z(\d{1,9}))?(?:-c([0-9a-fA-F]{6}))?(?:-b([0-9a-fA-F]{6}))?(?:-t([til]))?(?:-p([a-z0-9]+))?(?:-s(\d{2,3}))?(?:-o(\d{1,2}))?$/;
const blocks=/^(`{3,})(noteapp-(?:text|widget)-\d{1,6}-\d{1,6}(?:-w\d{1,4}-h\d{1,4})?(?:-z\d{1,9})?(?:-c[0-9a-fA-F]{6})?(?:-b[0-9a-fA-F]{6})?(?:-t[til])?(?:-p[a-z0-9]+)?(?:-s\d{2,3})?(?:-o\d{1,2})?)[ \t]*\n([\s\S]*?)\n\1[ \t]*$/gm;
const embedPattern=/!?\[[^\]]*\]\([^)\n]+\)/g;
const limit=(value:number,max=100000)=>Math.max(0,Math.min(max,Math.round(value)));

export function noteTextPosition(marker:string):WidgetPosition|null {
  const match=textMarker.exec(marker);
  if(!match)return null;
  const position:WidgetPosition={x:Number(match[1]),y:Number(match[2]),z:match[5]===undefined?2:Number(match[5])};
  if(match[3]!==undefined)position.width=Number(match[3]);
  if(match[4]!==undefined)position.height=Number(match[4]);
  if(match[6])position.color='#'+match[6];
  if(match[7])position.fill='#'+match[7];
  if(match[8])position.kind=match[8]==='i'?'image':match[8]==='l'?'link':'text';
  if(match[9])position.texture=textureById(`texture-${match[9]}`)?.id;
  if(match[10])position.scale=Math.max(.5,Math.min(2,Number(match[10])/100));
  if(match[11])position.borderWidth=widgetBorderWidth(Number(match[11])/2);
  return position;
}

function widgetMarker(position:WidgetPosition) {
  const kind=position.kind??'text';
  return `noteapp-widget-${limit(position.x)}-${limit(position.y)}-w${limit(position.width??320,1600)}-h${limit(position.height??160,1200)}-z${limit(position.z,100000)}${position.color?'-c'+position.color.replace('#',''):''}${position.fill?'-b'+position.fill.replace('#',''):''}-t${kind==='image'?'i':kind==='link'?'l':'t'}${textureById(position.texture)?'-p'+position.texture!.slice(8):''}${position.scale&&position.scale!==1?'-s'+Math.round(position.scale*100):''}${position.borderWidth!==undefined?'-o'+Math.round(widgetBorderWidth(position.borderWidth)*2):''}`;
}

function blockFence(text:string,minimum=3) {
  let length=minimum;
  for(const match of text.matchAll(/`+/g))length=Math.max(length,match[0].length+1);
  return '`'.repeat(length);
}

export function floatNoteText(view:EditorView,kind:WidgetKind='text') {
  let {from,to}=view.state.selection.main;
  if(from===to&&kind==='text'){
    const line=view.state.doc.lineAt(from);
    ({from,to}=line);
  }else if(from===to){
    const line=view.state.doc.lineAt(from);
    from=to=line.to;
  }
  if([...view.state.doc.toString().matchAll(blocks)].some(match=>from<=match.index!+match[0].length&&to>=match.index!))return;
  const text=view.state.sliceDoc(from,to);
  const fence=blockFence(text),content=view.contentDOM.getBoundingClientRect(),line=view.coordsAtPos(from);
  const step=elementGridStep(view.contentDOM),scale=elementScale(view.contentDOM);
  const desiredWidth=Math.max(step*4,Math.round(320/step)*step),width=Math.min(desiredWidth,view.contentDOM.clientWidth||desiredWidth);
  const x=snapGridBounded(line?(line.left-content.left)/scale:0,Math.max(0,view.contentDOM.clientWidth-width),step);
  const y=snapGridBounded(line?(line.top-content.top)/scale:0,100000,step);
  const height=Math.max(step*3,Math.round(160/step)*step);
  const marker=widgetMarker({x,y,width,height,z:nextNoteLayer(view.state.doc.toString()),kind});
  const before=from&&view.state.sliceDoc(from-1,from)!=='\n'?'\n\n':'';
  const after=to<view.state.doc.length&&view.state.sliceDoc(to,to+1)!=='\n'?'\n\n':'';
  const insert=before+fence+marker+'\n'+text+'\n'+fence+after;
  view.dispatch({changes:{from,to,insert},selection:{anchor:from+insert.length},userEvent:'input.float-text'});
  view.focus();
}

class FloatingText extends WidgetType {
  constructor(readonly from:number,readonly source:string,readonly marker:string,readonly at:number,readonly text:string,readonly bodyAt:number,readonly notePath:string,readonly getActions:()=>WidgetActions) { super(); }
  eq(other:FloatingText) { return this.from===other.from&&this.source===other.source; }
  ignoreEvent() { return true; }
  toDOM(view:EditorView) {
    let position=noteTextPosition(this.marker)!;
    const frame=document.createElement('div');
    frame.className='floating-note-anchor';
    frame.contentEditable='false';
    const card=document.createElement('div');
    card.className='floating-note-text';
    card.style.setProperty('--note-layer',String(position.z));
    card.style.setProperty('--widget-height',(position.height??160)+'px');
    const body=document.createElement('div');
    body.className='floating-note-copy';
    body.contentEditable=String(this.getActions().editable);
    body.setAttribute('role','textbox');
    body.setAttribute('aria-multiline','true');
    body.setAttribute('aria-label','Текст виджета');
    body.spellcheck=true;
    const media=document.createElement('div');
    media.className='floating-note-media';
    const resizeHandles=(['n','e','s','w','se'] as const).map(edge=>{
      const handle=document.createElement('div');
      handle.className=`floating-note-resize floating-note-resize-${edge}`;
      handle.setAttribute('role','separator');
      handle.setAttribute('aria-orientation',edge==='e'||edge==='w'?'vertical':'horizontal');
      handle.setAttribute('aria-label',edge==='se'?'Изменить размер виджета':edge==='e'||edge==='w'?'Изменить ширину виджета':'Изменить высоту виджета');
      handle.tabIndex=0;
      handle.hidden=!this.getActions().editable;
      return {edge,handle};
    });
    const {menu,actions,move,remove}=noteInsertMenu('Действия с виджетом',false);
    move.hidden=true;
    const imageMatches=[...this.text.matchAll(/!\[([^\]]*)\]\(([^)\n]+)\)/g)];
    const embeds=[...this.text.matchAll(embedPattern)].map(match=>match[0]);
    const plain=this.text.replace(embedPattern,'').replace(/\n{3,}/g,'\n\n').trim();
    body.textContent=plain;
    card.style.setProperty('--note-widget-border-width',widgetBorderWidth(position.borderWidth)+'px');card.style.borderColor=position.color??'var(--edge)';
    card.style.background=position.fill??'var(--editor)';

    for(const match of imageMatches){
      const image=document.createElement('img');
      image.alt=match[1]||'Изображение виджета';
      image.draggable=false;
      media.append(image);
      void loadNoteImage(this.notePath,match[2]).then(url=>{if(url)image.src=url;else image.alt='Изображение не найдено';}).catch(()=>{image.alt='Изображение не найдено';});
    }
    const linkSource=this.text.replace(/!\[[^\]]*\]\([^)\n]+\)/g,'');
    for(const match of linkSource.matchAll(/\[([^\]]+)\]\(([^)\n]+)\)/g)){
      const link=document.createElement('a'),url=match[2],reference=parseReference(url);
      if(!reference&&!/^(?:https?:\/\/|mailto:)/i.test(url))continue;
      link.textContent=match[1];
      link.href=reference?'#':url;
      if(reference)link.onclick=event=>{event.preventDefault();this.getActions().references?.open(url);};
      else if(/^https?:\/\//i.test(url)){link.target='_blank';link.rel='noreferrer';}
      media.append(link);
    }
    if(imageMatches.length&&!plain&&!media.querySelector('a'))card.dataset.imageOnly='';
    media.hidden=!media.childNodes.length;
    const viewport=document.createElement('div');viewport.className='widget-fit-viewport note-text-fit-viewport';
    const inner=document.createElement('div');inner.className='widget-fit-content note-text-fit-content';inner.append(body,media);viewport.append(inner);
    card.append(viewport,menu,...resizeHandles.map(({handle})=>handle));
    frame.append(card);fitDisposers.set(frame,fitWidgetContent(viewport,inner,268,()=>position.scale??1));

    function place(next:WidgetPosition) {
      const bounded=constrainNoteWidgetPosition({...next,width:next.width??320,height:next.height??160},view.contentDOM,elementGridStep(view.contentDOM));
      card.style.left=bounded.x+'px';
      card.style.top=bounded.y+'px';
      card.style.width=bounded.width+'px';
      card.style.height=bounded.height+'px';
      card.style.setProperty('--widget-height',bounded.height+'px');
      card.style.setProperty('--note-layer',String(bounded.z));
      card.style.setProperty('--note-widget-border-width',widgetBorderWidth(bounded.borderWidth)+'px');card.style.borderColor=bounded.color??'var(--edge)';
      card.style.background=bounded.fill??'var(--editor)';
      applyTextureClass(card,bounded.texture);
      if(bounded.fill)card.style.setProperty('--accent',bounded.fill);else card.style.removeProperty('--accent');
      queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));
    }
    place(position);
    queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));

    const saveWidget=(next:WidgetPosition,plainText=body.textContent??'',extraEmbeds=embeds,moving=false)=>{
      let bounded=constrainNoteWidgetPosition({...next,width:next.width??320,height:next.height??160},view.contentDOM,elementGridStep(view.contentDOM));
      if(moving)bounded=snapNoteWidgetPosition(card,bounded,view.contentDOM,elementGridStep(view.contentDOM));
      const end=this.from+this.source.length;
      if(view.state.sliceDoc(this.from,end)!==this.source)return this.bodyAt+this.text.length;
      const content=[plainText.trimEnd(),...extraEmbeds].filter(Boolean).join('\n\n');
      const fence=blockFence(content,this.source.match(/^`+/)?.[0].length??3);
      const marker=widgetMarker({...bounded,z:moving?nextNoteLayer(view.state.doc.toString()):bounded.z});
      const insert=fence+marker+'\n'+content+'\n'+fence;
      const bodyPosition=this.from+fence.length+marker.length+1+content.length;
      position=bounded;
      if(insert!==this.source)view.dispatch({changes:{from:this.from,to:end,insert},userEvent:moving?'input.move-widget':'input.widget'});
      queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));
      return bodyPosition;
    };

    for(const {edge,handle} of resizeHandles){
      const resized=(dx:number,dy:number)=>{
        const step=elementGridStep(view.contentDOM),available=view.contentDOM.clientWidth||position.width||320,minWidth=Math.min(64,available),minHeight=64;
        const width=position.width??320,height=position.height??160;
        const next:WidgetPosition={...position};
        if(edge.includes('e'))next.width=Math.max(minWidth,Math.min(available,Math.round((width+dx)/step)*step));
        if(edge.includes('s'))next.height=Math.max(minHeight,Math.min(1200,Math.round((height+dy)/step)*step));
        if(edge.includes('w')){
          next.x=snapGridBounded(position.x+dx,Math.max(0,position.x+width-minWidth),step);
          next.width=position.x+width-next.x;
        }
        if(edge.includes('n')){
          next.y=snapGridBounded(position.y+dy,Math.max(0,position.y+height-minHeight),step);
          next.height=position.y+height-next.y;
        }
        return constrainNoteWidgetPosition({...next,width:next.width??width,height:next.height??height},view.contentDOM,step);
      };
      handle.onpointerdown=event=>{
        event.stopPropagation();
        if(event.button!==0||!this.getActions().editable)return;
        event.preventDefault();
        const start={x:event.clientX,y:event.clientY},scale=elementScale(view.contentDOM);
        let next=position;
        handle.setPointerCapture(event.pointerId);
        handle.onpointermove=pointer=>{
          if(pointer.pointerId!==event.pointerId)return;
          pointer.preventDefault();
          next=resized((pointer.clientX-start.x)/scale,(pointer.clientY-start.y)/scale);
          place(next);
        };
        handle.onpointerup=pointer=>{
          if(pointer.pointerId!==event.pointerId)return;
          handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;
          saveWidget(next,body.textContent??'',embeds);
        };
        handle.onpointercancel=()=>{handle.onpointermove=null;handle.onpointerup=null;place(position);};
      };
      handle.onkeydown=event=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();
        const step=elementGridStep(view.contentDOM),dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
        saveWidget(resized(dx,dy),body.textContent??'',embeds);
      };
    }

    remove.onclick=()=>{
      const end=this.from+this.source.length;
      if(view.state.sliceDoc(this.from,end)!==this.source)return;
      view.dispatch({changes:{from:this.from,to:end},selection:{anchor:this.from},userEvent:'delete.widget'});
      view.focus();
    };
    body.onblur=event=>{if(!card.contains(event.relatedTarget as Node|null))saveWidget(position);};
    card.onpointerdown=event=>{
      if(event.button!==0||!this.getActions().editable||(event.target instanceof Element&&event.target.closest('.note-insert-menu,.floating-note-resize,a,button,input')) )return;
      const start={x:event.clientX,y:event.clientY},scale=elementScale(view.contentDOM),step=elementGridStep(view.contentDOM),origin=constrainNoteWidgetPosition({...position,width:position.width??320,height:position.height??160},view.contentDOM,step);
      let x=origin.x,y=origin.y,dragged=false;
      card.setPointerCapture(event.pointerId);
      card.onpointermove=pointer=>{
        if(pointer.pointerId!==event.pointerId)return;
        const dx=pointer.clientX-start.x,dy=pointer.clientY-start.y;
        if(!dragged&&Math.abs(dx)+Math.abs(dy)<4)return;
        dragged=true;card.dataset.dragging='';pointer.preventDefault();
        x=snapGridBounded(origin.x+dx/scale,Math.max(0,view.contentDOM.clientWidth-origin.width),step);
        y=snapGridBounded(origin.y+dy/scale,100000,step);
        const next=snapNoteWidgetPosition(card,{...origin,x,y},view.contentDOM,step);
        x=next.x;y=next.y;place(next);
      };
      card.onpointerup=pointer=>{
        if(pointer.pointerId!==event.pointerId)return;
        card.onpointermove=null;card.onpointerup=null;card.onpointercancel=null;
        delete card.dataset.dragging;
        if(dragged){pointer.preventDefault();saveWidget({...position,x,y},body.textContent??'',embeds,true);}
      };
      card.onpointercancel=()=>{card.onpointermove=null;card.onpointerup=null;card.onpointercancel=null;delete card.dataset.dragging;place(position);};
    };

    const addImage=document.createElement('button');
    addImage.type='button';addImage.textContent='Добавить изображение';
    const fileInput=document.createElement('input');
    fileInput.type='file';fileInput.accept='image/*';fileInput.multiple=true;fileInput.hidden=true;
    addImage.onclick=()=>fileInput.click();
    fileInput.onchange=()=>{
      const files=Array.from(fileInput.files??[]);fileInput.value='';if(!files.length)return;
      const positionAtEnd=saveWidget(position,body.textContent??'');
      this.getActions().attach?.(files,positionAtEnd);
      menu.open=false;
    };

    const addLink=document.createElement('button');
    addLink.type='button';addLink.textContent='Добавить ссылку';
    const linkForm=document.createElement('form');
    linkForm.className='note-widget-link-form';
    linkForm.hidden=position.kind!=='link';
    const linkLabel=document.createElement('input');linkLabel.placeholder='Название';linkLabel.setAttribute('aria-label','Название ссылки');linkLabel.value='Ссылка';
    const linkUrl=document.createElement('input');linkUrl.placeholder='https://…';linkUrl.setAttribute('aria-label','Адрес ссылки');
    const linkSave=document.createElement('button');linkSave.type='submit';linkSave.textContent='Добавить';
    linkForm.append(linkLabel,linkUrl,linkSave);
    addLink.onclick=()=>{linkForm.hidden=!linkForm.hidden;if(!linkForm.hidden)linkUrl.focus();};
    linkForm.onsubmit=event=>{
      event.preventDefault();
      let url=linkUrl.value.trim();if(!url)return;
      if(!/^(?:https?:\/\/|mailto:|noteapp-(?:note|map):)/i.test(url))url='https://'+url;
      if(/^javascript:/i.test(url))return;
      const label=linkLabel.value.trim()||url;
      const markdown=`[${label.replace(/[\\\[\]]/g,'\\$&')}](${url.replace(/[)\s]/g,encodeURIComponent)})`;
      saveWidget(position,body.textContent??'',[...embeds,markdown]);
      menu.open=false;
    };

    const colorLabel=document.createElement('label');colorLabel.className='note-widget-color';colorLabel.append('Цвет окантовки');
    const colorInput=document.createElement('input');colorInput.type='color';colorInput.value=position.color??'#cba6ed';colorInput.setAttribute('aria-label','Цвет окантовки виджета');colorLabel.append(colorInput);
    colorInput.oninput=()=>{card.style.borderColor=colorInput.value;};
    colorInput.onchange=()=>saveWidget({...position,color:colorInput.value});
    const resetColor=document.createElement('button');resetColor.type='button';resetColor.textContent='Вернуть обычный цвет рамки';
    resetColor.onclick=()=>{position={...position,color:undefined};colorInput.value='#cba6ed';saveWidget(position);};
    actions.append(resetColor);

    actions.append(addImage,fileInput,addLink,linkForm,colorLabel);
    widgetBorderControls(actions,()=>position.borderWidth,borderWidth=>saveWidget({...position,borderWidth}));
    widgetSizeControls(actions,()=>({width:position.width??320,height:position.height??160}),size=>saveWidget({...position,...size}));
    const scaleLabel=document.createElement('label');scaleLabel.className='note-widget-scale';scaleLabel.append('Масштаб содержимого');
    const scaleOutput=document.createElement('output'),scaleInput=document.createElement('input');scaleInput.type='range';scaleInput.min='50';scaleInput.max='150';scaleInput.step='10';scaleInput.value=String(Math.round((position.scale??1)*100));scaleOutput.textContent=scaleInput.value+'%';scaleLabel.append(scaleOutput,scaleInput);actions.append(scaleLabel);
    scaleInput.oninput=()=>{position={...position,scale:Number(scaleInput.value)/100};scaleOutput.textContent=scaleInput.value+'%';refreshWidgetFit(viewport);};
    scaleInput.onchange=()=>saveWidget(position);
    card.ondragover=event=>{
      const transfer=event.dataTransfer;
      if(!transfer?.types.includes(paletteDragType))return;
      event.preventDefault();transfer.dropEffect='copy';
    };
    card.ondrop=event=>{
      const transfer=event.dataTransfer;
      if(!transfer)return;
      const value=readPaletteDrop(transfer.getData(paletteDragType));
      if(!value)return;
      event.preventDefault();event.stopPropagation();
      if(textureById(value.palette)){saveWidget({...position,texture:value.palette},body.textContent??'',embeds);return;}
      const color=getComputedStyle(card).getPropertyValue(`--palette-color-${value.palette}`).trim();
      if(!color||!CSS.supports('color',color))return;
      card.style.background=color;
      card.style.setProperty('--accent',color);
      saveWidget({...position,fill:color,texture:undefined},body.textContent??'',embeds);
    };
    if(position.kind==='link'){menu.open=true;requestAnimationFrame(()=>linkUrl.focus());}
    return frame;
  }
  destroy(frame:HTMLElement){fitDisposers.get(frame)?.();fitDisposers.delete(frame);}
}

export function noteTextBlocks(notePath:string,getActions:()=>WidgetActions) {
  return StateField.define({
    create:state=>decorate(state,notePath,getActions),
    update:(value,transaction)=>transaction.docChanged||transaction.selection ? decorate(transaction.state,notePath,getActions) : value,
    provide:field=>[EditorView.decorations.from(field),EditorView.atomicRanges.of(view=>view.state.field(field))],
  });
}

function decorate(state:EditorView['state'],notePath:string,getActions:()=>WidgetActions) {
  const widgets=[];
  for(const match of state.doc.toString().matchAll(blocks)){
    const [source,fence,marker,text]=match;
    const from=match.index!,to=from+source.length;
    const at=from+fence.length;
    const widget=new FloatingText(from,source,marker,at,text,from+source.indexOf('\n')+1,notePath,getActions);
    widgets.push(Decoration.replace({block:true,widget}).range(from,to));
  }
  return Decoration.set(widgets);
}
