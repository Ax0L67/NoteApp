import {invoke} from '@tauri-apps/api/core';
const paint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
export function pngCanvas(width:number,height:number) {
 if(width<1||height<1||width*height>64000000||width>32767||height>32767)throw Error('Изображение слишком большое для одного PNG.');
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(width);canvas.height=Math.ceil(height);return canvas;
}
export const canvasBlob=(canvas:HTMLCanvasElement)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Не удалось создать PNG')),'image/png'));
async function tile(area:HTMLElement) {
 await paint();const rect=area.getBoundingClientRect();
 if(area.clientWidth<1||area.clientHeight<1)throw Error('Открой окно целиком перед экспортом.');
 const data=await invoke<string>('capture_png_region',{x:Math.max(0,rect.left),y:Math.max(0,rect.top),width:area.clientWidth,height:area.clientHeight});
 const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();return image;
}
export async function nativeNotePng(scroll:HTMLElement) {
 const top=scroll.scrollTop,behavior=scroll.style.scrollBehavior,height=scroll.scrollHeight,width=scroll.clientWidth;
 const canvas=pngCanvas(width,height),context=canvas.getContext('2d')!;
 try{
  scroll.style.scrollBehavior='auto';
  for(let y=0;y<height;){scroll.scrollTop=y;const image=await tile(scroll),offset=y-scroll.scrollTop,h=Math.min(scroll.clientHeight-offset,height-y),scale=image.height/scroll.clientHeight;
   if(h<=0)throw Error('Размер заметки изменился во время экспорта. Повтори сохранение.');
   context.drawImage(image,0,offset*scale,image.width,h*scale,0,y,width,h);y+=h;
  }
 }finally{scroll.scrollTop=top;scroll.style.scrollBehavior=behavior;}
 return canvasBlob(canvas);
}
export async function nativeGraphPng(scroll:HTMLElement) {
 const content=scroll.querySelector<HTMLElement>('.graph-canvas');if(!content)throw Error('Открой карту связей.');
 const nodes=[...content.querySelectorAll<HTMLElement>('.graph-card,.graph-annotation')];
 const edges=content.querySelector<SVGSVGElement>('.graph-edges');
 const rects=nodes.map(node=>({x:node.offsetLeft,y:node.offsetTop,width:node.offsetWidth,height:node.offsetHeight}));
 if(edges)rects.push({x:parseFloat(edges.style.left)||0,y:parseFloat(edges.style.top)||0,width:edges.width.baseVal.value,height:edges.height.baseVal.value});
 if(!scroll.clientWidth||!scroll.clientHeight)throw Error('Открой окно карты перед экспортом.');
 const padding=24,minX=Math.min(...(rects.length?rects.map(r=>r.x):[0]))-padding,minY=Math.min(...(rects.length?rects.map(r=>r.y):[0]))-padding;
 const width=Math.ceil(Math.max(minX+scroll.clientWidth,...rects.map(r=>r.x+r.width))-minX+padding),height=Math.ceil(Math.max(minY+scroll.clientHeight,...rects.map(r=>r.y+r.height))-minY+padding);
 const canvas=pngCanvas(width,height),context=canvas.getContext('2d')!,previous=content.style.cssText;
 try{
  for(let y=0;y<height;y+=scroll.clientHeight)for(let x=0;x<width;x+=scroll.clientWidth){
   content.style.transform=`translate(${-minX-x}px,${-minY-y}px) scale(1)`;
   const image=await tile(scroll),w=Math.min(scroll.clientWidth,width-x),h=Math.min(scroll.clientHeight,height-y);
   context.drawImage(image,0,0,w*image.width/scroll.clientWidth,h*image.height/scroll.clientHeight,x,y,w,h);
  }
 }finally{content.style.cssText=previous;}
 return canvasBlob(canvas);
}
