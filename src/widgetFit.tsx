import {useLayoutEffect,useRef,type ReactNode} from 'react';

export function widgetFitScale(width:number,height:number,contentWidth:number,contentHeight:number) {
  if(width<=0||height<=0||contentWidth<=0||contentHeight<=0)return 1;
  return Math.min(width/contentWidth,height/contentHeight);
}

export function fitWidgetContent(viewport:HTMLElement,content:HTMLElement,baseWidth:number,userScale:()=>number=()=>1) {
  let frame=0;
  content.style.width=`${Math.max(160,baseWidth)}px`;
  const update=()=>{
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      for(const field of content.querySelectorAll<HTMLTextAreaElement>('textarea')){
        if(field.scrollHeight>field.clientHeight+1)field.style.height=`${field.scrollHeight+2}px`;
      }
      const style=getComputedStyle(viewport);
      const width=viewport.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0);
      const height=viewport.clientHeight-(parseFloat(style.paddingTop)||0)-(parseFloat(style.paddingBottom)||0);
      if(width<=0||height<=0)return;
      const base=Math.max(160,Math.min(baseWidth,width/Math.max(.5,Math.min(2,userScale()))));
      content.style.width=`${base}px`;
      content.style.minHeight="0";
      for(let i=0;i<3;i++){
        const naturalWidth=Math.max(content.offsetWidth,content.scrollWidth),naturalHeight=Math.max(content.offsetHeight,content.scrollHeight,1);
       const scale=Math.min(1.2,widgetFitScale(width,height,naturalWidth,naturalHeight));
        const target=Math.min(4000,Math.max(base,width/scale));
        if(target<=content.offsetWidth+1)break;
        content.style.width=`${target}px`;
      }
      const naturalWidth=Math.max(content.offsetWidth,content.scrollWidth),naturalHeight=Math.max(content.offsetHeight,content.scrollHeight,1);
       const scale=Math.min(1.2,widgetFitScale(width,height,naturalWidth,naturalHeight));
       const fitted=Math.min(widgetFitScale(width,height,naturalWidth,naturalHeight),scale*Math.max(.5,Math.min(2,userScale())));
       content.style.transform=`scale(${fitted})`;
       content.style.minHeight=`${height/fitted}px`;
    });
  };
  const resize=new ResizeObserver(update);resize.observe(viewport);resize.observe(content);
  const mutation=new MutationObserver(update);mutation.observe(content,{childList:true,subtree:true,characterData:true});
  content.addEventListener('input',update);
  viewport.addEventListener('widget-fit-change',update);
  update();
  return ()=>{cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();content.removeEventListener('input',update);viewport.removeEventListener('widget-fit-change',update);};
}

export function refreshWidgetFit(viewport:HTMLElement) { viewport.dispatchEvent(new Event('widget-fit-change')); }

export function FittedWidget({children,baseWidth=620,scale=1}:{children:ReactNode;baseWidth?:number;scale?:number}) {
  const viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    if(!viewport.current||!content.current)return;
    return fitWidgetContent(viewport.current,content.current,baseWidth,()=>scale);
  },[baseWidth,scale]);
  return <div className="widget-fit-viewport" ref={viewport}><div className="widget-fit-content" ref={content}>{children}</div></div>;
}
