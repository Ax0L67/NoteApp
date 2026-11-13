import {cloneElement,useEffect,useLayoutEffect,useRef,useState,type HTMLAttributes,type ReactElement} from 'react';
import {captureLayout,animateLayout} from './layoutMotion';
import {mergeTabOrder,reorderTab} from './tabOrder';

export default function ReorderTabs({items,order,change,active,windowId,transfer}:{
  items:ReactElement<HTMLAttributes<HTMLDivElement>>[];
  order:string[];
  change:(order:string[])=>void;
  active:string;
  windowId?:string;
  transfer?:(source:string,destination:string,key:string)=>void;
}) {
  const bar=useRef<HTMLDivElement>(null);
  const drag=useRef<{key:string;order:string[]}|null>(null);
  const blocked=useRef(false);
  const positions=useRef(new Map<string,DOMRect>());
  const [preview,setPreview]=useState<string[]|null>(null);
  const byKey=new Map(items.map(item=>[String(item.key),item]));
  const keys=preview??mergeTabOrder(order,[...byKey.keys()]);

  useLayoutEffect(()=>{
    const element=bar.current;
    const workspace=element?.closest<HTMLElement>('.workbench');
    if(!element||!workspace)return;
    const measure=()=>{
      const selected=element.querySelector<HTMLElement>('.selected-note-tab');
    const pane=workspace.querySelector<HTMLElement>('.editor-layout > .tabbed-workspace > :is(.editor-pane,.folder-contents,.project-overview)');
    if(!selected||!pane||!element.offsetWidth){
        workspace.removeAttribute('data-tab-joined');return;
      }
      const bounds=element.getBoundingClientRect(),panel=pane.getBoundingClientRect();
      const scale=bounds.width/element.offsetWidth;
      const border=parseFloat(getComputedStyle(pane).borderTopWidth);
      const left=(bounds.left-panel.left)/scale+selected.offsetLeft-element.scrollLeft-border;
      workspace.style.setProperty('--tab-join-border',`${border}px`);
      workspace.style.setProperty('--tab-join-width',`${pane.clientWidth}px`);
      workspace.style.setProperty('--tab-join-left',`${left}px`);
      workspace.style.setProperty('--tab-join-selected-width',`${selected.offsetWidth}px`);
      workspace.setAttribute('data-tab-joined','');
    };
    const observer=new ResizeObserver(measure);
    observer.observe(element);observer.observe(workspace);
    element.addEventListener('scroll',measure,{passive:true});
    measure();
    return()=>{observer.disconnect();element.removeEventListener('scroll',measure);workspace.removeAttribute('data-tab-joined');};
  },[active,keys.join('\n')]);

  useLayoutEffect(()=>{
    animateLayout(bar.current,positions.current);
    positions.current=new Map();
  },[keys.join('\n')]);
  useEffect(()=>{
    const element=Array.from(bar.current?.children??[]).find(child=>child.getAttribute('data-layout-key')===active);
    if(!element||!bar.current)return;
    const left=(element as HTMLElement).offsetLeft-bar.current.scrollLeft,right=left+(element as HTMLElement).offsetWidth;
    if(left<0)bar.current.scrollLeft+=left;
    else if(right>bar.current.clientWidth)bar.current.scrollLeft+=right-bar.current.clientWidth;
  },[active,items.length]);

  useLayoutEffect(()=>{
    const element=bar.current;if(!element)return;
    let frame=0;
    const measure=()=>{
      cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
        if(!element.offsetWidth)return;
        const bounds=element.getBoundingClientRect(),scale=bounds.width/element.offsetWidth,fade=36*scale;
        for(const tab of Array.from(element.children) as HTMLElement[]){
          const left=bounds.left+(tab.offsetLeft-element.scrollLeft)*scale,width=tab.offsetWidth*scale,right=left+width,visible=Math.min(Math.max(0,Math.min(1,(right-bounds.left)/fade)),Math.max(0,Math.min(1,(bounds.right-left)/fade)));
          tab.style.transform=`scaleX(${visible})`;tab.style.transformOrigin=left<bounds.left?'right center':'left center';tab.style.opacity=String(visible);tab.style.pointerEvents=visible<.12?'none':'';
        }
      });
    };
    const observer=new ResizeObserver(measure);observer.observe(element);
    for(const tab of Array.from(element.children))observer.observe(tab);
    element.addEventListener('scroll',measure,{passive:true});measure();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();element.removeEventListener('scroll',measure);};
  },[keys.join('\n')]);

  function finish(commit:boolean) {
    const current=drag.current;
    if(!current)return;
    positions.current=captureLayout(bar.current);
    drag.current=null;
    if(commit)change(current.order);
    setPreview(null);
  }
  return <div className="note-tabs" ref={bar} role="group" aria-label="Открытые вкладки"
    onDragOver={event=>{
      const current=drag.current;
      if(!current){if(transfer&&event.dataTransfer.types.includes('application/x-noteapp-window-tab')){event.preventDefault();event.dataTransfer.dropEffect='move';}return;}
      event.preventDefault();
      event.dataTransfer.dropEffect='move';
      const bounds=bar.current!.getBoundingClientRect();
      if(event.clientX<bounds.left+24)bar.current!.scrollLeft-=14;
      if(event.clientX>bounds.right-24)bar.current!.scrollLeft+=14;
      const target=(event.target as Element).closest<HTMLElement>('[data-layout-key]');
      const key=target?.dataset.layoutKey;
      if(!target||!key||key===current.key)return;
      const index=current.order.indexOf(key),from=current.order.indexOf(current.key);
      const rect=target.getBoundingClientRect();
      const midpoint=(rect.left+rect.right)/2;
      if(index<0||(index>from&&event.clientX<midpoint)||(index<from&&event.clientX>midpoint))return;
      positions.current=captureLayout(bar.current);
      current.order=reorderTab(current.order,current.key,index);
      setPreview(current.order);
    }}
    onDrop={event=>{
      if(drag.current){event.preventDefault();event.stopPropagation();finish(true);return;}
      if(!transfer||!windowId)return;
      try{const payload:unknown=JSON.parse(event.dataTransfer.getData('application/x-noteapp-window-tab'));if(payload&&typeof payload==='object'&&'source'in payload&&'key'in payload&&typeof payload.source==='string'&&typeof payload.key==='string'){event.preventDefault();event.stopPropagation();transfer(payload.source,windowId,payload.key);}}catch{}
    }}>
    {keys.map((key,index)=>{
      const item=byKey.get(key);
      if(!item)return null;
      return cloneElement(item,{
        draggable:!!transfer||keys.length>1,
        'data-layout-key':key,
        'data-reordering':drag.current?.key===key||undefined,
        onPointerDownCapture:event=>{blocked.current=!!(event.target as Element).closest('.icon-button');},
        onDragStart:event=>{
          if(blocked.current){event.preventDefault();return;}
          event.stopPropagation();
          event.dataTransfer.setData('application/x-noteapp-tab',key);
          if(windowId)event.dataTransfer.setData('application/x-noteapp-window-tab',JSON.stringify({source:windowId,key}));
          event.dataTransfer.effectAllowed='move';
          drag.current={key,order:keys};
          setPreview(keys);
        },
        onDragEnd:()=>finish(false),
        onKeyDown:event=>{
          if(!(event.target as Element).closest('.note-tab-label')||!event.altKey||!(event.ctrlKey||event.metaKey)||event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
          event.preventDefault();
          const next=index+(event.key==='ArrowLeft'?-1:1);
          if(next<0||next>=keys.length)return;
          positions.current=captureLayout(bar.current);
          change(reorderTab(keys,key,next));
        },
      } as HTMLAttributes<HTMLDivElement>);
    })}
  </div>;
}
