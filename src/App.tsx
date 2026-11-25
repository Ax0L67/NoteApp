import {useState,useRef,useEffect,useCallback,useMemo,type CSSProperties,type ReactNode} from 'react';
import {House,Minus,Square,CaretLeft,ArrowUp,Stack,Archive,Plus,MagnifyingGlass,Folder,FolderPlus,FileText,Trash, Gear,CaretDown,CaretRight,ArrowsOut,ArrowsOutCardinal,SidebarSimple,List,Link as LinkIcon,Image as ImageIcon,CalendarBlank,DotsThree,X,Check,ArrowCounterClockwise,Download,Upload,Copy,Sun,Moon,PencilSimple,BookOpen,Warning,FloppyDisk,Graph,Columns,NotePencil,SortAscending,SortDescending,ClockClockwise,ClockCounterClockwise,CalendarCheck,Eye,ArrowsIn,ArrowsOutSimple,Palette,GridFour,Star} from '@phosphor-icons/react';
import type {EditorView} from '@codemirror/view';
import type {ReactCodeMirrorRef} from '@uiw/react-codemirror';
import {request,desktop} from './storage';
import type {Snapshot,Settings,NoteAppearance,Draft,SaveResult,ProjectConnection,ProjectMap,MapBlock,MapCard,MapPoint,TaskBoard} from './types';
import {title,folder,backlinks,resolveLink,target} from './indexing';
import {search} from './search';
import {GridPicker,gridStyle} from './gridPatterns';
import {chromeStyle,chromeTransparency,customColor,resetActivePalette} from './appearanceSettings';
import {builtins,dateString,expand} from './templates';
import Editor from './Editor';
import ProjectGraph from './ProjectGraph';
import {ALL_PROJECTS,allProjectsRoot,allProjectsGraph} from './allProjectsGraph';
import ProjectGrid from './ProjectGrid';
import ReorderTabs from './ReorderTabs';
import CentralWindows,{type CentralWindowsHandle} from './CentralWindows';
import {parseCanvas,canvasFrameParents} from './CanvasEditor';
import PrintNote from './PrintNote';
import SettingsPanel from './SettingsPanel';
import {objectIcons,objectIconKey,ObjectIcon} from './ObjectIcon';
import TermsWindow,{removeTermDefinition,type TermEntry} from './TermsWindow';
import {localize} from './localization';
import {shortcutActions,shortcutMatches,type ShortcutAction} from './shortcuts';
import {movedSettings,movedLocation} from './moveSettings';
import WorkspaceLayout from './WorkspaceLayout';
import {mergeTabOrder} from './tabOrder';
import {readCentralWindows} from './centralWindowState';
import {focusOrCreateDetachedWindow} from './detachedWindow';

import {folderTabKey,locationTabKey,replaceTab,tabLocation,type FolderTab} from './workspaceTabs';
import {mapBlockKey,mapBlocks,mapNotesPath} from './mapBlocks';
import MarkdownToolbar from './MarkdownToolbar';
import FontPicker,{fontStack,validFont} from './FontPicker';
import TextOptions,{textAppearanceStyle} from './TextOptions';
import ReferencePicker from './ReferencePicker';
import NoteOutline from './NoteOutline';
import KanbanOutline from './KanbanOutline';
import WidgetOutline,{graphOutlineItems} from './SidebarObjectList';
import SortMenu from './SortMenu';
import {floatNoteText} from './noteTextBlocks';
import NoteTypography from './NoteTypography';
import {referenceMarkdown,referenceUrl,remapNoteReference,type ReferenceKind,type ReferenceRange,type ReferenceTarget} from './noteReferences';
import {defaultProjects,projectRoot,projectOf,vaultFolders,validateFolderName} from './projects';
import {entriesIn,ExplorerContextMenu,ExplorerTree,FolderContents,itemKey,type ExplorerItem,type ExplorerMenu,type Location} from './Explorer';
import {NoteBackdrop,paletteId,paletteDragType,readPaletteDrop,ProjectCard,ProjectPalettePicker} from './appearance';
import TaskBoardManager,{newTaskBoard} from './TaskBoards';
import {kanbanNoteBoard,kanbanNoteContent,kanbanNoteId} from './kanbanNote';
import {insertBoard as insertBoardMarker} from './noteFeatureBlocks';
import {textures} from './textures';
import {initialNoteWidget} from './noteWidgetChrome';
import {imageWidgetMarkdown} from './imageAttachment';
import {customThemeStyle} from './customThemes';

type Modal='move'|'search'|'new'|'rename'|'folder'|'settings'|'trash'|'templates'|'delete'|'project'|'archive-project'|'reference'|'daily-note'|'icon'|null;
type ExplorerSort='name-asc'|'name-desc'|'modified-desc'|'modified-asc'|'created-desc'|'created-asc';
const sortChoices=[
 ['name-asc','По имени файла (от А до Я)',SortAscending],['name-desc','По имени файла (от Я до А)',SortDescending],
 ['modified-desc','По времени последнего изменения (от новых к старым)',ClockCounterClockwise],['modified-asc','По времени последнего изменения (от старых к новым)',ClockClockwise],
 ['created-desc','По времени создания (от новых к старым)',CalendarBlank],['created-asc','По времени создания (от старых к новым)',CalendarCheck],
] as const;
const empty:Snapshot={root:'',name:'',notes:[],folders:[],settings:{},trash:[],templates:[]};
const imageFile = /\.(png|jpe?g|webp|gif|avif)$/i;
function IconButton({label,onClick,children,disabled=false,active=false}:{label:string;onClick:()=>void;children:ReactNode;disabled?:boolean;active?:boolean}){return <button className={`icon-button ${active?'active':''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}>{children}</button>}
function Highlight({text,query}:{text:string;query:string}){const i=text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());return !query||i<0?<>{text}</>:<>{text.slice(0,i)}<mark>{text.slice(i,i+query.length)}</mark>{text.slice(i+query.length)}</>}
export default function App(){
 const settingsWindow=new URLSearchParams(window.location.search).has('settings');
 const favoritesWindow=new URLSearchParams(window.location.search).has('favorites');
 const termsWindow=new URLSearchParams(window.location.search).has('terms');
 const detachedCentralId=desktop?new URLSearchParams(window.location.search).get('centralWindow'):null;
 const [project,setProject]=useState('Личное');
 const [section,setSection]=useState('');
 const [openTabs,setOpenTabs]=useState<string[]>([]);
 const windowsRef=useRef<CentralWindowsHandle>(null);
 const [moveTarget,setMoveTarget]=useState<ExplorerItem|null>(null);
 const [moveDestination,setMoveDestination]=useState('');
 const [printPath,setPrintPath]=useState('');
 const [graphOpen,setGraphOpen]=useState(false);
 const [graphEditing,setGraphEditing]=useState(false);
 useEffect(()=>{const changed=(event:Event)=>{const detail=(event as CustomEvent<{project:string;edit:boolean}>).detail;if(detail.project===project)setGraphEditing(detail.edit)};window.addEventListener('noteapp-graph-mode-changed',changed);return()=>window.removeEventListener('noteapp-graph-mode-changed',changed)},[project]);
 const [openGraphs,setOpenGraphs]=useState<string[]>([]);
 const [openFolders,setOpenFolders]=useState<FolderTab[]>([]);
 const [tabOrder,setTabOrder]=useState<string[]>([]);
 const [expanded,setExpanded]=useState<string[]>([itemKey({kind:'project',project:'Личное',path:'',name:'Личное'})]);
 const [explorerSort,setExplorerSort]=useState<ExplorerSort>('modified-desc');
 const [autoReveal,setAutoReveal]=useState(false);
 const [sortMenu,setSortMenu]=useState(false);
 const explorerSortAnchor=useRef<HTMLDivElement>(null);
 const [explorerMenu,setExplorerMenu]=useState<ExplorerMenu|null>(null);
 const closeExplorerMenu=useCallback(()=>setExplorerMenu(null),[]);
 const [folderTarget,setFolderTarget]=useState<ExplorerItem|null>(null);
 const [deleteTarget,setDeleteTarget]=useState<ExplorerItem|null>(null);
 const [renameTarget,setRenameTarget]=useState('');
 const [projectToArchive,setProjectToArchive]=useState('');
 const [referenceDialog,setReferenceDialog]=useState<{url:string;kind?:ReferenceKind;apply:(text:string)=>boolean;instant?:boolean;excludePath?:string}|null>(null);
 const [globalPalette,setGlobalPalette]=useState(()=>localStorage.getItem('noteapp-global-palette'));
 const [overview,setOverview]=useState(true);
 const [appearanceTab,setAppearanceTab]=useState<'palette'|'grid'>('palette');
 const [showFavorites,setShowFavorites]=useState(false);
 const [showTerms,setShowTerms]=useState(false);
 const [favoritesQuery,setFavoritesQuery]=useState('');
 const [dailyNoteUrl,setDailyNoteUrl]=useState('');
 const [taskManagerProject,setTaskManagerProject]=useState<string|null>(null);
 const [paletteArriving,setPaletteArriving]=useState(false);
 const [data,setData]=useState<Snapshot>(empty),[active,setActive]=useState(''),[read,setRead]=useState(()=>localStorage.getItem('noteapp-read-mode')==='true'),[focus,setFocus]=useState(false),[right,setRight]=useState(true),[modal,setModal]=useState<Modal>(settingsWindow?'settings':null),[query,setQuery]=useState(''),[name,setName]=useState(''),[newFolder,setNewFolder]=useState(''),[template,setTemplate]=useState(''),[status,setStatus]=useState('Загрузка…'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[conflict,setConflict]=useState<{path:string;disk:SaveResult}|null>(null),[menu,setMenu]=useState(false),[collapsed,setCollapsed]=useState<string[]>([]),[templateName,setTemplateName]=useState(''),[templateBody,setTemplateBody]=useState(''),[history,setHistory]=useState<Location[]>([{kind:'home'}]),[position,setPosition]=useState(0);
 const [newType,setNewType]=useState<'note'|'canvas'|'kanban'>('note');
 const [iconTarget,setIconTarget]=useState<ExplorerItem|null>(null);
 const [iconQuery,setIconQuery]=useState('');
 const [windowFullscreen,setWindowFullscreen]=useState(false);
 const currentLocation=useRef<Location>({kind:'home'});
 currentLocation.current=overview?{kind:'home'}:graphOpen?{kind:'graph',project}:active?{kind:'note',path:active}:{kind:'folder',project,path:section};
 const visibleTabKeys=useRef<string[]>(['home']);
 const dataRef=useRef(data);dataRef.current=data;const activeRef=useRef(active);activeRef.current=active;
 const pendingBoardUpdates=useRef(new Map<string,TaskBoard>()),pendingBoardRoot=useRef('');
 const drafts=useRef<Record<string,Draft>>({}),savePromise=useRef<Promise<boolean>|null>(null),conflictRef=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),editor=useRef<ReactCodeMirrorRef>(null),fileInput=useRef<HTMLInputElement>(null),body=useRef<HTMLDivElement>(null);

 const settings = data.settings;
 useEffect(()=>{
  const root=document.querySelector<HTMLElement>('.app');if(!root)return;
  const names=['--surface-base','--surface-panel','--surface-tint','--surface-editor','--surface-popup','--surface-input'];
  for(const name of names)root.style.removeProperty(name);
  const shift=((Math.floor(settings.themeColorShift??0)%names.length)+names.length)%names.length;
  if(shift){const style=getComputedStyle(root),colors=names.map(name=>style.getPropertyValue(name).trim());names.forEach((name,index)=>{const color=colors[(index+shift)%names.length];if(color)root.style.setProperty(name,color)});}
  return()=>{for(const name of names)root.style.removeProperty(name)};
 },[settings.themeColorShift,settings.interfaceTheme,settings.theme,settings.customThemes]);
 useEffect(()=>{const root=document.querySelector<HTMLElement>('#root');return root?localize(root,settings.language??'ru'):undefined},[settings.language]);
 const allProjects = settings.projects ?? defaultProjects;
 const projects = allProjects.filter(p => !settings.archivedProjects?.includes(p));
 const orderedProjects=[...new Set([...(settings.projectOrder??[]).filter(name=>allProjects.includes(name)),...allProjects])];
 const visibleProjectOrder=orderedProjects.filter(name=>projects.includes(name));
 const font=validFont(settings.fontFamily);
 const projectFor = (path: string) => projectOf(path, dataRef.current.settings.projects ?? defaultProjects);
 const availableNotes = data.notes.filter(n => !projectFor(n.path)||projects.includes(projectFor(n.path)));
 const note = availableNotes.find(n => n.path === active);

 useEffect(()=>{localStorage.setItem('noteapp-read-mode',String(read))},[read]);

 useEffect(()=>{setOpenTabs(tabs=>{const valid=tabs.filter(path=>availableNotes.some(n=>n.path===path));return valid.length===tabs.length?tabs:valid})},[data.notes,settings.archivedProjects,settings.projects]);
 useEffect(()=>{setOpenFolders(tabs=>{
  const valid=tabs.filter(tab=>canNavigate({kind:'folder',...tab}));
  return valid.length===tabs.length?tabs:valid;
 })},[data.folders,data.notes,settings.archivedProjects,settings.projects]);
 const folders = vaultFolders(data);
 const generalPalette = paletteId(globalPalette ?? settings.palette);
 const overviewPalette=paletteId(settings.overviewPalette??generalPalette);
 const pattern=overview?settings.overviewPattern:settings.projectPatterns?.[project];

 const paletteForProject = (name:string) => {
  if(Object.hasOwn(settings.projectPalettes ?? {},name)) return settings.projectPalettes?.[name] ?? undefined;
  const legacy = availableNotes.find(n=>projectFor(n.path)===name && settings.noteAppearance?.[n.path]?.palette);
  return legacy && settings.noteAppearance?.[legacy.path]?.palette;
 };
 const projectPalette = paletteForProject(project);
 const currentPalette = paletteId(projectPalette ?? generalPalette);
 const blendForProject=(name:string)=>paletteForProject(name)?settings.projectPaletteBlends?.[name]:settings.paletteBlend;
 const paletteBlend=overview?(settings.overviewPalette?settings.overviewPaletteBlend:settings.paletteBlend):blendForProject(project);
 const gridOpacity=overview?settings.overviewGridOpacity??100:settings.projectGridOpacity?.[project]??100;
 const backgroundPath = note ? projectBackground(projectFor(note.path)) : null;
 function projectBackground(name:string) {
  const background=Object.hasOwn(settings.projectBackgrounds??{},name) ? settings.projectBackgrounds![name] : null;
  return background==='/wallpaper.png'?null:background;
 }
 const projectBgInput=useRef<HTMLInputElement>(null);
 const referencePaths=JSON.stringify(availableNotes.map(note=>note.path));
 const referenceProjects=JSON.stringify(projects);
 const referenceTargets=useMemo(()=>{
  const targets=new Map<string,ReferenceTarget>();
  for(const path of JSON.parse(referencePaths) as string[]){
   const owner=projectFor(path);
   const background=projectBackground(owner);
   const palette=paletteId(paletteForProject(owner)??generalPalette);
   const target:ReferenceTarget={kind:'note',path,name:title(path),palette,background};
   targets.set(referenceUrl(target),target);
  }
  for(const path of JSON.parse(referenceProjects) as string[]){
   const target:ReferenceTarget={kind:'map',path,name:`Карта · ${path}`,palette:paletteId(paletteForProject(path)??generalPalette),
    background:projectBackground(path)};
   targets.set(referenceUrl(target),target);
  }
  return targets;
 },[referencePaths,referenceProjects,settings.noteAppearance,settings.projectPalettes,settings.projectBackgrounds,generalPalette]);
 const report=(e:unknown)=>{setError(String(e instanceof Error?e.message:e));setStatus('Не сохранено — проверьте ошибку')};
 const draftKey=()=>`noteapp-drafts:${dataRef.current.root}`;
 const persistDrafts=()=>{try{localStorage.setItem(draftKey(),JSON.stringify(drafts.current))}catch{setError('Недостаточно места для аварийного черновика. Сохраните заметку на диск.')}};
 function accept(s:Snapshot,restore=false){
   if(pendingBoardRoot.current!==s.root){pendingBoardUpdates.current.clear();pendingBoardRoot.current=s.root;}
   if(restore&&!settingsWindow&&!termsWindow){try{drafts.current=JSON.parse(localStorage.getItem(`noteapp-drafts:${s.root}`)||'{}')}catch{drafts.current={}}}
   s.notes=s.notes.map(n=>drafts.current[n.path]?{...n,content:drafts.current[n.path].content}:n);
   for(const [path,d] of Object.entries(drafts.current))if(!s.notes.some(n=>n.path===path))s.notes.push({path,content:d.content,revision:d.revision||''});
   const boards=new Map((s.settings.taskBoards??[]).map(board=>[board.id,board])),seen=new Set<string>();
   for(const note of s.notes){const id=kanbanNoteId(note.content);if(!id)continue;const board=kanbanNoteBoard(note.content);if(seen.has(id)){if(!s.notes.some(item=>item.content.trim()===kanbanNoteContent(id)))boards.delete(id);continue}const pending=pendingBoardUpdates.current.get(id);if(board&&pending&&JSON.stringify(board)===JSON.stringify(pending))pendingBoardUpdates.current.delete(id);if(!board&&note.content.trim()!==kanbanNoteContent(id))boards.delete(id);else if(pending&&!drafts.current[note.path])boards.set(id,pending);else if(board)boards.set(id,board);seen.add(id);}
   if(seen.size)s.settings={...s.settings,taskBoards:[...boards.values()]};
   dataRef.current=s;setData(s);
 }
 const flush=useCallback(async():Promise<boolean>=>{
   if(savePromise.current)return savePromise.current;
   if(conflictRef.current)return false;
   const run=async()=>{try{
     while(Object.keys(drafts.current).length){
         const path=Object.keys(drafts.current)[0];
         const draft={...drafts.current[path]};setStatus('Сохранение…');
         const r=await request<SaveResult>('save',{path,content:draft.content,revision:draft.revision});
         if(r.conflict){conflictRef.current=true;setConflict({path,disk:r});setStatus('Конфликт изменений');return false}
         const latest=drafts.current[path];if(latest?.content===draft.content)delete drafts.current[path];else if(latest)latest.revision=r.revision;
         const s=dataRef.current;s.notes=s.notes.map(n=>n.path===path?{...n,revision:r.revision!,modifiedAt:Date.now()}:n);accept({...s});persistDrafts();
     }setStatus('Сохранено локально');return true;
   }catch(e){report(e);return false}};
   savePromise.current=run();try{return await savePromise.current}finally{savePromise.current=null}
 },[]);
 function edit(path:string,content:string){const n=dataRef.current.notes.find(n=>n.path===path);if(!n)return;drafts.current[n.path]={content,revision:drafts.current[n.path]?.revision??n.revision};persistDrafts();accept({...dataRef.current,notes:dataRef.current.notes.map(x=>x.path===n.path?{...x,content}:x)});setStatus('Есть изменения');clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),450)}
 const settingsQueue=useRef(Promise.resolve());
 const pendingSettings=useRef<{root:string;patch:Partial<Settings>}[]>([]),sendingSettings=useRef(false);
 const settingsChannel=useRef<BroadcastChannel|null>(null);
 useEffect(()=>{const channel=new BroadcastChannel('noteapp-settings');settingsChannel.current=channel;channel.onmessage=({data:message})=>{if(message.root!==dataRef.current.root)return;if(Array.isArray(message.patch.taskBoards))for(const board of message.patch.taskBoards as TaskBoard[]){const previous=dataRef.current.settings.taskBoards?.find(item=>item.id===board.id);if(JSON.stringify(previous)!==JSON.stringify(board)&&dataRef.current.notes.some(note=>kanbanNoteId(note.content)===board.id))pendingBoardUpdates.current.set(board.id,board);}accept({...dataRef.current,settings:{...dataRef.current.settings,...message.patch}});if('palette' in message.patch)setGlobalPalette(message.patch.palette??null);};return()=>{settingsChannel.current=null;channel.close();};},[]);
 function updateSettings(patch:Partial<Settings>){const snapshot=dataRef.current,root=snapshot.root,old=snapshot.settings;if('fontSize' in patch||'fontFamily' in patch||'textWidth' in patch){const appearances={...old.noteAppearance};for(const note of snapshot.notes){const appearance=appearances[note.path]??{};appearances[note.path]={...appearance,fontFamily:appearance.fontFamily??old.fontFamily??'Inter',fontSize:appearance.fontSize??old.fontSize??16,textWidth:appearance.textWidth??old.textWidth??810}}patch={...patch,noteAppearance:appearances}}const next={...snapshot,settings:{...old,...patch}};if(Object.keys(patch).every(key=>['customPaletteColor','textureColors','appBrightness','borderBrightness','contrast'].includes(key))){dataRef.current=next;setData(next)}else accept(next);const last=pendingSettings.current.at(-1);if(last?.root===root)last.patch={...last.patch,...patch};else pendingSettings.current.push({root,patch});if(!sendingSettings.current){sendingSettings.current=true;settingsQueue.current=settingsQueue.current.then(async()=>{while(pendingSettings.current.length){const entry=pendingSettings.current.shift()!;try{await request('settings-patch',{root:entry.root,values:entry.patch,remove:Object.keys(entry.patch).filter(key=>entry.patch[key as keyof Settings]===undefined)});settingsChannel.current?.postMessage(entry)}catch(error){report(error)}}sendingSettings.current=false;});}}
 function openSettings(){if(!desktop){setModal('settings');return;}void (async()=>{await settingsQueue.current;const {WebviewWindow}=await import('@tauri-apps/api/webviewWindow');await focusOrCreateDetachedWindow(()=>WebviewWindow.getByLabel('settings'),()=>new WebviewWindow('settings',{url:'index.html?settings',title:'Настройки — NoteApp',width:940,height:740,minWidth:680,minHeight:480,decorations:true,center:true}));})().catch(report);}
 function openFavorites(){if(!desktop){setShowFavorites(value=>!value);return}void (async()=>{const {WebviewWindow}=await import('@tauri-apps/api/webviewWindow');await focusOrCreateDetachedWindow(()=>WebviewWindow.getByLabel('favorites'),()=>new WebviewWindow('favorites',{url:'index.html?favorites',title:'Избранное — NoteApp',width:460,height:620,minWidth:350,minHeight:400,decorations:true,center:true}))})().catch(report)}
 function openTerms(){if(!desktop){setShowTerms(true);return}void (async()=>{if(!await flush())return;const {WebviewWindow}=await import('@tauri-apps/api/webviewWindow');await focusOrCreateDetachedWindow(()=>WebviewWindow.getByLabel('terms'),()=>new WebviewWindow('terms',{url:'index.html?terms',title:'Термины — NoteApp',width:540,height:680,minWidth:360,minHeight:400,decorations:true,center:true}));})().catch(report)}
 async function removeTerm(entry:TermEntry){
  if(!await flush())return false;
  const note=dataRef.current.notes.find(item=>item.path===entry.path);if(!note)return false;
  const content=removeTermDefinition(note.content,entry,note.path.endsWith('.canvas'));if(content===null)return false;
  edit(note.path,content);return await flush();
 }
 useEffect(()=>{
  if(settingsWindow||favoritesWindow||detachedCentralId)return;
  const channel=new BroadcastChannel('noteapp-terms');
  channel.onmessage=({data:message})=>{
   if(message.root!==dataRef.current.root)return;
   if(termsWindow&&message.type==='updated'){
    if(message.error){setError(message.error);return;}
    void request('snapshot').then(snapshot=>accept(snapshot)).catch(report);
   }else if(!termsWindow&&message.type==='remove'){
    void removeTerm(message.entry).then(ok=>channel.postMessage({type:'updated',root:message.root,error:ok?'':'Не удалось удалить определение. Проверьте сохранение заметки.'})).catch(error=>channel.postMessage({type:'updated',root:message.root,error:String(error)}));
   }
  };
  return()=>channel.close();
 },[settingsWindow,favoritesWindow,detachedCentralId,termsWindow]);
 useEffect(()=>{if(favoritesWindow||termsWindow||detachedCentralId||settingsWindow)return;const channel=new BroadcastChannel('noteapp-favorites-open');channel.onmessage=({data:message})=>{if(message.root===dataRef.current.root)void go(message.path).catch(report)};return()=>channel.close()},[favoritesWindow,termsWindow,detachedCentralId,settingsWindow]);
 useEffect(()=>{if(settingsWindow&&!modal)setModal('settings');},[modal]);
 useEffect(()=>{const scale=Number.isFinite(settings.uiScale)?Math.max(75,Math.min(150,settings.uiScale!))/100:1;if(desktop){void import('@tauri-apps/api/webview').then(({getCurrentWebview})=>getCurrentWebview().setZoom(scale)).catch(report);}else{document.documentElement.style.zoom=String(scale);} },[settings.uiScale]);
 useEffect(()=>{
  if(!desktop)return;
  let live=true,unlisten:(()=>void)|undefined;
  void import('@tauri-apps/api/window').then(async({getCurrentWindow})=>{
   const current=getCurrentWindow(),sync=async()=>{const [fullscreen,maximized]=await Promise.all([current.isFullscreen(),current.isMaximized()]);if(live)setWindowFullscreen(fullscreen||maximized)};
   await sync();unlisten=await current.onResized(()=>{void sync()});if(!live)unlisten();
  }).catch(report);
  return()=>{live=false;unlisten?.()};
 },[]);
 function detachCentralWindow(id:string,point?:{x:number;y:number}){
  if(!desktop)return;
  void (async()=>{
   const {WebviewWindow}=await import('@tauri-apps/api/webviewWindow'),label=`central-${id}`;
   const windows=readCentralWindows(dataRef.current.settings.centralWindows,dataRef.current.settings.active),source=windows.find(win=>win.id===id);
   if(!source)return;
   try{await focusOrCreateDetachedWindow(()=>WebviewWindow.getByLabel(label),async()=>{updateSettings({centralWindows:windows.map(win=>win.id===id?{...win,detached:true}:win)});await settingsQueue.current;return new WebviewWindow(label,{url:`index.html?centralWindow=${encodeURIComponent(id)}`,title:'NoteApp',width:source.width||960,height:source.height||680,minWidth:720,minHeight:480,decorations:true,resizable:true,center:!point,...(point?{x:point.x,y:point.y}:{})});});}
   catch(error){const next=readCentralWindows(dataRef.current.settings.centralWindows,dataRef.current.settings.active);updateSettings({centralWindows:next.map(win=>win.id===id?{...win,detached:false}:win)});await settingsQueue.current;throw error;}
  })().catch(report);
 }
 function returnCentralWindow(id:string){
  const windows=readCentralWindows(dataRef.current.settings.centralWindows,dataRef.current.settings.active);
  updateSettings({centralWindows:windows.map(win=>win.id===id?{...win,detached:false}:win)});
  if(detachedCentralId===id)void import('@tauri-apps/api/window').then(async({getCurrentWindow})=>getCurrentWindow().close());
 }
 function syncTaskBoardNotes(boards:TaskBoard[]){
  for(const board of boards){const notes=dataRef.current.notes.filter(item=>kanbanNoteId(item.content)===board.id),note=notes[0];if(notes.length!==1||(!kanbanNoteBoard(note.content)&&note.content.trim()!==kanbanNoteContent(board.id)))continue;const pending=pendingBoardUpdates.current.get(board.id);if(pending&&JSON.stringify(pending)===JSON.stringify(board))continue;pendingBoardUpdates.current.delete(board.id);const content=kanbanNoteContent(board);if(note.content!==content)edit(note.path,content);}
 }
 function changeTaskBoards(boards:TaskBoard[]){const current=dataRef.current.settings.taskBoards??[];const changed=boards.filter(board=>JSON.stringify(current.find(item=>item.id===board.id))!==JSON.stringify(board));for(const board of changed)pendingBoardUpdates.current.delete(board.id);syncTaskBoardNotes(changed);updateSettings({taskBoards:boards});}
 function changeTaskBoard(board:TaskBoard){const current=dataRef.current.settings.taskBoards??[];changeTaskBoards(current.some(value=>value.id===board.id)?current.map(value=>value.id===board.id?board:value):[...current,board]);}
 function insertTaskBoard(view:EditorView,owner:string,id?:string){let board=(dataRef.current.settings.taskBoards??[]).find(value=>value.id===id);if(!board){board=newTaskBoard(owner);updateSettings({taskBoards:[...(dataRef.current.settings.taskBoards??[]),board]});}insertBoardMarker(view,board.id);}
 useEffect(()=>{let live=true;request('init').then(async s=>{if(!live)return;accept(s,true);if(desktop&&!settingsWindow&&!detachedCentralId&&s.settings.centralWindows?.some(win=>win.detached)){const {getAllWebviewWindows}=await import('@tauri-apps/api/webviewWindow');if(!live)return;const labels=new Set((await getAllWebviewWindows()).map(win=>win.label)),windows=readCentralWindows(s.settings.centralWindows,s.settings.active),open=windows.filter(win=>!win.detached||labels.has(`central-${win.id}`));if(open.length!==windows.length)updateSettings({centralWindows:open.length?open:[{...windows[0],detached:false}]});}setStatus('Сохранено локально');void flush()}).catch(report);return()=>{live=false}},[]);
 useEffect(()=>{const id=setInterval(async()=>{if(!dataRef.current.root||savePromise.current||conflictRef.current)return;try{await settingsQueue.current;const previous=dataRef.current;const s=await request('snapshot');if(dataRef.current.root===previous.root)accept({...s,settings:dataRef.current.settings===previous.settings?s.settings:dataRef.current.settings})}catch(e){report(e)}},3500);return()=>clearInterval(id)},[]);
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(Object.keys(drafts.current).length){persistDrafts();e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',handler);let unlisten:(()=>void)|undefined;
 if(desktop)import('@tauri-apps/api/window').then(async({getCurrentWindow})=>{const currentWindow=getCurrentWindow();unlisten=await currentWindow.onCloseRequested(async e=>{e.preventDefault();if(await flush()){await settingsQueue.current;if(detachedCentralId){const windows=readCentralWindows(dataRef.current.settings.centralWindows,dataRef.current.settings.active),closing=windows.find(win=>win.id===detachedCentralId);if(closing?.detached){const remaining=windows.filter(win=>win.id!==detachedCentralId),next=remaining.length?remaining:[{...closing,detached:false,mode:undefined,tilePath:undefined}];updateSettings({centralWindows:next});await settingsQueue.current;}}await currentWindow.destroy();}})});
 return()=>{window.removeEventListener('beforeunload',handler);unlisten?.()}},[]);


 function showBranch(next: string, dir: string) {
  const keys = [itemKey({kind:'project',project:next,path:projectRoot(next),name:next})];
  for(let p=dir; p && p.toLocaleLowerCase()!==projectRoot(next).toLocaleLowerCase(); p=folder(p)) {
   keys.push(itemKey({kind:'folder',project:next,path:p,name:''}));
  }
  setExpanded(previous=>[...new Set([...previous,...keys])]);
 }
 function canNavigate(location: Location) {
  const s = dataRef.current;
  const names = s.settings.projects ?? defaultProjects;
  const next = location.kind==='note' ? projectFor(location.path) : location.kind==='home' ? '' : location.project;
  if(location.kind==='home'||location.kind==='graph'&&location.project===ALL_PROJECTS)return true;
  if(location.kind==='note'&&!next)return s.notes.some(n=>n.path===location.path);
  if(!names.includes(next)||s.settings.archivedProjects?.includes(next))return false;
  if(location.kind==='note')return s.notes.some(n=>n.path===location.path);
  if(location.kind==='graph')return true;
  return location.path===projectRoot(next)||vaultFolders(s).includes(location.path);
 }
 async function navigate(location: Location, record = true, replaceCurrent=false, fromWindow=false) {
  if (!await flush()) return false;
  if (!canNavigate(location)) throw Error('Этот объект больше недоступен.');
  if(!fromWindow&&windowsRef.current&&!await windowsRef.current.open(location,replaceCurrent,false))return false;
  const source=locationTabKey(currentLocation.current),destination=locationTabKey(location);
  const nextOrder=replaceCurrent?replaceTab(visibleTabKeys.current,source,destination):
   mergeTabOrder(visibleTabKeys.current,[...visibleTabKeys.current,destination]);
  if(replaceCurrent&&source!=='home'&&source!==destination){
   const previous=tabLocation(source);
   if(previous?.kind==='note')setOpenTabs(tabs=>tabs.filter(path=>path!==previous.path));
   if(previous?.kind==='graph')setOpenGraphs(tabs=>tabs.filter(name=>name!==previous.project));
   if(previous?.kind==='folder')setOpenFolders(tabs=>tabs.filter(tab=>folderTabKey(tab)!==source));
  }
  visibleTabKeys.current=nextOrder;
  currentLocation.current=location;
  setTabOrder(nextOrder);
  setMenu(false);
  setExplorerMenu(null);
  setOverview(location.kind==='home');
  setGraphOpen(location.kind==='graph');
  if(location.kind==='graph')setOpenGraphs(tabs=>tabs.includes(location.project)?tabs:[...tabs,location.project]);
  if(location.kind==='folder')setOpenFolders(tabs=>tabs.some(tab=>tab.project===location.project&&tab.path===location.path)?
   tabs:[...tabs,{project:location.project,path:location.path}]);
  if(location.kind!=='note')setFocus(false);
  if (location.kind==='home') {
   setActive('');
  } else {
   const next = location.kind==='note' ? projectFor(location.path) : location.project;
   const dir = location.kind==='note' ? folder(location.path) : location.kind==='graph' ? projectRoot(next) : location.path;
   setProject(next);
   setSection(dir);
   showBranch(next, dir);
   setActive(location.kind==='note' ? location.path : '');
   if(location.kind==='note'){
    setOpenTabs(tabs=>tabs.includes(location.path)?tabs:[...tabs,location.path]);
    const s = dataRef.current.settings;
    updateSettings(next?{active:location.path,projectNotes:{...s.projectNotes,[next]:location.path}}:{active:location.path});
    body.current?.scrollTo(0,0);
   }
  }
  if(record && JSON.stringify(history[position])!==JSON.stringify(location)){
   const updated=history.slice(0,position+1).concat(location);
   setHistory(updated);
   setPosition(updated.length-1);
  }
  return true;
 }
 const go = (path:string) => navigate({kind:'note',path});
 const navigateCentral=(location:Location)=>navigate(location,true,true);
 function itemLocation(item:ExplorerItem):Location {
  return item.kind==='note'?{kind:'note',path:item.path}:{kind:'folder',project:item.project,path:item.path};
 }
 const openCentralItem=(item:ExplorerItem)=>act(()=>navigateCentral(itemLocation(item)));
 const openGraph = () => navigate({kind:'graph',project});
 function changeConnection(connection:ProjectConnection|null, previous?:ProjectConnection, structural=false,owner=project) {
  if(owner===ALL_PROJECTS&&previous)structural=structural||allProjectsGraph(projects,dataRef.current.settings,childrenOf,roots.filter(item=>item.kind==='note')).inherited.some(link=>link.from===previous.from&&link.to===previous.to);
  const {projectConnections:saved={},projectMaps:maps={}}=dataRef.current.settings;
  const links = Object.hasOwn(saved,owner) ? saved[owner] : [];
  const map = Object.hasOwn(maps,owner) ? maps[owner] : {};
  const matches = (link:ProjectConnection, other?:ProjectConnection|null) => link.from===other?.from && link.to===other.to;
  const next=links.filter(link=>!matches(link,previous)&&!matches(link,connection));
  if(connection)next.push(connection);
  const hidden=map.hiddenConnections??[];
  const patch:Partial<Settings>={projectConnections:{...saved,[owner]:next}};
  if(structural && previous && !matches(previous,connection) && !hidden.some(link=>matches(link,previous))){
   patch.projectMaps={...maps,[owner]:{...map,hiddenConnections:[...hidden,{from:previous.from,to:previous.to}]}};
  }
  updateSettings(patch);
 }
 function projectMap(owner=project) {
  const maps=dataRef.current.settings.projectMaps;
  return maps&&Object.hasOwn(maps,owner)?maps[owner]:{};
 }
 function updateProjectMap(patch:Partial<ProjectMap>,owner=project) {
  const maps=dataRef.current.settings.projectMaps??{};
  updateSettings({projectMaps:{...maps,[owner]:{...projectMap(owner),...patch}}});
 }
 function updateMapCard(id:string, patch:MapCard,owner=project) {
  const cards=projectMap(owner).cards;
  updateProjectMap({cards:{...cards,[id]:{...cards?.[id],...patch}}},owner);
 }
 function changeMapBlocks(edit:(blocks:MapBlock[])=>MapBlock[],owner=project) {
  const map=projectMap(owner);
  const previous=mapBlocks(map);
  const blocks=edit(previous);
  if(blocks.length>=previous.length){
   updateProjectMap({blocks,text:undefined},owner);
   return;
  }
  const remaining=new Set(blocks.map(block=>block.id));
  const removed=new Set(previous.filter(block=>!remaining.has(block.id)).map(block=>mapBlockKey(block.id)));
  const {projectConnections={},projectMaps={}}=dataRef.current.settings;
  const connections=Object.hasOwn(projectConnections,owner)?projectConnections[owner]:[];
  updateSettings({
   projectMaps:{...projectMaps,[owner]:{...map,blocks,text:undefined}},
   projectConnections:{...projectConnections,[owner]:connections.filter(link=>!removed.has(link.from)&&!removed.has(link.to))},
  });
 }
 function saveProjectOrder(order:string[]) {
  const visibleOrder=order.filter(name=>projects.includes(name));
  let visibleIndex=0;
  updateSettings({projectOrder:orderedProjects.map(name=>visibleOrder.includes(name)?visibleOrder[visibleIndex++]:name)});
 }

 function neighboringTab(key:string):Location|undefined {
  const index=orderedTabs.indexOf(key);
  for(const adjacent of [orderedTabs[index+1],orderedTabs[index-1]]){
   if(!adjacent)continue;
   const location=tabLocation(adjacent);
   if(location&&canNavigate(location))return location;
  }
 }
 async function closeGraph(name:string) {
  if(graphOpen && name===project){
   const destination:Location = neighboringTab('graph:'+name)??{kind:'folder',project:name,path:projectRoot(name)};
   if(!await navigate(destination))return;
  }
  setOpenGraphs(tabs=>tabs.filter(tab=>tab!==name));
  setTabOrder(order=>order.filter(key=>key!=='graph:'+name));
 }

 async function closeTab(path: string) {
  if (path === active) {
   const destination: Location = neighboringTab(path)??{kind:'folder',project,path:section};
   if (!await navigate(destination)) return;
  }
  setOpenTabs(tabs=>tabs.filter(tab=>tab!==path));
  setTabOrder(order=>order.filter(key=>key!==path));
 }
 async function closeFolderTab(tab:FolderTab) {
  const key=folderTabKey(tab);
  if(folderView&&project===tab.project&&section===tab.path){
   if(!await navigate(neighboringTab(key)??{kind:'home'}))return;
  }
  setOpenFolders(tabs=>tabs.filter(item=>folderTabKey(item)!==key));
  setTabOrder(order=>order.filter(item=>item!==key));
 }

 async function travel(delta: number) {
  for(let i=position+delta; i>=0 && i<history.length; i+=delta) {
   if(canNavigate(history[i])){
    if(await navigate(history[i],false,true))setPosition(i);
    return;
   }
  }
 }
 function openNewAt(dir: string, kind:'note'|'canvas'='note') {
  setName('');
  setNewFolder(dir);
  setTemplate('');
  setNewType(kind);
  setModal('new');
 }
 function openNew() {
  const target = !overview && projects.includes(project) ? project : projects[0];
  if (!target) {setName('');setModal('project');return;}
  openNewAt(currentLocation.current.kind==='folder'?currentLocation.current.path:'');
 }
 async function create(noteName: string, dir: string, content: string, kind:'note'|'canvas'|'kanban'='note') {
  const clean = noteName.trim().replace(/\.(md|canvas)$/i, '');
  if (!clean || /[<>:"/\\|?*]/.test(clean) || clean.endsWith('.')) throw Error('Введите допустимое имя заметки.');
  const path = [dir.trim().replace(/\/+$/, ''), clean + (kind==='canvas'?'.canvas':'.md')].filter(Boolean).join('/');
  if (settings.archivedProjects?.includes(projectFor(path))) throw Error('Сначала восстановите проект из корзины.');
  if (dataRef.current.notes.some(n => n.path.toLocaleLowerCase() === path.toLocaleLowerCase())) {
   throw Error('Заметка с таким именем уже существует.');
  }
  if (!await flush()) return;
  await settingsQueue.current;
  const board=kind==='kanban'?{...newTaskBoard(projectFor(path)),name:clean}:undefined;
  if(board)content=kanbanNoteContent(board);
  const result = await request<SaveResult>('save', {path, content, revision: null});
  if (result.conflict) throw Error('Файл уже существует.');
  accept(await request('snapshot'));
  {const s=dataRef.current.settings;updateSettings({noteAppearance:{...s.noteAppearance,[path]:{...s.noteAppearance?.[path],fontFamily:s.fontFamily??'Inter',fontSize:s.fontSize??16,textWidth:s.textWidth??810}}});await settingsQueue.current;}
  if(board){changeTaskBoard(board);await settingsQueue.current;}
  await go(path);
  setModal(null);
  setNotice('Заметка создана');
 }
 async function fromLink(s:string){const match=resolveLink(s,dataRef.current.notes);if(match){await go(match.path);return}const t=target(s);setName(title(t));setNewFolder(folder(t));setTemplate('');setNewType('note');setModal('new')}
 function pickDailyNote() {
  const path=dataRef.current.settings.dailyNotes?.[dateString()];
  setDailyNoteUrl(path?referenceUrl({kind:'note',path}):'');setModal('daily-note');
 }
 async function daily(){
  const path=`${dateString()}.md`;if(data.notes.some(n=>n.path===path))return go(path);await create(dateString(),'',expand(builtins[2].content,dateString()))}
 async function chooseVault(){if(!await flush())return;await settingsQueue.current;const s=await request('choose');if(s){drafts.current={};accept(s,true);setOpenTabs([]);setOpenGraphs([]);setOpenFolders([]);setTabOrder([]);setGraphOpen(false);setActive('');setProject('Личное');setSection('');setOverview(true);setHistory([{kind:'home'}]);setPosition(0);setExpanded([itemKey({kind:'project',project:'Личное',path:'',name:'Личное'})]);setModal(null);await flush()}}
 async function rename(targetPath=renameTarget,destination?:string) {
  if (!targetPath || !await flush()) return;
  const n = dataRef.current.notes.find(n => n.path === targetPath);
  if (!n) throw Error('Заметка больше не найдена в хранилище.');
  const to = destination ?? [folder(n.path),name.trim().replace(/\.(md|canvas)$/i, '') + (n.path.endsWith('.canvas')?'.canvas':'.md')].filter(Boolean).join('/');
  if (!destination&&(!name.trim() || /[<>:"/\\|?*]/.test(name) || name.trim().endsWith('.'))) throw Error('Введите допустимое имя без пути.');
  const next = projectFor(to);
  if (settings.archivedProjects?.includes(next)) throw Error('Сначала восстановите проект из корзины.');
  await settingsQueue.current;
  const snapshot = await request('rename', {path: n.path, to, revision: n.revision});
  accept(snapshot);
  if(active===n.path){setActive(to);setProject(next);setSection(folder(to));showBranch(next,folder(to));}
  setHistory(h=>h.map(location=>location.kind==='note'&&location.path===n.path?{kind:'note',path:to}:location));
  setOpenTabs(tabs=>tabs.map(path=>path===n.path?to:path));
  setTabOrder(order=>order.map(key=>key===n.path?to:key));
  windowsRef.current?.remap(location=>location.kind==='note'&&location.path===n.path?{...location,path:to}:location);
  const appearance = {...snapshot.settings.noteAppearance};
  if (to !== n.path && appearance[n.path]) {
   appearance[to] = appearance[n.path];
   delete appearance[n.path];
  }
  const projectNotes = Object.fromEntries(Object.entries(snapshot.settings.projectNotes ?? {}).filter(([, path]) => path !== n.path));
  const remap=(link:ProjectConnection)=>({...link,from:link.from===n.path?to:link.from,to:link.to===n.path?to:link.to});
  const projectConnections = Object.fromEntries(Object.entries(snapshot.settings.projectConnections ?? {}).map(([key,links])=>[key,links.map(remap)]));
  const projectMaps:Record<string,ProjectMap>=Object.fromEntries(Object.entries(snapshot.settings.projectMaps??{}).map(([key,map])=>[key,{
   ...map,hiddenConnections:map.hiddenConnections?.map(remap),
   text:map.text===undefined?undefined:remapNoteReference(map.text,n.path,to),
   blocks:map.blocks?.map(block=>({...block,text:remapNoteReference(block.text,n.path,to)})),
  }]));
  const oldProject=projectFor(n.path);
  const oldMap=Object.hasOwn(projectMaps,oldProject)?projectMaps[oldProject]:undefined;
  const card=oldMap?.cards?.[n.path];
  if(card && n.path!==to){
   const cards={...oldMap.cards};
   delete cards[n.path];
   projectMaps[oldProject]={...oldMap,cards};
   const destination=Object.hasOwn(projectMaps,next)?projectMaps[next]:undefined;
   projectMaps[next]={...destination,hiddenConnections:destination?.hiddenConnections,cards:{...destination?.cards,[to]:oldProject===next?card:{comments:card.comments}}};
  }
  const taskBoards=snapshot.settings.taskBoards?.map(board=>({...board,project:board.id===kanbanNoteId(n.content)?next:board.project,tasks:board.tasks.map(task=>({...task,notes:task.notes.map(path=>path===n.path?to:path)}))}));
  if(taskBoards)syncTaskBoardNotes(taskBoards);
  updateSettings({favorites:snapshot.settings.favorites?.map(path=>path===n.path?to:path),recent:snapshot.settings.recent?.map(path=>path===n.path?to:path),dailyNotes:Object.fromEntries(Object.entries(snapshot.settings.dailyNotes??{}).map(([day,path])=>[day,path===n.path?to:path])),taskBoards,noteAppearance: appearance, objectIcons:Object.fromEntries(Object.entries(snapshot.settings.objectIcons??{}).map(([key,value])=>[key==='note:'+n.path?'note:'+to:key,value])),projectConnections, projectMaps, projectNotes: {...projectNotes, [next]: to}, active: active===n.path ? to : snapshot.settings.active});
  setModal(null);
 }
 async function restore(id:string){await settingsQueue.current;accept(await request('restore',{id}));setNotice('Восстановлено из корзины')}
 async function transfer(op:string){if(!await flush())return;await settingsQueue.current;const result=await request<any>(op);if(result){if(op==='import'){accept(result);setNotice('Файлы добавлены в отдельную папку импорта')}else setNotice(`Копия сохранена: ${result.path}`)}}

 async function uploadAttachments(files:File[], path:string, root:string) {
  const extensions:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
  files=files.map(file=>!imageFile.test(file.name)&&extensions[file.type]?new File([file],`image.${extensions[file.type]}`,{type:file.type,lastModified:file.lastModified}):file);
  if (files.some(file=>file.size>20*1024*1024)) throw Error('Максимальный размер вложения — 20 МБ');
  const attachments: {path:string;markdown:string;url:string}[] = [];
  for (const file of files) {
   const data = await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
   });
   if (dataRef.current.root!==root) return [];
   const saved=await request<{path:string}>('attachment',{name:file.name,data});
   if (dataRef.current.root!==root) return [];
   const relative='../'.repeat(folder(path).split('/').filter(Boolean).length)+saved.path;
   const url=relative.split('/').map(part=>encodeURIComponent(part).replaceAll('(','%28').replaceAll(')','%29')).join('/');
   const label=file.name.replace(/[\[\]\\]/g,'');
   attachments.push({path:saved.path,url,markdown:(imageFile.test(file.name)?'!':'')+'['+label+']('+url+')'});
  }
  return attachments;
 }
 async function uploadCanvasImages(files:File[],path:string) {
  if(read)return [];
  const images=files.filter(file=>imageFile.test(file.name)||/^image\/(png|jpeg|webp|gif|avif)$/i.test(file.type));
  if(!images.length)throw Error('Выберите изображение PNG, JPEG, WebP, GIF или AVIF.');
  return (await uploadAttachments(images,path,dataRef.current.root)).map(item=>item.url);
 }
 async function attachMapImages(files:File[],position:MapPoint,owner=project) {
  const images=files.filter(file=>imageFile.test(file.name)||/^image\/(png|jpeg|webp|gif|avif)$/i.test(file.type));
  if(!images.length)throw Error('Выберите изображение PNG, JPEG, WebP, GIF или AVIF.');
  const saved=await uploadAttachments(images,mapNotesPath,dataRef.current.root);
  if(saved.length)changeMapBlocks(current=>[...current,...saved.map(({markdown},index)=>({
    id:crypto.randomUUID(),text:markdown,position:{x:position.x+index*32,y:position.y+index*32},
    size:{width:320,height:240},
  }))],owner);
 }
 async function attach(files:File[], position?:number, path=activeRef.current, targetEditor=editor) {
  const root=dataRef.current.root;
  if(read||!path)return;
  const initialView=targetEditor.current?.view;
  const selection=initialView?.state.selection.main;
  const getContent=()=>dataRef.current.notes.find(note=>note.path===path)?.content;
  const documentBefore=getContent();
  const attachments=await uploadAttachments(files,path,root);
  if(!attachments.length)return;
  const view=targetEditor.current?.view===initialView ? initialView : undefined;
  const content=getContent();
  if (content===undefined) return;
  if (!view) {
   const block=attachments.map(attachment=>attachment.markdown).join('\n');
   const next=content.trimEnd()+'\n\n'+block+'\n';
   edit(path,next);
   return;
  }
  const range=documentBefore===content ? selection : view.state.selection.main;
  const from=(documentBefore===content?position:undefined) ?? range?.from ?? view.state.doc.length;
  const to=position!==undefined ? from : range?.to ?? from;
  const layout=initialNoteWidget(view,from,320,240);
  const block=attachments.map((attachment,index)=>imageWidgetMarkdown(attachment.markdown,{...layout,x:Math.min(Math.max(0,view.contentDOM.clientWidth-layout.width),layout.x+index*16),y:layout.y+index*16,z:layout.z+index})).join('\n');
  const before=from>0 && view.state.sliceDoc(from-1,from)!=='\n' ? '\n' : '';
  const insert=before+block+'\n';
  view.dispatch({changes:{from,to,insert},selection:{anchor:from+insert.length},scrollIntoView:true,userEvent:'input.attach'});
  view.focus();
 }
 async function resolveConflict(mode:'disk'|'copy'|'mine'){if(!conflict)return;const {path,disk}=conflict;const draft=drafts.current[path];if(mode==='copy'&&draft){const p=path.replace(/\.md$/i,` (конфликт ${Date.now()}).md`);const r=await request<SaveResult>('save',{path:p,content:draft.content,revision:null});if(r.conflict)throw Error('Не удалось сохранить копию')}
 if(mode==='mine'&&draft){draft.revision=disk.revision;conflictRef.current=false;setConflict(null);persistDrafts();await flush();return}
 delete drafts.current[path];persistDrafts();conflictRef.current=false;setConflict(null);accept(await request('snapshot'));setStatus('Сохранено локально')}
 const act=(fn:()=>unknown)=>{setError('');Promise.resolve().then(fn).catch(report)};
 useEffect(()=>{function key(event:KeyboardEvent){
  if(event.key==='Escape'){setModal(null);setMenu(false);setFocus(false);closeExplorerMenu();return;}
  if(modal==='settings')return;
  const action=shortcutActions.find(action=>shortcutMatches(event,settings.shortcuts?.[action.id]??action.binding));if(!action)return;event.preventDefault();
  const actions:Record<ShortcutAction,()=>unknown>={search:()=>{setQuery('');setModal('search')},new:openNew,save:flush,read:()=>setRead(value=>!value),focus:()=>setFocus(value=>!value),home:()=>navigate({kind:'home'}),closeTabs:closeAllTabs,back:()=>travel(-1),forward:()=>travel(1)};
  act(actions[action.id]);
 }window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[active,history,position,note,project,section,overview,modal,settings.shortcuts,settings.projects,settings.archivedProjects]);
 useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),6500);return()=>clearTimeout(id)},[notice]);
 const found=modal==='search'?search(availableNotes,query,[
  ...projects.map(name=>({kind:'project' as const,project:name,path:projectRoot(name),name})),
  ...folders.filter(path=>!allProjects.some(name=>projectRoot(name)===path)&&projects.includes(projectFor(path+'/note.md')))
   .map(path=>({kind:'folder' as const,project:projectFor(path+'/note.md'),path,name:path.split('/').at(-1)!})),
  ...availableNotes.map(note=>({kind:'note' as const,project:projectFor(note.path),path:note.path,name:title(note.path)})),
 ]):[];
 async function openSearchResult(item:ExplorerItem) {
  if(await navigate(itemLocation(item)))setModal(null);
 }
 async function closeAllTabs() {
  if(!await navigate({kind:'home'}))return;
  setOpenTabs([]);setOpenFolders([]);setOpenGraphs([]);setTabOrder([]);setModal(null);
  visibleTabKeys.current=[];windowsRef.current?.closeAll();
 }
 const incoming=note?backlinks(note,availableNotes):[];
 const allTemplates=[...builtins.filter(b=>!data.templates.some(t=>t.name===b.name)),...data.templates];
 function toggleSection(k:string){setCollapsed(c=>c.includes(k)?c.filter(x=>x!==k):[...c,k])}
 


 const openProject = (next: string) => navigate({kind:'folder',project:next,path:projectRoot(next)});
 const sortItems=(items:ExplorerItem[])=>[...items].sort((a,b)=>{
  const byName=a.name.localeCompare(b.name,settings.language==='en'?'en':'ru',{numeric:true});
  if(explorerSort==='name-asc')return byName;
  if(explorerSort==='name-desc')return -byName;
  const field=explorerSort.startsWith('created')?'createdAt':'modifiedAt';
  const time=(item:ExplorerItem)=>item.kind==='note'?availableNotes.find(note=>note.path===item.path)?.[field]??0:
   availableNotes.reduce((latest,note)=>note.path.startsWith(item.path?item.path+'/':'')&&projectFor(note.path)===item.project?Math.max(latest,note[field]??0):latest,0);
  return (explorerSort.endsWith('desc')?1:-1)*(time(b)-time(a))||byName;
 });
 const childrenOf = (item: ExplorerItem) => sortItems(entriesIn(item.project,item.path,folders,availableNotes,projectFor));
 const roots: ExplorerItem[] = sortItems([...projects.map(name=>({kind:'project' as const,project:name,path:projectRoot(name),name})),...entriesIn('','',folders,availableNotes,projectFor).filter(item=>item.kind==='note')]);
 const revealActive=()=>{
  if(!active)return;
  const parent=folder(active),owner=projectFor(active);
  const ancestors:ExplorerItem[]=[{kind:'project',project:owner,path:projectRoot(owner),name:owner}];
  let path=projectRoot(owner);
  for(const segment of parent.slice(path.length).split('/').filter(Boolean)){path=[path,segment].filter(Boolean).join('/');ancestors.push({kind:'folder',project:owner,path,name:segment});}
  setExpanded(previous=>[...new Set([...previous,...ancestors.map(itemKey)])]);
  requestAnimationFrame(()=>document.querySelector('.explorer-tree .current-item')?.scrollIntoView({block:'nearest'}));
 };
 useEffect(()=>{if(autoReveal)revealActive()},[autoReveal,active]);
 const allBranchKeys=()=>{const keys:string[]=[];const visit=(item:ExplorerItem)=>{if(item.kind==='note')return;keys.push(itemKey(item));childrenOf(item).forEach(visit)};roots.forEach(visit);return keys};
 const allExpanded=allBranchKeys().every(key=>expanded.includes(key));
 const isActiveItem = (item:ExplorerItem) => !overview && (item.kind==='note' ? active===item.path : !note&&item.project===project&&item.path===section);
 function toggleBranch(item:ExplorerItem) {
  const key=itemKey(item);
  setExpanded(previous=>previous.includes(key)?previous.filter(entry=>entry!==key):[...previous,key]);
 }
 function openItem(item:ExplorerItem) {
  act(()=>item.kind==='note'?go(item.path):navigate({kind:'folder',project:item.project,path:item.path}));
 }
 function showExplorerMenu(event:React.MouseEvent,item:ExplorerItem) {
  event.preventDefault();
  setError('');
  const bounds=event.currentTarget.getBoundingClientRect();
  const x=event.type==='contextmenu'?event.clientX:bounds.right;
  const y=event.type==='contextmenu'?event.clientY:bounds.bottom;
  setExplorerMenu({item,x:Math.max(8,Math.min(x,window.innerWidth-272)),y:Math.max(8,Math.min(y,window.innerHeight-152))});
 }
 function toggleFavorite(path:string) {const current=dataRef.current.settings.favorites??[];updateSettings({favorites:current.includes(path)?current.filter(item=>item!==path):[...current,path]})}
 function openFolderDialog(item: ExplorerItem) {
  setFolderTarget(item);
  setName('');
  setModal('folder');
 }
 async function addFolder() {
  if(!folderTarget)return;
  const child=validateFolderName(name);
  const path=[folderTarget.path,child].filter(Boolean).join('/');
  if(vaultFolders(dataRef.current).some(p=>p.toLocaleLowerCase()===path.toLocaleLowerCase())
    || (!folderTarget.path && allProjects.some(p=>p.toLocaleLowerCase()===child.toLocaleLowerCase()))) {
   throw Error('Папка с таким именем уже существует.');
  }
  if(!await flush())return;
  await settingsQueue.current;
  accept(await request('folder',{path}));
  await navigate({kind:'folder',project:folderTarget.project,path});
  setModal(null);
 }
 function openMove(item:ExplorerItem){
  if(item.kind==='project'&&!item.path){setError('Корневой проект «Личное» нельзя переместить. Перемещайте его заметки и папки отдельно.');return;}
  setMoveTarget(item);setMoveDestination(folder(item.path));setModal('move');setMenu(false);
 }
 async function moveItem(){
  if(!moveTarget||!await flush())return;
  await settingsQueue.current;
  const from=moveTarget.path,to=[moveDestination,from.split('/').at(-1)!].filter(Boolean).join('/');
  if(moveTarget.kind==='note'){if(to===from){setModal(null);return;}await rename(from,to);return;}
  if(!from)throw Error('Корень хранилища нельзя перемещать.');
  if(moveDestination===from||moveDestination.startsWith(from+'/'))throw Error('Нельзя переместить папку внутрь неё самой.');
  const previous=dataRef.current,oldLocation=currentLocation.current;
  const projectNames=[...(previous.settings.projects??defaultProjects)].filter(name=>!(moveTarget.kind==='project'&&name===moveTarget.project));
  if(!moveDestination&&!projectNames.includes(to))projectNames.push(to);
  const notePaths=previous.notes.filter(note=>note.path.startsWith(from+'/')).map(note=>note.path);
  const result=from===to?previous:await request('move_folder',{from,to});
  accept(result);
  const moved=movedSettings(dataRef.current.settings,from,to,notePaths,projectNames);
  const taskBoards=moved.taskBoards?.map(board=>{const source=previous.notes.find(note=>kanbanNoteId(note.content)===board.id),path=source?.path.startsWith(from+'/')?to+source.path.slice(from.length):source?.path;return {...board,project:path?projectOf(path,projectNames):board.project,tasks:board.tasks.map(task=>({...task,notes:task.notes.map(path=>path.startsWith(from+'/')?to+path.slice(from.length):path)}))}});
  if(taskBoards)syncTaskBoardNotes(taskBoards);
  updateSettings({...moved,taskBoards});
  const map=(location:Location)=>movedLocation(location,from,to,projectNames);
  windowsRef.current?.remap(map);setHistory(history=>history.map(map));
  setOpenTabs(paths=>paths.map(path=>path.startsWith(from+'/')?to+path.slice(from.length):path));
  setExpanded([]);await navigate(map(oldLocation),false,false,true);await settingsQueue.current;
  setModal(null);setNotice(!moveDestination?'Перемещено в корень и преобразовано в проект':'Перемещено');
 }
 function removeItem(item: ExplorerItem) {
  setDeleteTarget(item);
  if(item.kind==='project'){
   setProjectToArchive(item.project);
   setModal('archive-project');
  }else setModal('delete');
 }
 function openRename(path:string) {
  setRenameTarget(path);
  setName(title(path));
  setModal('rename');
  setMenu(false);
 }
 async function trash() {
  if(!deleteTarget||!await flush())return;
  await settingsQueue.current;
  const {kind,path,project:owner}=deleteTarget;
  const source=dataRef.current.notes.find(n=>n.path===path);
  if(kind==='folder'){const snapshot=await request<Snapshot>('trash_folder',{path});for(const draftPath of Object.keys(drafts.current))if(draftPath.startsWith(path+'/'))delete drafts.current[draftPath];persistDrafts();accept(snapshot)}
  else {
   if(!source)throw Error('Заметка уже отсутствует в хранилище.');
   const snapshot=await request<Snapshot>('trash',{path,revision:source.revision});delete drafts.current[path];persistDrafts();accept(snapshot);
  }
  const removedCurrent=kind==='folder' ? (section===path||section.startsWith(path+'/')) : active===path;
  if(!overview&&project===owner&&removedCurrent) await navigate(owner?{kind:'folder',project:owner,path:folder(path)}:{kind:'home'});
  setModal(null);
  setNotice(kind==='folder'?'Папка перемещена в корзину':'Заметка перемещена в корзину');
 }
 async function addProject() {
  const next = validateFolderName(name);
  if (allProjects.some(p => p.toLocaleLowerCase() === next.toLocaleLowerCase())) {
   throw Error('Проект с таким именем уже существует. Проверьте также корзину.');
  }
  if (!await flush()) return;
  await settingsQueue.current;
  const existing = dataRef.current.folders.find(p => p.toLocaleLowerCase() === next.toLocaleLowerCase());
  const root = existing ?? next;
  accept(await request('folder', {path: root}));
  updateSettings({projects: [...allProjects, root]});
  await openProject(root);
  setModal(null);
 }
 async function archiveProject() {
  if (!await flush()) return;
  const next = [...(dataRef.current.settings.archivedProjects ?? []), projectToArchive];
  updateSettings({archivedProjects: next});
  setOpenGraphs(tabs=>tabs.filter(name=>name!==projectToArchive));
  if (project === projectToArchive) {
   await navigate({kind:'home'});
  }
  setModal(null);
  setNotice('Проект перемещён в корзину');
 }
 function editNoteAppearance(path: string, patch: Partial<NoteAppearance>) {
  const s = dataRef.current.settings;
  updateSettings({
   noteAppearance: {...s.noteAppearance, [path]: {...s.noteAppearance?.[path], ...patch}},
   projectNotes: {...s.projectNotes, [projectFor(path)]: path},
  });
 }
 function noteFontStyle(path:string):CSSProperties {
  const appearance=settings.noteAppearance?.[path];
  const family=validFont(appearance?.fontFamily);
  return {
   ...textAppearanceStyle(appearance),
   '--editor-size':`${settings.fontSize??16}px`,
   ...(family&&{'--body-font':fontStack(family)}),
  } as CSSProperties;
 }
 function runNoteFormat(apply:(view:EditorView)=>void) {
  const view=editor.current?.view;
  if(!read&&note&&view)apply(view);
 }
 function noteTypography(path:string,getView=()=>read?undefined:editor.current?.view) {
  
  return <>
   <NoteTypography getView={getView} size={settings.noteAppearance?.[path]?.fontSize??settings.fontSize??16} font={settings.noteAppearance?.[path]?.fontFamily??settings.fontFamily}/>

  </>;
 }
 function textInsertion(moveText:()=>void,disabled=false) {
  return <button type="button" className="ribbon-action" title="Вынести выделение или текущую строку в текстовый блок"
   disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={moveText}><ArrowsOutCardinal size={17}/>Текстовый блок</button>;
 }
 function pickEditorReference(view:EditorView,range?:ReferenceRange,kind?:ReferenceKind) {
  const {from,to}=range??view.state.selection.main;
  const document=view.state.doc;
  setReferenceDialog({url:range?.url??'',kind,apply:insert=>{
   if(!view.dom.isConnected||view.state.doc!==document||(range&&view.state.sliceDoc(from,to)!==range.source))return false;
   view.dispatch({changes:{from,to,insert},selection:{anchor:from+insert.length},userEvent:'input.reference'});
   view.focus();
   return true;
  }});
  setModal('reference');
 }
 function pickMapReference(kind:ReferenceKind,position:MapPoint,owner=project) {
  const root=data.root;
  setReferenceDialog({url:'',kind,apply:text=>{
   if(dataRef.current.root!==root)return false;
   changeMapBlocks(blocks=>[...blocks,{id:crypto.randomUUID(),position,text}],owner);
   return true;
  }});
  setModal('reference');
 }
 const references={
  targets:referenceTargets,root:data.root,
  open:(url:string)=>act(()=>{
   const target=referenceTargets.get(url);
   if(target)return target.kind==='note'?go(target.path):navigate({kind:'graph',project:target.path});
  }),
  edit:pickEditorReference,
  insertCanvas:(kind:ReferenceKind,apply:(text:string)=>boolean)=>{setReferenceDialog({url:'',kind,apply});setModal('reference');},
  insertCanvasNote:(excludePath:string,apply:(text:string)=>boolean)=>{setReferenceDialog({url:'',kind:'note',apply,instant:true,excludePath});setModal('reference');},
 };
 function saveReference() {
  if(!referenceDialog)return;
  const target=referenceTargets.get(referenceDialog.url);
  if(!target)return;
  if(!referenceDialog.apply(referenceMarkdown(target))){
   setError('Место вставки изменилось. Откройте выбор ссылки ещё раз.');
   return;
  }
  setModal(null);
 }
 function changeTextureColor(id:string,color:string|undefined) {const next={...dataRef.current.settings.textureColors};if(color&&/^#[0-9a-f]{6}$/i.test(color))next[id]=color;else delete next[id];updateSettings({textureColors:next});}
 function chooseGlobalPalette(value: string) {
  localStorage.setItem('noteapp-global-palette', value);
  setGlobalPalette(value);
  updateSettings({palette:value,paletteBlend:undefined});
 }
 function mixPalettes(base:string,withColor:string,global=false) {
  windowsRef.current?.inheritProjectPalette();
  const saved=dataRef.current.settings;
  if(global){localStorage.setItem('noteapp-global-palette',base);setGlobalPalette(base);updateSettings({palette:base,paletteBlend:withColor});}
  else updateSettings(overview?{overviewPalette:base,overviewPaletteBlend:withColor}:{projectPalettes:{...saved.projectPalettes,[project]:base},projectPaletteBlends:{...saved.projectPaletteBlends,[project]:withColor}});
 }
 function commonPalette() {
  windowsRef.current?.inheritProjectPalette();
  updateSettings(resetActivePalette(dataRef.current.settings,overview?null:project));
 }
 function applyWorkspacePalette(value:{palette:string;blend?:string}) {
  windowsRef.current?.inheritProjectPalette();
  updateSettings(overview?{overviewPalette:value.palette,overviewPaletteBlend:value.blend}:{
   projectPalettes:{...dataRef.current.settings.projectPalettes,[project]:value.palette},
   projectPaletteBlends:{...dataRef.current.settings.projectPaletteBlends,[project]:value.blend??null},
  });
  setPaletteArriving(true);
 }
 function windowAction(action: 'minimize'|'toggleMaximize'|'close') {
  if (!desktop) return;
  act(async () => {
   const { getCurrentWindow } = await import('@tauri-apps/api/window');
   await getCurrentWindow()[action]();
  });
 }
 function jump(offset:number,id:string){if(windowsRef.current?.jump(offset,id))return;if(read){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});return}editor.current?.view?.dispatch({selection:{anchor:offset},scrollIntoView:true});editor.current?.view?.focus()}
 const folderItem:ExplorerItem={kind:section===projectRoot(project)?'project':'folder',project,path:section,name:section===projectRoot(project)?project:section.split('/').at(-1)!};
 const breadcrumbs:ExplorerItem[]=[];
 if(!overview){
  for(let dir=section;dir&&dir.toLocaleLowerCase()!==projectRoot(project).toLocaleLowerCase();dir=folder(dir)) breadcrumbs.unshift({kind:'folder',project,path:dir,name:dir.split('/').at(-1)!});
  breadcrumbs.unshift({kind:'project',project,path:projectRoot(project),name:project});
 }
 const graphTabs=openGraphs.filter(name=>name===ALL_PROJECTS||projects.includes(name));
 const orderedTabs=mergeTabOrder(tabOrder,[...openFolders.map(folderTabKey),...graphTabs.map(name=>'graph:'+name),...openTabs]);
 visibleTabKeys.current=orderedTabs;
 const folderView=!overview&&!graphOpen&&!note;
 function tabClass(owner:string,selected:boolean) {
  const palette=paletteId(paletteForProject(owner)??generalPalette);
  const state=selected?'selected-note-tab':!overview&&palette===currentPalette?'inactive-matching-tab':'';
  return `note-tab palette-${palette} ${state}`;
 }
 const noteMode=<div className="segmented" aria-label="Режим заметки">
  <button type="button" title="Правка" aria-label="Правка" className={!read?'on':''} aria-pressed={!read} onClick={()=>{setRead(false);setMenu(false);}}><PencilSimple size={19}/></button>
  <button type="button" title="Чтение" aria-label="Чтение" className={read?'on':''} aria-pressed={read} onClick={()=>{setRead(true);setMenu(false);}}><BookOpen size={19}/></button>
 </div>;
 const contrast=Math.max(70,Math.min(140,Number.isFinite(settings.contrast)?settings.contrast!:100));
 const selectedCustomTheme=settings.customThemes?.find(theme=>theme.id===settings.interfaceTheme);
 const css={...(selectedCustomTheme?customThemeStyle(selectedCustomTheme):{}),filter:settings.appBrightness===undefined||settings.appBrightness===100?undefined:`brightness(${Math.max(50,Math.min(150,settings.appBrightness))}%)`,...Object.fromEntries(textures.filter(item=>/^#[0-9a-f]{6}$/i.test(settings.textureColors?.[item.id]??'')).map(item=>[`--texture-tint-${item.id}`,settings.textureColors![item.id]])),...gridStyle(pattern,gridOpacity),...chromeStyle(settings.appTransparency),'--palette-color-custom':customColor(settings.customPaletteColor),'--left-width':`${settings.leftWidth||334}px`,'--right-width':`${settings.rightWidth||282}px`,'--ui-font-scale':(settings.uiFontSize??14)/16,'--editor-size':`${settings.fontSize||16}px`,'--text-width':`${settings.textWidth||810}px`,'--body-font':fontStack(font),
  '--border-visible':(settings.borderBrightness??20)>0?'100%':'0%','--border-strength':`${Math.max(0,Math.min(100,settings.borderBrightness??20))*2}%`,'--border-lighten':`${Math.max(0,(settings.borderBrightness??20)-50)}%`,'--contrast-boost':`${Math.max(0,contrast-100)/2}%`,'--contrast-fade':`${Math.max(0,100-contrast)}%`} as CSSProperties;
 const favoritesList=<div className="favorites-window-content"><header><Star size={20}/><strong>Избранное</strong></header><label className="favorites-search"><MagnifyingGlass size={18}/><input aria-label="Поиск в избранном" placeholder="Найти заметку или полотно" value={favoritesQuery} onChange={event=>setFavoritesQuery(event.target.value)}/></label><div className="favorites-items">{availableNotes.filter(item=>settings.favorites?.includes(item.path)&&title(item.path).toLocaleLowerCase().includes(favoritesQuery.toLocaleLowerCase())).map(item=><div key={item.path}><button onClick={()=>{if(favoritesWindow){const channel=new BroadcastChannel('noteapp-favorites-open');channel.postMessage({root:data.root,path:item.path});channel.close()}else{setShowFavorites(false);act(()=>go(item.path))}}}>{kanbanNoteId(item.content)?<Columns size={19}/>:item.path.endsWith('.canvas')?<GridFour size={19}/>:<FileText size={19}/>}<span><strong>{title(item.path)}</strong><small>{item.path}</small></span></button><button className="favorites-remove" aria-label={`Убрать ${title(item.path)} из избранного`} title="Убрать из избранного" onClick={()=>updateSettings({favorites:settings.favorites?.filter(path=>path!==item.path)})}><X size={17}/></button></div>)}{!availableNotes.some(item=>settings.favorites?.includes(item.path)&&title(item.path).toLocaleLowerCase().includes(favoritesQuery.toLocaleLowerCase()))&&<p>В избранном ничего не найдено</p>}</div></div>;
 const navigation=<aside className="sidebar glass-panel">

 <div className="explorer-sidebar-heading explorer-tools">
  <IconButton label="Новая заметка в выбранной папке" onClick={openNew}><NotePencil size={19}/></IconButton>
  <IconButton label="Поиск" onClick={()=>{setQuery('');setModal('search')}}><MagnifyingGlass size={19}/></IconButton>
  <IconButton label="Новый проект" onClick={()=>{setName('');setModal('project')}}><FolderPlus size={19}/></IconButton>
  <div className="explorer-sort" ref={explorerSortAnchor}><IconButton label="Порядок сортировки" active={sortMenu} onClick={()=>setSortMenu(value=>!value)}>{(()=>{const Icon=sortChoices.find(([value])=>value===explorerSort)![2];return <Icon size={19}/>})()}</IconButton>{sortMenu&&<SortMenu anchor={explorerSortAnchor} close={()=>setSortMenu(false)}>{sortChoices.map(([value,label,Icon],index)=><button key={value} className={index===2||index===4?'sort-divider':''} role="menuitemradio" aria-checked={explorerSort===value} onClick={()=>{setExplorerSort(value);setSortMenu(false)}}><Icon size={18}/><span>{label}</span>{explorerSort===value&&<Check size={16}/>}</button>)}</SortMenu>}</div>
  <IconButton label="Показывать открытый файл" active={autoReveal} onClick={()=>{setAutoReveal(value=>!value);if(!autoReveal)revealActive()}}><Eye size={19}/></IconButton>
  <IconButton label={allExpanded?'Свернуть всё':'Развернуть всё'} onClick={()=>setExpanded(allExpanded?[]:allBranchKeys())}>{allExpanded?<ArrowsIn size={19}/>:<ArrowsOutSimple size={19}/>}</IconButton>
 </div>
 <ExplorerTree roots={roots} childrenOf={childrenOf} expanded={expanded} active={isActiveItem}
  open={openItem} toggle={toggleBranch} showMenu={showExplorerMenu}
  projectPalette={name=>paletteId(paletteForProject(name)??generalPalette)} icons={settings.objectIcons} favorites={settings.favorites}/>
 <div className="sidebar-bottom">
  <button className="vault-switch sidebar-vault-switch" title={data.root} onClick={()=>act(chooseVault)}><Archive size={21}/><strong>Хранилище</strong><CaretDown size={15}/></button>
  <div className="bottom-actions"><button aria-label="Корзина" title="Корзина" onClick={()=>setModal('trash')}><Trash size={21}/></button><button aria-label="Настройки" title="Настройки" onClick={openSettings}><Gear size={21}/></button><button aria-label="Заметка на сегодня" title="Заметка на сегодня" onClick={()=>act(daily)}><CalendarBlank size={18}/></button><button aria-label="Избранное" title="Избранное" aria-expanded={showFavorites} onClick={openFavorites}><Star size={18}/></button>{showFavorites&&!desktop&&<div className="favorites-panel glass-panel">{favoritesList}</div>}</div>
 </div></aside>;
 const kanbanBoard=note?settings.taskBoards?.find(board=>board.id===kanbanNoteId(note.content)):undefined;
 const canvasWidgets=note?.path.endsWith('.canvas')?(parseCanvas(note.content)?.widgets??[]):[];
 const frameParents=canvasFrameParents(canvasWidgets);
 const canvasGroupIds=[...new Set(canvasWidgets.map(widget=>widget.groupId).filter((id):id is string=>!!id))];
 const graphAll=graphOpen&&project===ALL_PROJECTS?allProjectsGraph(visibleProjectOrder,settings,childrenOf,roots.filter(item=>item.kind==='note')):undefined;
 const graphRoot=graphAll?allProjectsRoot:{kind:'project' as const,project,path:projectRoot(project),name:project};
 const graphItems=graphOpen?graphOutlineItems(graphRoot,item=>graphAll&&item.project===ALL_PROJECTS?graphAll.roots:childrenOf(item),graphAll?.map??projectMap(project)):[];
 const graphMode=<div className="segmented" aria-label="Режим карты"><button type="button" title="Правка" aria-label="Правка" className={graphEditing?'on':''} aria-pressed={graphEditing} onClick={()=>window.dispatchEvent(new CustomEvent('noteapp-graph-mode',{detail:{project,edit:true}}))}><PencilSimple size={19}/></button><button type="button" title="Чтение" aria-label="Чтение" className={!graphEditing?'on':''} aria-pressed={!graphEditing} onClick={()=>window.dispatchEvent(new CustomEvent('noteapp-graph-mode',{detail:{project,edit:false}}))}><BookOpen size={19}/></button></div>;
 const inspector=right&&!focus?<aside className="inspector glass-panel" data-decorative-rings={settings.decorativeRings&&!!note||undefined}>{overview?<div className="project-summary"><strong>Проекты</strong><p>Всего: {projects.length}</p></div>:<>{note&&<><section className="inspector-note-mode">{noteMode}</section>{kanbanBoard?<KanbanOutline key={note.path} board={kanbanBoard} path={note.path} collapsed={collapsed.includes('$outline')} toggle={()=>toggleSection('$outline')}/>:note.path.endsWith('.canvas')?<WidgetOutline key={note.path} items={[...canvasGroupIds.map(id=>{const members=canvasWidgets.filter(widget=>widget.groupId===id),parentId=frameParents[members[0]?.id];return {id:`group:${id}`,kind:'group',label:'Группа',text:'',parentId:members.every(widget=>frameParents[widget.id]===parentId)?parentId:undefined}}),...canvasWidgets.map(widget=>({id:widget.id,kind:widget.kind??'text',fill:widget.fill,imageSrc:widget.kind==='image'?widget.text:undefined,notePath:note.path,parentId:widget.groupId?`group:${widget.groupId}`:frameParents[widget.id],label:({frame:'Frame',comment:'Комментарий',table:'Таблица',code:'Код',image:'Изображение',note:'Заметка',text:'Текст',board:'Доска задач',plot:'График',link:'Ссылка',shape:'Фигура'} as Record<string,string>)[widget.kind??'text']??'Виджет',text:widget.kind==='note'?(referenceTargets.get(/\]\((noteapp-note:[\w-]+)\)/.exec(widget.text)?.[1]??'')?.name??'Заметка недоступна'):widget.text}))]} onSelect={id=>window.dispatchEvent(new CustomEvent('noteapp-focus-widget',{detail:{path:note.path,id:id.startsWith('group:')?(canvasWidgets.find(widget=>widget.groupId===id.slice(6))?.id??id):id}}))} onLayer={(id,action)=>window.dispatchEvent(new CustomEvent('noteapp-canvas-layer',{detail:{path:note.path,id,action}}))}/>:<NoteOutline key={note.path} notes={data.notes} openNote={path=>act(()=>go(path))} openTerms={openTerms} content={note.content} read={read} collapsed={collapsed.includes('$outline')} toggle={()=>toggleSection('$outline')} jump={jump}/>}{incoming.length>0&&<section className="backlinks"><button className="inspector-title" onClick={()=>toggleSection('$links')}><LinkIcon size={23}/><strong>Обратные ссылки</strong><span className="count">{incoming.length}</span><CaretDown size={14}/></button>{!collapsed.includes('$links')&&<div>{incoming.map(n=><button className="backlink" key={n.path} onClick={()=>act(()=>go(n.path))}><div><ObjectIcon item={{kind:'note',path:n.path,isKanban:!!kanbanNoteId(n.content)}} icons={settings.objectIcons} size={20}/><strong>{title(n.path)}</strong></div><p>{n.path.endsWith('.canvas')?'Полотно':n.content.replace(/^#+\s+.*\n/,'').replace(/\n/g,' ').trim().slice(0,150)}</p></button>)}</div>}</section>}</>}
</>}
 {graphOpen&&<><section className="inspector-note-mode">{graphMode}</section><WidgetOutline key={project} title="Объекты карты" items={graphItems} onSelect={id=>window.dispatchEvent(new CustomEvent('noteapp-focus-map-item',{detail:{project,id}}))}/></>}
 <details className="note-appearance"><summary><Palette size={16}/>Оформление</summary><div className="appearance-menu">
  <div id="appearance-panel">
   {kanbanBoard&&<><div className="appearance-label">Цвет доски Kanban</div><ProjectPalettePicker value={paletteId(kanbanBoard.palette??currentPalette)} choose={palette=>changeTaskBoard({...kanbanBoard,palette})}/><button className="inherit-palette" onClick={()=>changeTaskBoard({...kanbanBoard,palette:undefined})}>Общий цвет доски</button></>}
   <ProjectPalettePicker collapsible textureColors={settings.textureColors} changeTextureColor={changeTextureColor} customColor={settings.customPaletteColor} changeCustomColor={color=>updateSettings({customPaletteColor:color})} savedColors={settings.savedPaletteColors} changeSavedColors={colors=>updateSettings({savedPaletteColors:colors})} key={overview?'overview':project} value={overview?overviewPalette:currentPalette} blend={paletteBlend}
    mix={(base,withColor)=>mixPalettes(base,withColor)}
    choose={id=>{windowsRef.current?.inheritProjectPalette();updateSettings(overview?{overviewPalette:id,overviewPaletteBlend:undefined}:{projectPalettes:{...dataRef.current.settings.projectPalettes,[project]:id},projectPaletteBlends:{...dataRef.current.settings.projectPaletteBlends,[project]:null}})}}/>
   {paletteBlend&&<button className="palette-mix-action" onClick={()=>{windowsRef.current?.inheritProjectPalette();updateSettings(overview?{overviewPaletteBlend:undefined}:{projectPaletteBlends:{...dataRef.current.settings.projectPaletteBlends,[project]:null}})}}>Убрать градиент</button>}
   <div className="appearance-actions">
    {!overview&&<><button className="inherit-palette" onClick={()=>projectBgInput.current?.click()}><ImageIcon size={16}/>Фон проекта</button>
    {projectBackground(project)&&<IconButton label="Убрать фон проекта" onClick={()=>updateSettings({projectBackgrounds:{...dataRef.current.settings.projectBackgrounds,[project]:null}})}><X size={18}/></IconButton>}</>}
    <button className="inherit-palette" onClick={commonPalette}><X size={16}/>Общее оформление</button>
    <button className="inherit-palette" onClick={()=>setAppearanceTab(value=>value==='grid'?'palette':'grid')}><GridFour size={16}/>Фоновая сетка</button>
   </div>
   {appearanceTab==='grid'&&<>
   <div className="appearance-label">Фоновая сетка</div>
   <GridPicker value={pattern} opacity={gridOpacity} changeOpacity={value=>updateSettings(overview?{overviewGridOpacity:value}:{projectGridOpacity:{...dataRef.current.settings.projectGridOpacity,[project]:value}})} change={id=>updateSettings(overview?{overviewPattern:id}:{projectPatterns:{...dataRef.current.settings.projectPatterns,[project]:id}})}/>
   </>}
  </div>
 </div></details>
 </aside>:null;
 const centralWindowSurface=<CentralWindows key={data.root} ref={windowsRef} data={data} generalPalette={generalPalette} read={read} focus={focus} references={references}
  beforeNavigate={flush} onLocation={location=>act(()=>navigate(location,true,false,true))} save={centralWindows=>updateSettings({centralWindows})}
  edit={edit} openLink={link=>act(()=>fromLink(link))} showMenu={showExplorerMenu}
  newNote={openNewAt} newFolder={openFolderDialog} move={openMove} rename={openRename} remove={removeItem} toggleFavorite={toggleFavorite}
  pdf={path=>act(async()=>{if(await flush())setPrintPath(path)})} toggleRead={()=>setRead(value=>!value)} toggleFocus={()=>setFocus(value=>!value)}
  typography={noteTypography} pickReference={(view,kind)=>pickEditorReference(view,undefined,kind)} attach={(files,position,path,target)=>act(()=>attach(files,position,path,target))} uploadImages={uploadCanvasImages}
  changeTaskBoard={changeTaskBoard} openTaskManager={owner=>setTaskManagerProject(owner)} insertBoard={insertTaskBoard} detachedId={detachedCentralId??undefined} detach={desktop?detachCentralWindow:undefined} returnToApp={returnCentralWindow}
  renderHome={open=><section className={`project-overview glass-panel project-workspace overview-workspace palette-${overviewPalette}`} aria-label="Все проекты">
   <NoteBackdrop path={null} root={data.root} grid/><div className="project-overview-content"><div className="project-heading"><h1>Все проекты</h1><button className="primary" onClick={()=>{setName('');setModal('project')}}><Plus size={20}/>Новый проект</button></div>
   <ProjectGrid projects={visibleProjectOrder} saveOrder={saveProjectOrder} renderCard={name=><ProjectCard key={name} name={name} sections={entriesIn(name,projectRoot(name),folders,availableNotes,projectFor).filter(item=>item.kind==='folder').map(item=>item.name)} path={projectBackground(name)} root={data.root} palette={paletteId(paletteForProject(name)??generalPalette)} blend={blendForProject(name)} pattern={settings.projectPatterns?.[name]} gridOpacity={settings.projectGridOpacity?.[name]} open={()=>open({kind:'project',project:name,path:projectRoot(name),name})} showMenu={event=>showExplorerMenu(event,{kind:'project',project:name,path:projectRoot(name),name})} archive={()=>{setProjectToArchive(name);setModal('archive-project')}}/>}/></div>
  </section>}
  renderGraph={(owner,open,mode)=>{const all=owner===ALL_PROJECTS?allProjectsGraph(visibleProjectOrder,settings,childrenOf,roots.filter(item=>item.kind==='note')):undefined;return <section className="editor-pane project-graph" aria-label={owner===ALL_PROJECTS?'Общая карта связей':`Карта связей · ${owner}`}>
   <ProjectGraph mode={mode} key={JSON.stringify([data.root,owner])} project={all?allProjectsRoot:{kind:'project',project:owner,path:projectRoot(owner),name:owner}} notes={all?availableNotes:availableNotes.filter(n=>projectFor(n.path)===owner)} childrenOf={item=>all&&item.project===ALL_PROJECTS?all.roots:childrenOf(item)} settings={settings} root={data.root} cover={projectBackground(owner)} connections={all?.connections??settings.projectConnections?.[owner]??[]} map={all?.map??projectMap(owner)} open={item=>item.project===ALL_PROJECTS?act(()=>navigate({kind:'home'})):open(item)} showMenu={(event,item)=>{if(item.project===ALL_PROJECTS){event.preventDefault();return;}showExplorerMenu(event,item)}}
    changeConnection={(next,previous,structural)=>changeConnection(next,previous,structural,owner)} updateCard={(id,patch)=>updateMapCard(id,patch,owner)} changeBlocks={edit=>changeMapBlocks(edit,owner)} changeAppearance={patch=>updateProjectMap(patch,owner)}
    openLink={link=>act(()=>fromLink(link))} references={references} pickReference={(kind,position)=>pickMapReference(kind,position,owner)} attach={(files,position)=>act(()=>attachMapImages(files,position,owner))}
    changeTaskBoard={changeTaskBoard} createTaskBoard={()=>{const board=newTaskBoard(owner);changeTaskBoard(board);return board.id;}} openTasks={()=>setTaskManagerProject(owner)}/>
  </section>}}/>;
 const taskManager=taskManagerProject!==null?<TaskBoardManager boards={settings.taskBoards??[]} notes={availableNotes} project={taskManagerProject} change={changeTaskBoards} close={()=>setTaskManagerProject(null)} openNote={path=>act(()=>fromLink(path))}/>:null;
 const modalSurface=(modal&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null)}}><div className={`modal modal-${modal}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={e=>{if(e.key==='Tab'){const els=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,[tabindex="0"]'));if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els.at(-1)?.focus()}else if(!e.shiftKey&&document.activeElement===els.at(-1)){e.preventDefault();els[0]?.focus()}}}}><header><h2 id="modal-title">{{move:'Переместить', 'daily-note':'Заметка на сегодня',reference:'Внутренняя ссылка',search:'Поиск',new:'Новая заметка',rename:'Переименовать заметку',folder:'Новая папка',settings:'Настройки — NoteApp',icon:'Иконка объекта',trash:'Корзина',templates:'Шаблоны',delete:'Переместить в корзину?',project:'Новый проект','archive-project':'Удалить проект?'}[modal]}</h2>{!(settingsWindow&&desktop&&modal==='settings')&&<IconButton label="Закрыть" onClick={()=>setModal(null)}><X size={22}/></IconButton>}</header>
 {modal==='icon'&&iconTarget&&<><p className='subtle'>{iconTarget.name}</p><label className="object-icon-search"><MagnifyingGlass size={18}/><input autoFocus aria-label="Поиск иконок по названию" placeholder="Название иконки…" value={iconQuery} onChange={event=>setIconQuery(event.target.value)}/></label><div className='object-icon-picker'><button aria-label='По умолчанию' title='По умолчанию' onClick={()=>{const next={...settings.objectIcons};delete next[objectIconKey(iconTarget)];updateSettings({objectIcons:next});setModal(null)}}><ObjectIcon item={iconTarget}/></button>{Object.entries(objectIcons).filter(([name])=>name.toLocaleLowerCase().includes(iconQuery.trim().toLocaleLowerCase())).map(([name,Icon])=><button key={name} title={name} aria-label={name} aria-pressed={settings.objectIcons?.[objectIconKey(iconTarget)]===name} onClick={()=>{updateSettings({objectIcons:{...settings.objectIcons,[objectIconKey(iconTarget)]:name}});setModal(null)}}><Icon size={22}/></button>)}{!Object.keys(objectIcons).some(name=>name.toLocaleLowerCase().includes(iconQuery.trim().toLocaleLowerCase()))&&<p className="modal-empty">Иконки не найдены</p>}</div></>}
 {modal==='daily-note'&&<>
  <ReferencePicker icons={settings.objectIcons} roots={roots} childrenOf={childrenOf} targets={referenceTargets} value={dailyNoteUrl} kind="note" choose={setDailyNoteUrl}/>
  <div className="modal-foot"><button type="button" onClick={()=>setModal(null)}>Отмена</button>
   <button type="button" onClick={()=>{const next={...dataRef.current.settings.dailyNotes};delete next[dateString()];updateSettings({dailyNotes:next});setModal(null);}}>Без привязки</button>
   <button type="button" className="primary" disabled={referenceTargets.get(dailyNoteUrl)?.kind!=='note'} onClick={()=>{
    const selected=referenceTargets.get(dailyNoteUrl);if(selected?.kind!=='note')return;
    updateSettings({dailyNotes:{...dataRef.current.settings.dailyNotes,[dateString()]:selected.path}});setModal(null);
   }}>Привязать</button>
  </div>
 </>}
 {modal==='reference'&&referenceDialog&&<form onSubmit={event=>{event.preventDefault();saveReference();}}>
  <ReferencePicker icons={settings.objectIcons} roots={roots} childrenOf={childrenOf} targets={referenceTargets} value={referenceDialog.url} kind={referenceDialog.kind} excludePath={referenceDialog.excludePath} onlyMarkdown={referenceDialog.instant}
   choose={url=>{if(!referenceDialog.instant){setReferenceDialog({...referenceDialog,url});return}const target=referenceTargets.get(url);if(target&&referenceDialog.apply(referenceMarkdown(target)))setModal(null);else setError('Место вставки изменилось. Откройте выбор заметки ещё раз.')}}/>
  <div className="modal-foot"><button type="button" onClick={()=>setModal(null)}>Отмена</button>
   {!referenceDialog.instant&&<button type="submit" className="primary" disabled={!referenceTargets.has(referenceDialog.url)}>
    {referenceDialog.kind?'Вставить':'Сохранить'}
   </button>}
  </div>
 </form>}
 {error&&<p className="modal-error" role="alert">{error}</p>}
 {modal==='search'&&<><label htmlFor="note-search">Проекты, папки и заметки</label><div className="search-field"><MagnifyingGlass size={23}/><input id="note-search" autoFocus placeholder="Название, путь или текст заметки…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&found[0])act(()=>openSearchResult(found[0].item))}}/><kbd>Esc</kbd></div><div className="search-results">{found.map(r=>{return <button key={itemKey(r.item)} onClick={()=>act(()=>openSearchResult(r.item))}><ObjectIcon item={r.item} icons={settings.objectIcons} size={23}/><div><strong><Highlight text={r.item.name} query={query.trim()}/></strong><small>{{project:'Проект',folder:'Папка',note:'Заметка'}[r.item.kind]} · {r.item.path||r.item.project}</small>{r.snippet&&<p><Highlight text={r.snippet} query={query.trim()}/></p>}</div></button>})}{!found.length&&<div className="modal-empty">Ничего не найдено. Попробуйте другое слово.</div>}</div><div className="modal-foot subtle">Найдено объектов: {found.length}</div></>}
 {(modal==='new'||modal==='rename')&&<form onSubmit={e=>{e.preventDefault();act(async()=>{if(modal==='new')await create(name,newFolder,newType==='canvas'?'{}':expand(allTemplates.find(t=>t.name===template)?.content||'# {{title}}\n\n',name),newType);if(modal==='rename')await rename();})}}><label>{modal==='rename'?'Имя':'Название'}<input autoFocus required value={name} onChange={e=>setName(e.target.value)} placeholder="Например, Новая идея"/></label>{modal==='new'&&<><label>Тип файла<select value={newType} onChange={event=>setNewType(event.target.value as 'note'|'canvas'|'kanban')}><option value='note'>Заметка</option><option value='canvas'>Полотно</option><option value='kanban'>Kanban</option></select></label><label>Папка<input list="folders" value={newFolder} onChange={e=>setNewFolder(e.target.value)} placeholder="Корень хранилища"/><datalist id="folders">{data.folders.map(f=><option key={f}>{f}</option>)}</datalist></label>{newType==='note'&&<label>Шаблон<select value={template} onChange={e=>setTemplate(e.target.value)}><option value="">Пустая заметка</option>{allTemplates.map(t=><option key={t.name}>{t.name}</option>)}</select></label>}</>}<p className="subtle">{modal==='rename'?'Внутренние ссылки будут обновлены автоматически.':newType==='canvas'?'Пустое полотно в вашем хранилище. Двойной щелчок добавит текстовый виджет.':newType==='kanban'?'Доска Kanban в вашем хранилище.':'Обычный Markdown-файл в вашем хранилище.'}</p><div className="modal-foot"><button type="button" onClick={()=>setModal(null)}>Отмена</button><button className="primary" type="submit">{modal==='rename'?'Сохранить':'Создать'}</button></div></form>}


 {(modal==='project'||modal==='folder')&&<form onSubmit={event=>{event.preventDefault();act(modal==='project'?addProject:addFolder)}}>
  {modal==='folder'&&folderTarget&&<p className="subtle">Расположение · {folderTarget.path || folderTarget.project}</p>}
  <label>Название<input autoFocus required value={name} onChange={event=>setName(event.target.value)} maxLength={100}
    placeholder={modal==='project'?'Например, Исследования':'Например, Черновики'}/></label>
  <div className="modal-foot"><button type="button" onClick={()=>setModal(null)}>Отмена</button><button className="primary" type="submit">Создать</button></div>
 </form>}
 {modal==='archive-project'&&<><p>Проект «{projectToArchive}» и его заметки будут скрыты. Проект можно восстановить из корзины.</p>
  <div className="modal-foot"><button onClick={()=>setModal(null)}>Отмена</button><button className="danger" onClick={()=>act(archiveProject)}>В корзину</button></div>
 </>}
 {modal==='delete'&&<><p>«{deleteTarget?.name}» можно будет восстановить из корзины.{deleteTarget?.kind==='folder'&&' Вложенные папки и заметки тоже попадут в корзину.'}</p><div className="modal-foot"><button onClick={()=>setModal(null)}>Отмена</button><button className="danger" onClick={()=>act(trash)}>В корзину</button></div></>}
 {modal==='trash'&&<><p className="subtle">Удалённые заметки сохраняются вместе с вложениями.</p>{data.trash.length>0&&<button type="button" onClick={()=>{if(window.confirm('Очистить корзину без возможности восстановления?'))act(async()=>{accept(await request('empty_trash'));setNotice('Корзина очищена')})}}><Trash size={18}/>Очистить корзину</button>}<div className="trash-list">{settings.archivedProjects?.map(p=><div key={p}><Folder size={22}/><span><strong>{p}</strong><small>Проект</small></span><button onClick={()=>{updateSettings({archivedProjects:settings.archivedProjects?.filter(name=>name!==p)});setNotice('Проект восстановлен')}}><ArrowCounterClockwise/>Восстановить проект</button></div>)}{data.trash.map(t=><div key={t.id}>{t.kind==='folder'?<Folder size={22}/>:<FileText size={22}/>}<span><strong>{t.kind==='folder'?t.path.split('/').at(-1):title(t.path)}</strong><small>{t.path}</small></span><button onClick={()=>act(()=>restore(t.id))}><ArrowCounterClockwise/>Восстановить</button></div>)}{!data.trash.length&&!settings.archivedProjects?.length&&<div className="modal-empty"><Trash size={40}/><h3>Корзина пуста</h3><p>Здесь будут удалённые заметки.</p></div>}</div></>}
 {modal==='move'&&moveTarget&&<form onSubmit={event=>{event.preventDefault();act(moveItem)}}><p className="subtle">Переместить «{moveTarget.name}»</p><label>Папка назначения<select autoFocus value={moveDestination} onChange={event=>setMoveDestination(event.target.value)}><option value="">Корень хранилища{moveTarget.kind!=='note'?' — сделать проектом':''}</option>{folders.filter(path=>path!==moveTarget.path&&!path.startsWith(moveTarget.path+'/')).map(path=><option key={path} value={path}>{path}</option>)}</select></label><p className="subtle">{moveTarget.kind==='project'?'При переносе внутрь другого проекта этот проект станет папкой. Содержимое и настройки сохранятся.':'Внутренние ссылки обновятся автоматически.'}</p><div className="modal-foot"><button type="button" onClick={()=>setModal(null)}>Отмена</button><button className="primary" type="submit">Переместить</button></div></form>}
 {modal==='templates'&&<><label>Открыть шаблон<select value="" onChange={e=>{const t=allTemplates.find(t=>t.name===e.target.value);if(t){setTemplateName(t.name);setTemplateBody(t.content)}}}><option value="">Выберите шаблон для редактирования</option>{allTemplates.map(t=><option key={t.name}>{t.name}</option>)}</select></label><label>Название<input autoFocus value={templateName} onChange={e=>setTemplateName(e.target.value)}/></label><label>Markdown<textarea rows={12} value={templateBody} onChange={e=>setTemplateBody(e.target.value)}/></label><p className="subtle">{'Переменные: {{title}} — название, {{date}} — текущая дата.'}</p><div className="modal-foot"><button className="primary" disabled={!templateName.trim()} onClick={()=>act(async()=>{accept(await request('template',{name:templateName.trim(),content:templateBody}));setNotice('Шаблон сохранён')})}><FloppyDisk/>Сохранить шаблон</button></div></>}
 {modal==='settings'&&<SettingsPanel settings={settings} update={updateSettings} appearance={<><p className="subtle">Настройки сохраняются отдельно для «{data.name}».</p><div className="setting-row"><span>Режим яркости</span><div className="segmented"><button className={settings.theme!=='light'?'on':''} onClick={()=>updateSettings({theme:'dark'})}><Moon/>Тёмная</button><button className={settings.theme==='light'?'on':''} onClick={()=>updateSettings({theme:'light'})}><Sun/>Светлая</button></div></div><div className="settings-palette"><div className="appearance-label">Общая палитра приложения</div>
  <ProjectPalettePicker textureColors={settings.textureColors} changeTextureColor={changeTextureColor} customColor={settings.customPaletteColor} changeCustomColor={color=>updateSettings({customPaletteColor:color})} savedColors={settings.savedPaletteColors} changeSavedColors={colors=>updateSettings({savedPaletteColors:colors})} value={generalPalette} blend={settings.paletteBlend} choose={chooseGlobalPalette} mix={(base,withColor)=>mixPalettes(base,withColor,true)}/>
  {settings.paletteBlend&&<button type="button" onClick={()=>updateSettings({paletteBlend:undefined})}>Убрать градиент</button>}
 </div>
 <label className="range-label">Прозрачность приложения <output>{chromeTransparency(settings.appTransparency)}%</output>
  <input aria-label="Прозрачность приложения" type="range" min="0" max="100" step="5" value={chromeTransparency(settings.appTransparency)} onChange={event=>updateSettings({appTransparency:Number(event.target.value)})}/>
 </label>
 <label>Шрифт приложения<FontPicker value={font} label="Шрифт приложения" inherited="Inter (по умолчанию)"
  change={fontFamily=>updateSettings({fontFamily})}/>
 </label>
</>} storage={<><p className="vault-path">{data.root}</p><div className="settings-grid"><button onClick={()=>act(chooseVault)}><Folder/>Выбрать хранилище</button><button onClick={()=>act(()=>transfer('import'))}><Upload/>Импорт папки</button><button onClick={()=>act(()=>transfer('export'))}><Download/>Экспорт с вложениями</button><button onClick={()=>act(()=>transfer('backup'))}><Copy/>Резервная копия</button><button onClick={()=>act(chooseVault)}><ArrowCounterClockwise/>Открыть резервную копию</button><button onClick={()=>{setTemplateName('');setTemplateBody('');setModal('templates')}}><FileText/>Редактор шаблонов</button></div><p className="subtle">Копия — отдельная папка со всеми файлами, вложениями и настройками. Её можно открыть как хранилище или импортировать без перезаписи существующих заметок.</p></>}/>}
 </div></div>);
 const interfaceTheme=selectedCustomTheme?'custom':settings.interfaceTheme==='stone'?'coal':['nord','classic'].includes(settings.interfaceTheme??'')?'graphite':settings.interfaceTheme??'graphite';
 const termsList=<TermsWindow notes={data.notes} close={!desktop?()=>setShowTerms(false):undefined} openNote={path=>{if(termsWindow){const channel=new BroadcastChannel('noteapp-favorites-open');channel.postMessage({root:data.root,path});channel.close()}else{setShowTerms(false);act(()=>go(path))}}} remove={entry=>{if(termsWindow){const channel=new BroadcastChannel('noteapp-terms');channel.postMessage({type:'remove',root:data.root,entry});channel.close()}else void removeTerm(entry).then(ok=>{if(!ok)setError('Не удалось удалить определение. Проверьте сохранение заметки.')}).catch(report)}}/>;
 if(termsWindow)return <div className={`app favorites-window liquid-shell palette-${generalPalette} ${settings.theme==='light'?'light':''}`} data-theme={interfaceTheme} data-simple-style={settings.simpleStyle||undefined} style={css}>{error&&<div className="error-banner" role="alert">{error}<button aria-label="Закрыть" onClick={()=>setError('')}><X size={16}/></button></div>}{termsList}</div>;
 if(favoritesWindow)return <div className={`app favorites-window liquid-shell palette-${generalPalette} ${settings.theme==='light'?'light':''}`} data-theme={interfaceTheme} data-simple-style={settings.simpleStyle||undefined} data-window-fullscreen={windowFullscreen||undefined} style={css}>{favoritesList}</div>;
 if(settingsWindow)return <div className={`app settings-window liquid-shell palette-${generalPalette} ${settings.theme==='light'?'light':''}`} data-theme={interfaceTheme} data-simple-style={settings.simpleStyle||undefined} data-window-fullscreen={windowFullscreen||undefined} style={css} data-palette-blend={settings.paletteBlend??''}>{modalSurface}</div>;
 if(detachedCentralId)return <div className={`app detached-app liquid-shell palette-${generalPalette} ${settings.theme==='light'?'light':''}`} data-theme={interfaceTheme} data-simple-style={settings.simpleStyle||undefined} data-window-fullscreen={windowFullscreen||undefined} style={{...css,height:'100vh'}}>{centralWindowSurface}{taskManager}</div>;
 return <div className={`app liquid-shell palette-${generalPalette} ${settings.theme==='light'?'light':''}`} data-theme={interfaceTheme} data-simple-style={settings.simpleStyle||undefined} data-window-fullscreen={windowFullscreen||undefined} style={css} data-palette-blend={settings.paletteBlend??''} data-transparent={chromeTransparency(settings.appTransparency)>0||undefined}>
 <header className="titlebar glass-panel" data-tauri-drag-region>
  <div className="brand"><span className="brand-name">NoteApp</span></div>
  <div className="toolbar-nav">
   <IconButton label="Назад · Alt+←" disabled={position<=0} onClick={()=>act(()=>travel(-1))}><CaretLeft size={20}/></IconButton>
   <IconButton label="Вперёд · Alt+→" disabled={position>=history.length-1} onClick={()=>act(()=>travel(1))}><CaretRight size={20}/></IconButton>
  </div>
  {!desktop&&<span className="preview-label">Предпросмотр · данные браузера</span>}
  <div className="window-actions">
   <IconButton label="Свернуть" disabled={!desktop} onClick={()=>windowAction('minimize')}><Minus size={18}/></IconButton>
   <IconButton label="Развернуть" disabled={!desktop} onClick={()=>windowAction('toggleMaximize')}><Square size={16}/></IconButton>
   <IconButton label="Закрыть окно" disabled={!desktop} onClick={()=>windowAction('close')}><X size={19}/></IconButton>
  </div>
 </header>
 {error&&!modal&&<div className="error-banner" role="alert"><Warning size={20}/><span>{error}</span><button aria-label="Закрыть ошибку" onClick={()=>setError('')}><X/></button></div>}
 <WorkspaceLayout decorativeRings={!!settings.decorativeRings&&!!note} palette={generalPalette} blend={settings.paletteBlend} appearances={settings.panelAppearance}
  applyPalette={(panel,value)=>updateSettings({panelAppearance:{...dataRef.current.settings.panelAppearance,[panel]:value}})} navigation={navigation} inspector={inspector} focus={focus} layout={settings.workspaceLayout} leftWidth={settings.leftWidth} rightWidth={settings.rightWidth} change={workspaceLayout=>updateSettings({workspaceLayout})}
  homeButton={<IconButton label="Все проекты" active={overview} onClick={()=>act(()=>navigate({kind:'home'}))}><House size={21}/></IconButton>}>


 {centralWindowSurface}
 </WorkspaceLayout>
 <input type="file" multiple hidden ref={fileInput} onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';if(files.length)act(()=>attach(files))}}/>

 <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" hidden ref={projectBgInput}
  onChange={event=>{
   const file=event.target.files?.[0];
   event.target.value='';
   if(file)act(async()=>{
    const saved=await uploadAttachments([file],mapNotesPath,dataRef.current.root);
    if(saved.length)updateSettings({projectBackgrounds:{...dataRef.current.settings.projectBackgrounds,[project]:saved[0].path}});
   });
  }}/>
 {explorerMenu&&<ExplorerContextMenu menu={explorerMenu} close={closeExplorerMenu}
  openSeparate={()=>act(()=>navigate(itemLocation(explorerMenu.item)))}
  openSplit={()=>act(async()=>{const windows=windowsRef.current;if(windows&&!await windows.openSplit(itemLocation(explorerMenu.item)))setNotice('Не удалось открыть окно: проверьте сохранение и ограничение количества окон')})}
  chooseIcon={()=>{setIconQuery('');setIconTarget(explorerMenu.item);setModal('icon')}} newNote={()=>openNewAt(explorerMenu.item.path)} newCanvas={()=>openNewAt(explorerMenu.item.path,'canvas')} newFolder={()=>openFolderDialog(explorerMenu.item)}
  isFavorite={settings.favorites?.includes(explorerMenu.item.path)??false} toggleFavorite={toggleFavorite}
  rename={()=>openRename(explorerMenu.item.path)} move={()=>openMove(explorerMenu.item)} remove={()=>removeItem(explorerMenu.item)}/>}
 {showTerms&&!desktop&&<div className="modal-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)setShowTerms(false)}}><section className="modal terms-window-modal" role="dialog" aria-modal="true" aria-label="Термины хранилища">{termsList}</section></div>}
 {notice&&<div className="toast" role="status"><Check size={20}/><span>{notice}</span><button aria-label="Закрыть уведомление" onClick={()=>setNotice('')}><X size={17}/></button></div>}
 {modalSurface}
 {taskManager}
 {printPath&&data.notes.find(note=>note.path===printPath)&&<PrintNote note={data.notes.find(note=>note.path===printPath)!} notes={data.notes} references={references} done={()=>setPrintPath('')} taskBoards={settings.taskBoards??[]} changeTaskBoard={changeTaskBoard} openNote={path=>act(()=>fromLink(path))}/>}
 {conflict&&<div className="modal-overlay"><div className="modal conflict-modal" role="alertdialog" aria-modal="true" aria-labelledby="conflict-title"><h2 id="conflict-title"><Warning/>Файл изменился вне NoteApp</h2><p>«{title(conflict.path)}». Ваш черновик сохранён отдельно. Выберите, какую версию оставить.</p><div className="conflict-columns"><div><h3>Ваши изменения</h3><pre>{drafts.current[conflict.path]?.content}</pre></div><div><h3>Версия на диске</h3><pre>{conflict.disk.content??'Файл удалён'}</pre></div></div><div className="modal-foot"><button onClick={()=>act(()=>resolveConflict('disk'))}>Использовать версию с диска</button><button onClick={()=>act(()=>resolveConflict('mine'))}>Перезаписать моей версией</button><button className="primary" onClick={()=>act(()=>resolveConflict('copy'))}>Сохранить обе версии</button></div></div></div>}
 </div>
}
