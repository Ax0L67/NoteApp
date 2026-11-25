import {invoke,isTauri} from '@tauri-apps/api/core';
import {nativeNotePng,nativeGraphPng,nativeCanvasPng} from './nativePng';
const nextPaint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
function blobUrl(blob:Blob) {return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
export async function captureNotePng(area:HTMLElement,height:number,options?:{width?:number;transparent?:boolean;exclude?:(element:Element)=>boolean;restoreCovered?:(element:Element)=>boolean;prepare?:(clone:HTMLElement)=>void}):Promise<Blob> {
 const resources=new Map<string,Promise<string>>();
 const embed=(url:string)=>{
  if(url.startsWith('data:')||url.startsWith('#'))return Promise.resolve(url);
  const absolute=new URL(url,location.href).href;let result=resources.get(absolute);
  if(!result){result=fetch(absolute).then(response=>{if(!response.ok)throw Error('Не удалось загрузить ресурс PNG: '+url);return response.blob();}).then(blobUrl);resources.set(absolute,result);}return result;
 };
 const inlineUrls=async(css:string,base=location.href)=>{for(const match of [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)])css=css.replace(match[0],'url("'+await embed(new URL(match[1],base).href)+'")');return css;};
 const copyStyle=(original:Element,copy:Element,pseudo?:string)=>{const style=getComputedStyle(original,pseudo);(copy as HTMLElement).style.cssText=Array.from(style).map(key=>key+':'+style.getPropertyValue(key)).join(';');return style;};
 const clone=area.cloneNode(true) as HTMLElement;
 const originals=[area,...area.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')],families=new Set<string>(),excluded=new Set<Element>();
 if(options?.exclude)for(const element of originals)if((element.parentElement&&excluded.has(element.parentElement))||options.exclude(element))excluded.add(element);
 await Promise.all(originals.map(async(original,index)=>{
  const copy=copies[index];if(excluded.has(original)){copy.remove();return}const style=copyStyle(original,copy);style.fontFamily.split(',').forEach(name=>families.add(name.trim().replace(/["']/g,'').toLowerCase()));
  if(options?.restoreCovered?.(original))(copy as HTMLElement).style.opacity=(original as HTMLElement).style.opacity||original.getAttribute('opacity')||'1';
  if(original instanceof HTMLImageElement&&original.currentSrc){(copy as HTMLImageElement).src=await embed(original.currentSrc);copy.removeAttribute('srcset');copy.removeAttribute('loading');}
  if(original instanceof HTMLTextAreaElement)copy.textContent=original.value;
  if(original instanceof HTMLInputElement){(copy as HTMLInputElement).setAttribute('value',original.value);if(original.type==='checkbox'||original.type==='radio')(copy as HTMLInputElement).toggleAttribute('checked',original.checked);}
  if(original instanceof HTMLCanvasElement){const img=document.createElement('img');img.src=original.toDataURL();copyStyle(original,img);if(options?.restoreCovered?.(original))img.style.opacity=original.style.opacity||'1';copy.replaceWith(img);return;}
  (copy as HTMLElement).style.backgroundImage=await inlineUrls(style.backgroundImage);
  // HTML pseudo-elements cannot be inserted into SVG paths and clip paths.
  if(original instanceof HTMLElement)for(const pseudo of ['::before','::after']){const ps=getComputedStyle(original,pseudo);if(ps.content==='none'||ps.content==='normal')continue;const element=document.createElement('span');copyStyle(original,element,pseudo);element.style.backgroundImage=await inlineUrls(ps.backgroundImage);element.textContent=ps.content==='""'?'':ps.content.replace(/^"|"$/g,'');copy.append(element);}
 }));
 clone.querySelectorAll('.note-insert-menu,.floating-note-resize,.canvas-widget-resize,.cm-cursorLayer,.cm-selectionLayer,.note-code-menu,.canvas-align-guide,.task-card-drag,.task-card-move,.task-column-drag').forEach(node=>node.remove());
 if(!options?.transparent){let background:Element|null=area;while(background){const color=getComputedStyle(background).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent'){clone.style.backgroundColor=color;break;}background=background.parentElement;}}else clone.style.backgroundColor='transparent';
 const width=options?.width??area.clientWidth;Object.assign(clone.style,{width:width+'px',height:height+'px',maxHeight:'none',position:'relative',inset:'auto',margin:'0',overflow:'hidden',flex:'none',transform:'none'});options?.prepare?.(clone);
 const scroll=clone.querySelector<HTMLElement>('.editor-scroll');if(scroll)Object.assign(scroll.style,{height:height+'px',maxHeight:'none',overflow:'visible',flex:'none'});
 let fonts='';for(const sheet of document.styleSheets){let rules:CSSRuleList;try{rules=sheet.cssRules;}catch{continue;}for(const rule of rules)if(rule instanceof CSSFontFaceRule&&families.has(rule.style.fontFamily.replace(/["']/g,'').toLowerCase()))fonts+=await inlineUrls(rule.cssText,sheet.href??location.href);}
 const style=document.createElement('style');style.textContent=fonts;clone.prepend(style);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));
 const foreign=document.createElementNS(svg.namespaceURI,'foreignObject');foreign.setAttribute('width','100%');foreign.setAttribute('height','100%');foreign.append(clone);svg.append(foreign);
 const serialized=new XMLSerializer().serializeToString(svg),parsed=new DOMParser().parseFromString(serialized,'image/svg+xml');if(parsed.querySelector('parsererror'))throw Error('Не удалось подготовить изображение заметки.');
 const image=new Image();image.src=await blobUrl(new Blob([serialized],{type:'image/svg+xml;charset=utf-8'}));try{await image.decode();}catch{throw Error('Не удалось отрисовать заметку в PNG.');}
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw Error('PNG недоступен');context.drawImage(image,0,0);
 return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Не удалось создать PNG')),'image/png'));
}
export async function captureFrameComposition(frame:HTMLElement):Promise<HTMLCanvasElement>{
 const viewport=frame.closest<HTMLElement>('.canvas-viewport'),world=frame.parentElement;if(!viewport||!world||!frame.dataset.widgetId)throw Error('Frame недоступен для шейдера.');
 const x=frame.offsetLeft,y=frame.offsetTop,width=frame.offsetWidth,height=frame.offsetHeight;if(!width||!height||width*height>64000000)throw Error('Недопустимый размер Frame.');
 const allowed=new Set<Element>([frame]);for(const child of Array.from(world.children)){if(!(child instanceof HTMLElement)||!child.classList.contains('canvas-widget')||child===frame)continue;if(child.offsetLeft>=x&&child.offsetTop>=y&&child.offsetLeft+child.offsetWidth<=x+width&&child.offsetTop+child.offsetHeight<=y+height)allowed.add(child)}
 const id=frame.dataset.widgetId!;
 const nestedOutput=(element:Element)=>element instanceof HTMLCanvasElement&&element.classList.contains('canvas-frame-shader-output')&&!!element.dataset.shaderOwner&&element.dataset.shaderOwner!==id&&Array.from(allowed).some(item=>(item as HTMLElement).dataset.widgetId===element.dataset.shaderOwner);
 const blob=await captureNotePng(viewport,height,{width,transparent:true,restoreCovered:element=>{const owners=(element as HTMLElement).dataset?.frameShaderCovered?.split(' ').filter(Boolean);return !!owners?.includes(id)&&owners.every(owner=>owner===id)},exclude:element=>{
  if(element!==viewport&&!world.contains(element)&&element!==world)return true;
  if(world.contains(element)&&element!==world){let top:Element=element;while(top.parentElement&&top.parentElement!==world)top=top.parentElement;if(top.parentElement===world&&!allowed.has(top)&&!nestedOutput(top)&&!(top instanceof SVGElement&&top.classList.contains('canvas-strokes')))return true}
  const widget=element.closest('.canvas-widget');if(widget&&world.contains(widget)&&!allowed.has(widget))return true;
  if(element.classList.contains('canvas-frame-shader-output')&&!nestedOutput(element))return true;
  if(element.closest('.canvas-shape-points,.canvas-radius-handle,.canvas-widget-resize,.canvas-line-handles'))return true;
  if(widget===frame){const direct=element.closest('.canvas-widget > header,.canvas-widget > .canvas-shader-canvas,.canvas-widget > .canvas-filter-defs,.canvas-widget > .canvas-effect-overlay,.canvas-widget > .canvas-frame-guides');if(direct&&direct.parentElement===frame)return true}
  return false;
 },prepare:clone=>{
  const backdrop=clone.querySelector(':scope > .note-backdrop');backdrop?.remove();const cloneWorld=clone.querySelector<HTMLElement>('.canvas-world');if(!cloneWorld)throw Error('Полотно Frame недоступно.');
  cloneWorld.style.transform=`translate(${-x}px,${-y}px) scale(1)`;cloneWorld.style.transformOrigin='0 0';
  const copied=Array.from(cloneWorld.querySelectorAll<HTMLElement>(':scope > .canvas-widget')).find(element=>element.dataset.widgetId===id);if(!copied)throw Error('Frame не найден в снимке.');
  copied.style.opacity='1';copied.style.outline='none';copied.style.boxShadow='none';const body=copied.querySelector<HTMLElement>(':scope > .canvas-frame-body');if(body){body.style.filter='none';body.style.opacity='1'}
 }});
 const url=URL.createObjectURL(blob);try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw Error('Не удалось создать изображение Frame.');context.drawImage(image,0,0);return canvas}finally{URL.revokeObjectURL(url)}
}
export async function captureWidgetComposition(widget:HTMLElement):Promise<HTMLCanvasElement>{
 const width=widget.offsetWidth,height=widget.offsetHeight;if(!width||!height||width*height>64000000)throw Error('Недопустимый размер объекта.');
 const blob=await captureNotePng(widget,height,{width,transparent:true,restoreCovered:element=>element.parentElement===widget,exclude:element=>element!==widget&&!!element.closest('.canvas-shader-canvas,.canvas-filter-defs,.canvas-widget-resize,.canvas-radius-handle,.canvas-shape-points,.canvas-line-handles'),prepare:clone=>{clone.style.filter='none';clone.style.opacity='1';clone.style.outline='none';clone.style.transform='none';clone.style.background=widget.style.background||getComputedStyle(widget).background}});
 const url=URL.createObjectURL(blob);try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw Error('Не удалось создать изображение объекта.');context.drawImage(image,0,0);return canvas}finally{URL.revokeObjectURL(url)}
}
export async function saveNotePng(windowElement:HTMLElement,name:string) {
 const kanban=windowElement.querySelector<HTMLElement>('.kanban-note');
 if(kanban){await saveKanbanPng(kanban,name);return;}
 const area=windowElement.querySelector<HTMLElement>('.note-editor-area');if(!area)throw Error('Открой заметку для экспорта');await document.fonts.ready;
 await Promise.all([...area.querySelectorAll('img')].map(image=>image.decode().catch(()=>{})));
 const scroll=area.querySelector<HTMLElement>('.editor-scroll'),content=area.querySelector<HTMLElement>('.note-zoom-content');
 const height=Math.ceil(Math.max(area.clientHeight,scroll?.scrollHeight??0,content?.getBoundingClientRect().height??0));
 if(!area.clientWidth||area.clientWidth*height>64000000||height>32767)throw Error('Заметка слишком большая для одного PNG. Раздели её на несколько заметок.');
 if(isTauri()&&scroll){await savePng(await exporting(area,()=>nativeNotePng(scroll)),name);return;}
 const previousArea=area.style.cssText,previous=scroll?.style.cssText,top=scroll?.scrollTop??0;let blob:Blob;
 try{Object.assign(area.style,{height:height+'px',minHeight:height+'px',flex:'none'});if(scroll){Object.assign(scroll.style,{height:height+'px',maxHeight:'none',overflow:'visible',flex:'none'});scroll.scrollTop=0;}await nextPaint();blob=await captureNotePng(area,height);}finally{area.style.cssText=previousArea;if(scroll){scroll.style.cssText=previous??'';scroll.scrollTop=top;}}
 await savePng(blob,name);
}
export function kanbanExportWidth(columns:number[],gap:number,padding:number) {
 return Math.ceil(columns.reduce((sum,width)=>sum+width,0)+Math.max(0,columns.length-1)*gap+padding);
}
async function saveKanbanPng(area:HTMLElement,name:string) {
 await document.fonts.ready;
 await Promise.all([...area.querySelectorAll('img')].map(image=>image.decode().catch(()=>{})));
 const columns=area.querySelector<HTMLElement>('.task-board-columns'),previous=area.style.cssText,columnStyle=columns?.style.cssText,top=area.scrollTop,left=area.scrollLeft,columnLeft=columns?.scrollLeft??0,columnTop=columns?.scrollTop??0;
 if(!columns)throw Error('Не удалось найти столбцы доски.');
 const areaStyle=getComputedStyle(area),columnStyleValues=getComputedStyle(columns),number=(value:string)=>parseFloat(value)||0;
 const padding=number(areaStyle.paddingLeft)+number(areaStyle.paddingRight)+number(areaStyle.borderLeftWidth)+number(areaStyle.borderRightWidth)+number(columnStyleValues.paddingLeft)+number(columnStyleValues.paddingRight);
 const widths=Array.from(columns.querySelectorAll<HTMLElement>(':scope > .task-board-column')).map(column=>column.offsetWidth);
 const width=widths.length?kanbanExportWidth(widths,number(columnStyleValues.columnGap),padding):Math.ceil(padding+250);
 let blob:Blob;
 try{
  blob=await exporting(area,async()=>{
   Object.assign(area.style,{position:'fixed',left:'0',top:'0',width:width+'px',maxWidth:'none',height:'auto',maxHeight:'none',overflow:'visible',zIndex:'10000'});
   columns.style.overflow='visible';columns.scrollLeft=0;columns.scrollTop=0;
   await nextPaint();
   const height=Math.ceil(Math.max(area.scrollHeight,area.getBoundingClientRect().height));
   if(!width||!height||width*height>64000000||width>32767||height>32767)throw Error('Доска слишком большая для одного PNG.');
   return captureNotePng(area,height);
  });
 }finally{area.style.cssText=previous;columns.style.cssText=columnStyle??'';columns.scrollLeft=columnLeft;columns.scrollTop=columnTop;area.scrollTop=top;area.scrollLeft=left;}
 await savePng(blob,name);
}
async function savePng(blob:Blob,name:string) {
 const fileName=name.replace(/[\\/:*?"<>|]/g,'_')+'.png';
 if(isTauri())await invoke('save_note_png',{bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),fileName});
 else {const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
let busy=false;
async function exporting<T>(area:HTMLElement,run:()=>Promise<T>):Promise<T> {
 if(busy)throw Error('Дождись завершения текущего экспорта.');busy=true;
 const app=area.closest('.app');app?.setAttribute('data-png-export','');
 try{await nextPaint();return await run();}finally{app?.removeAttribute('data-png-export');busy=false;}
}
export async function saveGraphPng(windowElement:HTMLElement,name:string) {
 const area=windowElement.querySelector<HTMLElement>('.graph-scroll');if(!area)throw Error('Открой карту связей для экспорта.');
 const blob=await exporting(area,async()=>{await document.fonts.ready;await Promise.all([...area.querySelectorAll('img')].map(image=>image.decode().catch(()=>{})));return isTauri()?nativeGraphPng(area):captureNotePng(area,area.clientHeight)});await savePng(blob,name);
}

async function captureCanvas(windowElement:HTMLElement):Promise<Blob> {
 const viewport=windowElement.querySelector<HTMLElement>('.canvas-viewport'),world=viewport?.querySelector<HTMLElement>('.canvas-world');
 if(!viewport||!world)throw Error('Откройте полотно для экспорта.');
 viewport.setAttribute('data-canvas-export','');
 try {
 await nextPaint();
 await document.fonts.ready;await Promise.all([...viewport.querySelectorAll('img')].map(image=>image.decode().catch(()=>{})));
 const rects=[...world.querySelectorAll<HTMLElement>(':scope > .canvas-widget')].map(item=>({x:item.offsetLeft,y:item.offsetTop,width:item.offsetWidth,height:item.offsetHeight}));
 for(const line of world.querySelectorAll<SVGGraphicsElement>('.canvas-strokes polyline')){const box=line.getBBox(),pad=(parseFloat(line.getAttribute('stroke-width')??'0')||0)/2;rects.push({x:box.x-pad,y:box.y-pad,width:box.width+pad*2,height:box.height+pad*2});}
 const padding=24,minX=Math.floor(Math.min(...(rects.length?rects.map(r=>r.x):[0]))-padding),minY=Math.floor(Math.min(...(rects.length?rects.map(r=>r.y):[0]))-padding);
 const bounds={x:minX,y:minY,width:Math.ceil(Math.max(...(rects.length?rects.map(r=>r.x+r.width):[viewport.clientWidth]))-minX+padding),height:Math.ceil(Math.max(...(rects.length?rects.map(r=>r.y+r.height):[viewport.clientHeight]))-minY+padding)};
 if(bounds.width<1||bounds.height<1||bounds.width*bounds.height>64000000||bounds.width>32767||bounds.height>32767)throw Error('Полотно слишком большое для одного изображения.');
 return await exporting(viewport,async()=>{
  if(isTauri())return nativeCanvasPng(viewport,bounds);
  const previous=viewport.style.cssText,transform=world.style.transform;
  try{Object.assign(viewport.style,{position:'fixed',left:'0',top:'0',width:bounds.width+'px',height:bounds.height+'px',maxWidth:'none',maxHeight:'none',flex:'none',zIndex:'10000'});world.style.transform=`translate(${-bounds.x}px,${-bounds.y}px) scale(1)`;viewport.style.setProperty('--canvas-grid-x',`${-bounds.x}px`);viewport.style.setProperty('--canvas-grid-y',`${-bounds.y}px`);viewport.style.setProperty('--canvas-grid-zoom','1');await nextPaint();return await captureNotePng(viewport,bounds.height);}
  finally{viewport.style.cssText=previous;world.style.transform=transform;}
 });
 } finally {viewport.removeAttribute('data-canvas-export');}
}
export async function saveCanvasPng(windowElement:HTMLElement,name:string){await savePng(await captureCanvas(windowElement),name)}
export async function saveCanvasObjectPng(windowElement:HTMLElement,id:string,name:string,scale=1,format:'png'|'jpeg'='png') {
 const viewport=windowElement.querySelector<HTMLElement>('.canvas-viewport'),world=viewport?.querySelector<HTMLElement>('.canvas-world');
 if(!viewport||!world)throw Error('Откройте полотно перед экспортом.');
 if(busy)throw Error('Дождитесь завершения текущего экспорта.');busy=true;
 viewport.setAttribute('data-canvas-export','');
 try {
  await nextPaint();await document.fonts.ready;
  const widgets=Array.from(world.querySelectorAll<HTMLElement>(':scope > .canvas-widget'));
  const target=widgets.find(widget=>widget.dataset.widgetId===id);if(!target)throw Error('Объект для экспорта не найден.');
  const bounds={x:target.offsetLeft,y:target.offsetTop,width:target.offsetWidth,height:target.offsetHeight};
  if(!bounds.width||!bounds.height)throw Error('Размер объекта недоступен.');
  const factor=Math.max(.25,Math.min(8,Number.isFinite(scale)?scale:1));
  if(bounds.width*bounds.height*factor*factor>64000000||bounds.width*factor>32767||bounds.height*factor>32767)throw Error('Объект слишком большой для экспорта.');
  const frame=!!target.querySelector(':scope > .canvas-frame-body');
  const hidden:{element:HTMLElement|SVGElement;value:string;priority:string}[]=[];
  const previousViewport=viewport.style.cssText,previousWorld=world.style.cssText;
  const app=viewport.closest('.app'),hadExport=app?.hasAttribute('data-png-export');app?.setAttribute('data-png-export','');
  const contains=(widget:HTMLElement)=>widget.offsetLeft>=bounds.x&&widget.offsetTop>=bounds.y&&widget.offsetLeft+widget.offsetWidth<=bounds.x+bounds.width&&widget.offsetTop+widget.offsetHeight<=bounds.y+bounds.height;
  try {
   for(const element of Array.from(world.children)){if(!(element instanceof HTMLElement||element instanceof SVGElement))continue;if(element===target||(frame&&element instanceof HTMLElement&&element.classList.contains('canvas-widget')&&contains(element))||(frame&&element instanceof SVGElement&&element.classList.contains('canvas-strokes')))continue;hidden.push({element,value:element.style.getPropertyValue('visibility'),priority:element.style.getPropertyPriority('visibility')});element.style.setProperty('visibility','hidden','important')}
   Object.assign(viewport.style,{position:'fixed',left:'0',top:'0',width:`${bounds.width}px`,height:`${bounds.height}px`,minHeight:'0',maxWidth:'none',maxHeight:'none',flex:'none',zIndex:'10000'});
   world.style.transform=`translate(${-bounds.x}px,${-bounds.y}px) scale(1)`;
   await nextPaint();await Promise.all(Array.from(viewport.querySelectorAll('img')).map(image=>image.decode().catch(()=>{})));
   let blob=await captureNotePng(viewport,bounds.height);
   if(factor!==1||format==='jpeg'){const url=URL.createObjectURL(blob),image=new Image();try{image.src=url;await image.decode();const canvas=document.createElement('canvas'),style=getComputedStyle(target);canvas.width=Math.round((parseFloat(style.width)||bounds.width)*factor);canvas.height=Math.round((parseFloat(style.height)||bounds.height)*factor);const context=canvas.getContext('2d');if(!context)throw Error('Не удалось масштабировать изображение.');if(format==='jpeg'){context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height)}context.drawImage(image,0,0,canvas.width,canvas.height);blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Не удалось создать изображение.')),format==='jpeg'?'image/jpeg':'image/png',.92))}finally{URL.revokeObjectURL(url)}}
   if(format==='png')await savePng(blob,name);else {const fileName=name.replace(/[\\/:*?"<>|]/g,'_')+'.jpg';if(isTauri())await invoke('save_note_jpeg',{bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),fileName});else {const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}
  } finally {for(const {element,value,priority} of hidden){if(value)element.style.setProperty('visibility',value,priority);else element.style.removeProperty('visibility')}viewport.style.cssText=previousViewport;world.style.cssText=previousWorld;if(!hadExport)app?.removeAttribute('data-png-export')}
 } finally {viewport.removeAttribute('data-canvas-export');busy=false}
}
export async function printCanvasPdf(windowElement:HTMLElement,name:string){
 const blob=await captureCanvas(windowElement),url=URL.createObjectURL(blob),article=document.createElement('article'),img=document.createElement('img'),previous=document.title;
 article.className='note-print';img.alt=name;img.src=url;article.append(img);document.body.append(article);
 const finish=()=>{article.remove();URL.revokeObjectURL(url);document.title=previous;window.removeEventListener('afterprint',finish)};
 try{await img.decode();document.title=name;window.addEventListener('afterprint',finish,{once:true});window.print()}catch(error){finish();throw error}
}
