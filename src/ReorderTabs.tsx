import {cloneElement,useEffect,useLayoutEffect,useRef,useState,type HTMLAttributes,type ReactElement,type CSSProperties} from 'react';
import {captureLayout,animateLayout} from './layoutMotion';
import {mergeTabOrder,reorderTab} from './tabOrder';
import {widgetOutline} from './widgetOutline';

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
    const outline=document.createElementNS('http://www.w3.org/2000/svg','svg');
    const path=document.createElementNS(outline.namespaceURI,'path');
    outline.classList.add('joined-tab-outline');outline.setAttribute('aria-hidden','true');
    path.setAttribute('fill','none');path.setAttribute('stroke','var(--edge)');path.setAttribute('stroke-width','1');
    outline.append(path);workspace.append(outline);
    const measure=()=>{
      const selected=element.querySelector<HTMLElement>('.selected-note-tab');
    const pane=workspace.querySelector<HTMLElement>('.editor-layout > .tabbed-workspace > :is(.editor-pane,.folder-contents,.project-overview)');
    if(!selected||!pane||!element.offsetWidth){
        workspace.removeAttribute('data-tab-joined');workspace.removeAttribute('data-tab-outline');outline.style.display='none';return;
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
      const frame=workspace.getBoundingClientRect(),tab=selected.getBoundingClientRect();
      const visible=tab.left>=bounds.left&&tab.right<=bounds.right;
      const joined=workspace.classList.contains('central-window')&&visible;
      workspace.toggleAttribute('data-tab-outline',joined);outline.style.display=joined?'':'none';
      if(joined){
        const rect=(r:DOMRect)=>({x:(r.left-frame.left)/scale+.5,y:(r.top-frame.top)/scale+.5,width:r.width/scale-1,height:r.height/scale-1});
        const panelRect=rect(panel),tabRect=rect(tab);
        const radius=Math.max(0,Math.min(12,(tabRect.x-panelRect.x)/2,(panelRect.x+panelRect.width-tabRect.x-tabRect.width)/2));
        workspace.style.setProperty('--tab-outline-radius',`${radius}px`);
        tabRect.height=panelRect.y-tabRect.y+1;
        path.setAttribute('d',widgetOutline([panelRect,tabRect],radius,true));
      }
    };
    const observer=new ResizeObserver(measure);
    observer.observe(element);observer.observe(workspace);
    element.addEventListener('scroll',measure,{passive:true});
    measure();
    const pane=workspace.querySelector('.editor-layout > .tabbed-workspace > :is(.editor-pane,.folder-contents,.project-overview)');
    if(pane)observer.observe(pane);
    return()=>{observer.disconnect();element.removeEventListener('scroll',measure);workspace.removeAttribute('data-tab-joined');workspace.removeAttribute('data-tab-outline');outline.remove();};
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



  function finish(commit:boolean) {
    const current=drag.current;
    if(!current)return;
    positions.current=captureLayout(bar.current);
    drag.current=null;
    if(commit)change(current.order);
    setPreview(null);
  }
  return <div className="note-tabs" style={{'--tab-count':Math.max(1,keys.length)} as CSSProperties} ref={bar} role="group" aria-label="Открытые вкладки"
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
