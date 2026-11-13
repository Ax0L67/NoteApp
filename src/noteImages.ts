import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { folder } from './indexing';
import { request } from './storage';
import { noteInsertMenu } from './noteInsertMenu';
import {nextNoteLayer} from './noteLayers';
import {elementGridStep,elementScale,snapGridBounded} from './gridGeometry';
import {queueNoteWidgetJoinSync,snapNoteWidgetPosition} from './noteWidgetChrome';

const widthMarker = /#noteapp-width=(\d+)(?:&x=(\d+)&y=(\d+))?(?:&z=(\d{1,9}))?$/;
const limitWidth = (width: number) => Math.max(1, Math.min(1600, Math.round(width)));
export function imageLayout(src: string) {
  const match = src.match(widthMarker);
  return {
    width: match ? limitWidth(Number(match[1])) : undefined,
    x: match?.[2] === undefined ? undefined : Math.min(10000, Number(match[2])),
    y: match?.[3] === undefined ? undefined : Math.min(100000, Number(match[3])),
    z: match?.[4]===undefined?2:Number(match[4]),
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
  parts.box.style.left = floating ? 'min(' + layout.x + 'px, max(0px, 100% - ' + (layout.width ?? 320) + 'px))' : '';
  parts.box.style.top = floating ? layout.y + 'px' : '';
  parts.box.style.setProperty('--note-layer',String(layout.z));
  parts.box.toggleAttribute('data-sized',layout.width!==undefined);
  parts.box.style.width = layout.width ? layout.width + 'px' : '';
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
    const save = (width: number, x?: number, y?: number, moving=false) => {
      const { from, to, text, urlFrom, urlTo, src } = parts.source;
      if (view.state.sliceDoc(from, to) !== text) { applyLayout(parts); return; }
      const step=elementGridStep(view.contentDOM);
      width=Math.max(step,Math.min(Math.floor(1600/step)*step,Math.round(width/step)*step));
      const position = x === undefined || y === undefined ? '' : '&x=' + (moving?Math.round(Math.max(0,Math.min(view.contentDOM.clientWidth-width,x))):snapGridBounded(x,Math.max(0,view.contentDOM.clientWidth-width),step)) + '&y=' + (moving?Math.round(Math.max(0,y)):snapGridBounded(y,100000,step));
      const z=moving?nextNoteLayer(view.state.doc.toString()):imageLayout(src).z;
      const insert = src.replace(widthMarker, '') + '#noteapp-width=' + limitWidth(width) + position+'&z='+z;
      if (insert !== src) view.dispatch({changes:{from:urlFrom,to:urlTo,insert},userEvent:'input.image'});
    };
    move.onkeydown = event => {
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();
      event.stopPropagation();
      const {left,top,width}=preview.getBoundingClientRect();
      const bounds=view.contentDOM.getBoundingClientRect();
      const scale=elementScale(view.contentDOM),step=elementGridStep(view.contentDOM);
      const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0;
      const dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
      save(width/scale,(left-bounds.left)/scale+dx,(top-bounds.top)/scale+dy,true);
    };
    resize.onkeydown = event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const { x, y } = imageLayout(parts.source.src);
      const step=elementGridStep(view.contentDOM);
      save(Math.max(step*4, preview.getBoundingClientRect().width/elementScale(view.contentDOM) + (event.key === 'ArrowLeft' ? -step : step)), x, y);
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
      const initialX = (boxRect.left - origin.left)/scale, initialY = (boxRect.top - origin.top)/scale;
      let x = original.x, y = original.y, width = imageRect.width/scale;
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
          const bounds = content.getBoundingClientRect();
          x = snapGridBounded(initialX + (dx + origin.left - bounds.left)/scale,Math.max(0,content.clientWidth-width),step);
          y = snapGridBounded(initialY + (dy + origin.top - bounds.top)/scale,100000,step);
          const next=snapNoteWidgetPosition(box,{x,y,width,height:boxRect.height/scale,z},content,step);x=next.x;y=next.y;
        } else width = Math.min(Math.floor(1600/step)*step,Math.max(step*4,Math.round((imageRect.width/scale+dx/scale)/step)*step));
        applyLayout(parts,{width,x,y,z});
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
          save(width,x,y,moving);
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
