import {useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight, ArrowsClockwise, ArrowsIn, CaretDown, Check, DotsSixVertical, DotsThree, FileText, Folder, Minus, NotePencil, PencilSimple, Plus, Stack, Trash, X} from '@phosphor-icons/react';
import type {ReactCodeMirrorRef} from '@uiw/react-codemirror';
import Editor from './Editor';
import MarkdownToolbar from './MarkdownToolbar';
import FontPicker,{fontStack,validFont} from './FontPicker';
import TextOptions,{textAppearanceStyle} from './TextOptions';
import type {ReferenceActions} from './ReferenceChip';
import type {ReferenceKind} from './noteReferences';
import {mapBlockKey,mapBlocks,mapNotesPath} from './mapBlocks';
import {createGraphRouter,graphRoutePath,hierarchyBranchRoutes} from './graphRoutes';
import {gridStep} from './gridPatterns';
import {snapGrid} from './gridGeometry';
import {CardFace,paletteDragType,readPaletteDrop,paletteId} from './appearance';
import {textureById} from './textures';
import {FeatureCard,featureDefaults,featureFromMarkdown,featureBaseWidth,markdownBlock,type NoteFeature} from './noteFeatureBlocks';
import {kanbanWidgetSize} from './kanbanWidgetSize';
import {FittedWidget} from './widgetFit';
import {queueNoteWidgetJoinSync,snapNoteWidgetPosition,tableMinimumSize} from './noteWidgetChrome';
import {MapTable,ReadingTable,standaloneMapTable} from './noteTables';
import type {ExplorerItem} from './Explorer';
import {ObjectIcon} from './ObjectIcon';
import type {MapBlock, MapCard, MapPoint, Note, ProjectConnection, ProjectMap, Settings, TaskBoard} from './types';

const sizes = {
  project: {width: 296, height: 148},
  folder: {width: 232, height: 124},
  note: {width: 188, height: 108},
};
const icons = {project: Stack, folder: Folder, note: FileText};
const inset = 32, gap = 36;
const blockWidth = 300;
const gridSize=(value:number,step:number,min:number,max:number)=>Math.max(min*step,Math.min(max*step,Math.round((Number.isFinite(value)?value:min*step)/step)*step));
const dimensions=(size:Dimensions,step:number):Dimensions=>({width:gridSize(size.width,step,6,40),height:gridSize(size.height,step,4,30)});
const keyOf = (item: ExplorerItem) => item.kind === 'note' ? item.path :
  item.kind === 'folder' ? 'folder:' + item.path : 'project:' + item.project;

function noteExcerpt(note?: Note) {
  return note?.content
    .replace(/^\s*#+[^\S\n]+[^\n]*\n*/, '')
    .replace(/!\[[^\]]*\]\([^\n]*?\)/g, '')
    .replace(/\[\[([^\]]+)\]\]/g, (_, link: string) => link.split('|').at(-1)!)
    .replace(/\[([^\]]+)\]\([^\n]*?\)/g, '$1')
    .replace(/^[\s#>*-]+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 220) || 'Пока без текста';
}

const linkKey = ({from, to}: ProjectConnection) => JSON.stringify([from, to]);

export function layoutProjectGraph(project: ExplorerItem, childrenOf: (item: ExplorerItem) => ExplorerItem[],
  measurements: Record<string,Dimensions>, cards: ProjectMap['cards'], viewport: number, drag: Drag | null, step:number, sizing:Sizing|null) {
  const rows: number[] = [];
  const spacing=Math.ceil(gap/step)*step;
  const sizeOf=(item:ExplorerItem)=>dimensions(sizing?.id===keyOf(item)?sizing.size:cards?.[keyOf(item)]?.size??sizes[item.kind],step);
  function branch(item: ExplorerItem, depth: number): Branch {
    const id = keyOf(item);
    const size = sizeOf(item);
    const level=depth;
    const height = Math.ceil(Math.max(measurements[id]?.height??0,size.height)/step)*step;
    rows[level] = Math.max(rows[level] ?? sizes.project.height, cards?.[id]?.position ? size.height : height);
    const children = item.kind === 'note' ? [] : [...childrenOf(item)]
      .sort((a,b)=>item.project===':all-projects:'?0:(a.kind==='folder'?0:1)-(b.kind==='folder'?0:1)||a.name.localeCompare(b.name,'ru',{numeric:true}))
      .map(child => branch(child, depth + 1));
    const span = children.reduce((width, child, i) => width + child.width + (i ? spacing : 0), 0);
    return {item, children, span, height, width: Math.max(size.width, span),depth:level};
  }
  const tree = branch(project, 0);
  const nodes = new Map<string, Node>();
  let width = Math.max(viewport, tree.width + 2 * inset), height = 0, minX = 0, minY = 0;
  const left = (width - tree.width) / 2;
  let rowTop = inset;
  const offsets = rows.map(row => {
    const y = rowTop;
    rowTop += row + 60;
    return y;
  });
  function place(branch: Branch, left: number, parent?: ExplorerItem) {
    const id = keyOf(branch.item);
    const depth=branch.depth,size = sizeOf(branch.item), position = drag?.moved ? drag.positions[id] ?? cards?.[id]?.position : sizing?.id===id?sizing.position:cards?.[id]?.position;
    const x = snapGrid(position?.x ?? left + (branch.width - size.width) / 2,step), y = snapGrid(position?.y ?? offsets[depth],step);
    const children = branch.children.map(child => child.item);
    nodes.set(id, {...size, height:branch.height, bodyHeight:size.height, x, y, item:branch.item, parent, children, depth});
    width = Math.max(width, x + size.width + inset);
    height = Math.max(height, y + branch.height + inset);
    minX = Math.min(minX, x - inset);
    minY = Math.min(minY, y - inset);
    let next = left + (branch.width - branch.span) / 2;
    for (const child of branch.children) {
      place(child, next, branch.item);
      next += child.width + spacing;
    }
  }
  place(tree, left);
  return {nodes, bounds: {x:minX, y:minY, width:width-minX, height:height-minY}};
}

type Branch = {item: ExplorerItem; children: Branch[]; span: number; width: number; height: number;depth:number};
type Node = typeof sizes.note & {
  x: number; y: number; bodyHeight:number; depth:number; item: ExplorerItem; parent?: ExplorerItem; children: ExplorerItem[];
};
function radialLayout(tree:ReturnType<typeof layoutProjectGraph>,root:ExplorerItem,positions:Record<string,MapPoint>,drag:Drag|null,cards:ProjectMap['cards'],sizing:Sizing|null) {
  const counts=new Map<number,number>();
  for(const node of tree.nodes.values())counts.set(node.depth,(counts.get(node.depth)??0)+1);
  const radii=new Map<number,number>();let previous=0;
  for(const [depth,count] of [...counts].sort((a,b)=>a[0]-b[0])){const radius=depth===0?0:Math.max(previous+340,count*300/(2*Math.PI));radii.set(depth,radius);previous=radius;}
  const weights=new Map<string,number>();
  const weight=(node:Node):number=>{const n=node.children.reduce((sum,child)=>sum+weight(tree.nodes.get(keyOf(child))!),0)||1;weights.set(keyOf(node.item),n);return n};
  const start=tree.nodes.get(keyOf(root));if(!start)return tree;weight(start);
  const nodes=new Map<string,Node>();let left=0,top=0,right=0,bottom=0;
  const occupied=new Map<string,{x:number;y:number;r:number}[]>(),cellSize=360;let maxRadius=0;
  const addCircle=(x:number,y:number,r:number)=>{maxRadius=Math.max(maxRadius,r);const key=`${Math.floor(x/cellSize)}:${Math.floor(y/cellSize)}`,items=occupied.get(key);if(items)items.push({x,y,r});else occupied.set(key,[{x,y,r}])};
  const overlaps=(x:number,y:number,r:number)=>{const reach=Math.ceil((r+maxRadius+30)/cellSize);for(let i=-reach;i<=reach;i++)for(let j=-reach;j<=reach;j++)for(const other of occupied.get(`${Math.floor(x/cellSize)+i}:${Math.floor(y/cellSize)+j}`)??[])if(Math.hypot(x-other.x,y-other.y)<r+other.r+30)return true;return false};
  const place=(node:Node,from:number,to:number)=>{
    const id=keyOf(node.item),angle=(from+to)/2,radius=radii.get(node.depth)??0;
    const scale=cards?.[id]?.size||sizing?.id===id?1:Math.max(.7,1.05-node.depth*.1);
    const diameter=Math.max(node.width,node.bodyHeight)*scale;
    const position=drag?.moved?drag.positions[id]??positions[id]:positions[id];
    let distance=radius,cx=Math.cos(angle)*distance,cy=Math.sin(angle)*distance;
    if(!position&&node.depth>0)while(overlaps(cx,cy,diameter/2)){distance+=Math.max(48,diameter/2);cx=Math.cos(angle)*distance;cy=Math.sin(angle)*distance}
    const x=position?.x??cx-diameter/2,y=position?.y??cy-diameter/2;
    addCircle(x+diameter/2,y+diameter/2,diameter/2);
    const next={...node,x,y,width:diameter,bodyHeight:diameter,height:diameter};nodes.set(id,next);left=Math.min(left,x-inset);top=Math.min(top,y-inset);right=Math.max(right,x+next.width+inset);bottom=Math.max(bottom,y+next.height+inset);
    let at=from;for(const child of node.children){const childNode=tree.nodes.get(keyOf(child))!;const end=at+(to-from)*(weights.get(keyOf(child))??1)/(weights.get(id)??1);place(childNode,at,end);at=end;}
  };
  place(start,-Math.PI/2,3*Math.PI/2);
  return {nodes,bounds:{x:left,y:top,width:right-left,height:bottom-top}};
}
type Dimensions = {width:number;height:number};
type Sizing={id:string;size:Dimensions;position:MapPoint};
type Box = MapPoint & Dimensions;
type Endpoint = Box & {name:string; item?:ExplorerItem; reference?:string};
type Drag = {id:string; pointer:number; start:MapPoint; zoom:number; origin:MapPoint; position:MapPoint; origins:Record<string,MapPoint>; positions:Record<string,MapPoint>; initial:Record<string,MapPoint>; moved:boolean};
type Camera = MapPoint & {zoom:number};
type Marquee={pointer:number;start:MapPoint;current:MapPoint;initial:string[];additive:boolean};
const initialCamera: Camera = {x:0, y:0, zoom:1};
const minZoom = .25, maxZoom = 2.5;

const resizeEdges=['n','e','s','w','ne','nw','se','sw'] as const;
function ResizeHandle({label,size,position,step,zoom,draft,save,moveEdges}:{label:string;size:Dimensions;position:MapPoint;step:number;zoom:number;draft:(value:{size:Dimensions;position:MapPoint}|null)=>void;save:(size:Dimensions,position:MapPoint)=>void;moveEdges?:{start:(event:PointerEvent<HTMLButtonElement>)=>void;move:(event:PointerEvent<HTMLButtonElement>)=>void;end:(event:PointerEvent<HTMLButtonElement>)=>void;key:(dx:number,dy:number)=>void}}) {
  const gesture=useRef<{pointer:number;x:number;y:number;size:Dimensions;position:MapPoint;nextSize:Dimensions;nextPosition:MapPoint}|null>(null);
  const resize=(edge:string,dx:number,dy:number,originSize:Dimensions,originPosition:MapPoint)=>{
    const nextSize={...originSize},nextPosition={...originPosition},right=originPosition.x+originSize.width,bottom=originPosition.y+originSize.height;
    if(edge.includes('e'))nextSize.width=gridSize(originSize.width+dx,step,6,40);
    if(edge.includes('s'))nextSize.height=gridSize(originSize.height+dy,step,4,30);
    if(edge.includes('w')){nextSize.width=gridSize(originSize.width-dx,step,6,40);nextPosition.x=right-nextSize.width;}
    if(edge.includes('n')){nextSize.height=gridSize(originSize.height-dy,step,4,30);nextPosition.y=bottom-nextSize.height;}
    return {size:nextSize,position:nextPosition};
  };
  return <>{resizeEdges.map(edge=><button key={edge} type="button" className={`graph-resize graph-resize-${edge}`} role="separator"
    aria-orientation={edge==='e'||edge==='w'?'vertical':edge==='n'||edge==='s'?'horizontal':undefined}
    aria-label={`${label} ${edge.length===2?'по диагонали':edge==='e'||edge==='w'?'по ширине':'по высоте'}`} title="Изменить размер перетаскиванием"
    onPointerDown={event=>{if(event.button!==0)return;if(moveEdges&&edge.length===1){moveEdges.start(event);return}event.preventDefault();event.stopPropagation();gesture.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,size,position,nextSize:size,nextPosition:position};event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={event=>{if(moveEdges&&edge.length===1){moveEdges.move(event);return}const current=gesture.current;if(!current||current.pointer!==event.pointerId)return;event.stopPropagation();const next=resize(edge,(event.clientX-current.x)/zoom,(event.clientY-current.y)/zoom,current.size,current.position);current.nextSize=next.size;current.nextPosition=next.position;draft(next);}}
    onPointerUp={event=>{if(moveEdges&&edge.length===1){moveEdges.end(event);return}const current=gesture.current;if(!current||current.pointer!==event.pointerId)return;event.stopPropagation();gesture.current=null;draft(null);save(current.nextSize,current.nextPosition);}}
    onPointerCancel={()=>{gesture.current=null;draft(null);}}
    onLostPointerCapture={()=>{if(gesture.current){gesture.current=null;draft(null);}}}
    onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;if(moveEdges&&edge.length===1){moveEdges.key(dx,dy);return}const next=resize(edge,dx,dy,size,position);save(next.size,next.position)}}>
    </button>)}</>;
}

export default function ProjectGraph({mode,project, notes, childrenOf, settings, root, cover, connections, map, open, changeConnection, updateCard,
  changeBlocks, changeAppearance, attach, openLink, references, pickReference, showMenu, changeTaskBoard, createTaskBoard, openTasks}: {
  mode:'tree'|'graph';project: ExplorerItem;
  notes: Note[];
  childrenOf: (item: ExplorerItem) => ExplorerItem[];
  settings: Settings;
  root: string;
  cover: string | null;
  connections: ProjectConnection[];
  map: ProjectMap;
  open: (item: ExplorerItem) => void;
  showMenu:(event:React.MouseEvent,item:ExplorerItem)=>void;
  changeConnection: (connection: ProjectConnection|null, previous?: ProjectConnection, structural?: boolean) => void;
  updateCard: (id: string, patch: MapCard) => void;
  changeBlocks: (edit: (blocks:MapBlock[]) => MapBlock[]) => void;
  changeAppearance: (patch:Partial<ProjectMap>)=>void;
  attach: (files:File[], position:MapPoint) => void;
  openLink: (link:string) => void;
  references: ReferenceActions;
  pickReference: (kind:ReferenceKind,position:MapPoint)=>void;
  changeTaskBoard:(board:TaskBoard)=>void;
  createTaskBoard:()=>string;
  openTasks:()=>void;
}) {
  const [from, setFrom] = useState('');
  const [label, setLabel] = useState('');
  const [editing, setEditing] = useState<{previous:ProjectConnection;next:ProjectConnection}|null>(null);
  const [comment, setComment] = useState<{id:string;text:string;index?:number}|null>(null);
  const [nodeMenu,setNodeMenu]=useState<{id:string;x:number;y:number;item?:ExplorerItem}|null>(null);
  const [viewport, setViewport] = useState(0);
  const [measurements,setMeasurements]=useState<Record<string,Dimensions>>({});
  const [boardHeights,setBoardHeights]=useState<Record<string,number>>({});
  const [drag, setDrag] = useState<Drag|null>(null);
  const [selectedIds,setSelectedIds]=useState<Set<string>>(()=>new Set());
  const [marquee,setMarquee]=useState<Marquee|null>(null);
  const [sizing,setSizing]=useState<Sizing|null>(null);
  const [camera, setCamera] = useState(initialCamera);
  const positionKey=JSON.stringify(['noteapp-radial-positions',root,project.project]);
  const [radialPositions,setRadialPositions]=useState<Record<string,MapPoint>>(()=>{try{const saved=JSON.parse(localStorage.getItem(positionKey)??'{}');return Object.fromEntries(Object.entries(saved).filter((entry):entry is [string,MapPoint]=>{const p=entry[1] as MapPoint;return !!p&&typeof p==='object'&&Number.isFinite(p.x)&&Number.isFinite(p.y)}))}catch{return {}}});
  useEffect(()=>{try{localStorage.setItem(positionKey,JSON.stringify(radialPositions))}catch{}},[positionKey,radialPositions]);
  const [exporting,setExporting]=useState(false);
  const [rebuilding,setRebuilding]=useState(false);
  const [panning, setPanning] = useState(false);
  const [editCanvas, setEditCanvas] = useState(false);
  useEffect(()=>{const change=(event:Event)=>{const detail=(event as CustomEvent<{project:string;edit:boolean}>).detail;if(detail.project!==project.project||!scroll.current?.closest('.central-window[data-active]'))return;setEditCanvas(detail.edit);setActiveBlock('');setPlacingText(false)};window.addEventListener('noteapp-graph-mode',change);return()=>window.removeEventListener('noteapp-graph-mode',change)},[project.project]);
  useEffect(()=>{if(scroll.current?.closest('.central-window[data-active]'))window.dispatchEvent(new CustomEvent('noteapp-graph-mode-changed',{detail:{project:project.project,edit:editCanvas}}))},[project.project,editCanvas]);
  const [ribbonHidden,setRibbonHidden]=useState(false);
  const [placingText, setPlacingText] = useState(false);
  const [activeBlock, setActiveBlock] = useState('');
  const [rawMapTable,setRawMapTable]=useState('');
  const [settingsBlock,setSettingsBlock]=useState('');
  const [settingsTarget,setSettingsTarget]=useState<HTMLElement|null>(null);
  const [tableSettingsTarget,setTableSettingsTarget]=useState<HTMLDivElement|null>(null);
  const marker = useId();
  const editToolsId = useId();
  const blockEditor = useRef<ReactCodeMirrorRef>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const attachmentPosition = useRef<MapPoint>({x:0,y:0});
  const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const view=scroll.current;
    if(!view||!editCanvas){setSettingsBlock('');return;}
    const select=(event:globalThis.PointerEvent)=>{
      const target=event.target as Element|null;
      if(!target||!view.closest('.central-window[data-active]'))return;
      const element=target.closest<HTMLElement>('[data-node-id^="annotation:"]');
      const next=element&&view.contains(element)?element.dataset.nodeId!.slice('annotation:'.length):'';
      if(settingsBlock!==next){setTableSettingsTarget(null);setSettingsBlock(next)}
    };
    const switchWindow=(event:globalThis.PointerEvent)=>{const target=(event.target as Element|null)?.closest('.central-window');if(target&&target!==view.closest('.central-window'))setSettingsBlock('')};
    view.addEventListener('pointerdown',select,true);
    document.addEventListener('pointerdown',switchWindow,true);
    return()=>{view.removeEventListener('pointerdown',select,true);document.removeEventListener('pointerdown',switchWindow,true)};
  },[editCanvas,project.project,settingsBlock]);
  useEffect(()=>{
    if(!settingsBlock||!editCanvas){setSettingsTarget(null);return;}
    const inspector=scroll.current?.closest('.app')?.querySelector<HTMLElement>('.dock-panel[data-panel="inspector"] .inspector');
    if(!inspector){setSettingsTarget(null);return;}
    const host=document.createElement('section');host.className='note-widget-settings-panel';inspector.append(host);
    inspector.setAttribute('data-note-widget-settings','');setSettingsTarget(host);
    return()=>{inspector.removeAttribute('data-note-widget-settings');host.remove();};
  },[settingsBlock,editCanvas]);
  useEffect(()=>{const app=scroll.current?.closest('.app');if(!app)return;const sync=()=>setExporting(app.hasAttribute('data-png-export'));const observer=new MutationObserver(sync);observer.observe(app,{attributes:true,attributeFilter:['data-png-export']});sync();return()=>observer.disconnect()},[]);
  useLayoutEffect(()=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const elements=canvas.current?.querySelectorAll('.graph-card, .graph-annotation, .graph-edges');
    if(!elements)return;
    const animations=Array.from(elements,(element,index)=>element.animate(
      [{opacity:0},{opacity:1}],
      {duration:230,delay:element.classList.contains('graph-edges')?100:Math.min(Math.max(index-1,0)*28,140),
        easing:'cubic-bezier(.2,.75,.25,1)',fill:'backwards'},
    ));
    return()=>animations.forEach(animation=>animation.cancel());
  },[]);
  const linksMenu = useRef<HTMLDetailsElement>(null);
  const centered = useRef(false);
  const pointer = useRef<Drag|null>(null);
  const moveHistory=useRef<{mode:'graph'|'tree';positions:Record<string,MapPoint>}[]>([]);
  useEffect(()=>{moveHistory.current=[]},[root,project.project]);
  const pan = useRef<{pointer:number; start:MapPoint; origin:MapPoint}|null>(null);
  const selection = useRef<Marquee|null>(null);
  const suppressClick = useRef('');
  const step=gridStep(settings.projectPatterns?.[project.project]);
  const treeDrag=mode==='tree'?drag:null;
  const tree=useMemo(()=>layoutProjectGraph(project, childrenOf, measurements, map.cards, viewport, treeDrag,step,sizing),[project,childrenOf,measurements,map.cards,viewport,treeDrag,step,sizing]);
  const layout=useMemo(()=>mode==='graph'?radialLayout(tree,project,radialPositions,drag,map.cards,sizing):tree,[mode,tree,project,radialPositions,drag,map.cards,sizing]);
  const nodes=layout.nodes;
  const blocks=useMemo(()=>mapBlocks(map),[map]);
  const settingsItem=blocks.find(block=>block.id===settingsBlock);
  const settingsPlot=settingsItem&&/^`{3,}noteapp-plot\n([\s\S]*?)\n`{3,}\s*$/.exec(settingsItem.text);
  const settingsPlotValue=settingsPlot&&featureFromMarkdown('plot',settingsPlot[1]);
  useEffect(()=>{if(settingsBlock&&!settingsItem)setSettingsBlock('')},[settingsBlock,settingsItem]);
  const {endpoints,baseBounds}=useMemo(()=>{
    const bounds={...layout.bounds};
    const endpoints=new Map<string,Endpoint>();
    for(const [id,node] of nodes)endpoints.set(id,{...node,height:mode==='graph'?node.bodyHeight:node.height,name:node.item.name});
    let right=bounds.x+bounds.width, bottom=bounds.y+bounds.height;
    for(const block of blocks){
      const id=mapBlockKey(block.id);
      const original=drag?.moved&&drag.positions[id]?drag.positions[id]:sizing?.id===id?sizing.position:block.position;
      const position=mode==='graph'?original:{x:snapGrid(original.x,step),y:snapGrid(original.y,step)};
      const firstLine=block.text.trimStart().split('\n',1)[0];
      const image=/^!\[([^\]]*)\]\(/.exec(firstLine);
      const link=/^\[(.*)\]\((noteapp-(?:note|map):[\w-]+)\)$/.exec(block.text.trim());
      const name=link?(references.targets.get(link[2])?.name??link[1])
        : image ? 'Фото'+(image[1]?' · '+image[1]:'') : firstLine.trim()||'Текстовый блок';
      const boardAutoSize=block.autoSize??(block.size?.width===704&&block.size?.height===462);
      const boardBlock=boardAutoSize?/^`{3,}noteapp-board\n([\s\S]*?)\n`{3,}\s*$/.exec(block.text):null;
      const boardValue=boardBlock&&featureFromMarkdown('board',boardBlock[1]);
      const boardSize=boardValue&&kanbanWidgetSize(settings.taskBoards?.find(board=>board.id===boardValue.id),boardValue.column,boardValue.taskId);
      const size=dimensions(sizing?.id===id?sizing.size:boardSize?{width:boardSize[0],height:boardHeights[block.id]??boardSize[1]}:block.size??{width:link?340:blockWidth,height:measurements[id]?.height??74},step);
      const height=block.size||sizing?.id===id?size.height:Math.ceil(Math.max(size.height,measurements[id]?.height??0)/step)*step;
      const diameter=Math.max(size.width,height);
      const endpoint={...position,name:link?name:name.slice(0,80),reference:link?.[2],
        width:mode==='graph'?diameter:size.width,height:mode==='graph'?diameter:height};
      endpoints.set(id,endpoint);
      bounds.x=Math.min(bounds.x,position.x-inset);
      bounds.y=Math.min(bounds.y,position.y-inset);
      right=Math.max(right,position.x+endpoint.width+inset);
      bottom=Math.max(bottom,position.y+endpoint.height+inset);
    }
    bounds.width=right-bounds.x;
    bounds.height=bottom-bounds.y;
    return {endpoints,baseBounds:bounds};
  },[layout,nodes,blocks,mode,drag,sizing,step,references.targets,settings.taskBoards,boardHeights,measurements]);
  const bounds={...baseBounds};
  let right=bounds.x+bounds.width,bottom=bounds.y+bounds.height;
  const nodeIds = JSON.stringify([...endpoints.keys()]);
  const notesByPath = useMemo(()=>new Map(notes.map(note => [note.path, note])),[notes]);
  const source = endpoints.get(from);
  const structural = new Map<string,ProjectConnection>();
  for(const [to,node] of nodes){
    if(!node.parent)continue;
    const link={from:keyOf(node.parent),to};
    structural.set(linkKey(link),link);
  }
  const effective=new Map(structural);
  for(const link of map.hiddenConnections??[])effective.delete(linkKey(link));
  for(const link of connections){
    if(endpoints.has(link.from)&&endpoints.has(link.to))effective.set(linkKey(link),link);
  }
  const visible=[...effective.values()];
  const geometry=useMemo(()=>JSON.stringify([...endpoints].map(([id,{x,y,width,height}])=>[id,x,y,width,height,nodes.get(id)?.depth])),[endpoints,nodes]);
  useLayoutEffect(()=>{const focus=(event:Event)=>{const detail=(event as CustomEvent<{project:string;id:string}>).detail;if(detail.project!==project.project||!scroll.current?.closest('.central-window[data-active]'))return;const endpoint=endpoints.get(detail.id),view=scroll.current;if(!endpoint||!view)return;setCamera(current=>({...current,x:view.clientWidth/2-(endpoint.x+endpoint.width/2)*current.zoom,y:view.clientHeight/2-(endpoint.y+endpoint.height/2)*current.zoom}));canvas.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(detail.id)}"]`)?.focus({preventScroll:true})};window.addEventListener('noteapp-focus-map-item',focus);return()=>window.removeEventListener('noteapp-focus-map-item',focus)},[endpoints,project.project]);
  useLayoutEffect(()=>{if(canvas.current)queueNoteWidgetJoinSync(canvas.current,step);},[geometry,step,map]);
  const routeLinks=JSON.stringify(visible.map(link=>[link.from,link.to,structural.has(linkKey(link))]));
  const routes=useMemo(()=>{
    if(mode==='graph'){
      const center=(box:Endpoint)=>({x:box.x+box.width/2,y:box.y+box.height/2});
      const edge=(box:Endpoint,toward:MapPoint)=>{const c=center(box),dx=toward.x-c.x,dy=toward.y-c.y,factor=(box.width/2)/(Math.hypot(dx,dy)||1);return {x:c.x+dx*factor,y:c.y+dy*factor}};
      return new Map(visible.map(link=>{const a=endpoints.get(link.from)!,b=endpoints.get(link.to)!,ac=center(a),bc=center(b),start=edge(a,bc),end=edge(b,ac);
        const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy)||1;
        const bend=Math.min(60,length*.09),control1={x:start.x+dx*.32-dy/length*bend,y:start.y+dy*.32+dx/length*bend},control2={x:start.x+dx*.68-dy/length*bend,y:start.y+dy*.68+dx/length*bend};
        const path=`M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`;
        return [linkKey(link),{points:[start,control1,control2,end],path}] as const;}));
    }
    const boxes=[...endpoints.values()],route=createGraphRouter(boxes,step);
    const families=new Map<string,ProjectConnection[]>();
    for(const link of visible){
      const source=nodes.get(link.from),target=nodes.get(link.to);
      if(!structural.has(linkKey(link))||!source||!target||target.depth!==source.depth+1||target.y<source.y+source.height)continue;
      families.set(link.from,[...(families.get(link.from)??[]),link]);
    }
    const hierarchyRoutes=new Map<string,MapPoint[]>();
    for(const links of families.values()){
      const source=endpoints.get(links[0].from)!;
      const children=links.map(link=>({link,box:endpoints.get(link.to)!})).sort((a,b)=>a.box.x-b.box.x);
      hierarchyBranchRoutes(source,children.map(child=>child.box),step).forEach((points,index)=>{
        const target=children[index].box;
        const blocked=points.length===2&&points[0].x===points[1].x&&boxes.some(box=>box!==source&&box!==target&&points[0].x>box.x&&points[0].x<box.x+box.width&&Math.max(points[0].y,points[1].y)>box.y&&Math.min(points[0].y,points[1].y)<box.y+box.height);
        if(!blocked)hierarchyRoutes.set(linkKey(children[index].link),points);
      });
    }
    const ordered=[...visible].sort((a,b)=>{
      const aSource=nodes.get(a.from),bSource=nodes.get(b.from),aTarget=nodes.get(a.to),bTarget=nodes.get(b.to);
      return (aSource?.depth??Number.MAX_SAFE_INTEGER)-(bSource?.depth??Number.MAX_SAFE_INTEGER)
        ||(aSource?.x??0)-(bSource?.x??0)
        ||(a.from===b.from?(aTarget?.x??0)-(bTarget?.x??0):a.from.localeCompare(b.from));
    });
    return new Map(ordered.map(link=>{const key=linkKey(link),source=nodes.get(link.from),target=nodes.get(link.to),points=hierarchyRoutes.get(key)??route(endpoints.get(link.from)!,endpoints.get(link.to)!,!!source&&!!target&&source.depth!==target.depth);return [key,{points,path:graphRoutePath(points,boxes,step)}] as const}));
  },[geometry,routeLinks,step,mode,camera.zoom<.5,exporting]);
  for(const {points} of routes.values())for(const point of points){bounds.x=Math.min(bounds.x,point.x-12);bounds.y=Math.min(bounds.y,point.y-12);right=Math.max(right,point.x+12);bottom=Math.max(bottom,point.y+12);}
  bounds.width=right-bounds.x;bounds.height=bottom-bounds.y;
  useEffect(()=>{
    const view=scroll.current,root=canvas.current;if(mode!=='graph'||!view||!root||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const active=new Map<string,{offset:number;velocity:number}>();let frame=0;
    const paths=new Map<string,SVGPathElement[]>();root.querySelectorAll<SVGGElement>('[data-graph-edge]').forEach(group=>{const key=group.dataset.graphEdge;if(key)paths.set(key,Array.from(group.querySelectorAll('path')))});
    const tick=()=>{frame=0;for(const [key,state] of active){const route=routes.get(key),elements=paths.get(key);if(!route||route.points.length!==4||!elements){active.delete(key);continue}const [a,b,c,d]=route.points,dx=d.x-a.x,dy=d.y-a.y,length=Math.hypot(dx,dy)||1;state.velocity=(state.velocity-state.offset*.09)*.84;state.offset+=state.velocity;const ox=-dy/length*state.offset,oy=dx/length*state.offset,path=`M ${a.x} ${a.y} C ${b.x+ox} ${b.y+oy}, ${c.x+ox} ${c.y+oy}, ${d.x} ${d.y}`;for(const element of elements)element.setAttribute('d',path);if(Math.abs(state.offset)<.08&&Math.abs(state.velocity)<.08){for(const element of elements)element.setAttribute('d',route.path);active.delete(key)}}if(active.size)frame=requestAnimationFrame(tick)};
    const move=(event:globalThis.PointerEvent)=>{
      if(pointer.current||pan.current)return;
      const rect=view.getBoundingClientRect(),x=(event.clientX-rect.left-camera.x)/camera.zoom,y=(event.clientY-rect.top-camera.y)/camera.zoom,reach=52/camera.zoom;
      let count=0;
      for(const [key,route] of routes){
        if(route.points.length!==4||!paths.has(key))continue;
        const [a,b,c,d]=route.points;
        if(x<Math.min(a.x,b.x,c.x,d.x)-reach||x>Math.max(a.x,b.x,c.x,d.x)+reach||y<Math.min(a.y,b.y,c.y,d.y)-reach||y>Math.max(a.y,b.y,c.y,d.y)+reach)continue;
        let nearest=Infinity,side=1;
        for(let i=2;i<=14;i++){
          const t=i/16,u=1-t,px=u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,py=u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y;
          const distance=Math.hypot(x-px,y-py);
          if(distance<nearest){const dx=u*u*(b.x-a.x)+2*u*t*(c.x-b.x)+t*t*(d.x-c.x),dy=u*u*(b.y-a.y)+2*u*t*(c.y-b.y)+t*t*(d.y-c.y);nearest=distance;side=(x-px)*-dy+(y-py)*dx>=0?-1:1;}
        }
        if(nearest>reach)continue;
        const state=active.get(key)??{offset:0,velocity:0};state.velocity+=side*(1-nearest/reach)*3;active.set(key,state);
        if(++count>=24)break;
      }
      if(active.size&&!frame)frame=requestAnimationFrame(tick);
    };
    view.addEventListener('pointermove',move,{passive:true});return()=>{view.removeEventListener('pointermove',move);if(frame)cancelAnimationFrame(frame)};
  },[mode,routes,camera.x,camera.y,camera.zoom]);
  const maxDepth=Math.max(0,...[...nodes.values()].map(node=>node.depth));
  const selectedBlock=blocks.find(block=>block.id===activeBlock);
  const selectedBlocks=blocks.filter(block=>selectedIds.has(mapBlockKey(block.id)));
  const inView=(id:string,box:Box)=>{
    const view=scroll.current;if(exporting||!view||selectedIds.has(id)||from===id||drag?.positions[id]||sizing?.id===id||comment?.id===id||id===mapBlockKey(activeBlock)||id===mapBlockKey(settingsBlock))return true;
    const pad=400/camera.zoom,left=-camera.x/camera.zoom-pad,top=-camera.y/camera.zoom-pad;
    return box.x+box.width>=left&&box.y+box.height>=top&&box.x<=left+view.clientWidth/camera.zoom+pad*2&&box.y<=top+view.clientHeight/camera.zoom+pad*2;
  };

  function updateBlock(id:string, patch:Partial<Omit<MapBlock,'id'>>) {
    changeBlocks(current=>current.map(block=>block.id===id?{...block,...patch}:block));
  }
  function canvasPoint(x:number,y:number):MapPoint {
    return {x:snapGrid((x-camera.x)/camera.zoom,step),y:snapGrid((y-camera.y)/camera.zoom,step)};
  }
  function canvasPointRaw(x:number,y:number):MapPoint {
    return {x:(x-camera.x)/camera.zoom,y:(y-camera.y)/camera.zoom};
  }
  function pointAt(clientX:number,clientY:number) {
    const rect=scroll.current!.getBoundingClientRect();
    return canvasPoint(clientX-rect.left,clientY-rect.top);
  }
  function insertionPoint() {
    const view=scroll.current!;
    return canvasPoint(Math.max(16,view.clientWidth/2-100*camera.zoom),Math.max(16,view.clientHeight/2-30*camera.zoom));
  }
  function addText(position:MapPoint,text='') {
    const id=crypto.randomUUID();
    changeBlocks(current=>[...current,{id,position,text}]);
    setActiveBlock(id);
    setPlacingText(false);
  }
  function addMapFeature(kind:NoteFeature|'table',options?:{rows?:number;columns?:number;boardId?:string;column?:string;taskId?:string}) {
    let text:string;
    if(kind==='table'){
      const rows=Math.max(1,Math.min(30,Math.floor(options?.rows??1))),columns=Math.max(1,Math.min(16,Math.floor(options?.columns??2)));
      const cells=Array(columns).fill('');
      text=[`| ${cells.join(' | ')} |`,`| ${cells.map(()=>':---').join(' | ')} |`,...Array.from({length:rows},()=>`| ${cells.map(()=>' ').join(' | ')} |`)].join('\n');
    }else{
      const value=featureDefaults(kind);
      if(kind==='board'){value.id=options?.boardId||createTaskBoard();value.column=options?.column;value.taskId=options?.taskId;}
      text=markdownBlock(kind,value);
    }
    const id=crypto.randomUUID(),position=insertionPoint(),boardSize=kind==='board'?kanbanWidgetSize(settings.taskBoards?.find(board=>board.id===options?.boardId),options?.column,options?.taskId):undefined;
    changeBlocks(current=>[...current,{id,position,text,...(kind==='board'?{autoSize:true}:{}),size:{width:kind==='table'?Math.ceil(Math.max(180,(options?.columns??2)*90)/step)*step:boardSize?Math.ceil(boardSize[0]/step)*step:kind==='plot'?660:528,height:kind==='table'?Math.ceil(Math.max(100,((options?.rows??1)+1)*50)/step)*step:boardSize?Math.ceil(boardSize[1]/step)*step:kind==='plot'?484:330}}]);
    setActiveBlock(id);
  }
  function openEndpoint(id:string, endpoint:Endpoint) {
    if(endpoint.item){open(endpoint.item);return;}
    const view=scroll.current!;
    setCamera(current=>({
      ...current,
      x:view.clientWidth/2-(endpoint.x+endpoint.width/2)*current.zoom,
      y:view.clientHeight/2-(endpoint.y+endpoint.height/2)*current.zoom,
    }));
    if(linksMenu.current)linksMenu.current.open=false;
    canvas.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
  }
  const center = () => {
    if(pointer.current||pan.current)return;
    const view = scroll.current, node=nodes.get(keyOf(project));
    if(view&&node)setCamera(current=>({
      ...current, x:view.clientWidth/2-(node.x+node.width/2)*current.zoom, y:mode==='graph'?view.clientHeight/2-(node.y+node.height/2)*current.zoom:inset-node.y*current.zoom,
    }));
  };
  function zoomAt(factor:number, point:MapPoint, reset=false) {
    setCamera(current=>{
      const zoom=Math.max(minZoom,Math.min(maxZoom,reset?1:current.zoom*factor));
      const ratio=zoom/current.zoom;
      return {zoom,x:point.x-(point.x-current.x)*ratio,y:point.y-(point.y-current.y)*ratio};
    });
  }
  function zoomCenter(factor:number, reset=false) {
    const view=scroll.current!;
    if(!pointer.current&&!pan.current)zoomAt(factor,{x:view.clientWidth/2,y:view.clientHeight/2},reset);
  }
  function rebuildMap() {
    if(mode==='graph'){const reset=radialLayout(tree,project,{},null,map.cards,null),node=reset.nodes.get(keyOf(project)),view=scroll.current;setRadialPositions({});if(view&&node)setCamera(current=>({...current,x:view.clientWidth/2-(node.x+node.width/2)*current.zoom,y:view.clientHeight/2-(node.y+node.bodyHeight/2)*current.zoom}));setRebuilding(true);window.setTimeout(()=>setRebuilding(false),800);return;}
    const cards:Record<string,MapCard>=Object.fromEntries(Object.entries(map.cards??{}).map(([id,card])=>[id,{...card,position:undefined}]));
    const arranged=layoutProjectGraph(project,childrenOf,measurements,cards,viewport,null,step,null);
    const nextCards:Record<string,MapCard>={...cards};
    for(const [id,node] of arranged.nodes)nextCards[id]={...nextCards[id],position:{x:node.x,y:node.y}};
    let x=snapGrid(arranged.bounds.x+inset,step),y=snapGrid(Math.max(...[...arranged.nodes.values()].map(node=>node.y+node.height))+gap+step/2,step),rowHeight=0;
    const maxX=arranged.bounds.x+arranged.bounds.width-inset;
    const arrangedBlocks=blocks.map(block=>{
      const id=mapBlockKey(block.id),size=dimensions(block.size??{width:blockWidth,height:measurements[id]?.height??74},step);
      if(x>snapGrid(arranged.bounds.x+inset,step)&&x+size.width>maxX){x=snapGrid(arranged.bounds.x+inset,step);y+=rowHeight+Math.ceil(gap/step)*step;rowHeight=0;}
      const next={...block,position:{x,y}};
      x+=size.width+Math.ceil(gap/step)*step;rowHeight=Math.max(rowHeight,size.height);
      return next;
    });
    setRebuilding(true);
    changeAppearance({cards:nextCards});
    changeBlocks(()=>arrangedBlocks);
    const view=scroll.current;
    if(view)setCamera(current=>({...current,x:view.clientWidth/2-(arranged.bounds.x+arranged.bounds.width/2)*current.zoom,y:view.clientHeight/2-(arranged.bounds.y+arranged.bounds.height/2)*current.zoom}));
    window.setTimeout(()=>setRebuilding(false),(maxDepth+1)*1150+750);
  }
  useLayoutEffect(()=>{
    const view=scroll.current!;
    const measure=()=>setViewport(previous=>previous||view.clientWidth);
    const wheel=(event:WheelEvent)=>{
      if((event.target as Element).closest('textarea, .cm-editor'))return;
      event.preventDefault();
      if(pointer.current||pan.current)return;
      const unit=event.deltaMode===1?16:event.deltaMode===2?view.clientHeight:1;
      if(event.ctrlKey||event.metaKey){
        const bounds=view.getBoundingClientRect();
        zoomAt(Math.exp(-event.deltaY*unit*.002),{x:event.clientX-bounds.left,y:event.clientY-bounds.top});
      }else setCamera(current=>({...current,x:current.x-event.deltaX*unit,y:current.y-event.deltaY*unit}));
    };
    const observer=new ResizeObserver(measure);
    observer.observe(view);
    view.addEventListener('wheel',wheel,{passive:false});
    measure();
    return ()=>{observer.disconnect();view.removeEventListener('wheel',wheel);};
  },[]);
  useLayoutEffect(()=>{
    if(viewport&&!centered.current){centered.current=true;center();}
  },[viewport]);
  useLayoutEffect(()=>{if(viewport)center();},[mode]);
  useLayoutEffect(()=>{
    const observer=new ResizeObserver(entries=>setMeasurements(previous=>{
      const next={...previous};
      let changed=false;
      for(const {target} of entries){
        const element=target as HTMLElement;
        const id=element.dataset.nodeId!;
        const {offsetWidth:width,offsetHeight:height}=element;
        if(previous[id]?.width===width&&previous[id]?.height===height)continue;
        next[id]={width,height};
        changed=true;
      }
      return changed?next:previous;
    }));
    const root=canvas.current!;const observed=new Set<Element>();
    const observe=()=>{const cards=new Set(root.querySelectorAll(':scope > [data-node-id]:not(.graph-dot)'));for(const item of observed)if(!cards.has(item)){observer.unobserve(item);observed.delete(item)}for(const item of cards)if(!observed.has(item)){observer.observe(item);observed.add(item)}};
    const mutation=new MutationObserver(observe);mutation.observe(root,{childList:true});observe();
    return ()=>{mutation.disconnect();observer.disconnect()};
  },[nodeIds,mode]);

  function startMove(event:PointerEvent<HTMLElement>, id:string, position:MapPoint,fromEdge=false) {
    suppressClick.current='';
    const target=event.target as Element;
    if(source||editing||pointer.current||pan.current||event.button!==0||
      target.closest(fromEdge?'.graph-card-actions, .graph-comment':'.graph-card-actions, .graph-comment, .graph-resize'))return;
    if(event.ctrlKey||event.metaKey||event.shiftKey){
      event.preventDefault();event.stopPropagation();
      suppressClick.current=id;
      setSelectedIds(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});
      return;
    }
    if(!selectedIds.has(id))setSelectedIds(new Set([id]));
    scroll.current?.focus({preventScroll:true});
    const ids=selectedIds.has(id)?selectedIds:new Set([id]);
    const positions=Object.fromEntries([...ids].flatMap(key=>{const endpoint=endpoints.get(key);return endpoint?[[key,{x:endpoint.x,y:endpoint.y}]]:[]}));
    if(!positions[id])positions[id]=position;
    pointer.current={id,pointer:event.pointerId,start:{x:event.clientX,y:event.clientY},zoom:camera.zoom,
      origin:position,position,origins:positions,positions,initial:Object.fromEntries([...endpoints].map(([key,value])=>[key,{x:value.x,y:value.y}])),moved:false};
    (event.target as Element).setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent<HTMLElement>) {
    const current=pointer.current;
    if(!current||current.pointer!==event.pointerId)return;
    const dx=(event.clientX-current.start.x)/current.zoom,dy=(event.clientY-current.start.y)/current.zoom;
    if(!current.moved&&Math.hypot(event.clientX-current.start.x,event.clientY-current.start.y)<5)return;
    event.preventDefault();
    const positions={...current.positions,...Object.fromEntries(Object.entries(current.origins).map(([id,origin])=>[id,mode==='graph'?{x:origin.x+dx,y:origin.y+dy}:{x:snapGrid(origin.x+dx,step),y:snapGrid(origin.y+dy,step)}]))};
    if(mode==='graph'){
      const fixed=new Set(Object.keys(current.origins)),queue=[...fixed];
      for(let i=0;i<queue.length&&i<endpoints.size*3;i++){
        const id=queue[i],a=endpoints.get(id),pa=positions[id];if(!a||!pa)continue;
        for(const [otherId,b] of endpoints){if(otherId===id||fixed.has(otherId))continue;const pb=positions[otherId]??{x:b.x,y:b.y},vx=pb.x+b.width/2-pa.x-a.width/2,vy=pb.y+b.height/2-pa.y-a.height/2,distance=Math.hypot(vx,vy),minimum=(a.width+b.width)/2+step;if(distance>=minimum)continue;const ux=distance?vx/distance:1,uy=distance?vy/distance:0;positions[otherId]={x:pb.x+ux*(minimum-distance),y:pb.y+uy*(minimum-distance)};queue.push(otherId)}
      }
    }
    if(Object.keys(positions).length===1&&current.id.startsWith('annotation:')&&canvas.current){
      const element=canvas.current.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(current.id)}"]`),box=endpoints.get(current.id);
      if(element&&box){const {x,y}=snapNoteWidgetPosition(element,{...positions[current.id],width:box.width,height:box.height,z:0},canvas.current,step,true);positions[current.id]={x,y};}
    }
    const position=positions[current.id]??{x:snapGrid(current.origin.x+dx,step),y:snapGrid(current.origin.y+dy,step)};
    pointer.current={...current,position,positions,moved:true};
    setDrag(pointer.current);
  }
  function savePositions(positions:Record<string,MapPoint>) {
    const snapped=Object.fromEntries(Object.entries(positions).map(([id,position])=>[id,mode==='graph'?position:{x:snapGrid(position.x,step),y:snapGrid(position.y,step)}]));
    if(mode==='graph'){setRadialPositions(current=>({...current,...Object.fromEntries(Object.entries(snapped).filter(([id])=>nodes.has(id)))}));}
    const changedCards=Object.fromEntries(Object.entries(snapped).filter(([id])=>mode==='tree'&&nodes.has(id)).map(([id,position])=>[id,{...map.cards?.[id],position}]));
    if(Object.keys(changedCards).length)changeAppearance({cards:{...map.cards,...changedCards}});
    const changedBlocks=new Map(blocks.flatMap(block=>snapped[mapBlockKey(block.id)]?[[block.id,snapped[mapBlockKey(block.id)]]]:[]));
    if(changedBlocks.size)changeBlocks(current=>current.map(block=>changedBlocks.has(block.id)?{...block,position:changedBlocks.get(block.id)!}:block));
  }
  function endMove(event:PointerEvent<HTMLElement>, save?: (positions:Record<string,MapPoint>)=>void) {
    const current=pointer.current;
    if(!current||current.pointer!==event.pointerId)return;
    pointer.current=null;
    setDrag(null);
    if(!current.moved)return;
    suppressClick.current=current.id;
    moveHistory.current.push({mode,positions:Object.fromEntries(Object.keys(current.positions).flatMap(id=>current.initial[id]?[[id,current.initial[id]]]:[]))});
    moveHistory.current=moveHistory.current.slice(-100);
    save?.(current.positions);
  }

  function endPan(event:PointerEvent<HTMLDivElement>) {
    if(pan.current?.pointer!==event.pointerId)return;
    pan.current=null;
    setPanning(false);
  }
  function endSelection(event:PointerEvent<HTMLDivElement>) {
    const current=selection.current;
    if(!current||current.pointer!==event.pointerId)return;
    selection.current=null;setMarquee(null);
    const left=Math.min(current.start.x,current.current.x),right=Math.max(current.start.x,current.current.x);
    const top=Math.min(current.start.y,current.current.y),bottom=Math.max(current.start.y,current.current.y);
    const hits=[...endpoints].filter(([,box])=>box.x+box.width>=left&&box.x<=right&&box.y+box.height>=top&&box.y<=bottom).map(([id])=>id);
    setSelectedIds(new Set(current.additive?[...current.initial,...hits]:hits));
  }

  function cancelLink() { setFrom(''); setLabel(''); }
  function openNodeMenu(event:React.MouseEvent,id:string,item?:ExplorerItem){event.preventDefault();event.stopPropagation();setNodeMenu({id,item,x:event.clientX,y:event.clientY})}
  function connect(to: string) {
    if (!source || to === from) { cancelLink(); return; }
    if (!effective.has(linkKey({from,to})))changeConnection({from,to,label:label.trim()});
    cancelLink();
  }
  const editingValid=editing&&endpoints.has(editing.next.from)&&endpoints.has(editing.next.to)&&editing.next.from!==editing.next.to&&
    (linkKey(editing.previous)===linkKey(editing.next)||!effective.has(linkKey(editing.next)));

  return <div className="project-graph-content" data-linking={!!source||undefined} onKeyDown={event => {
    if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&event.key.toLowerCase()==='z'&&!(event.target as Element).closest('input,textarea,.cm-editor,[contenteditable="true"]')){const previous=moveHistory.current.at(-1);if(previous&&previous.mode===mode){event.preventDefault();event.stopPropagation();moveHistory.current.pop();savePositions(previous.positions)}return}
    const menu=linksMenu.current;
    if(event.key==='Escape'&&menu?.open){
      event.stopPropagation();menu.open=false;menu.querySelector('summary')?.focus();return;
    }
    if(event.key==='Escape'&&(source||editing||comment)){
      event.stopPropagation();cancelLink();setEditing(null);setComment(null);
    }else if(event.key==='Escape'&&(selectedIds.size||selection.current)){
      event.stopPropagation();selection.current=null;setMarquee(null);setSelectedIds(new Set());scroll.current?.focus();
    }else if(event.key==='Escape'&&(placingText||activeBlock)){
      event.stopPropagation();setPlacingText(false);setActiveBlock('');scroll.current?.focus();
    }
  }}>
    <div className="graph-toolbar">
      <div className="graph-instruction" aria-live="polite">{source
        ? <>Из «{source.name}» · выберите объект назначения</>
        : placingText ? 'Щёлкните по свободному месту, чтобы разместить текст.'
        : editCanvas ? 'Добавьте текст или перетащите изображение на карту.'
        : 'Перемещайте элементы левой кнопкой, выделяйте рамкой, а карту двигайте правой кнопкой. Ctrl + колесо меняет масштаб.'}</div>
      {source && <>
        <input aria-label="Подпись стрелки" placeholder="Подпись стрелки" value={label} maxLength={100} onChange={event => setLabel(event.target.value)}/>
        <button className="icon-button" title="Отменить связывание" aria-label="Отменить связывание" onClick={cancelLink}><X size={18}/></button>
      </>}
      <div className="graph-zoom" role="group" aria-label="Масштаб карты">
        <button className="icon-button" title={ribbonHidden?'Показать панель редактирования':'Скрыть панель редактирования'} aria-label={ribbonHidden?'Показать панель редактирования':'Скрыть панель редактирования'} aria-expanded={!ribbonHidden} onClick={()=>setRibbonHidden(value=>!value)}><CaretDown size={16} className={ribbonHidden?'ribbon-collapsed':''}/></button>
        <button className="icon-button" title="Отдалить" aria-label="Отдалить" disabled={camera.zoom===minZoom} onClick={()=>zoomCenter(1/1.25)}><Minus size={18}/></button>
        <button title="Сбросить масштаб" aria-label={`Масштаб ${Math.round(camera.zoom*100)}%. Сбросить масштаб`} onClick={()=>zoomCenter(1,true)}>{Math.round(camera.zoom*100)}%</button>
        <button className="icon-button" title="Приблизить" aria-label="Приблизить" disabled={camera.zoom===maxZoom} onClick={()=>zoomCenter(1.25)}><Plus size={18}/></button>
      </div>
      <button className="icon-button" title="К карточке проекта" aria-label="К карточке проекта" onClick={center}><ArrowsIn size={20}/></button>
      <button className="icon-button" title="Перестроить карту" aria-label="Перестроить карту" disabled={rebuilding} onClick={rebuildMap}><ArrowsClockwise size={18}/></button>
      <button className="graph-notes-toggle" aria-expanded={editCanvas&&!ribbonHidden} aria-controls={editToolsId}
        onClick={()=>{setEditCanvas(!editCanvas);setActiveBlock('');setPlacingText(false);}}>
        <NotePencil size={18}/>Редактирование
      </button>
      {selectedIds.size>0&&<div className="graph-selection-actions" aria-label="Действия с выделенными элементами">
        <span>{selectedIds.size} выбрано</span>
        <button type="button" onClick={()=>setSelectedIds(new Set())}>Снять выбор</button>
        {selectedBlocks.length>0&&<button type="button" className="danger-text" onClick={()=>{
          if(!confirm(`Удалить ${selectedBlocks.length} выбранных блоков с карты?`))return;
          const removed=new Set(selectedBlocks.map(block=>mapBlockKey(block.id)));
          changeBlocks(current=>current.filter(block=>!selectedBlocks.some(selected=>selected.id===block.id)));
          setSelectedIds(current=>new Set([...current].filter(id=>!removed.has(id))));
        }}>Удалить блоки · {selectedBlocks.length}</button>}
      </div>}
      {visible.length > 0 && <details ref={linksMenu} className="graph-links">
        <summary>Связи <span>{visible.length}</span></summary>
        <ul className="graph-connections" aria-label="Связи">
          {visible.map(link => {
            const a = endpoints.get(link.from)!, b = endpoints.get(link.to)!;
            return <li key={linkKey(link)}>
              <button title={b.item?.path || b.name} onClick={() => openEndpoint(link.to,b)}><span>{a.name} <ArrowRight size={14}/> {b.name}{link.label && <small>{link.label}</small>}</span></button>
              <button className="icon-button" title="Изменить стрелку" aria-label={`Изменить связь ${a.name} → ${b.name}`} onClick={()=>{
                cancelLink();setEditing({previous:link,next:link});if(linksMenu.current)linksMenu.current.open=false;
              }}><PencilSimple size={17}/></button>
              <button className="icon-button" title="Удалить стрелку" aria-label={`Удалить связь ${a.name} → ${b.name}`}
                data-delete-link={linkKey(link)} onClick={()=>{
                  (visible.length>1 ? linksMenu.current?.querySelector('summary') : scroll.current)?.focus();
                  changeConnection(null,link,structural.has(linkKey(link)));
                }}><Trash size={17}/></button>
            </li>;
          })}
        </ul>
      </details>}
    </div>
    {editing&&<form className="graph-toolbar graph-link-edit" onSubmit={event=>{
      event.preventDefault();
      if(!editingValid)return;
      changeConnection({...editing.next,label:editing.next.label?.trim()},editing.previous,structural.has(linkKey(editing.previous)));
      setEditing(null);
    }}>
      <label>Откуда<select value={editing.next.from} onChange={event=>setEditing({...editing,next:{...editing.next,from:event.target.value}})}>
        {[...endpoints].map(([id,endpoint])=><option key={id} value={id}>{endpoint.item?.path||endpoint.name}</option>)}
      </select></label>
      <label>Куда<select value={editing.next.to} onChange={event=>setEditing({...editing,next:{...editing.next,to:event.target.value}})}>
        {[...endpoints].map(([id,endpoint])=><option key={id} value={id}>{endpoint.item?.path||endpoint.name}</option>)}
      </select></label>
      <label>Подпись<input value={editing.next.label??''} maxLength={100} onChange={event=>setEditing({...editing,next:{...editing.next,label:event.target.value}})}/></label>
      <button className="primary" type="submit" disabled={!editingValid}>Сохранить</button>
      <button type="button" onClick={()=>setEditing(null)}>Отмена</button>
    </form>}
    <div id={editToolsId} hidden={!editCanvas||ribbonHidden}>
      {editCanvas&&!ribbonHidden&&<MarkdownToolbar disabled={!selectedBlock} runEdit={apply=>{
        const view=blockEditor.current?.view;
        if(view)apply(view);
      }} insertReference={kind=>pickReference(kind,insertionPoint())} insertMapFeature={addMapFeature}
        taskBoards={settings.taskBoards??[]} changeTaskBoard={changeTaskBoard} openTasks={openTasks}
        createWidget={kind=>{
          if(kind==='text'){setPlacingText(true);scroll.current?.focus();}
          else if(kind==='image'){attachmentPosition.current=insertionPoint();fileInput.current?.click();}
          else pickReference('note',insertionPoint());
        }}
        typography={<>
        <FontPicker value={selectedBlock?selectedBlock.fontFamily:map.fontFamily}
          inherited={selectedBlock?'Как на карте':'Как в приложении'}
          change={font=>selectedBlock?updateBlock(selectedBlock.id,{fontFamily:font||undefined}):changeAppearance({fontFamily:font})}/>
        <TextOptions value={selectedBlock??map}
          change={patch=>selectedBlock?updateBlock(selectedBlock.id,patch):changeAppearance(patch)}/>
        </>}/>}
    </div>
    <input type="file" multiple hidden ref={fileInput} accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={event=>{
      const files=Array.from(event.target.files??[]);
      event.target.value='';
      if(files.length)attach(files,attachmentPosition.current);
    }}/>
    <div className="graph-workspace">
    <div ref={scroll} className="graph-scroll" tabIndex={0} aria-label="Карта карточек проекта" data-panning={panning||undefined} data-selecting={marquee||undefined}
      data-placing={placingText||undefined}
      style={{'--grid-x':`${camera.x}px`,'--grid-y':`${camera.y}px`,'--grid-zoom':camera.zoom} as React.CSSProperties}
      onClick={event=>{
        if(placingText&&event.target===event.currentTarget)addText(pointAt(event.clientX,event.clientY));
      }}
      onDragOver={event=>{if(editCanvas&&event.dataTransfer.types.includes('Files'))event.preventDefault();}}
      onDrop={event=>{
        if(!editCanvas||!event.dataTransfer.files.length)return;
        event.preventDefault();
        attach(Array.from(event.dataTransfer.files),pointAt(event.clientX,event.clientY));
      }}
      onPaste={event=>{
        if(!editCanvas)return;
        const files=Array.from(event.clipboardData.files);
        if(files.length){
          event.preventDefault();
          attach(files,insertionPoint());
        }else if(event.target===event.currentTarget){
          const text=event.clipboardData.getData('text/plain');
          if(text){event.preventDefault();addText(insertionPoint(),text);}
        }
      }}
      onPointerDown={event=>{
        if(placingText||event.target!==event.currentTarget||pointer.current||pan.current||selection.current)return;
        if(event.button===2){
          event.preventDefault();pan.current={pointer:event.pointerId,start:{x:event.clientX,y:event.clientY},origin:camera};setPanning(true);event.currentTarget.setPointerCapture(event.pointerId);return;
        }
        if(event.button!==0)return;
        const rect=event.currentTarget.getBoundingClientRect(),start=canvasPointRaw(event.clientX-rect.left,event.clientY-rect.top),additive=event.ctrlKey||event.metaKey||event.shiftKey;
        const gesture={pointer:event.pointerId,start,current:start,initial:additive?[...selectedIds]:[],additive};
        selection.current=gesture;setMarquee(gesture);if(!additive)setSelectedIds(new Set());
        event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event=>{
        if(pointer.current?.pointer===event.pointerId&&event.target===event.currentTarget){move(event);return;}
        const selecting=selection.current;
        if(selecting?.pointer===event.pointerId){const rect=event.currentTarget.getBoundingClientRect(),current=canvasPointRaw(event.clientX-rect.left,event.clientY-rect.top),next={...selecting,current};selection.current=next;setMarquee(next);return;}
        const current=pan.current;
        if(current?.pointer!==event.pointerId)return;
        setCamera(camera=>({...camera,x:current.origin.x+event.clientX-current.start.x,y:current.origin.y+event.clientY-current.start.y}));
      }}
      onPointerUp={event=>{endMove(event,savePositions);endPan(event);endSelection(event);}} onPointerCancel={event=>{endMove(event);endPan(event);if(selection.current?.pointer===event.pointerId){selection.current=null;setMarquee(null);}}} onLostPointerCapture={event=>{endMove(event);endPan(event);if(selection.current?.pointer===event.pointerId){selection.current=null;setMarquee(null);}}}
      onContextMenu={event=>{if(event.target===event.currentTarget)event.preventDefault();}}
      onKeyDown={event=>{
        if(placingText&&event.target===event.currentTarget&&event.key==='Enter'){
          event.preventDefault();addText(insertionPoint());return;
        }
        if(pointer.current||pan.current||event.altKey||event.target!==event.currentTarget||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();
        const dx=event.key==='ArrowLeft'?40:event.key==='ArrowRight'?-40:0;
        const dy=event.key==='ArrowUp'?40:event.key==='ArrowDown'?-40:0;
        setCamera(current=>({...current,x:current.x+dx,y:current.y+dy}));
      }}>
      <div ref={canvas} className="graph-canvas" data-graph-layout={mode} data-dragging={drag?.moved||undefined} data-rebuilding={rebuilding||undefined} style={{transform:`translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,'--graph-text-factor':1+Math.max(0,1-camera.zoom)*.4} as React.CSSProperties}>
        <svg className="graph-edges" aria-hidden="true" width={bounds.width} height={bounds.height}
          viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} style={{left:bounds.x,top:bounds.y}}>
          <defs><marker id={marker} markerWidth="12" markerHeight="12" viewBox="0 0 12 12" markerUnits="userSpaceOnUse" refX="10" refY="6" orient="auto">
            <path d="M3 2L9 6L3 10" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </marker></defs>
          {visible.map(link => {
            const a = endpoints.get(link.from)!, b = endpoints.get(link.to)!;
            const key = linkKey(link);
            const route = routes.get(key);
            if(!route?.path)return null;
            const level=Math.max(nodes.get(link.from)?.depth??maxDepth+1,nodes.get(link.to)?.depth??maxDepth+1);
            const projectPalette=nodes.get(link.to)?.item.project??nodes.get(link.from)?.item.project;
            return <g key={key} data-graph-edge={key} className={`graph-arrow${mode==='graph'&&project.project===':all-projects:'?` palette-${paletteId(settings.projectPalettes?.[projectPalette??'']??settings.palette)}`:''}`} onClick={() => {
              const menu=linksMenu.current;
              if(!menu)return;
              menu.open=true;
              menu.querySelector<HTMLButtonElement>(`[data-delete-link="${CSS.escape(key)}"]`)?.focus();
            }}>
              <title>{a.name} → {b.name}{link.label ? ' · ' + link.label : ''}</title>
              <path d={route.path} fill="none" stroke="transparent" strokeWidth="14"/>
            <path className="graph-route" d={route.path} pathLength={1} style={{'--route-delay':`${structural.has(key)&&nodes.get(link.to)!.depth>nodes.get(link.from)!.depth?Math.max(0,nodes.get(link.to)!.depth*1150-650):level*1150+500}ms`} as React.CSSProperties} fill="none" stroke={mode==='graph'&&project.project===':all-projects:'?'var(--swatch-color,var(--palette-hue))':'var(--accent)'} strokeWidth={mode==='graph'?2:1.8} strokeLinecap="round" strokeLinejoin="round" markerEnd={mode==='tree'?`url(#${marker})`:undefined}/>
            </g>;
          })}
        </svg>
        {[...nodes].map(([id, node]) => {
          if(!inView(id,node))return null;
          const {item, parent, children, width, bodyHeight, x, y} = node;
          if(mode==='graph'&&camera.zoom<.5&&!exporting&&comment?.id!==id){
            return <button key={id} type="button" data-node-id={id} data-selected={selectedIds.has(id)||undefined} data-link-source={from===id||undefined} className={`graph-dot palette-${paletteId(settings.projectPalettes?.[item.project]??settings.palette)}`} title={item.name} aria-label={`Открыть «${item.name}»`} style={{left:x,top:y,width,height:bodyHeight}} onContextMenu={event=>openNodeMenu(event,id,item)} onPointerDown={event=>startMove(event,id,node)} onPointerMove={move} onPointerUp={event=>endMove(event,savePositions)} onPointerCancel={endMove} onClick={()=>{if(suppressClick.current===id){suppressClick.current='';return}if(source)connect(id);else open(item)}}/>;
          }
          const isNote = item.kind === 'note';
          const duplicate = !!source && effective.has(linkKey({from,to:id}));
          const comments=map.cards?.[id]?.comments??[];
          const commentOpen=comment?.id===id;
          const summary = item.path.endsWith('.canvas') ? 'Полотно' : isNote ? noteExcerpt(notesByPath.get(item.path)) :
            children.length ? children.slice(0, 4).map(child => child.name).join(' · ') + (children.length > 4 ? ' · …' : '') : 'Пока пусто';
          return <article key={id} className={`project-card graph-card graph-card-${item.kind}${mode==='graph'?` palette-${paletteId(settings.projectPalettes?.[item.project]??settings.palette)}`:textureById(map.cards?.[id]?.texture)?` palette-${map.cards![id].texture}`:''}`} data-node-id={id} data-depth={node.depth} data-palette-blend={mode==='graph'?(settings.projectPalettes?.[item.project]?settings.projectPaletteBlends?.[item.project]:settings.paletteBlend)??'':undefined}
            onDragOver={event=>{if(event.dataTransfer.types.includes(paletteDragType))event.preventDefault();}}
            onDrop={event=>{const value=readPaletteDrop(event.dataTransfer.getData(paletteDragType));if(value&&textureById(value.palette)){event.preventDefault();event.stopPropagation();updateCard(id,{texture:value.palette});}}}
            onContextMenu={event=>openNodeMenu(event,id,item)}
            data-link-source={source && from === id ? true : undefined}
            data-moving={drag?.positions[id]!==undefined||undefined} data-selected={selectedIds.has(id)||undefined} data-comment-open={commentOpen||undefined}
            style={{left:x, top:y, width,'--rebuild-delay':`${node.depth*1150}ms`} as React.CSSProperties}
            onClickCapture={event=>{
              if(suppressClick.current===id&&event.detail!==0){
                suppressClick.current='';event.preventDefault();event.stopPropagation();return;
              }
              if(!source)return;
              if((event.target as Element).closest('.graph-resize'))return;
              event.preventDefault();event.stopPropagation();if(!duplicate)connect(id);
            }}
            onPointerDown={event=>startMove(event,id,node)} onPointerMove={move}
            onPointerUp={event=>endMove(event,savePositions)} onPointerCancel={endMove}
            onLostPointerCapture={event=>{if(!scroll.current?.hasPointerCapture(event.pointerId))endMove(event);}}>
            <div className="project-open" style={{height:bodyHeight}}>
              <CardFace heading={<button className="graph-card-title" type="button" title={item.path || item.name} disabled={duplicate}
              aria-label={source ? from === id ? 'Отменить связывание' : `Провести стрелку к «${item.name}»` : `Открыть «${item.name}»`}
              aria-keyshortcuts="Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
              onKeyDown={event=>{
                if(!event.shiftKey||source||editing||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
                event.preventDefault();event.stopPropagation();
                const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0;
                const dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
                moveHistory.current.push({mode,positions:{[id]:{x,y}}});moveHistory.current=moveHistory.current.slice(-100);
                if(mode==='graph')setRadialPositions(current=>({...current,[id]:{x:x+dx,y:y+dy}}));else updateCard(id,{position:{x:x+dx,y:y+dy}});
              }}
              onClick={event=>{
                if(suppressClick.current===id&&event.detail!==0){suppressClick.current='';return;}
                if(source)connect(id);else open(item);
              }}><ObjectIcon item={item} icons={settings.objectIcons} size={18}/><span>{item.name}</span></button>}
                path={project.project===':all-projects:' ? (settings.projectBackgrounds?.[item.project]??null) : isNote || item.kind === 'project' ? cover : null} root={root}>
                <span className="graph-card-context">{parent ? parent.name : 'Проект'}</span>
                <span className="graph-card-summary">{summary}</span>
              </CardFace>
            </div>
            {commentOpen&&comments.map((text,index)=>comment.index!==index&&<div className="graph-comment graph-comment-saved" key={index}>
              <p>{text}</p>
              <div>
                <button className="icon-button" type="button" title="Изменить комментарий" aria-label={`Изменить комментарий ${index+1}`}
                  onClick={()=>setComment({id,index,text})}><PencilSimple size={15}/></button>
                <button className="icon-button" type="button" title="Удалить комментарий" aria-label={`Удалить комментарий ${index+1}`}
                  onClick={()=>{if(commentOpen)setComment(null);updateCard(id,{comments:comments.filter((_,i)=>i!==index)});}}><Trash size={15}/></button>
              </div>
            </div>)}
            {commentOpen && <form className="graph-comment" onSubmit={event=>{
              event.preventDefault();
              const text=comment.text.trim();
              if(!text)return;
              const next=[...comments];
              next[comment.index??next.length]=text;
              updateCard(id,{comments:next});
              setComment(null);
            }}>
              <textarea autoFocus rows={3} maxLength={4000} aria-label="Комментарий к карточке"
                placeholder="Комментарий к карточке" value={comment.text}
                onChange={event=>setComment({...comment,text:event.target.value})}/>
              <div><button className="primary" type="submit" disabled={!comment.text.trim()}>Сохранить</button>
                <button type="button" onClick={()=>setComment(null)}>Отмена</button></div>
            </form>}
            <ResizeHandle label={`Размер карточки «${item.name}»`} size={{width,height:bodyHeight}} position={{x,y}} step={step} zoom={camera.zoom}
              draft={value=>setSizing(value?{id,...value}:null)} save={(size,position)=>{if(mode==='graph'){setRadialPositions(current=>({...current,[id]:position}));updateCard(id,{size})}else updateCard(id,{size,position})}}/>
          </article>;
        })}
        {blocks.map(block=>{
          const dragId=mapBlockKey(block.id);
          const moving=drag?.positions[dragId]!==undefined&&drag.moved;
          const position=endpoints.get(dragId)!;
          if(!inView(dragId,position))return null;
          const active=editCanvas&&activeBlock===block.id;
          if(mode==='graph'&&camera.zoom<.5&&!exporting&&!active&&settingsBlock!==block.id){
            return <button key={block.id} type="button" data-node-id={dragId} data-selected={selectedIds.has(dragId)||undefined} data-link-source={from===dragId||undefined} className={`graph-dot palette-${paletteId(settings.projectPalettes?.[project.project]??settings.palette)}`} onContextMenu={event=>openNodeMenu(event,dragId)} title={position.name} aria-label={`Объект «${position.name}»`} style={{left:position.x,top:position.y,width:position.width,height:position.height}} onPointerDown={event=>startMove(event,dragId,position)} onPointerMove={move} onPointerUp={event=>endMove(event,savePositions)} onPointerCancel={endMove} onClick={()=>{if(suppressClick.current===dragId){suppressClick.current='';return}if(source)connect(dragId);else if(position.reference)references.open(position.reference)}}/>;
          }
          const font=validFont(block.fontFamily)||validFont(map.fontFamily);
          const duplicate=!!source&&effective.has(linkKey({from,to:dragId}));
          const feature=/^`{3,}noteapp-(compare|source|concept|math|plot|board)\n([\s\S]*?)\n`{3,}\s*$/.exec(block.text);
          const featureValue=feature&&featureFromMarkdown(feature[1],feature[2]);
          const table=standaloneMapTable(block.text);
          const image=/^!\[[^\]]*\]\([^\n]+\)\s*$/.test(block.text);
          return <article key={block.id} className={`graph-annotation${featureValue||table?' note-feature-widget':''}${table?' graph-table-annotation':''}${image?' graph-image-annotation':''}${textureById(block.texture)?` palette-${block.texture}`:''}`} data-active={active||undefined} data-reference={!!position.reference||undefined} data-note-widget-selected={settingsBlock===block.id&&!!settingsTarget||undefined}
            onDragOver={event=>{if(event.dataTransfer.types.includes(paletteDragType))event.preventDefault();}}
            onDrop={event=>{const value=readPaletteDrop(event.dataTransfer.getData(paletteDragType));if(value&&textureById(value.palette)){event.preventDefault();event.stopPropagation();updateBlock(block.id,{texture:value.palette});}}}
            onContextMenu={event=>openNodeMenu(event,dragId)} data-node-id={dragId} data-depth={maxDepth+1} tabIndex={-1} data-link-source={from===dragId||undefined}
            data-moving={moving||undefined} data-selected={selectedIds.has(dragId)||undefined} style={{left:position.x,top:position.y,width:position.width,minWidth:0,maxWidth:'none',minHeight:position.height,'--rebuild-delay':`${(maxDepth+1)*1150}ms`,
              height:mode==='graph'||block.size||sizing?.id===dragId?position.height:undefined,fontFamily:font?fontStack(font):undefined} as React.CSSProperties}
            onClickCapture={event=>{
              if(suppressClick.current===dragId&&event.detail!==0){
                suppressClick.current='';event.preventDefault();event.stopPropagation();return;
              }
              if(!source)return;
              if((event.target as Element).closest('.graph-resize'))return;
              event.preventDefault();event.stopPropagation();if(!duplicate)connect(dragId);
            }}
            onClick={event=>{
              if(suppressClick.current===dragId&&event.detail!==0){suppressClick.current='';event.preventDefault();event.stopPropagation();return;}
              if(!source&&!active&&position.reference&&!(event.target as Element).closest('button, summary, .graph-widget-menu')){
                references.open(position.reference);
              }
            }}>
            <header>
              <button type="button" className="graph-annotation-handle" title="Переместить блок"
                aria-label="Переместить блок" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                 onPointerDown={event=>startMove(event,dragId,position)} onPointerMove={move}
                 onPointerUp={event=>endMove(event,savePositions)} onPointerCancel={endMove}
                 onLostPointerCapture={event=>{if(!scroll.current?.hasPointerCapture(event.pointerId))endMove(event);}}
                onKeyDown={event=>{
                  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
                  event.preventDefault();event.stopPropagation();
                  const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0;
                  const dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
                  moveHistory.current.push({mode,positions:{[dragId]:{x:position.x,y:position.y}}});moveHistory.current=moveHistory.current.slice(-100);
                  updateBlock(block.id,{position:{x:position.x+dx,y:position.y+dy}});
                }}><DotsSixVertical size={16}/></button>
              {editCanvas&&
                <button type="button" className="icon-button" title={active?'Готово':'Правка блока'} aria-label={active?'Готово':'Правка блока'}
                  onClick={()=>{setRawMapTable('');setActiveBlock(active?'':block.id)}}>{active?<Check size={16}/>:<PencilSimple size={16}/>}</button>}
              <details className="graph-widget-menu" onKeyDown={event=>{
                if(event.key!=='Escape'||!event.currentTarget.open)return;
                event.stopPropagation();
                event.currentTarget.open=false;
                event.currentTarget.querySelector('summary')?.focus();
              }}>
                <summary title="Действия с блоком" aria-label="Действия с блоком"><DotsThree size={18}/></summary>
                <div>
                  {editCanvas&&feature?.[1]==='plot'&&featureValue&&<label>Цвет графика <input type="color" value={/^#[0-9a-f]{6}$/i.test(featureValue.plotColor??'')?featureValue.plotColor:'#96a6b6'} onChange={event=>updateBlock(block.id,{text:markdownBlock('plot',{...featureValue,plotColor:event.target.value})})}/></label>}
                  <button type="button" aria-label={`Удалить блок «${position.name}»`} onClick={()=>{
                    if(active)setActiveBlock('');
                    if(from===dragId)cancelLink();
                    changeBlocks(current=>current.filter(item=>item.id!==block.id));
                    scroll.current?.focus();
                  }}><Trash size={16}/>Удалить блок</button>
                </div>
              </details>
            </header>
            <div onPointerDown={image&&editCanvas?event=>startMove(event,dragId,position):undefined} onPointerMove={image?move:undefined} onPointerUp={image?event=>endMove(event,savePositions):undefined} onPointerCancel={image?endMove:undefined} className={`graph-annotation-content${featureValue||table?' note-widget-body':''}`} style={{
              ...textAppearanceStyle({lineHeight:block.lineHeight??map.lineHeight,textColor:block.textColor??map.textColor}),
              ...(font&&{'--body-font':fontStack(font)}),
            } as React.CSSProperties}>
              {feature&&featureValue?<FittedWidget baseWidth={featureBaseWidth(feature[1] as NoteFeature,settings.taskBoards?.find(board=>board.id===featureValue.id),featureValue.column,featureValue.taskId)}><FeatureCard key={block.id} kind={feature[1] as NoteFeature} value={featureValue} editable={editCanvas} notes={notes} boards={settings.taskBoards??[]} changeBoard={changeTaskBoard} openNote={openLink} onBoardHeight={(block.autoSize??(block.size?.width===704&&block.size?.height===462))?height=>setBoardHeights(current=>{const next=height+48;return current[block.id]===next?current:{...current,[block.id]:next}}):undefined} save={value=>updateBlock(block.id,{text:markdownBlock(feature[1] as NoteFeature,value)})}/></FittedWidget>:table&&rawMapTable!==block.id?editCanvas?<MapTable source={block.text} save={text=>{const host=Array.from(scroll.current?.querySelectorAll<HTMLElement>('.graph-annotation')??[]).find(node=>node.dataset.nodeId===dragId)??null,[minWidth,minHeight]=tableMinimumSize(host);updateBlock(block.id,{text,size:{width:Math.max(position.width,Math.ceil(minWidth/step)*step),height:Math.max(position.height,Math.ceil(minHeight/step)*step)}})}} markdown={()=>{setRawMapTable(block.id);setActiveBlock(block.id)}} menuTarget={settingsBlock===block.id?tableSettingsTarget??undefined:undefined}/>:<ReadingTable source={block.text}/>:<Editor references={references} note={{path:mapNotesPath,content:block.text,revision:''}} notes={notes} read={!active} floatingText={false}
                light={settings.theme==='light'} autoFocus={active} editorRef={blockEditor}
                onChange={text=>updateBlock(block.id,{text})} onLink={openLink}/>}
              {!active&&!block.text&&<p className="subtle">Пустой блок</p>}
            </div>
            <ResizeHandle label={`Размер блока «${position.name}»`} size={{width:position.width,height:position.height}} position={position} step={step} zoom={camera.zoom} moveEdges={table?{start:event=>startMove(event,dragId,position,true),move,end:event=>endMove(event,savePositions),key:(dx,dy)=>updateBlock(block.id,{position:{x:position.x+dx,y:position.y+dy}})}:undefined}
              draft={value=>setSizing(value?{id:dragId,...value}:null)} save={(size,nextPosition)=>updateBlock(block.id,{size,position:nextPosition,...(feature?.[1]==='board'?{autoSize:false}:{})})}/>
          </article>;
        })}
        {marquee&&<div className="graph-selection-box" style={{left:Math.min(marquee.start.x,marquee.current.x),top:Math.min(marquee.start.y,marquee.current.y),width:Math.abs(marquee.current.x-marquee.start.x),height:Math.abs(marquee.current.y-marquee.start.y)}}/>}
      </div>
    </div>
    </div>
    {settingsTarget&&settingsItem&&createPortal(<>
      <strong>Настройки виджета</strong>
      <div className="graph-widget-settings-controls">
        <button type="button" onClick={()=>{setRawMapTable('');setActiveBlock(activeBlock===settingsItem.id?'':settingsItem.id)}}>{activeBlock===settingsItem.id?'Готово':'Правка блока'}</button>
        <button type="button" onClick={()=>{if(activeBlock===settingsItem.id)setActiveBlock('');if(from===mapBlockKey(settingsItem.id))cancelLink();changeBlocks(current=>current.filter(item=>item.id!==settingsItem.id));setSettingsBlock('')}}>Удалить блок</button>
      </div>
      {settingsPlotValue&&<label>Цвет графика <input type="color" value={/^#[0-9a-f]{6}$/i.test(settingsPlotValue.plotColor??'')?settingsPlotValue.plotColor:'#96a6b6'} onChange={event=>updateBlock(settingsItem.id,{text:markdownBlock('plot',{...settingsPlotValue,plotColor:event.target.value})})}/></label>}
      {standaloneMapTable(settingsItem.text)&&rawMapTable!==settingsItem.id&&<div key={settingsItem.id} ref={setTableSettingsTarget} className="note-insert-actions"/>}
    </>,settingsTarget)}
    {nodeMenu&&createPortal(<><div className="graph-context-dismiss" onPointerDown={()=>setNodeMenu(null)} onContextMenu={event=>{event.preventDefault();setNodeMenu(null)}}/><div className="graph-context-menu" role="menu" style={{left:Math.max(0,Math.min(nodeMenu.x,window.innerWidth-220)),top:Math.max(0,Math.min(nodeMenu.y,window.innerHeight-150))}}><button type="button" role="menuitem" disabled={!!editing||endpoints.size<2} onClick={()=>{source?connect(nodeMenu.id):setFrom(nodeMenu.id);setNodeMenu(null)}}>{source?(from===nodeMenu.id?'Отменить связывание':'Связать с этим объектом'):'Начать связь'}</button>{nodeMenu.item&&<button type="button" role="menuitem" onClick={()=>{setComment({id:nodeMenu.id,text:''});setNodeMenu(null)}}>Комментарии…</button>}{nodeMenu.item&&<button type="button" role="menuitem" onClick={event=>{showMenu(event,nodeMenu.item!);setNodeMenu(null)}}>Другие действия…</button>}</div></>,scroll.current?.closest('.app')??document.body)}
  </div>;
}
