import {invoke,isTauri} from '@tauri-apps/api/core';
import {nativeNotePng,nativeGraphPng,nativeCanvasPng} from './nativePng';
const nextPaint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
function blobUrl(blob:Blob) {return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
export async function captureNotePng(area:HTMLElement,height:number):Promise<Blob> {
 const resources=new Map<string,Promise<string>>();
 const embed=(url:string)=>{
  if(url.startsWith('data:')||url.startsWith('#'))return Promise.resolve(url);
  const absolute=new URL(url,location.href).href;let result=resources.get(absolute);
  if(!result){result=fetch(absolute).then(response=>{if(!response.ok)throw Error('Не удалось загрузить ресурс PNG: '+url);return response.blob();}).then(blobUrl);resources.set(absolute,result);}return result;
 };
 const inlineUrls=async(css:string,base=location.href)=>{for(const match of [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)])css=css.replace(match[0],'url("'+await embed(new URL(match[1],base).href)+'")');return css;};
 const copyStyle=(original:Element,copy:Element,pseudo?:string)=>{const style=getComputedStyle(original,pseudo);(copy as HTMLElement).style.cssText=Array.from(style).map(key=>key+':'+style.getPropertyValue(key)).join(';');return style;};
 const clone=area.cloneNode(true) as HTMLElement;
 const originals=[area,...area.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')],families=new Set<string>();
 await Promise.all(originals.map(async(original,index)=>{
  const copy=copies[index],style=copyStyle(original,copy);style.fontFamily.split(',').forEach(name=>families.add(name.trim().replace(/["']/g,'').toLowerCase()));
  if(original instanceof HTMLImageElement&&original.currentSrc){(copy as HTMLImageElement).src=await embed(original.currentSrc);copy.removeAttribute('srcset');copy.removeAttribute('loading');}
  if(original instanceof HTMLTextAreaElement)copy.textContent=original.value;
  if(original instanceof HTMLInputElement)(copy as HTMLInputElement).setAttribute('value',original.value);
  if(original instanceof HTMLCanvasElement){const img=document.createElement('img');img.src=original.toDataURL();copyStyle(original,img);copy.replaceWith(img);return;}
  (copy as HTMLElement).style.backgroundImage=await inlineUrls(style.backgroundImage);
  // HTML pseudo-elements cannot be inserted into SVG paths and clip paths.
  if(original instanceof HTMLElement)for(const pseudo of ['::before','::after']){const ps=getComputedStyle(original,pseudo);if(ps.content==='none'||ps.content==='normal')continue;const element=document.createElement('span');copyStyle(original,element,pseudo);element.style.backgroundImage=await inlineUrls(ps.backgroundImage);element.textContent=ps.content==='""'?'':ps.content.replace(/^"|"$/g,'');copy.append(element);}
 }));
 clone.querySelectorAll('.note-insert-menu,.floating-note-resize,.canvas-widget-resize,.cm-cursorLayer,.cm-selectionLayer,.note-code-menu,.canvas-align-guide').forEach(node=>node.remove());
 let background:Element|null=area;while(background){const color=getComputedStyle(background).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent'){clone.style.backgroundColor=color;break;}background=background.parentElement;}
 Object.assign(clone.style,{width:area.clientWidth+'px',height:height+'px',maxHeight:'none',position:'relative',inset:'auto',margin:'0',overflow:'hidden',flex:'none',transform:'none'});
 const scroll=clone.querySelector<HTMLElement>('.editor-scroll');if(scroll)Object.assign(scroll.style,{height:height+'px',maxHeight:'none',overflow:'visible',flex:'none'});
 let fonts='';for(const sheet of document.styleSheets){let rules:CSSRuleList;try{rules=sheet.cssRules;}catch{continue;}for(const rule of rules)if(rule instanceof CSSFontFaceRule&&families.has(rule.style.fontFamily.replace(/["']/g,'').toLowerCase()))fonts+=await inlineUrls(rule.cssText,sheet.href??location.href);}
 const style=document.createElement('style');style.textContent=fonts;clone.prepend(style);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',String(area.clientWidth));svg.setAttribute('height',String(height));
 const foreign=document.createElementNS(svg.namespaceURI,'foreignObject');foreign.setAttribute('width','100%');foreign.setAttribute('height','100%');foreign.append(clone);svg.append(foreign);
 const serialized=new XMLSerializer().serializeToString(svg),parsed=new DOMParser().parseFromString(serialized,'image/svg+xml');if(parsed.querySelector('parsererror'))throw Error('Не удалось подготовить изображение заметки.');
 const image=new Image();image.src=await blobUrl(new Blob([serialized],{type:'image/svg+xml;charset=utf-8'}));try{await image.decode();}catch{throw Error('Не удалось отрисовать заметку в PNG.');}
 const canvas=document.createElement('canvas');canvas.width=area.clientWidth;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw Error('PNG недоступен');context.drawImage(image,0,0);
 return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Не удалось создать PNG')),'image/png'));
}
export async function saveNotePng(windowElement:HTMLElement,name:string) {
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
 await document.fonts.ready;await Promise.all([...area.querySelectorAll('img')].map(image=>image.decode().catch(()=>{})));
 const blob=await exporting(area,()=>isTauri()?nativeGraphPng(area):captureNotePng(area,area.clientHeight));await savePng(blob,name);
}

async function captureCanvas(windowElement:HTMLElement):Promise<Blob> {
 const viewport=windowElement.querySelector<HTMLElement>('.canvas-viewport'),world=viewport?.querySelector<HTMLElement>('.canvas-world');
 if(!viewport||!world)throw Error('Откройте полотно для экспорта.');
 await document.fonts.ready;await Promise.all([...viewport.querySelectorAll('img')].map(image=>image.decode().catch(()=>{})));
 const rects=[...world.querySelectorAll<HTMLElement>(':scope > .canvas-widget')].map(item=>({x:item.offsetLeft,y:item.offsetTop,width:item.offsetWidth,height:item.offsetHeight}));
 for(const line of world.querySelectorAll<SVGGraphicsElement>('.canvas-strokes polyline')){const box=line.getBBox(),pad=(parseFloat(line.getAttribute('stroke-width')??'0')||0)/2;rects.push({x:box.x-pad,y:box.y-pad,width:box.width+pad*2,height:box.height+pad*2});}
 const padding=24,minX=Math.floor(Math.min(...(rects.length?rects.map(r=>r.x):[0]))-padding),minY=Math.floor(Math.min(...(rects.length?rects.map(r=>r.y):[0]))-padding);
 const bounds={x:minX,y:minY,width:Math.ceil(Math.max(...(rects.length?rects.map(r=>r.x+r.width):[viewport.clientWidth]))-minX+padding),height:Math.ceil(Math.max(...(rects.length?rects.map(r=>r.y+r.height):[viewport.clientHeight]))-minY+padding)};
 if(bounds.width<1||bounds.height<1||bounds.width*bounds.height>64000000||bounds.width>32767||bounds.height>32767)throw Error('Полотно слишком большое для одного изображения.');
 return exporting(viewport,async()=>{
  if(isTauri())return nativeCanvasPng(viewport,bounds);
  const previous=viewport.style.cssText,transform=world.style.transform;
  try{Object.assign(viewport.style,{position:'fixed',left:'0',top:'0',width:bounds.width+'px',height:bounds.height+'px',maxWidth:'none',maxHeight:'none',flex:'none',zIndex:'10000'});world.style.transform=`translate(${-bounds.x}px,${-bounds.y}px) scale(1)`;viewport.style.setProperty('--canvas-grid-x',`${-bounds.x}px`);viewport.style.setProperty('--canvas-grid-y',`${-bounds.y}px`);viewport.style.setProperty('--canvas-grid-zoom','1');await nextPaint();return await captureNotePng(viewport,bounds.height);}
  finally{viewport.style.cssText=previous;world.style.transform=transform;}
 });
}
export async function saveCanvasPng(windowElement:HTMLElement,name:string){await savePng(await captureCanvas(windowElement),name)}
export async function printCanvasPdf(windowElement:HTMLElement,name:string){
 const blob=await captureCanvas(windowElement),url=URL.createObjectURL(blob),article=document.createElement('article'),img=document.createElement('img'),previous=document.title;
 article.className='note-print';img.alt=name;img.src=url;article.append(img);document.body.append(article);
 const finish=()=>{article.remove();URL.revokeObjectURL(url);document.title=previous;window.removeEventListener('afterprint',finish)};
 try{await img.decode();document.title=name;window.addEventListener('afterprint',finish,{once:true});window.print()}catch(error){finish();throw error}
}
