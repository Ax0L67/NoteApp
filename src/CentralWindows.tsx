import {ALL_PROJECTS} from './allProjectsGraph';
import {saveNotePng,saveGraphPng} from './notePng';
import {forwardRef,useEffect,useImperativeHandle,useRef,useState,type ReactNode,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {ArrowsIn,ArrowsOut,DotsThree,DotsSixVertical,FileText,Folder,Graph,House,Minus,Plus,Stack,X,Copy,Download,PencilSimple,Trash,ArrowsOutCardinal,CaretDown,ArrowUp} from '@phosphor-icons/react';
import type {ReactCodeMirrorRef} from '@uiw/react-codemirror';
import type {EditorView} from '@codemirror/view';
import type {ReferenceActions} from './ReferenceChip';
import type {ReferenceKind} from './noteReferences';
import type {Snapshot,TaskBoard} from './types';
import {folder,title} from './indexing';
import {fontStack,validFont} from './FontPicker';
import {textAppearanceStyle} from './TextOptions';
import {floatNoteText} from './noteTextBlocks';
import {entriesIn,FolderContents,type ExplorerItem,type Location} from './Explorer';
import {projectOf,projectRoot,vaultFolders,defaultProjects} from './projects';
import {locationTabKey,tabLocation,replaceTab} from './workspaceTabs';
import {readCentralWindows,mapWindowKeys,windowLimit,ensureTilePaths,removeTile,tileRect,type CentralWindow} from './centralWindowState';
import {NoteBackdrop,paletteId,paletteDragType,readPaletteDrop} from './appearance';
import Editor from './Editor';
import MarkdownToolbar from './MarkdownToolbar';
import ReorderTabs from './ReorderTabs';

export interface CentralWindowsHandle {
  open:(location:Location,replace?:boolean,notify?:boolean)=>Promise<boolean>;
  closeAll:()=>void;
  remap:(map:(location:Location)=>Location)=>void;
  jump:(offset:number,id:string)=>boolean;
  inheritProjectPalette:()=>void;
}
interface Props {
  data:Snapshot;generalPalette:string;read:boolean;focus:boolean;references:ReferenceActions;
  beforeNavigate:()=>Promise<boolean>;onLocation:(location:Location)=>void;save:(windows:CentralWindow[])=>void;
  edit:(path:string,text:string)=>void;openLink:(link:string)=>void;
  renderHome:(open:(item:ExplorerItem)=>void)=>ReactNode;
  renderGraph:(project:string,open:(item:ExplorerItem)=>void)=>ReactNode;
  showMenu:(event:React.MouseEvent,item:ExplorerItem)=>void;
  newNote:(folder:string)=>void;newFolder:(item:ExplorerItem)=>void;move:(item:ExplorerItem)=>void;
  rename:(path:string)=>void;remove:(item:ExplorerItem)=>void;pdf:(path:string)=>void;
  toggleRead:()=>void;toggleFocus:()=>void;chooseVault:()=>void;
  typography:(path:string,getView?:()=>EditorView|undefined)=>ReactNode;
  pickReference:(view:EditorView,kind?:ReferenceKind)=>void;
  attach:(files:File[],position:number|undefined,path:string,editor:RefObject<ReactCodeMirrorRef|null>)=>void;
  changeTaskBoard:(board:TaskBoard)=>void;openTaskManager:(project:string)=>void;insertBoard:(view:EditorView,project:string,id?:string)=>void;
  detachedId?:string;detach?:(id:string,point?:{x:number;y:number})=>void;returnToApp?:(id:string)=>void;
}
const CentralWindows=forwardRef<CentralWindowsHandle,Props>(function CentralWindows(props,ref){
  const {data}=props;
  const [windows,setWindows]=useState(()=>readCentralWindows(data.settings.centralWindows,data.settings.active));

  const [activeId,setActiveId]=useState(()=>props.detachedId??windows[0].id);
  const [menuId,setMenuId]=useState<string|null>(null);
  const [splitPreview,setSplitPreview]=useState<{id:string;side:'L'|'R'|'T'|'B'}|null>(null);
  const draggingWindow=useRef<string|null>(null);
  const stage=useRef<HTMLDivElement>(null);
  const current=useRef(windows);current.current=windows;
  const active=useRef(activeId);active.current=activeId;
  const visibleWindows=props.detachedId?windows.filter(win=>win.id===props.detachedId):windows.filter(win=>!win.detached);
  const splitWindowCount=visibleWindows.length;
  const noteViews=useRef(new Map<string,EditorView>());
  const gesture=useRef<{id:string;pointer:number;x:number;y:number;rect:CentralWindow;mode:string;fitBottom:boolean}|null>(null);
  const [moving,setMoving]=useState(false);
  const [closing,setClosing]=useState<string[]>([]);
  const [tileOffset,setTileOffset]=useState(0);
  const tileResize=useRef<{pointer:number;y:number;offset:number}|null>(null);

  const projectFor=(path:string)=>projectOf(path,data.settings.projects??defaultProjects);
  const projects=(data.settings.projects??defaultProjects).filter(name=>!data.settings.archivedProjects?.includes(name));
  function commit(next:CentralWindow[],persist=true){current.current=next;setWindows(next);if(persist)props.save(next);}
  useEffect(()=>{const location=tabLocation(current.current.find(win=>win.id===props.detachedId)?.active??current.current[0].active);if(location)props.onLocation(location);},[]);
  useEffect(()=>{if(gesture.current)return;const next=readCentralWindows(data.settings.centralWindows,data.settings.active);current.current=next;setWindows(next);if(!next.some(win=>win.id===active.current)){active.current=next.find(win=>props.detachedId?win.id===props.detachedId:!win.detached)?.id??next[0].id;setActiveId(active.current);}},[data.settings.centralWindows]);
  async function open(location:Location,replace=false,notify=true,id=active.current){
    if(!await props.beforeNavigate())return false;
    const key=locationTabKey(location);
    commit(current.current.map(win=>win.id===id?{...win,active:key,tabs:replace?replaceTab(win.tabs,win.active,key):[...new Set([...win.tabs,key])]}:win));
    setActiveId(id);active.current=id;if(notify)props.onLocation(location);return true;
  }
  useImperativeHandle(ref,()=>({open,closeAll(){commit(current.current.map(win=>win.id===active.current?{...win,tabs:['home'],active:'home'}:win));},
    remap(map){commit(mapWindowKeys(current.current,map));},
    jump(offset,id){
      const window=current.current.find(entry=>entry.id===active.current),location=window&&tabLocation(window.active);
      if(!window||location?.kind!=='note')return false;
      if(!props.read){
        const view=noteViews.current.get(window.id);
        if(view?.dom.isConnected){view.dispatch({selection:{anchor:Math.min(offset,view.state.doc.length)},scrollIntoView:true});view.focus();return true;}
      }
      const headings=stage.current?.querySelectorAll<HTMLElement>('.central-window[data-active] .reading [id]');
      const heading=Array.from(headings??[]).find(element=>element.id===id);
      heading?.scrollIntoView({behavior:'smooth',block:'start'});
      return !!heading;
    },
    inheritProjectPalette(){
      const window=current.current.find(entry=>entry.id===active.current);
      if(window&&(window.palette!==undefined||window.blend!==undefined))commit(current.current.map(entry=>entry.id===window.id?{...entry,palette:undefined,blend:undefined}:entry));
    }}));
  function selectWindow(id:string){setActiveId(id);active.current=id;const win=current.current.find(win=>win.id===id);const location=win&&tabLocation(win.active);if(location)props.onLocation(location);}
  function duplicate(id:string,mode:'floating'|'tiled'='floating'){
    if((mode==='tiled'?current.current.filter(win=>props.detachedId?win.id===props.detachedId:!win.detached).length:current.current.length)>=windowLimit)return;
    const source=current.current.find(win=>win.id===id);if(!source)return;
    const bounds=stage.current!.getBoundingClientRect();
    const separate=mode==='floating'&&!!props.detach;
    const copy={...source,id:crypto.randomUUID(),tabs:[...source.tabs],x:Math.min(source.x+28,Math.max(0,bounds.width-360)),y:Math.min(source.y+28,Math.max(0,bounds.height-260)),width:source.width||Math.max(360,bounds.width*.8),height:source.height||Math.max(260,bounds.height*.85),mode:mode==='tiled'?'tiled' as const:undefined,detached:separate?true:mode==='tiled'?undefined:source.detached};
    if(mode==='tiled'){
      let next=ensureTilePaths(current.current);
      if(source.mode!=='tiled'){
        const existing=next.some(win=>win.mode==='tiled');
        next=next.map(win=>win.id===id?{...win,mode:'tiled' as const,tilePath:existing?'R':''}:existing&&win.mode==='tiled'?{...win,tilePath:'L'+win.tilePath}:win);
      }
      const path=next.find(win=>win.id===id)!.tilePath??'';
      commit([...next.map(win=>win.id===id?{...win,tilePath:path+'L'}:win),{...copy,tilePath:path+'R'}]);
    }else commit([...current.current,{...copy,tilePath:undefined}]);
    if(separate){setMenuId(null);props.detach?.(copy.id);return;}
    setActiveId(copy.id);active.current=copy.id;setMenuId(null);
  }
  async function closeWindow(id:string){if(current.current.length<2||!await props.beforeNavigate())return;const next=removeTile(current.current,id);commit(next);if(active.current===id)selectWindow(next.at(-1)!.id);}
  async function closeTab(id:string,key:string){
    if(!await props.beforeNavigate())return;
    const closingKey=JSON.stringify([id,key]);setClosing(keys=>[...keys,closingKey]);
    if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)await new Promise(resolve=>setTimeout(resolve,170));
    setClosing(keys=>keys.filter(value=>value!==closingKey));
    commit(current.current.map(win=>{if(win.id!==id)return win;const index=win.tabs.indexOf(key),tabs=win.tabs.filter(tab=>tab!==key);if(!tabs.length)tabs.push('home');return {...win,tabs,active:win.active===key?tabs[Math.min(index,tabs.length-1)]:win.active};}));
    selectWindow(id);
  }
  async function transfer(source:string,destination:string,key:string){
    if(source===destination||!current.current.some(win=>win.id===source&&win.tabs.includes(key))||!await props.beforeNavigate())return;
    commit(current.current.map(win=>{
      if(win.id===destination)return {...win,tabs:[...new Set([...win.tabs,key])],active:key};
      if(win.id!==source)return win;
      const tabs=win.tabs.filter(tab=>tab!==key);if(!tabs.length)tabs.push('home');return {...win,tabs,active:win.active===key?tabs[0]:win.active};
    }));selectWindow(destination);
  }
  function start(event:React.PointerEvent,id:string,mode:string){
    if(event.button!==0||(mode==='move'&&(event.target as Element).closest('button:not(.central-move-handle)')))return;
    const win=current.current.find(win=>win.id===id)!;const bounds=stage.current!.getBoundingClientRect();
    const rect=(event.currentTarget as HTMLElement).closest<HTMLElement>('.central-window')?.getBoundingClientRect();
    gesture.current={id,pointer:event.pointerId,x:event.clientX,y:event.clientY,rect:{...win,width:win.width||rect?.width||bounds.width,height:win.height||rect?.height||bounds.height},mode,fitBottom:mode==='move'&&win.height===0};
    event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();setMoving(true);selectWindow(id);
  }
  function move(event:React.PointerEvent){
    const g=gesture.current;if(!g||g.pointer!==event.pointerId)return;
    const bounds=stage.current!.getBoundingClientRect(),dx=event.clientX-g.x,dy=event.clientY-g.y;
    const appBounds=stage.current!.closest('.app')?.getBoundingClientRect()??bounds;
    if(g.mode==='move'&&props.detach&&(event.clientX<appBounds.left-24||event.clientX>appBounds.right+24||event.clientY<appBounds.top-24||event.clientY>appBounds.bottom+24)){
      gesture.current=null;setMoving(false);props.detach(g.id,{x:event.screenX-420,y:event.screenY-20});return;
    }
    let {x,y,width,height}=g.rect;
    if(g.mode==='move'){x+=dx;y+=dy;}else{
      if(g.mode.includes('e'))width=Math.max(320,width+dx);
      if(g.mode.includes('s'))height=Math.max(240,height+dy);
      if(g.mode.includes('w')){const delta=Math.min(dx,width-320);x+=delta;width-=delta;}
      if(g.mode.includes('n')){const delta=Math.min(dy,height-240);y+=delta;height-=delta;}
    }
    if(g.mode==='move'){
      x=Math.max(0,Math.min(Math.max(0,bounds.width-Math.min(width,320)),x));
      y=Math.max(-52,Math.min(Math.max(0,bounds.height-(g.fitBottom?240:Math.min(height,36))),y));
      if(g.fitBottom)height=Math.max(240,bounds.height-y);
    }else{
      x=Math.max(0,Math.min(Math.max(0,bounds.width-160),x));y=Math.max(0,Math.min(Math.max(0,bounds.height-80),y));
      width=Math.min(Math.max(320,bounds.width-x),width);height=Math.min(Math.max(240,bounds.height-y),height);
    }
    commit(current.current.map(win=>win.id===g.id?{...win,x,y,width,height:g.fitBottom?0:height}:win),false);
  }
  function finish(){if(!gesture.current)return;gesture.current=null;setMoving(false);commit(current.current);}
  const selected=windows.find(win=>win.id===activeId)??windows[0];
  const selectedLocation=tabLocation(selected.active)??{kind:'home' as const};
  const selectedOwner=selectedLocation.kind==='home'?'':selectedLocation.kind==='note'?projectFor(selectedLocation.path):selectedLocation.project;
  const selectedLabel=selectedOwner===ALL_PROJECTS?'Все проекты':selectedOwner;
  const selectedPath=selectedLocation.kind==='note'?selectedLocation.path.replace(/\.md$/,''):selectedLocation.kind==='folder'?selectedLocation.path:'';
  const parentPath=selectedLocation.kind==='note'?folder(selectedLocation.path):selectedLocation.kind==='folder'?folder(selectedLocation.path):projectRoot(selectedOwner);
  const hasTiles=visibleWindows.some(win=>win.mode==='tiled');
  const covered=(hasTiles&&tileOffset<-24)||visibleWindows.some(win=>win.mode!=='tiled'&&win.y<-34&&(win.width===0||win.width>=(stage.current?.clientWidth??1000)*.8));
  return <div className="central-desktop" data-detached={props.detachedId||undefined} data-storage-covered={covered||undefined} data-moving={moving||undefined}>
    {!props.detachedId&&<nav className={`storage-strip project-workspace palette-${props.generalPalette}`} aria-label="Хранилище">
      <button className="vault-switch" title={data.root} onClick={props.chooseVault}><Stack size={19}/><strong>Хранилище</strong><CaretDown size={15}/></button>
      <button className="storage-up" title="На уровень выше" aria-label="На уровень выше" disabled={!selectedOwner} onClick={()=>void open(selectedOwner===ALL_PROJECTS?{kind:'home'}:{kind:'folder',project:selectedOwner,path:parentPath},false,true,selected.id)}><ArrowUp size={19}/></button>
      <span className="storage-path" title={selectedPath||selectedLabel||'Все проекты'}>{selectedLabel||'Все проекты'}{selectedPath&&selectedPath!==projectRoot(selectedOwner)&&<> <span aria-hidden="true">›</span> {selectedPath.startsWith(projectRoot(selectedOwner))?selectedPath.slice(projectRoot(selectedOwner).length).replace(/^\//,'').replaceAll('/',' › '):selectedPath}</>}</span>
      <button className="storage-graph" onClick={()=>void open({kind:'graph',project:selectedOwner||ALL_PROJECTS},false,true,selected.id)}><Graph size={18}/>{selectedOwner?'Карта связей':'Общая карта связей'}</button>
    </nav>}
    <div ref={stage} className="central-stage" data-tiled={hasTiles||undefined} style={hasTiles?{marginTop:tileOffset}:undefined}>
      {hasTiles&&<div className="tile-stage-resize" role="separator" tabIndex={0} aria-label="Переместить верхнюю границу центральной области" aria-orientation="horizontal"
        onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);tileResize.current={pointer:event.pointerId,y:event.clientY,offset:tileOffset};}}
        onPointerMove={event=>{const drag=tileResize.current;if(drag?.pointer===event.pointerId)setTileOffset(Math.max(-32,Math.min(0,drag.offset+event.clientY-drag.y)));}}
        onPointerUp={()=>{tileResize.current=null;}} onPointerCancel={()=>{tileResize.current=null;}} onLostPointerCapture={()=>{tileResize.current=null;}}
        onKeyDown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();setTileOffset(value=>Math.max(-32,Math.min(0,value+(event.key==='ArrowUp'?-16:16))));}}}/>}
      {visibleWindows.map((win,index)=>{
        const location=tabLocation(win.active)??{kind:'home' as const};
        const owner=location.kind==='home'?'':location.kind==='note'?projectFor(location.path):location.project;
        const palette=paletteId(win.palette??(owner?data.settings.projectPalettes?.[owner]??props.generalPalette:data.settings.overviewPalette??props.generalPalette));
        const blend=win.palette?win.blend:owner?data.settings.projectPaletteBlends?.[owner]??data.settings.paletteBlend:data.settings.overviewPaletteBlend??data.settings.paletteBlend;
        const openItem=(item:ExplorerItem)=>void open(item.kind==='note'?{kind:'note',path:item.path}:{kind:'folder',project:item.project,path:item.path},true,true,win.id);
        const note=location.kind==='note'?data.notes.find(note=>note.path===location.path):undefined;
        const item:ExplorerItem=location.kind==='note'?{kind:'note',project:owner,path:location.path,name:title(location.path)}:{kind:location.kind==='folder'&&location.path!==projectRoot(owner)?'folder':'project',project:owner,path:location.kind==='folder'?location.path:projectRoot(owner),name:location.kind==='folder'&&location.path!==projectRoot(owner)?location.path.split('/').at(-1)!:owner};
        const maximized=props.detachedId===win.id||props.focus&&visibleWindows.length===1;
        const fillBottom=!maximized&&win.mode!=='tiled'&&(win.width===0||win.width>=(stage.current?.clientWidth??Number.POSITIVE_INFINITY)-2);
        const preview=splitPreview?.id===win.id?splitPreview.side:undefined;
        return <section key={win.id} className={`central-window workbench project-workspace palette-${palette}`} data-active={activeId===win.id||undefined} data-mode={win.mode??'floating'} data-maximized={maximized||undefined} data-palette-blend={blend??''} data-split-preview={preview} aria-label={`Центральное окно ${index+1}`}
          style={win.mode==='tiled'&&!maximized?{...tileRect(win.tilePath??''),zIndex:activeId===win.id?20:index+1}:{left:maximized?0:win.x,top:maximized?0:win.y,width:maximized?'100%':win.width||'100%',height:maximized?'100%':fillBottom?undefined:win.height||'100%',bottom:fillBottom?0:undefined,zIndex:activeId===win.id?20:index+1}}
          onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-noteapp-window')){event.preventDefault();if(win.mode==='tiled'&&draggingWindow.current!==win.id){const rect=event.currentTarget.getBoundingClientRect(),dx=(event.clientX-rect.left)/rect.width-.5,dy=(event.clientY-rect.top)/rect.height-.5,vertical=Math.abs(dy)>Math.abs(dx);setSplitPreview({id:win.id,side:vertical?(dy<0?'T':'B'):(dx<0?'L':'R')});}}else if(event.dataTransfer.types.includes(paletteDragType))event.preventDefault();}}
          onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setSplitPreview(null);}}
          onDrop={event=>{setSplitPreview(null);const value=readPaletteDrop(event.dataTransfer.getData(paletteDragType));if(value){event.preventDefault();event.stopPropagation();commit(current.current.map(entry=>entry.id===win.id?{...entry,palette:value.palette,blend:value.blend}:entry));return;}const source=event.dataTransfer.getData('application/x-noteapp-window');if(!source||source===win.id||win.mode!=='tiled')return;const moved=current.current.find(entry=>entry.id===source);if(!moved||moved.mode!=='tiled')return;event.preventDefault();const rect=event.currentTarget.getBoundingClientRect(),dx=(event.clientX-rect.left)/rect.width-.5,dy=(event.clientY-rect.top)/rect.height-.5;const vertical=Math.abs(dy)>Math.abs(dx),before=vertical?dy<0:dx<0;const first=vertical?'T':'L',second=vertical?'B':'R';const next=removeTile(current.current,source),target=next.find(entry=>entry.id===win.id);if(!target)return;const path=target.tilePath??'';const updated=next.map(entry=>entry.id===win.id?{...entry,tilePath:path+(before?second:first)}:entry);commit(current.current.map(entry=>entry.id===source?{...moved,tilePath:path+(before?first:second)}:updated.find(item=>item.id===entry.id)!));}}
          onPointerDownCapture={()=>{if(active.current!==win.id)selectWindow(win.id);}} onPointerDown={event=>{if(win.mode!=='tiled'&&(event.target as Element).closest('.markdown-ribbon-tabs')&&!(event.target as Element).closest('button,input,select'))start(event,win.id,'move');}} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
          {menuId===win.id&&<div className="dropdown central-window-menu" onKeyDown={event=>{if(event.key==='Escape')setMenuId(null);}}>
            <button onClick={()=>{void open({kind:'home'},false,true,win.id);setMenuId(null);}}><House/>Все проекты</button>
            {!win.detached&&props.detach&&<button onClick={()=>{setMenuId(null);props.detach?.(win.id);}}><ArrowsOut/>Открыть отдельным окном</button>}
            <button disabled={windows.length>=windowLimit} onClick={()=>duplicate(win.id)}><Copy/>Новое отдельное окно <small>{windows.length}/{windowLimit}</small></button>
            <button disabled={splitWindowCount>=windowLimit} onClick={()=>duplicate(win.id,'tiled')}><ArrowsOutCardinal/>Разделить центральную область <small>{splitWindowCount}/{windowLimit}</small></button>
            <button onClick={()=>{commit(current.current.map(entry=>entry.id===win.id?{...entry,x:0,y:0,width:0,height:0}:entry));setMenuId(null);}}><ArrowsOutCardinal/>Развернуть внутри приложения</button>
            {win.detached&&props.returnToApp&&<button onClick={()=>{setMenuId(null);props.returnToApp?.(win.id);}}><ArrowsIn/>Вернуть в приложение</button>}
            {!win.detached&&windows.length>1&&<button onClick={()=>{setMenuId(null);void closeWindow(win.id);}}><X/>Закрыть окно</button>}
            {note&&<><button onClick={()=>{props.rename(note.path);setMenuId(null);}}><PencilSimple/>Переименовать</button>
              <button onClick={()=>{props.move(item);setMenuId(null);}}><Folder/>Переместить…</button>
              <button onClick={event=>{const win=event.currentTarget.closest<HTMLElement>('.central-window');setMenuId(null);if(win)void (async()=>{try{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));await saveNotePng(win,title(note.path));}catch(error){alert(String(error));}})();}}><Download/>Сохранить заметку в PNG…</button>
              <button onClick={()=>{props.pdf(note.path);setMenuId(null);}}><Download/>Печать / сохранить PDF…</button>
              <button onClick={props.toggleRead}><FileText/>{props.read?'Редактировать':'Режим чтения'}</button></>}
            {location.kind==='graph'&&<button onClick={event=>{const win=event.currentTarget.closest<HTMLElement>('.central-window');setMenuId(null);if(win)void saveGraphPng(win,owner===ALL_PROJECTS?'Общая карта связей':'Карта — '+owner).catch(error=>alert(String(error)));}}><Download/>Сохранить карту в PNG…</button>}
            {location.kind==='folder'&&<button onClick={()=>{props.move(item);setMenuId(null);}}><Folder/>Переместить…</button>}
            {location.kind!=='home'&&owner!==ALL_PROJECTS&&<button onClick={()=>{props.remove(item);setMenuId(null);}}><Trash/>В корзину</button>}
          </div>}
          <div className={`note-tab-strip${location.kind==='note'?'':' folder-workspace'}`} onPointerDown={event=>{if(win.mode!=='tiled'&&!(event.target as Element).closest('button'))start(event,win.id,'move');}} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}><ReorderTabs windowId={win.id} transfer={transfer} active={win.active} order={win.tabs} change={tabs=>commit(current.current.map(entry=>entry.id===win.id?{...entry,tabs}:entry))}
            items={win.tabs.map(key=>{const tab=tabLocation(key);const tabOwner=tab?.kind==='note'?projectFor(tab.path):tab&&tab.kind!=='home'?tab.project:'';const tabPalette=paletteId(tabOwner?data.settings.projectPalettes?.[tabOwner]??props.generalPalette:props.generalPalette);const Icon=tab?.kind==='home'?House:tab?.kind==='graph'?Graph:tab?.kind==='folder'?Folder:FileText;const label=tab?.kind==='home'?'Все проекты':tab?.kind==='graph'?(tab.project===ALL_PROJECTS?'Общая карта':`Карта · ${tab.project}`):tab?.kind==='folder'?tab.path.split('/').at(-1)||tab.project:title(key);return <div key={key} data-closing={closing.includes(JSON.stringify([win.id,key]))||undefined} className={`note-tab palette-${tabPalette}${tabOwner&&tabOwner===owner&&key!==win.active?' same-project-note-tab':''}${key===win.active?' selected-note-tab':''}`}>
              <button className="note-tab-label" title={label} aria-pressed={key===win.active} onClick={()=>{if(tab)void open(tab,false,true,win.id);}}><Icon size={17}/><strong>{label}</strong></button>
              <button className="icon-button" aria-label={`Закрыть вкладку «${label}»`} onClick={()=>void closeTab(win.id,key)}><X size={14}/></button></div>;})}/>
            <div className="central-window-actions">
              <button className="central-move-handle" title="Переместить окно" aria-label="Переместить окно" draggable={win.mode==='tiled'} onDragStart={event=>{draggingWindow.current=win.id;setMoving(true);event.dataTransfer.setData('application/x-noteapp-window',win.id);event.dataTransfer.effectAllowed='move';}} onDragEnd={()=>{draggingWindow.current=null;setMoving(false);setSplitPreview(null);}} onPointerDown={event=>{if(win.mode!=='tiled')start(event,win.id,'move');}} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}><DotsSixVertical size={16}/></button>
              {!props.detachedId&&<button title="Фокус" aria-label="Фокус" aria-pressed={props.focus} onClick={props.toggleFocus}><ArrowsOut size={16}/></button>}
              <button title="Меню окна" aria-label="Меню окна" aria-expanded={menuId===win.id} onClick={()=>setMenuId(menuId===win.id?null:win.id)}><DotsThree size={20}/></button>
              {win.detached&&<button title="Вернуть в приложение" aria-label="Вернуть в приложение" onClick={()=>props.returnToApp?.(win.id)}><ArrowsIn size={16}/></button>}
              {!win.detached&&windows.length>1&&<button title="Закрыть окно" aria-label="Закрыть окно" onClick={()=>void closeWindow(win.id)}><X size={16}/></button>}
            </div></div>
          <div className="editor-layout"><div className="tabbed-workspace">
            {location.kind==='home'?props.renderHome(openItem):location.kind==='graph'&&(owner===ALL_PROJECTS||projects.includes(owner))?props.renderGraph(owner,openItem):location.kind==='folder'?<FolderContents root={data.root} background={data.settings.projectBackgrounds?.[owner]??null} name={item.name} entries={entriesIn(owner,item.path,vaultFolders(data),data.notes,projectFor)} open={openItem} showMenu={props.showMenu}
              actions={<div className="folder-actions"><button className="primary" onClick={()=>props.newNote(item.path)}><Plus size={18}/>Новая заметка</button><button onClick={()=>props.newFolder(item)}><Folder size={18}/>Новая папка</button></div>}/>:note?<NoteWindow key={note.path} {...props} path={note.path} onView={view=>noteViews.current.set(win.id,view)}/>:<div className="editor-pane editor-empty"><p>Этот объект больше недоступен.</p><button onClick={()=>void open({kind:'home'},false,true,win.id)}>Все проекты</button></div>}
          </div></div>
          {!maximized&&win.mode!=='tiled'&&['n','e','s','w','ne','se','sw','nw'].map(mode=><div key={mode} className={`central-resize central-resize-${mode}`} role="separator" tabIndex={0} aria-label="Изменить размер окна" onPointerDown={event=>start(event,win.id,mode)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onKeyDown={event=>{
            if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();commit(current.current.map(entry=>entry.id===win.id?{...entry,width:Math.max(320,(entry.width||stage.current!.clientWidth)+(event.key==='ArrowLeft'?-24:event.key==='ArrowRight'?24:0)),height:Math.max(240,(entry.height||stage.current!.clientHeight)+(event.key==='ArrowUp'?-24:event.key==='ArrowDown'?24:0))}:entry));
          }}/>) }
        </section>;
      })}
    </div>
  </div>;
});
function NoteWindow(props:Props&{path:string;onView:(view:EditorView)=>void}){
  const editor=useRef<ReactCodeMirrorRef>(null);
  const main=useRef<HTMLElement>(null);
  const [zoom,setZoom]=useState(1);
  const [zoomTarget,setZoomTarget]=useState<HTMLElement|null>(null);
  const note=props.data.notes.find(note=>note.path===props.path)!;
  const appearance=props.data.settings.noteAppearance?.[note.path];
  const owner=projectOf(note.path,props.data.settings.projects??defaultProjects);
  const style={...textAppearanceStyle(appearance),'--editor-size':`${props.data.settings.fontSize??16}px`,'--body-font':fontStack(validFont(props.data.settings.fontFamily))} as React.CSSProperties;
  const format=(apply:(view:EditorView)=>void)=>{if(!props.read&&editor.current?.view)apply(editor.current.view);};
  useEffect(()=>{setZoomTarget(main.current?.closest('.central-window')?.querySelector<HTMLElement>('.central-window-actions')??null);},[props.path]);
  const zoomControls=<div className="note-zoom-controls note-zoom-controls-titlebar" role="group" aria-label="Масштаб редактора">
    <button type="button" aria-label="Уменьшить масштаб" disabled={zoom<=.5} onClick={()=>setZoom(value=>Math.max(.5,Math.round((value-.1)*10)/10))}><Minus size={15}/></button>
    <button type="button" aria-label={`Масштаб редактора ${Math.round(zoom*100)}%. Сбросить`} onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button>
    <button type="button" aria-label="Увеличить масштаб" disabled={zoom>=2} onClick={()=>setZoom(value=>Math.min(2,Math.round((value+.1)*10)/10))}><Plus size={15}/></button>
  </div>;
  return <>
  <main ref={main} className="editor-pane main-note-editor">
    <div className="note-ribbon" inert={props.read}><MarkdownToolbar runEdit={format} disabled={props.read} typography={props.typography(note.path,()=>props.read?undefined:editor.current?.view)}
      insertReference={kind=>format(view=>props.pickReference(view,kind))}
      createWidget={kind=>format(view=>floatNoteText(view,kind))} taskBoards={props.data.settings.taskBoards??[]}
      openTasks={()=>props.openTaskManager(owner)} insertBoard={(view,id)=>props.insertBoard(view,owner,id)}/></div>
    <div className="editor-area note-editor-area"><NoteBackdrop root={props.data.root} path={props.data.settings.projectBackgrounds?.[owner]??null} grid/>
      <div className="editor-scroll" onDragOver={event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();}}
        onDrop={event=>{const files=Array.from(event.dataTransfer.files);if(!files.length||props.read)return;event.preventDefault();props.attach(files,editor.current?.view?.posAtCoords({x:event.clientX,y:event.clientY},false)??undefined,note.path,editor);}}
        onPaste={event=>{const files=Array.from(event.clipboardData.files);if(files.length&&!props.read){event.preventDefault();props.attach(files,undefined,note.path,editor);}}}>
        <div className="text-surface" style={style}><Editor note={note} notes={props.data.notes} read={props.read} onChange={text=>props.edit(note.path,text)} onLink={props.openLink} editorRef={editor} onReady={props.onView} light={props.data.settings.theme==='light'} references={props.references} attachWidget={(files,position)=>props.attach(files,position,note.path,editor)} zoom={zoom} setZoom={setZoom} showZoomControls={false} taskBoards={props.data.settings.taskBoards??[]} changeTaskBoard={props.changeTaskBoard}/></div>
      </div>
    </div>
    <footer className="statusbar"><span>Markdown</span><span>{note.content.trim().split(/\s+/).filter(Boolean).length} слов</span></footer>
  </main>
  {zoomTarget&&createPortal(zoomControls,zoomTarget)}
  </>;
}
export default CentralWindows;
