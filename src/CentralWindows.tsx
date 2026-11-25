import {activeTableEditor,clearActiveTableEditor} from './noteTables';
import {ALL_PROJECTS} from './allProjectsGraph';
import {saveNotePng,saveGraphPng,saveCanvasPng,printCanvasPdf,saveCanvasObjectPng} from './notePng';
import {parseCanvas} from './CanvasEditor';
import {forwardRef,useEffect,useLayoutEffect,useImperativeHandle,useRef,useState,type Dispatch,type ReactNode,type RefObject,type SetStateAction} from 'react';
import {createPortal} from 'react-dom';
import {ArrowsIn,ArrowsOut,DotsThree,DotsSixVertical,FileText,Folder,Graph,House,Minus,Plus,X,Copy,Download,PencilSimple,Trash,ArrowsOutCardinal,CaretDown,ArrowUp,Star,Check} from '@phosphor-icons/react';
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
import CanvasEditor from './CanvasEditor';
import {TaskBoardView} from './TaskBoards';
import {kanbanNoteId} from './kanbanNote';
import './kanbanNote.css';
import {ObjectIcon} from './ObjectIcon';

type NoteViewport={zoom:number;scrollTop:number;scrollLeft:number};
const noteViewports=new Map<string,NoteViewport>();

export interface CentralWindowsHandle {
  open:(location:Location,replace?:boolean,notify?:boolean)=>Promise<boolean>;
  openSplit:(location:Location)=>Promise<boolean>;
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
  renderGraph:(project:string,open:(item:ExplorerItem)=>void,mode:'tree'|'graph')=>ReactNode;
  showMenu:(event:React.MouseEvent,item:ExplorerItem)=>void;
  newNote:(folder:string)=>void;newFolder:(item:ExplorerItem)=>void;move:(item:ExplorerItem)=>void;
  rename:(path:string)=>void;remove:(item:ExplorerItem)=>void;pdf:(path:string)=>void;toggleFavorite:(path:string)=>void;
  toggleRead:()=>void;toggleFocus:()=>void;
  typography:(path:string,getView?:()=>EditorView|undefined)=>ReactNode;
  pickReference:(view:EditorView,kind?:ReferenceKind)=>void;
  attach:(files:File[],position:number|undefined,path:string,editor:RefObject<ReactCodeMirrorRef|null>)=>void;
  uploadImages:(files:File[],path:string)=>Promise<string[]>;
  changeTaskBoard:(board:TaskBoard)=>void;openTaskManager:(project:string)=>void;insertBoard:(view:EditorView,project:string,id?:string)=>void;
  detachedId?:string;detach?:(id:string,point?:{x:number;y:number})=>void;returnToApp?:(id:string)=>void;
}
const CentralWindows=forwardRef<CentralWindowsHandle,Props>(function CentralWindows(props,ref){
  const {data}=props;
  const [windows,setWindows]=useState(()=>readCentralWindows(data.settings.centralWindows,data.settings.active));

  const [activeId,setActiveId]=useState(()=>props.detachedId??windows[0].id);
  const [graphLayout,setGraphLayout]=useState<'tree'|'graph'>(()=>localStorage.getItem('noteapp-graph-layout')==='graph'?'graph':'tree');
  const [menuId,setMenuId]=useState<string|null>(null);
  const [exportWindow,setExportWindow]=useState<string|null>(null);
  const [batchExport,setBatchExport]=useState<{windowId:string;node:HTMLElement;items:{id:string;name:string;scale:number;format:'png'|'jpeg';width:number;height:number;enabled:boolean}[]}|null>(null);
  const [sourceWindow,setSourceWindow]=useState<string|null>(null);
  const [splitPreview,setSplitPreview]=useState<{id:string;side:'L'|'R'|'T'|'B'}|null>(null);
  const [tilePreview,setTilePreview]=useState<CentralWindow[]|null>(null);
  const draggingWindow=useRef<string|null>(null);
  const dragBase=useRef<CentralWindow[]|null>(null);
  const tilePreviewKey=useRef('');
  const stage=useRef<HTMLDivElement>(null);
  const current=useRef(windows);current.current=windows;
  const active=useRef(activeId);active.current=activeId;
  async function captureReading(id:string,action:()=>Promise<void>){
    setExportWindow(id);
    try{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));await action();}
    finally{setExportWindow(null);}
  }
  const visibleWindows=props.detachedId?(tilePreview??windows).filter(win=>win.id===props.detachedId):(tilePreview??windows).filter(win=>!win.detached);
  useLayoutEffect(()=>{
    const root=stage.current?.closest<HTMLElement>('.app'),stageNode=stage.current;
    if(!root||!stageNode)return;
    const sync=()=>{
      const strip=stageNode.querySelector<HTMLElement>('.central-window[data-active] .note-tab-strip');
      if(!strip)return;
      const y=strip.getBoundingClientRect().bottom;
      root.querySelectorAll<HTMLElement>('.dock-zone-left .dock-panel-heading,.dock-zone-right .dock-panel-heading').forEach(heading=>heading.style.setProperty('--dock-header-line-top',`${y-heading.getBoundingClientRect().top}px`));
    };
    const resize=new ResizeObserver(sync);resize.observe(stageNode);
    const activeWindow=stageNode.querySelector<HTMLElement>('.central-window[data-active]');if(activeWindow)resize.observe(activeWindow);
    root.querySelectorAll<HTMLElement>('.dock-zone-left,.dock-zone-right,.dock-zone-left .dock-panel,.dock-zone-right .dock-panel').forEach(panel=>resize.observe(panel));
    const mutation=new MutationObserver(records=>{if(records.some(record=>record.target instanceof HTMLElement&&record.target.classList.contains('central-window')))sync()});mutation.observe(stageNode,{subtree:true,attributes:true,attributeFilter:['style','data-active']});
    window.addEventListener('resize',sync);sync();
    return()=>{resize.disconnect();mutation.disconnect();window.removeEventListener('resize',sync);root.querySelectorAll<HTMLElement>('.dock-panel-heading').forEach(heading=>heading.style.removeProperty('--dock-header-line-top'))};
  },[activeId,data.settings.workspaceLayout,data.settings.simpleStyle,props.detachedId]);
  const noteViews=useRef(new Map<string,EditorView>());
  const gesture=useRef<{id:string;pointer:number;x:number;y:number;rect:CentralWindow;mode:string;fitBottom:boolean}|null>(null);
  const [moving,setMoving]=useState(false);
  const [closing,setClosing]=useState<string[]>([]);
  const [tileOffset,setTileOffset]=useState(0);
  const tileResize=useRef<{pointer:number;y:number;offset:number}|null>(null);

  const projectFor=(path:string)=>projectOf(path,data.settings.projects??defaultProjects);
  const projects=(data.settings.projects??defaultProjects).filter(name=>!data.settings.archivedProjects?.includes(name));
  function commit(next:CentralWindow[],persist=true){current.current=next;setWindows(next);if(persist)props.save(next);}
  function tileMove(base:CentralWindow[],source:string,destination:string,side:'L'|'R'|'T'|'B') {
    const moved=base.find(entry=>entry.id===source),next=removeTile(base,source),target=next.find(entry=>entry.id===destination);
    if(!moved||moved.mode!=='tiled'||!target||target.mode!=='tiled')return null;
    const before=side==='L'||side==='T',first=side==='L'||side==='R'?'L':'T',second=first==='L'?'R':'B',path=target.tilePath??'';
    return base.map(entry=>entry.id===source?{...moved,tilePath:path+(before?first:second)}:entry.id===destination?{...target,tilePath:path+(before?second:first)}:next.find(item=>item.id===entry.id)!);
  }
  useEffect(()=>{const location=tabLocation(current.current.find(win=>win.id===props.detachedId)?.active??current.current[0].active);if(location)props.onLocation(location);},[]);
  useEffect(()=>{if(gesture.current)return;const next=readCentralWindows(data.settings.centralWindows,data.settings.active);current.current=next;setWindows(next);if(!next.some(win=>win.id===active.current)){active.current=next.find(win=>props.detachedId?win.id===props.detachedId:!win.detached)?.id??next[0].id;setActiveId(active.current);}},[data.settings.centralWindows]);
  async function open(location:Location,replace=false,notify=true,id=active.current){
    if(!await props.beforeNavigate())return false;
    const key=locationTabKey(location);
    commit(current.current.map(win=>win.id===id?{...win,active:key,tabs:replace?replaceTab(win.tabs,win.active,key):[...new Set([...win.tabs,key])]}:win));
    setActiveId(id);active.current=id;if(notify)props.onLocation(location);return true;
  }
  useImperativeHandle(ref,()=>({open,async openSplit(location){if(!await props.beforeNavigate())return false;return duplicate(active.current,'tiled',location);},closeAll(){commit(current.current.map(win=>win.id===active.current?{...win,tabs:['home'],active:'home'}:win));},
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
  function duplicate(id:string,mode:'floating'|'tiled'='floating',location?:Location):boolean{
    if(current.current.length>=windowLimit)return false;
    const source=current.current.find(win=>win.id===id);if(!source)return false;
    const bounds=stage.current!.getBoundingClientRect();
    const separate=mode==='floating'&&!!props.detach;
    const key=location&&locationTabKey(location);
    const copy={...source,id:crypto.randomUUID(),tabs:key?[...new Set([...source.tabs,key])]:[...source.tabs],active:key??source.active,x:Math.min(source.x+28,Math.max(0,bounds.width-360)),y:Math.min(source.y+28,Math.max(0,bounds.height-260)),width:source.width||Math.max(360,bounds.width*.8),height:source.height||Math.max(260,bounds.height*.85),mode:mode==='tiled'?'tiled' as const:undefined,detached:separate?true:mode==='tiled'?undefined:source.detached};
    if(mode==='tiled'){
      let next=ensureTilePaths(current.current);
      if(source.mode!=='tiled'){
        const existing=next.some(win=>win.mode==='tiled');
        next=next.map(win=>win.id===id?{...win,mode:'tiled' as const,tilePath:existing?'R':''}:existing&&win.mode==='tiled'?{...win,tilePath:'L'+win.tilePath}:win);
      }
      const path=next.find(win=>win.id===id)!.tilePath??'';
      commit([...next.map(win=>win.id===id?{...win,tilePath:path+'L'}:win),{...copy,tilePath:path+'R'}]);
    }else commit([...current.current,{...copy,tilePath:undefined}]);
    if(separate){setMenuId(null);props.detach?.(copy.id);return true;}
    setActiveId(copy.id);active.current=copy.id;setMenuId(null);
    if(location)props.onLocation(location);
    return true;
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
    const app=stage.current!.closest<HTMLElement>('.app'),appBounds=app?.getBoundingClientRect()??bounds;
    const topLimit=Math.min(0,(app?.querySelector<HTMLElement>(':scope > .titlebar')?.getBoundingClientRect().bottom??appBounds.top)+2-bounds.top);
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
      y=Math.max(topLimit,Math.min(Math.max(0,bounds.height-(g.fitBottom?240:Math.min(height,36))),y));
      if(g.fitBottom)height=Math.max(240,bounds.height-y);
    }else{
      x=Math.max(0,Math.min(Math.max(0,bounds.width-160),x));y=Math.max(topLimit,Math.min(Math.max(0,bounds.height-80),y));
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
  const tileTopLimit=()=>{const node=stage.current,app=node?.closest<HTMLElement>('.app');if(!node||!app)return 0;const top=app.querySelector<HTMLElement>(':scope > .titlebar')?.getBoundingClientRect().bottom??app.getBoundingClientRect().top;return Math.min(0,top+2-(node.getBoundingClientRect().top-tileOffset));};
  const covered=(hasTiles&&tileOffset<-24)||visibleWindows.some(win=>win.mode!=='tiled'&&win.y<-34&&(win.width===0||win.width>=(stage.current?.clientWidth??1000)*.8));
  const layoutSwitch=<div className="graph-layout-switch" role="group" aria-label="Вид карты связей"><button type="button" aria-pressed={graphLayout==='tree'} onClick={()=>{setGraphLayout('tree');localStorage.setItem('noteapp-graph-layout','tree')}}>Древовидная таблица</button><button type="button" aria-pressed={graphLayout==='graph'} onClick={()=>{setGraphLayout('graph');localStorage.setItem('noteapp-graph-layout','graph')}}>Граф</button></div>;
  return <div className="central-desktop" data-detached={props.detachedId||undefined} data-storage-covered={covered||undefined} data-moving={moving||undefined}>
    {!props.detachedId&&<nav className={`storage-strip project-workspace palette-${props.generalPalette}`} aria-label="Навигация по хранилищу">
      <button className="storage-up" title="На уровень выше" aria-label="На уровень выше" disabled={!selectedOwner} onClick={()=>void open(selectedOwner===ALL_PROJECTS?{kind:'home'}:{kind:'folder',project:selectedOwner,path:parentPath},false,true,selected.id)}><ArrowUp size={19}/></button>
      <span className="storage-path" title={selectedPath||selectedLabel||'Все проекты'}>{selectedLabel||'Все проекты'}{selectedPath&&selectedPath!==projectRoot(selectedOwner)&&<> <span aria-hidden="true">›</span> {selectedPath.startsWith(projectRoot(selectedOwner))?selectedPath.slice(projectRoot(selectedOwner).length).replace(/^\//,'').replaceAll('/',' › '):selectedPath}</>}</span>
      {selectedLocation.kind==='graph'&&layoutSwitch}
      <button className="storage-graph" onClick={()=>void open({kind:'graph',project:selectedOwner||ALL_PROJECTS},false,true,selected.id)}><Graph size={18}/>{selectedOwner?'Карта связей':'Общая карта связей'}</button>
    </nav>}
    {props.detachedId&&selectedLocation.kind==='graph'&&<nav className="detached-graph-nav" aria-label="Вид карты связей">{layoutSwitch}</nav>}
    <div ref={stage} className="central-stage" data-tiled={hasTiles||undefined} style={hasTiles?{marginTop:tileOffset}:undefined}>
      {hasTiles&&<div className="tile-stage-resize" role="separator" tabIndex={0} aria-label="Переместить верхнюю границу центральной области" aria-orientation="horizontal"
        onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);tileResize.current={pointer:event.pointerId,y:event.clientY,offset:tileOffset};}}
        onPointerMove={event=>{const drag=tileResize.current;if(drag?.pointer===event.pointerId)setTileOffset(Math.max(tileTopLimit(),Math.min(0,drag.offset+event.clientY-drag.y)));}}
        onPointerUp={()=>{tileResize.current=null;}} onPointerCancel={()=>{tileResize.current=null;}} onLostPointerCapture={()=>{tileResize.current=null;}}
        onKeyDown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();const limit=tileTopLimit();setTileOffset(value=>Math.max(limit,Math.min(0,value+(event.key==='ArrowUp'?-16:16))));}}}/>}
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
        const customHex=/^#[\da-f]{6}$/i.test(data.settings.customPaletteColor??'')?data.settings.customPaletteColor!:'#8f9bb3',customRgb=parseInt(customHex.slice(1),16),customLight=((customRgb>>16)*299+((customRgb>>8)&255)*587+(customRgb&255)*114)/1000>=150;
        return <section key={win.id} className={`central-window workbench project-workspace palette-${palette}`} data-custom-light={palette==='custom'?customLight:undefined} data-active={activeId===win.id||undefined} data-mode={win.mode??'floating'} data-maximized={maximized||undefined} data-palette-blend={blend??''} data-split-preview={preview} aria-label={`Центральное окно ${index+1}`}
          style={win.mode==='tiled'&&!maximized?{...tileRect(win.tilePath??'',data.settings.simpleStyle),zIndex:activeId===win.id?20:index+1}:{left:maximized?0:win.x,top:maximized?0:win.y,width:maximized?'100%':win.width||'100%',height:maximized?'100%':fillBottom?undefined:win.height||'100%',bottom:fillBottom?0:undefined,zIndex:activeId===win.id?20:index+1}}
          onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-noteapp-window')){event.preventDefault();if(win.mode==='tiled'&&draggingWindow.current!==win.id){const rect=event.currentTarget.getBoundingClientRect(),dx=(event.clientX-rect.left)/rect.width-.5,dy=(event.clientY-rect.top)/rect.height-.5,vertical=Math.abs(dy)>Math.abs(dx);const side: 'L'|'R'|'T'|'B'=vertical?(dy<0?'T':'B'):(dx<0?'L':'R'),key=`${draggingWindow.current}:${win.id}:${side}`;if(tilePreviewKey.current!==key){tilePreviewKey.current=key;setSplitPreview({id:win.id,side});const preview=tileMove(dragBase.current??current.current,draggingWindow.current!,win.id,side);if(preview)setTilePreview(preview)}}}else if(event.dataTransfer.types.includes(paletteDragType))event.preventDefault();}}
          onDrop={event=>{setSplitPreview(null);const value=readPaletteDrop(event.dataTransfer.getData(paletteDragType));if(value){event.preventDefault();event.stopPropagation();commit(current.current.map(entry=>entry.id===win.id?{...entry,palette:value.palette,blend:value.blend}:entry));return;}const source=event.dataTransfer.getData('application/x-noteapp-window');if(!source)return;const destination=splitPreview?.id??win.id;if(source===destination||current.current.find(entry=>entry.id===destination)?.mode!=='tiled')return;event.preventDefault();const rect=event.currentTarget.getBoundingClientRect(),dx=(event.clientX-rect.left)/rect.width-.5,dy=(event.clientY-rect.top)/rect.height-.5,vertical=Math.abs(dy)>Math.abs(dx),side: 'L'|'R'|'T'|'B'=splitPreview?.side??(vertical?(dy<0?'T':'B'):(dx<0?'L':'R')),next=tileMove(dragBase.current??current.current,source,destination,side);setTilePreview(null);tilePreviewKey.current='';dragBase.current=null;if(next)commit(next);}}
          onPointerDownCapture={()=>{if(active.current!==win.id)selectWindow(win.id);}} onPointerDown={event=>{if(win.mode!=='tiled'&&(event.target as Element).closest('.markdown-ribbon-tabs')&&!(event.target as Element).closest('button,input,select'))start(event,win.id,'move');}} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
          {menuId===win.id&&<div className="dropdown central-window-menu" onKeyDown={event=>{if(event.key==='Escape')setMenuId(null);}}>
            <button onClick={()=>{void open({kind:'home'},false,true,win.id);setMenuId(null);}}><House/>Все проекты</button>
            {!win.detached&&props.detach&&<button onClick={()=>{setMenuId(null);props.detach?.(win.id);}}><ArrowsOut/>Открыть отдельным окном</button>}
            <button disabled={windows.length>=windowLimit} onClick={()=>duplicate(win.id)}><Copy/>Новое отдельное окно <small>{windows.length}/{windowLimit}</small></button>
            <button disabled={windows.length>=windowLimit} onClick={()=>duplicate(win.id,'tiled')}><ArrowsOutCardinal/>Разделить центральную область <small>{windows.length}/{windowLimit}</small></button>
            <button onClick={()=>{commit(current.current.map(entry=>entry.id===win.id?{...entry,x:0,y:0,width:0,height:0}:entry));setMenuId(null);}}><ArrowsOutCardinal/>Развернуть внутри приложения</button>
            {win.detached&&props.returnToApp&&<button onClick={()=>{setMenuId(null);props.returnToApp?.(win.id);}}><ArrowsIn/>Вернуть в приложение</button>}
            {!win.detached&&windows.length>1&&<button onClick={()=>{setMenuId(null);void closeWindow(win.id);}}><X/>Закрыть окно</button>}
            {note&&<><button onClick={()=>props.toggleFavorite(note.path)}><Star/>{data.settings.favorites?.includes(note.path)?'Убрать из избранного':'В избранное'}{data.settings.favorites?.includes(note.path)&&<Check size={16}/>}</button><button onClick={()=>{props.rename(note.path);setMenuId(null);}}><PencilSimple/>Переименовать</button>
              {!note.path.endsWith('.canvas')&&<button onClick={()=>{setSourceWindow(win.id);setMenuId(null)}}><FileText/>Исходный код заметки</button>}
              {note.path.endsWith('.canvas')&&(['snapGrid','snapGuides'] as const).map(key=><button key={key} role="menuitemcheckbox" disabled={props.read} aria-checked={parseCanvas(note.content)?.[key]!==false} onClick={()=>window.dispatchEvent(new CustomEvent('noteapp-canvas-setting',{detail:{path:note.path,key}}))}><Check size={16} style={{visibility:parseCanvas(note.content)?.[key]!==false?'visible':'hidden'}}/>{key==='snapGrid'?'Привязка виджетов к сетке':'Привязка к другим элементам'}</button>)}
              <button onClick={()=>{props.move(item);setMenuId(null);}}><Folder/>Переместить…</button>
              <button onClick={event=>{const node=event.currentTarget.closest<HTMLElement>('.central-window');setMenuId(null);if(node)void captureReading(win.id,()=>note.path.endsWith('.canvas')?saveCanvasPng(node,title(note.path)):saveNotePng(node,title(note.path))).catch(error=>alert(String(error)));}}><Download/>{note.path.endsWith('.canvas')?'Сохранить полотно в PNG…':'Сохранить заметку в PNG…'}</button>
              {note.path.endsWith('.canvas')&&<button onClick={event=>{const node=event.currentTarget.closest<HTMLElement>('.central-window'),items=(parseCanvas(note.content)?.widgets??[]).filter(item=>item.exportPreset);setMenuId(null);if(!node)return;if(!items.length){alert('Добавьте параметры экспорта в настройках объектов.');return}setBatchExport({windowId:win.id,node,items:items.map((item,index)=>({id:item.id,name:item.kind==='frame'&&item.text.trim()?item.text.trim():`Объект ${index+1}`,scale:item.exportPreset?.scale??1,format:item.exportPreset?.format==='jpeg'?'jpeg':'png',width:item.width??300,height:item.height??140,enabled:true}))})}}><Download/>Экспортировать объекты…</button>}
              <button onClick={event=>{const node=event.currentTarget.closest<HTMLElement>('.central-window');setMenuId(null);if(note.path.endsWith('.canvas')){if(node)void captureReading(win.id,()=>printCanvasPdf(node,title(note.path))).catch(error=>alert(String(error)));}else props.pdf(note.path);}}><Download/>Печать / сохранить PDF…</button>
              <button onClick={props.toggleRead}><FileText/>{props.read?'Редактировать':'Режим чтения'}</button></>}
            {location.kind==='graph'&&<button onClick={event=>{const win=event.currentTarget.closest<HTMLElement>('.central-window');setMenuId(null);if(win)void saveGraphPng(win,owner===ALL_PROJECTS?'Общая карта связей':'Карта — '+owner).catch(error=>alert(String(error)));}}><Download/>Сохранить карту в PNG…</button>}
            {location.kind==='folder'&&<button onClick={()=>{props.move(item);setMenuId(null);}}><Folder/>Переместить…</button>}
            {location.kind!=='home'&&owner!==ALL_PROJECTS&&<button onClick={()=>{props.remove(item);setMenuId(null);}}><Trash/>В корзину</button>}
          </div>}
          <div className={`note-tab-strip${location.kind==='note'?'':' folder-workspace'}`} onPointerDown={event=>{if(win.mode!=='tiled'&&!(event.target as Element).closest('button'))start(event,win.id,'move');}} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}><ReorderTabs windowId={win.id} transfer={transfer} active={win.active} order={win.tabs} change={tabs=>commit(current.current.map(entry=>entry.id===win.id?{...entry,tabs}:entry))}
            items={win.tabs.map(key=>{const tab=tabLocation(key);const tabOwner=tab?.kind==='note'?projectFor(tab.path):tab&&tab.kind!=='home'?tab.project:'';const tabPalette=paletteId(tabOwner?data.settings.projectPalettes?.[tabOwner]??props.generalPalette:props.generalPalette);const Icon=tab?.kind==='home'?House:tab?.kind==='graph'?Graph:tab?.kind==='folder'?Folder:FileText;const label=tab?.kind==='home'?'Все проекты':tab?.kind==='graph'?(tab.project===ALL_PROJECTS?'Общая карта':`Карта · ${tab.project}`):tab?.kind==='folder'?tab.path.split('/').at(-1)||tab.project:title(key);return <div key={key} data-closing={closing.includes(JSON.stringify([win.id,key]))||undefined} className={`note-tab${key===win.active?'':` palette-${tabPalette}`}${tabOwner&&tabOwner===owner&&key!==win.active?' same-project-note-tab':''}${key===win.active?' selected-note-tab':''}`}>
              <button className="note-tab-label" title={label} aria-pressed={key===win.active} onClick={()=>{if(tab)void open(tab,false,true,win.id);}}><ObjectIcon item={{kind:tab?.kind==='note'?'note':tab?.kind==='folder'?'folder':'project',path:tab?.kind==='note'||tab?.kind==='folder'?tab.path:tab?.kind==='graph'?tab.project:'',isKanban:tab?.kind==='note'&&!!kanbanNoteId(data.notes.find(item=>item.path===tab.path)?.content??'')}} icons={data.settings.objectIcons} size={17}/><strong>{label}</strong></button>
              <button className="icon-button" aria-label={`Закрыть вкладку «${label}»`} onClick={()=>void closeTab(win.id,key)}><X size={14}/></button></div>;})}/>
            <div className="central-window-actions">
              <button className="central-move-handle" title="Переместить окно" aria-label="Переместить окно" draggable={win.mode==='tiled'} onDragStart={event=>{draggingWindow.current=win.id;dragBase.current=current.current;setMoving(true);event.dataTransfer.setData('application/x-noteapp-window',win.id);event.dataTransfer.effectAllowed='move';const windowNode=event.currentTarget.closest<HTMLElement>('.central-window');if(windowNode)event.dataTransfer.setDragImage(windowNode,30,20);}} onDragEnd={()=>{draggingWindow.current=null;dragBase.current=null;tilePreviewKey.current='';setMoving(false);setSplitPreview(null);setTilePreview(null);}} onPointerDown={event=>{if(win.mode!=='tiled')start(event,win.id,'move');}} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}><DotsSixVertical size={16}/></button>
              {!props.detachedId&&<button title="Фокус" aria-label="Фокус" aria-pressed={props.focus} onClick={props.toggleFocus}><ArrowsOut size={16}/></button>}
              <button title="Меню окна" aria-label="Меню окна" aria-expanded={menuId===win.id} onClick={()=>setMenuId(menuId===win.id?null:win.id)}><DotsThree size={20}/></button>
              {win.detached&&<button title="Вернуть в приложение" aria-label="Вернуть в приложение" onClick={()=>props.returnToApp?.(win.id)}><ArrowsIn size={16}/></button>}
              {!win.detached&&windows.length>1&&<button title="Закрыть окно" aria-label="Закрыть окно" onClick={()=>void closeWindow(win.id)}><X size={16}/></button>}
            </div></div>
          {sourceWindow===win.id&&note&&!note.path.endsWith('.canvas')&&<div className="modal-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)setSourceWindow(null)}}><section className="modal note-source-view" role="dialog" aria-modal="true" aria-label="Исходный код заметки" onKeyDown={event=>{if(event.key==='Escape')setSourceWindow(null)}}><header><h2>Исходный код заметки</h2><button aria-label="Закрыть" onClick={()=>setSourceWindow(null)}><X size={20}/></button></header><textarea readOnly value={note.content} aria-label="Исходный текст заметки"/></section></div>}
          {batchExport?.windowId===win.id&&<div className="modal-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)setBatchExport(null)}}><section className="modal canvas-export-dialog" role="dialog" aria-modal="true" aria-label="Экспорт объектов" onKeyDown={event=>{if(event.key==='Escape')setBatchExport(null)}}><header><h2>Экспорт объектов</h2><button type="button" aria-label="Закрыть" onClick={()=>setBatchExport(null)}><X size={20}/></button></header><p className="subtle">Выберите объекты для экспорта. Для каждого файла откроется окно сохранения.</p><div className="canvas-export-list">{batchExport.items.map((item,index)=><label key={item.id}><input type="checkbox" checked={item.enabled} onChange={event=>{const enabled=event.target.checked;setBatchExport(current=>current?{...current,items:current.items.map((value,i)=>i===index?{...value,enabled}:value)}:current)}}/><span>{item.name}</span><small>{item.format.toUpperCase()} · {item.scale}× · {Math.round(item.width*item.scale)} × {Math.round(item.height*item.scale)} px</small></label>)}</div><div className="modal-foot"><button type="button" onClick={()=>setBatchExport(null)}>Отмена</button><button type="button" className="primary" disabled={!batchExport.items.some(item=>item.enabled)} onClick={()=>{const batch=batchExport,items=batch.items.filter(item=>item.enabled);setBatchExport(null);void captureReading(batch.windowId,async()=>{for(const item of items)await saveCanvasObjectPng(batch.node,item.id,item.name,item.scale,item.format)}).catch(error=>alert(String(error)))}}>Экспортировать ({batchExport.items.filter(item=>item.enabled).length})</button></div></section></div>}
          <div className="editor-layout"><div className="tabbed-workspace">
            {location.kind==='home'?props.renderHome(openItem):location.kind==='graph'&&(owner===ALL_PROJECTS||projects.includes(owner))?props.renderGraph(owner,openItem,graphLayout):location.kind==='folder'?<FolderContents icons={data.settings.objectIcons} root={data.root} background={data.settings.projectBackgrounds?.[owner]??null} name={item.name} entries={entriesIn(owner,item.path,vaultFolders(data),data.notes,projectFor)} open={openItem} showMenu={props.showMenu}
              actions={<div className="folder-actions"><button className="primary" onClick={()=>props.newNote(item.path)}><Plus size={18}/>Новая заметка</button><button onClick={()=>props.newFolder(item)}><Folder size={18}/>Новая папка</button></div>}/>:note?<NoteWindow key={note.path} {...props} read={props.read||exportWindow===win.id} path={note.path} onView={view=>noteViews.current.set(win.id,view)}/>:<div className="editor-pane editor-empty"><p>Этот объект больше недоступен.</p><button onClick={()=>void open({kind:'home'},false,true,win.id)}>Все проекты</button></div>}
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
  const viewportKey=JSON.stringify([props.data.root,props.path]);
  const [zoom,setZoomState]=useState(()=>noteViewports.get(viewportKey)?.zoom??1);
  const setZoom:Dispatch<SetStateAction<number>>=value=>setZoomState(current=>{const next=typeof value==='function'?value(current):value;noteViewports.set(viewportKey,{zoom:next,scrollTop:noteViewports.get(viewportKey)?.scrollTop??0,scrollLeft:noteViewports.get(viewportKey)?.scrollLeft??0});return next});
  const [ribbonHidden,setRibbonHidden]=useState(false);
  const [zoomTarget,setZoomTarget]=useState<HTMLElement|null>(null);
  const note=props.data.notes.find(note=>note.path===props.path)!;
  const appearance=props.data.settings.noteAppearance?.[note.path];
  const owner=projectOf(note.path,props.data.settings.projects??defaultProjects);
  const style={...textAppearanceStyle(appearance),'--editor-size':`${appearance?.fontSize??props.data.settings.fontSize??16}px`,'--text-width':`${appearance?.textWidth??props.data.settings.textWidth??810}px`,'--body-font':fontStack(validFont(appearance?.fontFamily??props.data.settings.fontFamily))} as React.CSSProperties;
  const activeView=()=>props.read?undefined:activeTableEditor(main.current)??editor.current?.view;
  const format=(apply:(view:EditorView)=>void)=>{const view=activeView();if(view)apply(view);};
  useEffect(()=>{setZoomTarget(main.current?.closest('.central-window')?.querySelector<HTMLElement>('.central-window-actions')??null);},[props.path]);
  useEffect(()=>{
    const root=main.current;
    if(!root||props.read||props.path.endsWith('.canvas'))return;
    let current:{widget:HTMLElement;menu:HTMLElement;actions:HTMLElement;panel:HTMLElement;inspector:HTMLElement;gridStep:string;gridPriority:string}|null=null;
    const close=()=>{
      if(!current)return;
      const {widget,menu,actions,panel,inspector,gridStep,gridPriority}=current;
      widget.removeAttribute('data-note-widget-selected');
      if(gridStep)actions.style.setProperty('--grid-step',gridStep,gridPriority);else actions.style.removeProperty('--grid-step');
      if(menu.isConnected)menu.append(actions);
      panel.remove();inspector.removeAttribute('data-note-widget-settings');current=null;
    };
    const select=(event:PointerEvent)=>{
      const target=event.target as Element|null;
      if(!target||!root.closest('.central-window[data-active]'))return;
      const widget=target.closest<HTMLElement>('.floating-note-text,.note-image-box,.note-feature-host.note-feature-widget,.visual-table-host.note-feature-widget,.note-code-host.note-feature-widget');
      if(!widget||!root.contains(widget)){close();return;}
      if(current?.widget===widget)return;
      const menu=widget.querySelector<HTMLElement>(':scope > .note-insert-menu');
      const actions=menu?.querySelector<HTMLElement>(':scope > .note-insert-actions');
      const inspector=root.closest('.app')?.querySelector<HTMLElement>('.dock-panel[data-panel="inspector"] .inspector');
      if(!menu||!actions||!inspector){close();return;}
      close();
      const gridStep=actions.style.getPropertyValue('--grid-step'),gridPriority=actions.style.getPropertyPriority('--grid-step');
      const inheritedGrid=getComputedStyle(actions).getPropertyValue('--grid-step');
      if(inheritedGrid)actions.style.setProperty('--grid-step',inheritedGrid);
      const panel=document.createElement('section');panel.className='note-widget-settings-panel';
      const heading=document.createElement('strong');heading.textContent='Настройки виджета';panel.append(heading,actions);
      inspector.append(panel);inspector.setAttribute('data-note-widget-settings','');widget.setAttribute('data-note-widget-selected','');current={widget,menu,actions,panel,inspector,gridStep,gridPriority};
    };
    const observer=new MutationObserver(()=>{if(current&&!current.widget.isConnected)close()});
    const switchWindow=(event:PointerEvent)=>{const target=(event.target as Element|null)?.closest('.central-window');if(target&&target!==root.closest('.central-window'))close()};
    observer.observe(root,{childList:true,subtree:true});
    root.addEventListener('pointerdown',select,true);
    document.addEventListener('pointerdown',switchWindow,true);
    return()=>{observer.disconnect();root.removeEventListener('pointerdown',select,true);document.removeEventListener('pointerdown',switchWindow,true);close()};
  },[props.path,props.read]);
  useLayoutEffect(()=>{
    const scroll=main.current?.querySelector<HTMLElement>('.editor-scroll,.task-board-columns')??main.current;
    if(!scroll)return;
    const saved=noteViewports.get(viewportKey);
    let frame=0,attempts=0,restoring=!!saved;
    const restore=()=>{
      if(!saved||!restoring)return;
      scroll.scrollTop=saved.scrollTop;scroll.scrollLeft=saved.scrollLeft;
      if(Math.abs(scroll.scrollTop-saved.scrollTop)<1&&Math.abs(scroll.scrollLeft-saved.scrollLeft)<1||++attempts>=30){restoring=false;return;}
      frame=requestAnimationFrame(restore);
    };
    restore();
    const remember=()=>{if(!restoring)noteViewports.set(viewportKey,{zoom:noteViewports.get(viewportKey)?.zoom??1,scrollTop:scroll.scrollTop,scrollLeft:scroll.scrollLeft})};
    scroll.addEventListener('scroll',remember,{passive:true});
    return()=>{cancelAnimationFrame(frame);remember();scroll.removeEventListener('scroll',remember)};
  },[viewportKey]);
  useEffect(()=>{
    const focus=(event:Event)=>{
      const detail=(event as CustomEvent<{path:string;column:string;taskId?:string}>).detail,root=main.current;
      if(!root||detail.path!==props.path||!root.closest('.central-window[data-active]'))return;
      const column=Array.from(root.querySelectorAll<HTMLElement>('[data-kanban-column]')).find(item=>item.dataset.kanbanColumn===detail.column);
      const target=detail.taskId?Array.from(column?.querySelectorAll<HTMLElement>('[data-task-id]')??[]).find(item=>item.dataset.taskId===detail.taskId):column;
      target?.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});
    };
    window.addEventListener('noteapp-focus-kanban',focus);
    return()=>window.removeEventListener('noteapp-focus-kanban',focus);
  },[props.path]);
  const zoomControls=<div className="note-zoom-controls note-zoom-controls-titlebar" role="group" aria-label="Масштаб редактора">
    <button type="button" aria-label={ribbonHidden?'Показать панель редактирования':'Скрыть панель редактирования'} aria-expanded={!ribbonHidden} onClick={()=>setRibbonHidden(value=>!value)}><CaretDown size={15} className={ribbonHidden?'ribbon-collapsed':''}/></button>
    <button type="button" aria-label="Уменьшить масштаб" disabled={zoom<=.5} onClick={()=>setZoom(value=>Math.max(.5,Math.round((value-.1)*10)/10))}><Minus size={15}/></button>
    <button type="button" aria-label={`Масштаб редактора ${Math.round(zoom*100)}%. Сбросить`} onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button>
    <button type="button" aria-label="Увеличить масштаб" disabled={zoom>=2} onClick={()=>setZoom(value=>Math.min(2,Math.round((value+.1)*10)/10))}><Plus size={15}/></button>
  </div>;
  if(note.path.endsWith('.canvas'))return <CanvasEditor key={note.path} note={note} notes={props.data.notes} project={owner} root={props.data.root} background={props.data.settings.projectBackgrounds?.[owner]??null} pattern={props.data.settings.projectPatterns?.[owner]} gridOpacity={props.data.settings.projectGridOpacity?.[owner]??100} read={props.read} light={props.data.settings.theme==='light'} textStyle={style} save={content=>props.edit(note.path,content)} onLink={props.openLink} references={props.references} typography={getView=>props.typography(note.path,getView)} pickReference={props.pickReference} attach={(files,position,ref)=>props.attach(files,position,note.path,ref)} uploadImages={files=>props.uploadImages(files,note.path)} taskBoards={props.data.settings.taskBoards??[]} changeTaskBoard={props.changeTaskBoard} openTasks={()=>props.openTaskManager(owner)} insertBoard={(view,id)=>props.insertBoard(view,owner,id)}/>;
  const boardId=kanbanNoteId(note.content);
  if(boardId){
    if(props.data.notes.filter(item=>kanbanNoteId(item.content)===boardId).length>1)return <main className="kanban-note editor-pane"><p>Несколько заметок используют один идентификатор Kanban. Данные сохранены в файлах; уберите лишние копии из хранилища, чтобы открыть доску.</p></main>;
    const board=props.data.settings.taskBoards?.find(item=>item.id===boardId);
    return <main ref={main} className="kanban-note editor-pane">{board?<TaskBoardView board={board} notes={props.data.notes} change={props.changeTaskBoard} openNote={props.openLink} editable={!props.read}/>:<p>Доска Kanban недоступна.</p>}</main>;
  }
  return <>
  <main ref={main} className="editor-pane main-note-editor" data-ribbon-hidden={ribbonHidden||undefined}>
    {!ribbonHidden&&<div className="note-ribbon" inert={props.read}><MarkdownToolbar runEdit={format} disabled={props.read} typography={props.typography(note.path,activeView)}
      insertReference={kind=>format(view=>props.pickReference(view,kind))}
      createWidget={kind=>format(view=>floatNoteText(view,kind))} taskBoards={props.data.settings.taskBoards??[]} changeTaskBoard={props.changeTaskBoard}
      openTasks={()=>props.openTaskManager(owner)} insertBoard={(view,id)=>props.insertBoard(view,owner,id)}/></div>}
    <div className="editor-area note-editor-area"><NoteBackdrop root={props.data.root} path={props.data.settings.projectBackgrounds?.[owner]??null} grid/>
      <div className="editor-scroll" onPointerDown={event=>{if(props.read||event.button!==0)return;const target=event.target as HTMLElement;if(!target.matches('.editor-scroll,.text-surface,.note-zoom-frame,.note-zoom-content,.cm-editor,.cm-scroller,.cm-content'))return;const view=editor.current?.view;if(!view)return;const rect=view.contentDOM.getBoundingClientRect(),pos=view.posAtCoords({x:Math.max(rect.left+1,Math.min(event.clientX,rect.right-1)),y:Math.max(rect.top+1,Math.min(event.clientY,rect.bottom-1))},false);if(pos!==null){event.preventDefault();view.dispatch({selection:{anchor:pos}});view.focus();}}} onDragOver={event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();}}
        onDrop={event=>{const files=Array.from(event.dataTransfer.files);if(!files.length||props.read)return;event.preventDefault();props.attach(files,editor.current?.view?.posAtCoords({x:event.clientX,y:event.clientY},false)??undefined,note.path,editor);}}
        onPaste={event=>{const files=Array.from(event.clipboardData.files);if(files.length&&!props.read){event.preventDefault();props.attach(files,undefined,note.path,editor);}}}>
        <div className="text-surface" style={style} onFocusCapture={event=>{const target=event.target as HTMLElement;if(target.classList.contains('cm-content')&&!target.closest('.visual-table-cell'))clearActiveTableEditor(main.current);}}><Editor note={note} notes={props.data.notes} read={props.read} onChange={text=>props.edit(note.path,text)} onLink={props.openLink} editorRef={editor} onReady={props.onView} light={props.data.settings.theme==='light'} autoFocus={false} references={props.references} attachWidget={(files,position)=>props.attach(files,position,note.path,editor)} zoom={zoom} setZoom={setZoom} showZoomControls={false} taskBoards={props.data.settings.taskBoards??[]} changeTaskBoard={props.changeTaskBoard}/></div>
      </div>
    </div>
    <footer className="statusbar"><span>Markdown</span><span>{note.content.trim().split(/\s+/).filter(Boolean).length} слов</span></footer>
  </main>
  {zoomTarget&&createPortal(zoomControls,zoomTarget)}
  </>;
}
export default CentralWindows;
