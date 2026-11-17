import {useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {createPortal} from 'react-dom';

export default function SortMenu({anchor,close,children,width=390}:{anchor:RefObject<HTMLElement|null>;close:()=>void;children:ReactNode;width?:number}) {
 const menu=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState({left:0,top:0});
 useLayoutEffect(()=>{
  const place=()=>{const trigger=anchor.current,box=menu.current;if(!trigger||!box)return;const rect=trigger.getBoundingClientRect(),w=box.offsetWidth,h=box.offsetHeight;setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-w-8)),top:rect.bottom+h+4<=window.innerHeight?rect.bottom+4:Math.max(8,rect.top-h-4)});};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close()};
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);document.addEventListener('keydown',key);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);document.removeEventListener('keydown',key)};
 },[anchor,close]);
 return createPortal(<><div className="note-context-dismiss" onMouseDown={close}/><div ref={menu} className="explorer-sort-menu glass-panel" role="menu" style={{position:'fixed',zIndex:10001,left:position.left,top:position.top,width:`min(${width}px, calc(100vw - 16px))`,maxHeight:'calc(100vh - 16px)',overflowY:'auto'}}>{children}</div></>,anchor.current?.closest('.app')??document.body);
}
