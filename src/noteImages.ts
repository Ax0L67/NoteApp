import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { folder } from './indexing';
import { request } from './storage';
import { noteInsertMenu } from './noteInsertMenu';
import {nextNoteLayer} from './noteLayers';
import {elementGridStep,elementScale,snapGridBounded} from './gridGeometry';
import {widgetBorderControls,widgetBorderWidth,widgetSizeControls,queueNoteWidgetJoinSync,snapNoteWidgetPosition} from './noteWidgetChrome';

const widthMarker = /#noteapp-width=(\d+)(?:&x=(\d+)&y=(\d+))?(?:&z=(\d{1,9}))?(?:&c=([\da-fA-F]{6}))?(?:&s=(\d{2,3}))?(?:&h=(\d{1,4}))?(?:&bw=(\d{1,2}))?$/;
const limitWidth = (width: number) => Math.max(1, Math.min(1600, Math.round(width)));
export function imageLayout(src: string) {
  const match = src.match(widthMarker);
  return {
    borderWidth:match?.[8]?widgetBorderWidth(Number(match[8])/2):undefined,
    width: match ? limitWidth(Number(match[1])) : undefined,
    height:match?.[7]?Math.max(64,Math.min(1200,Number(match[7]))):undefined,
    x: match?.[2] === undefined ? undefined : Math.min(10000, Number(match[2])),
    y: match?.[3] === undefined ? undefined : Math.min(100000, Number(match[3])),
    z: match?.[4]===undefined?2:Number(match[4]),
    color:match?.[5]?`#${match[5]}`:undefined,
    scale:match?.[6]===undefined?1:Math.max(.5,Math.min(2,Number(match[6])/100)),
  };
}
export function assetPath(note: string, src: string) {
  const parts = folder(note).split('/').filter(Boolean);
  for (const part of decodeURIComponent(src.replace(widthMarker, '')).split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

export function loadNoteImage(note: string, src: string) {
  if (!src || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(src)) return Promise.resolve('');
  try { return request<string>('asset', {path: assetPath(note, src)}).catch(() => ''); }
  catch { return Promise.resolve(''); }
}

type ImageRange = { from: number; to: number; urlFrom: number; urlTo: number; src: string; text: string };
type ImageParts = { source: ImageRange; box: HTMLDivElement; preview: HTMLImageElement };
const partsByFrame = new WeakMap<HTMLElement, ImageParts>();

function applyLayout(parts: ImageParts, layout = imageLayout(parts.source.src)) {
  const floating = layout.x !== undefined && layout.y !== undefined;
  parts.box.classList.toggle('floating-image', floating);
  parts.box.style.left = floating ? 'min(' + layout.x + 'px, max(0px, 100% - min(' + (layout.width ?? 320) + 'px, 100%)))' : '';
  parts.box.style.top = floating ? layout.y + 'px' : '';
  parts.box.style.setProperty('--note-layer',String(layout.z));
  parts.box.toggleAttribute('data-sized',layout.width!==undefined);
  parts.box.style.width = layout.width ? 'min(' + layout.width + 'px, 100%)' : '';
  parts.box.style.height=layout.height?layout.height+'px':'';
  parts.preview.style.height=layout.height?'100%':'';parts.preview.style.objectFit='contain';
  parts.box.style.setProperty('--note-widget-border-width',widgetBorderWidth(layout.borderWidth)+'px');
  parts.box.style.borderColor=layout.color??'var(--edge)';
  parts.preview.style.transform=`scale(${Math.min(1,layout.scale??1)})`;
  parts.preview.style.transformOrigin='center';
  parts.preview.style.width = layout.width ? '100%' : '';
}

class ImageWidget extends WidgetType {
  constructor(readonly image: ImageRange, readonly load: (src: string) => Promise<string>) { super(); }
  eq(other: ImageWidget) { return this.image.from === other.image.from && this.image.text === other.image.text; }

  updateDOM(frame: HTMLElement, view: EditorView) {
    const parts = partsByFrame.get(frame);
    if (!parts || parts.source.src.replace(widthMarker, '') !== this.image.src.replace(widthMarker, '')) return false;
    parts.source = this.image;
    parts.preview.alt = this.image.text.match(/^!\[([^\]]*)\]/)?.[1] || 'Изображение заметки';
    applyLayout(parts);
    queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));
    view.requestMeasure();
    return true;
  }

  toDOM(view: EditorView) {
    const frame = document.createElement('div');
    frame.className = 'inline-note-image';
    frame.contentEditable = 'false';
    const box = document.createElement('div');
    box.className = 'note-image-box';
    const preview = document.createElement('img');
    preview.alt = this.image.text.match(/^!\[([^\]]*)\]/)?.[1] || 'Изображение заметки';
    preview.draggable = false;
    preview.hidden = true;
    const status = document.createElement('span');
    status.textContent = 'Загрузка изображения…';
    const {menu,actions,move,remove} = noteInsertMenu('Действия с изображением');
    move.disabled = true;
    const resize = document.createElement('button');
    resize.type = 'button';
    resize.className = 'note-insert-resize';
    resize.textContent = 'Размер';
    resize.title = 'Перетащите влево или вправо. Можно использовать стрелки.';
    resize.disabled = true;
    actions.insertBefore(resize,remove);
    const colorLabel=document.createElement('label');colorLabel.className='note-widget-color';colorLabel.append('Цвет рамки');
    const colorInput=document.createElement('input');colorInput.type='color';colorInput.value=imageLayout(this.image.src).color??'#cba6ed';colorInput.setAttribute('aria-label','Цвет рамки виджета');colorLabel.append(colorInput);actions.insertBefore(colorLabel,remove);
    const scaleLabel=document.createElement('label');scaleLabel.className='note-widget-scale';scaleLabel.append('Масштаб содержимого');
    const scaleOutput=document.createElement('output'),scaleInput=document.createElement('input');scaleInput.type='range';scaleInput.min='50';scaleInput.max='150';scaleInput.step='10';scaleInput.value=String(Math.round((imageLayout(this.image.src).scale??1)*100));scaleOutput.textContent=scaleInput.value+'%';scaleLabel.append(scaleOutput,scaleInput);actions.insertBefore(scaleLabel,remove);
    const resetColor=document.createElement('button');resetColor.type='button';resetColor.textContent='Вернуть обычный цвет рамки';actions.insertBefore(resetColor,remove);
    box.append(preview,status,menu);
    frame.append(box);
    const parts = {source:this.image, box, preview};
    partsByFrame.set(frame,parts);
    applyLayout(parts);

    remove.onclick = () => {
      const {from,to,text}=parts.source;
      if(view.state.sliceDoc(from,to)!==text)return;
      view.dispatch({changes:{from,to},selection:{anchor:from},userEvent:'delete.note-image'});
      view.focus();
    };
    const save = (width: number, x?: number, y?: number, moving=false,color:string|null|undefined=imageLayout(parts.source.src).color,scale:number|undefined=imageLayout(parts.source.src).scale,height:number|undefined=imageLayout(parts.source.src).height,borderWidth:number|undefined=imageLayout(parts.source.src).borderWidth) => {
      const { from, to, text, urlFrom, urlTo, src } = parts.source;
      if (view.state.sliceDoc(from, to) !== text) { applyLayout(parts); return; }
      const step=elementGridStep(view.contentDOM);
      const maxWidth=Math.min(1600,view.contentDOM.clientWidth||1600);
      width=Math.max(Math.min(64,maxWidth),Math.min(maxWidth,Math.round(width)));
      const position = x === undefined || y === undefined ? '' : '&x=' + (moving?Math.round(Math.max(0,Math.min(view.contentDOM.clientWidth-width,x))):snapGridBounded(x,Math.max(0,view.contentDOM.clientWidth-width),step)) + '&y=' + (moving?Math.round(Math.max(0,y)):snapGridBounded(y,100000,step));
      const z=moving?nextNoteLayer(view.state.doc.toString()):imageLayout(src).z;
      const appearance=(color?'&c='+color.replace('#',''):'')+((scale??1)!==1?'&s='+Math.round((scale??1)*100):'');
      const insert = src.replace(widthMarker, '') + '#noteapp-width=' + limitWidth(width) + position+'&z='+z+appearance+(height?'&h='+Math.max(64,Math.min(1200,Math.round(height))):'')+(borderWidth!==undefined?'&bw='+Math.round(widgetBorderWidth(borderWidth)*2):'');
      if (insert !== src) view.dispatch({changes:{from:urlFrom,to:urlTo,insert},userEvent:'input.image'});
    };
    widgetBorderControls(actions,()=>imageLayout(parts.source.src).borderWidth,borderWidth=>{const l=imageLayout(parts.source.src);save(l.width??box.offsetWidth,l.x,l.y,false,l.color,l.scale,l.height,borderWidth);});
    widgetSizeControls(actions,()=>{const layout=imageLayout(parts.source.src);return {width:layout.width??box.offsetWidth,height:layout.height??box.offsetHeight};},size=>{const layout=imageLayout(parts.source.src);save(size.width,layout.x,layout.y,false,layout.color,layout.scale,size.height);});
    colorInput.oninput=()=>{box.style.borderColor=colorInput.value;};
    colorInput.onchange=()=>{const layout=imageLayout(parts.source.src),scale=elementScale(view.contentDOM);save(layout.width??preview.getBoundingClientRect().width/scale/(layout.scale??1),layout.x,layout.y,false,colorInput.value,layout.scale);};
    resetColor.onclick=()=>{const layout=imageLayout(parts.source.src),scale=elementScale(view.contentDOM);colorInput.value='#cba6ed';box.style.borderColor='var(--edge)';save(layout.width??preview.getBoundingClientRect().width/scale/(layout.scale??1),layout.x,layout.y,false,null,layout.scale);};
    scaleInput.oninput=()=>{scaleOutput.textContent=scaleInput.value+'%';applyLayout(parts,{...imageLayout(parts.source.src),scale:Number(scaleInput.value)/100});};
    scaleInput.onchange=()=>{const layout=imageLayout(parts.source.src),scale=elementScale(view.contentDOM),nextScale=Number(scaleInput.value)/100;save(layout.width??preview.getBoundingClientRect().width/scale/nextScale,layout.x,layout.y,false,layout.color,nextScale);};
    move.onkeydown = event => {
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();
      event.stopPropagation();
      const {left,top,width}=preview.getBoundingClientRect();
      const bounds=view.contentDOM.getBoundingClientRect();
      const scale=elementScale(view.contentDOM),step=elementGridStep(view.contentDOM);
      const layout=imageLayout(parts.source.src),contentScale=layout.scale??1;
      const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0;
      const dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
      save((layout.width??width/scale/contentScale),(layout.x??(left-bounds.left)/scale)+dx,(layout.y??(top-bounds.top)/scale)+dy,true);
    };
    resize.onkeydown = event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const { x, y, scale:contentScale } = imageLayout(parts.source.src);
      const step=elementGridStep(view.contentDOM);
      save(Math.max(step*4, preview.getBoundingClientRect().width/elementScale(view.contentDOM)/(contentScale??1) + (event.key === 'ArrowLeft' ? -step : step)), x, y);
    };
    const startPointer = (event: PointerEvent, control: HTMLElement, moving: boolean) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const original = imageLayout(parts.source.src);
      const z=moving?nextNoteLayer(view.state.doc.toString()):original.z;
      const imageRect = preview.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      const content = view.contentDOM;
      const origin = content.getBoundingClientRect();
      const scale=elementScale(content),step=elementGridStep(content);
      const initialX = original.x??(boxRect.left - origin.left)/scale, initialY = original.y??(boxRect.top - origin.top)/scale;
      let x = original.x, y = original.y, width = original.width??imageRect.width/scale/(original.scale??1);
      let height=original.height??boxRect.height/scale;
      let changed = false;
      const pointerId=event.pointerId;
      control.setPointerCapture(event.pointerId);
      control.onpointermove = moveEvent => {
        if(moveEvent.pointerId!==pointerId)return;
        const dx = moveEvent.clientX - event.clientX, dy = moveEvent.clientY - event.clientY;
        if (!changed && Math.abs(dx) + Math.abs(dy) < 3) return;
        changed = true;
        if(moving)box.dataset.dragging='';
        if (moving) {
          x = snapGridBounded(initialX + dx/scale,Math.max(0,content.clientWidth-width),step);
          y = snapGridBounded(initialY + dy/scale,100000,step);
          const next=snapNoteWidgetPosition(box,{x,y,width,height:boxRect.height/scale,z},content,step);x=next.x;y=next.y;
        } else {width=Math.min(1600,content.clientWidth||1600,Math.max(64,Math.round(((original.width??boxRect.width/scale)+dx/scale)/step)*step));height=Math.min(1200,Math.max(64,Math.round(((original.height??boxRect.height/scale)+dy/scale)/step)*step));}
        applyLayout(parts,{width,height,x,y,z,color:original.color,scale:original.scale,borderWidth:original.borderWidth});
        queueNoteWidgetJoinSync(content,step);
      };
      control.onpointerup = upEvent => {
        if(upEvent.pointerId!==pointerId)return;
        control.onpointermove = null;
        control.onpointerup = null;
        control.onpointercancel = null;
        delete box.dataset.dragging;
        if (changed) {
          menu.open=false;
          save(width,x,y,moving,original.color,original.scale,height);
          view.focus();
        }
      };
      control.onpointercancel = cancelEvent => {
        if(cancelEvent.pointerId!==pointerId)return;
        control.onpointermove = null;
        control.onpointerup = null;
        control.onpointercancel = null;
        delete box.dataset.dragging;
        applyLayout(parts);
        queueNoteWidgetJoinSync(content,step);
      };
    };
    move.onpointerdown = event => startPointer(event,move,true);
    resize.onpointerdown = event => startPointer(event,resize,false);
    box.onpointerdown=event=>{
      if(!box.classList.contains('floating-image')||(event.target instanceof Element&&event.target.closest('.note-insert-menu,.note-insert-resize,button')))return;
      startPointer(event,box,true);
    };
    void this.load(this.image.src).then(url => {
      if (!url) { status.textContent = 'Локальное изображение не найдено'; return; }
      preview.onload = () => {
        preview.hidden = false;
        status.hidden = true;
        move.disabled = false;
        resize.disabled = false;
        queueNoteWidgetJoinSync(view.contentDOM,elementGridStep(view.contentDOM));
        view.requestMeasure();
      };
      preview.onerror = () => { status.textContent = 'Не удалось открыть изображение'; };
      preview.src = url;
    });
    return frame;
  }
  ignoreEvent() { return true; }
}

export function noteImagePreviews(note: string) {
  const cache = new Map<string, Promise<string>>();
  const load = (src: string) => {
    const key = src.replace(widthMarker, '');
    let asset = cache.get(key);
    if (!asset) { asset = loadNoteImage(note, key); cache.set(key, asset); }
    return asset;
  };
  const decorate = (state: EditorState) => {
    const widgets: ReturnType<Decoration['range']>[] = [];
    syntaxTree(state).iterate({enter(node) {
      if (node.name !== 'Image') return;
      const url = node.node.getChild('URL');
      if (!url) return false;
      const raw = state.sliceDoc(url.from,url.to);
      const angled = raw.startsWith('<') && raw.endsWith('>');
      const src = angled ? raw.slice(1,-1) : raw;
      if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(src)) return false;
      const image = {from:node.from,to:node.to,urlFrom:url.from+Number(angled),urlTo:url.to-Number(angled),src,text:state.sliceDoc(node.from,node.to)};
      const line = state.doc.lineAt(node.to);
      const widget = new ImageWidget(image,load);
      if (line.text.trim() === image.text) {
        widgets.push(Decoration.replace({widget,block:true}).range(line.from,line.to));
      } else {
        widgets.push(Decoration.replace({}).range(image.from,image.to));
        widgets.push(Decoration.widget({widget,block:true,side:1}).range(line.to));
      }
      return false;
    }});
    return Decoration.set(widgets,true);
  };
  const images = StateField.define<DecorationSet>({
    create:decorate,
    update:(value,tr)=>tr.docChanged || syntaxTree(tr.startState)!==syntaxTree(tr.state) ? decorate(tr.state) : value,
    provide:field=>[
      EditorView.decorations.from(field),
      EditorView.atomicRanges.of(view=>view.state.field(field)),
    ],
  });
  return images;
}
