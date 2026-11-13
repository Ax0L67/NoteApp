import {useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent} from 'react';
import {ArrowRight, ArrowsClockwise, ArrowsIn, ArrowsOutCardinal, ChatText, Check, FileText, Folder, Link, Minus, NotePencil, PencilSimple, Plus, Stack, Trash, X} from '@phosphor-icons/react';
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
import {CardFace,paletteDragType,readPaletteDrop} from './appearance';
import {textureById} from './textures';
import {FeatureCard,featureDefaults,featureFromMarkdown,featureBaseWidth,markdownBlock,type NoteFeature} from './noteFeatureBlocks';
import {FittedWidget} from './widgetFit';
import {queueNoteWidgetJoinSync,snapNoteWidgetPosition} from './noteWidgetChrome';
import {MapTable,standaloneMapTable} from './noteTables';
import type {ExplorerItem} from './Explorer';
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
type Dimensions = {width:number;height:number};
type Sizing={id:string;size:Dimensions;position:MapPoint};
type Box = MapPoint & Dimensions;
type Endpoint = Box & {name:string; item?:ExplorerItem; reference?:string};
type Drag = {id:string; pointer:number; start:MapPoint; zoom:number; origin:MapPoint; position:MapPoint; origins:Record<string,MapPoint>; positions:Record<string,MapPoint>; moved:boolean};
type Camera = MapPoint & {zoom:number};
type Marquee={pointer:number;start:MapPoint;current:MapPoint;initial:string[];additive:boolean};
const initialCamera: Camera = {x:0, y:0, zoom:1};
const minZoom = .25, maxZoom = 2.5;

const resizeEdges=['n','e','s','w','ne','nw','se','sw'] as const;
function ResizeHandle({label,size,position,step,zoom,draft,save}:{label:string;size:Dimensions;position:MapPoint;step:number;zoom:number;draft:(value:{size:Dimensions;position:MapPoint}|null)=>void;save:(size:Dimensions,position:MapPoint)=>void}) {
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
    onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();gesture.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,size,position,nextSize:size,nextPosition:position};event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={event=>{const current=gesture.current;if(!current||current.pointer!==event.pointerId)return;event.stopPropagation();const next=resize(edge,(event.clientX-current.x)/zoom,(event.clientY-current.y)/zoom,current.size,current.position);current.nextSize=next.size;current.nextPosition=next.position;draft(next);}}
    onPointerUp={event=>{const current=gesture.current;if(!current||current.pointer!==event.pointerId)return;event.stopPropagation();gesture.current=null;draft(null);save(current.nextSize,current.nextPosition);}}
    onPointerCancel={()=>{gesture.current=null;draft(null);}}
    onLostPointerCapture={()=>{if(gesture.current){gesture.current=null;draft(null);}}}
    onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0,next=resize(edge,dx,dy,size,position);save(next.size,next.position)}}>
    </button>)}</>;
}

export default function ProjectGraph({project, notes, childrenOf, settings, root, cover, connections, map, open, changeConnection, updateCard,
  changeBlocks, changeAppearance, attach, openLink, references, pickReference, showMenu, changeTaskBoard, createTaskBoard, openTasks}: {
  project: ExplorerItem;
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
  const [viewport, setViewport] = useState(0);
  const [measurements,setMeasurements]=useState<Record<string,Dimensions>>({});
  const [drag, setDrag] = useState<Drag|null>(null);
  const [selectedIds,setSelectedIds]=useState<Set<string>>(()=>new Set());
  const [marquee,setMarquee]=useState<Marquee|null>(null);
  const [sizing,setSizing]=useState<Sizing|null>(null);
  const [camera, setCamera] = useState(initialCamera);
  const [rebuilding,setRebuilding]=useState(false);
  const [panning, setPanning] = useState(false);
  const [editCanvas, setEditCanvas] = useState(false);
  const [placingText, setPlacingText] = useState(false);
  const [activeBlock, setActiveBlock] = useState('');
  const [rawMapTable,setRawMapTable]=useState('');
  const marker = useId();
  const editToolsId = useId();
  const blockEditor = useRef<ReactCodeMirrorRef>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const attachmentPosition = useRef<MapPoint>({x:0,y:0});
  const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
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
  const pan = useRef<{pointer:number; start:MapPoint; origin:MapPoint}|null>(null);
  const selection = useRef<Marquee|null>(null);
  const suppressClick = useRef('');
  const step=gridStep(settings.projectPatterns?.[project.project]);
  const {nodes, bounds} = layoutProjectGraph(project, childrenOf, measurements, map.cards, viewport, drag,step,sizing);
  const blocks=mapBlocks(map);
  const endpoints=new Map<string,Endpoint>();
  for(const [id,node] of nodes)endpoints.set(id,{...node,name:node.item.name});
  let right=bounds.x+bounds.width, bottom=bounds.y+bounds.height;
  for(const block of blocks){
    const id=mapBlockKey(block.id);
    const original=drag?.moved&&drag.positions[id]?drag.positions[id]:sizing?.id===id?sizing.position:block.position;
    const position={x:snapGrid(original.x,step),y:snapGrid(original.y,step)};
    const firstLine=block.text.trimStart().split('\n',1)[0];
    const image=/^!\[([^\]]*)\]\(/.exec(firstLine);
    const link=/^\[(.*)\]\((noteapp-(?:note|map):[\w-]+)\)$/.exec(block.text.trim());
    const name=link?(references.targets.get(link[2])?.name??link[1])
      : image ? 'Фото'+(image[1]?' · '+image[1]:'') : firstLine.trim()||'Текстовый блок';
    const size=dimensions(sizing?.id===id?sizing.size:block.size??{width:link?340:blockWidth,height:measurements[id]?.height??74},step);
    const endpoint={...position,name:link?name:name.slice(0,80),reference:link?.[2],
      width:size.width,height:block.size||sizing?.id===id?size.height:Math.ceil(Math.max(size.height,measurements[id]?.height??0)/step)*step};
    endpoints.set(id,endpoint);
    bounds.x=Math.min(bounds.x,position.x-inset);
    bounds.y=Math.min(bounds.y,position.y-inset);
    right=Math.max(right,position.x+endpoint.width+inset);
    bottom=Math.max(bottom,position.y+endpoint.height+inset);
  }
  bounds.width=right-bounds.x;
  bounds.height=bottom-bounds.y;
  const nodeIds = JSON.stringify([...endpoints.keys()]);
  const notesByPath = new Map(notes.map(note => [note.path, note]));
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
  const geometry=JSON.stringify([...endpoints].map(([id,{x,y,width,height}])=>[id,x,y,width,height,nodes.get(id)?.depth]));
  useLayoutEffect(()=>{if(canvas.current)queueNoteWidgetJoinSync(canvas.current,step);},[geometry,step]);
  const routeLinks=JSON.stringify(visible.map(link=>[link.from,link.to,structural.has(linkKey(link))]));
  const routes=useMemo(()=>{
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
  },[geometry,routeLinks,step]);
  for(const {points} of routes.values())for(const point of points){bounds.x=Math.min(bounds.x,point.x-12);bounds.y=Math.min(bounds.y,point.y-12);right=Math.max(right,point.x+12);bottom=Math.max(bottom,point.y+12);}
  bounds.width=right-bounds.x;bounds.height=bottom-bounds.y;
  const maxDepth=Math.max(0,...[...nodes.values()].map(node=>node.depth));
  const selectedBlock=blocks.find(block=>block.id===activeBlock);
  const selectedBlocks=blocks.filter(block=>selectedIds.has(mapBlockKey(block.id)));

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
  function addMapFeature(kind:NoteFeature|'table',options?:{rows?:number;columns?:number;boardId?:string}) {
    let text:string;
    if(kind==='table'){
      const rows=Math.max(1,Math.min(30,Math.floor(options?.rows??3))),columns=Math.max(1,Math.min(16,Math.floor(options?.columns??3)));
      const cells=Array.from({length:columns},(_,i)=>`Столбец ${i+1}`);
      text=[`| ${cells.join(' | ')} |`,`| ${cells.map(()=>':---').join(' | ')} |`,...Array.from({length:rows},()=>`| ${cells.map(()=>' ').join(' | ')} |`)].join('\n');
    }else{
      const value=featureDefaults(kind);
      if(kind==='board')value.id=options?.boardId||createTaskBoard();
      text=markdownBlock(kind,value);
    }
    const id=crypto.randomUUID(),position=insertionPoint();
    changeBlocks(current=>[...current,{id,position,text,size:{width:kind==='table'||kind==='board'?704:kind==='plot'?660:528,height:kind==='plot'?484:kind==='board'?462:330}}]);
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
      ...current, x:view.clientWidth/2-(node.x+node.width/2)*current.zoom, y:inset-node.y*current.zoom,
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
    for(const card of canvas.current!.querySelectorAll('[data-node-id]'))observer.observe(card);
    return ()=>observer.disconnect();
  },[nodeIds]);

  function startMove(event:PointerEvent<HTMLElement>, id:string, position:MapPoint) {
    suppressClick.current='';
    const target=event.target as Element;
    if(source||editing||pointer.current||pan.current||event.button!==0||
      target.closest('.graph-card-title, .graph-card-actions, .graph-comment, .graph-resize'))return;
    if(event.ctrlKey||event.metaKey||event.shiftKey){
      event.preventDefault();event.stopPropagation();
      suppressClick.current=id;
      setSelectedIds(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});
      return;
    }
    if(!selectedIds.has(id))setSelectedIds(new Set([id]));
    const ids=selectedIds.has(id)?selectedIds:new Set([id]);
    const positions=Object.fromEntries([...ids].flatMap(key=>{const endpoint=endpoints.get(key);return endpoint?[[key,{x:endpoint.x,y:endpoint.y}]]:[]}));
    if(!positions[id])positions[id]=position;
    pointer.current={id,pointer:event.pointerId,start:{x:event.clientX,y:event.clientY},zoom:camera.zoom,
      origin:position,position,origins:positions,positions,moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent<HTMLElement>) {
    const current=pointer.current;
    if(!current||current.pointer!==event.pointerId)return;
    const dx=(event.clientX-current.start.x)/current.zoom,dy=(event.clientY-current.start.y)/current.zoom;
    if(!current.moved&&Math.hypot(event.clientX-current.start.x,event.clientY-current.start.y)<5)return;
    event.preventDefault();
    const positions=Object.fromEntries(Object.entries(current.origins).map(([id,origin])=>[id,{x:snapGrid(origin.x+dx,step),y:snapGrid(origin.y+dy,step)}]));
    if(Object.keys(positions).length===1&&current.id.startsWith('annotation:')&&canvas.current){
      const element=canvas.current.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(current.id)}"]`),box=endpoints.get(current.id);
      if(element&&box){const {x,y}=snapNoteWidgetPosition(element,{...positions[current.id],width:box.width,height:box.height,z:0},canvas.current,step);positions[current.id]={x,y};}
    }
    const position=positions[current.id]??{x:snapGrid(current.origin.x+dx,step),y:snapGrid(current.origin.y+dy,step)};
    pointer.current={...current,position,positions,moved:true};
    setDrag(pointer.current);
  }
  function savePositions(positions:Record<string,MapPoint>) {
    const snapped=Object.fromEntries(Object.entries(positions).map(([id,position])=>[id,{x:snapGrid(position.x,step),y:snapGrid(position.y,step)}]));
    const changedCards=Object.fromEntries(Object.entries(snapped).filter(([id])=>nodes.has(id)).map(([id,position])=>[id,{...map.cards?.[id],position}]));
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
  function connect(to: string) {
    if (!source || to === from) { cancelLink(); return; }
    if (!effective.has(linkKey({from,to})))changeConnection({from,to,label:label.trim()});
    cancelLink();
  }
  const editingValid=editing&&endpoints.has(editing.next.from)&&endpoints.has(editing.next.to)&&editing.next.from!==editing.next.to&&
    (linkKey(editing.previous)===linkKey(editing.next)||!effective.has(linkKey(editing.next)));

  return <div className="project-graph-content" data-linking={!!source||undefined} onKeyDown={event => {
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
        <button className="icon-button" title="Отдалить" aria-label="Отдалить" disabled={camera.zoom===minZoom} onClick={()=>zoomCenter(1/1.25)}><Minus size={18}/></button>
        <button title="Сбросить масштаб" aria-label={`Масштаб ${Math.round(camera.zoom*100)}%. Сбросить масштаб`} onClick={()=>zoomCenter(1,true)}>{Math.round(camera.zoom*100)}%</button>
        <button className="icon-button" title="Приблизить" aria-label="Приблизить" disabled={camera.zoom===maxZoom} onClick={()=>zoomCenter(1.25)}><Plus size={18}/></button>
      </div>
      <button className="icon-button" title="К карточке проекта" aria-label="К карточке проекта" onClick={center}><ArrowsIn size={20}/></button>
      <button className="icon-button" title="Перестроить карту" aria-label="Перестроить карту" disabled={rebuilding} onClick={rebuildMap}><ArrowsClockwise size={18}/></button>
      <button className="graph-notes-toggle" aria-expanded={editCanvas} aria-controls={editToolsId}
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
    <div id={editToolsId} hidden={!editCanvas}>
      {editCanvas&&<MarkdownToolbar disabled={!selectedBlock} runEdit={apply=>{
        const view=blockEditor.current?.view;
        if(view)apply(view);
      }} insertReference={kind=>pickReference(kind,insertionPoint())} insertMapFeature={addMapFeature}
        taskBoards={settings.taskBoards??[]} openTasks={openTasks}
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
      <div ref={canvas} className="graph-canvas" data-rebuilding={rebuilding||undefined} style={{transform:`translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,'--graph-text-factor':1+Math.max(0,1-camera.zoom)*.4} as React.CSSProperties}>
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
            return <g key={key} className="graph-arrow" onClick={() => {
              const menu=linksMenu.current;
              if(!menu)return;
              menu.open=true;
              menu.querySelector<HTMLButtonElement>(`[data-delete-link="${CSS.escape(key)}"]`)?.focus();
            }}>
              <title>{a.name} → {b.name}{link.label ? ' · ' + link.label : ''}</title>
              <path d={route.path} fill="none" stroke="transparent" strokeWidth="14"/>
            <path className="graph-route" d={route.path} pathLength={1} style={{'--route-delay':`${structural.has(key)&&nodes.get(link.to)!.depth>nodes.get(link.from)!.depth?Math.max(0,nodes.get(link.to)!.depth*1150-650):level*1150+500}ms`} as React.CSSProperties} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#${marker})`}/>
            </g>;
          })}
        </svg>
        {[...nodes].map(([id, node]) => {
          const {item, parent, children, width, bodyHeight, x, y} = node;
          const Icon = icons[item.kind];
          const isNote = item.kind === 'note';
          const duplicate = !!source && effective.has(linkKey({from,to:id}));
          const comments=map.cards?.[id]?.comments??[];
          const commentOpen=comment?.id===id;
          const summary = isNote ? noteExcerpt(notesByPath.get(item.path)) :
            children.length ? children.slice(0, 4).map(child => child.name).join(' · ') + (children.length > 4 ? ' · …' : '') : 'Пока пусто';
          return <article key={id} className={`project-card graph-card graph-card-${item.kind}${textureById(map.cards?.[id]?.texture)?` palette-${map.cards![id].texture}`:''}`} data-node-id={id} data-depth={node.depth}
            onDragOver={event=>{if(event.dataTransfer.types.includes(paletteDragType))event.preventDefault();}}
            onDrop={event=>{const value=readPaletteDrop(event.dataTransfer.getData(paletteDragType));if(value&&textureById(value.palette)){event.preventDefault();event.stopPropagation();updateCard(id,{texture:value.palette});}}}
            onContextMenu={event=>showMenu(event,item)}
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
                updateCard(id,{position:{x:x+dx,y:y+dy}});
              }}
              onClick={event=>{
                if(suppressClick.current===id&&event.detail!==0){suppressClick.current='';return;}
                if(source)connect(id);else open(item);
              }}><Icon size={18}/><span>{item.name}</span></button>}
                path={project.project===':all-projects:' ? (settings.projectBackgrounds?.[item.project]??null) : isNote || item.kind === 'project' ? cover : null} root={root}>
                <span className="graph-card-context">{parent ? parent.name : 'Проект'}</span>
                <span className="graph-card-summary">{summary}</span>
              </CardFace>
            </div>
            <div className="graph-card-actions">
              <button className="graph-port icon-button" type="button" aria-expanded={commentOpen}
                title="Добавить комментарий" aria-label={`Добавить комментарий · ${item.name}`}
                onClick={()=>setComment(commentOpen&&comment.index===undefined?null:{id,text:''})}><ChatText size={16} weight={comments.length?'fill':'regular'}/></button>
              {endpoints.size > 1 && <button className="graph-port graph-link-port icon-button" type="button" disabled={duplicate||!!editing}
                aria-label={source && from !== id ? `Связать с «${item.name}»` : `Начать связь от «${item.name}»`}
                aria-pressed={!!source && from === id} title={source ? 'Выбрать карточку назначения' : 'Провести стрелку'}
                onClick={() => source ? connect(id) : setFrom(id)}><Link size={19}/></button>}
            </div>
            {comments.map((text,index)=>!(commentOpen&&comment.index===index)&&<div className="graph-comment graph-comment-saved" key={index}>
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
              draft={value=>setSizing(value?{id,...value}:null)} save={(size,position)=>updateCard(id,{size,position})}/>
          </article>;
        })}
        {blocks.map(block=>{
          const dragId=mapBlockKey(block.id);
          const moving=drag?.positions[dragId]!==undefined&&drag.moved;
          const position=endpoints.get(dragId)!;
          const active=editCanvas&&activeBlock===block.id;
          const font=validFont(block.fontFamily)||validFont(map.fontFamily);
          const duplicate=!!source&&effective.has(linkKey({from,to:dragId}));
          const feature=/^`{3,}noteapp-(compare|source|concept|math|plot|board)\n([\s\S]*?)\n`{3,}\s*$/.exec(block.text);
          const featureValue=feature&&featureFromMarkdown(feature[1],feature[2]);
          const table=standaloneMapTable(block.text);
          return <article key={block.id} className={`graph-annotation${featureValue||table?' note-feature-widget':''}${textureById(block.texture)?` palette-${block.texture}`:''}`} data-active={active||undefined} data-reference={!!position.reference||undefined}
            onDragOver={event=>{if(event.dataTransfer.types.includes(paletteDragType))event.preventDefault();}}
            onDrop={event=>{const value=readPaletteDrop(event.dataTransfer.getData(paletteDragType));if(value&&textureById(value.palette)){event.preventDefault();event.stopPropagation();updateBlock(block.id,{texture:value.palette});}}}
            data-node-id={dragId} data-depth={maxDepth+1} tabIndex={-1} data-link-source={from===dragId||undefined}
            data-moving={moving||undefined} data-selected={selectedIds.has(dragId)||undefined} style={{left:position.x,top:position.y,width:position.width,minWidth:0,maxWidth:'none',minHeight:position.height,'--rebuild-delay':`${(maxDepth+1)*1150}ms`,
              height:block.size||sizing?.id===dragId?position.height:undefined,fontFamily:font?fontStack(font):undefined} as React.CSSProperties}
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
              if(!source&&!active&&position.reference&&!(event.target as Element).closest('button, summary')){
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
                  updateBlock(block.id,{position:{x:position.x+dx,y:position.y+dy}});
                }}><ArrowsOutCardinal size={11}/></button>
              {endpoints.size>1&&<button className="graph-port graph-link-port icon-button" type="button"
                disabled={!!editing||duplicate}
                aria-label={source&&from!==dragId?`Связать с «${position.name}»`:`Начать связь от «${position.name}»`}
                aria-pressed={from===dragId} title={source?'Выбрать объект назначения':'Провести стрелку'}
                onClick={()=>source?connect(dragId):setFrom(dragId)}><Link size={19}/></button>}
              {editCanvas&&feature?.[1]==='plot'&&featureValue&&<details className="graph-plot-settings"><summary title="Настройки графика" aria-label="Настройки графика">⋯</summary><div><label>Цвет графика <input type="color" value={/^#[0-9a-f]{6}$/i.test(featureValue.plotColor??'')?featureValue.plotColor:'#aa66db'} onChange={event=>updateBlock(block.id,{text:markdownBlock('plot',{...featureValue,plotColor:event.target.value})})}/></label></div></details>}
              {editCanvas&&
                <button type="button" className="icon-button" title={active?'Готово':'Правка блока'} aria-label={active?'Готово':'Правка блока'}
                  onClick={()=>{setRawMapTable('');setActiveBlock(active?'':block.id)}}>{active?<Check size={16}/>:<PencilSimple size={16}/>}</button>}
              <button type="button" className="icon-button" title="Удалить блок" aria-label={`Удалить блок «${position.name}»`}
                onClick={()=>{
                  if(active)setActiveBlock('');
                  if(from===dragId)cancelLink();
                  changeBlocks(current=>current.filter(item=>item.id!==block.id));
                  scroll.current?.focus();
                }}><Trash size={16}/></button>
            </header>
            <div className={`graph-annotation-content${featureValue||table?' note-widget-body':''}`} style={{
              ...textAppearanceStyle({lineHeight:block.lineHeight??map.lineHeight,textColor:block.textColor??map.textColor}),
              ...(font&&{'--body-font':fontStack(font)}),
            } as React.CSSProperties}>
              {feature&&featureValue?<FittedWidget baseWidth={featureBaseWidth(feature[1] as NoteFeature)}><FeatureCard key={block.id} kind={feature[1] as NoteFeature} value={featureValue} editable={editCanvas} notes={notes} boards={settings.taskBoards??[]} changeBoard={changeTaskBoard} openNote={openLink} save={value=>updateBlock(block.id,{text:markdownBlock(feature[1] as NoteFeature,value)})}/></FittedWidget>:table&&rawMapTable!==block.id?<FittedWidget baseWidth={668}>{editCanvas?<MapTable source={block.text} save={text=>updateBlock(block.id,{text})} markdown={()=>{setRawMapTable(block.id);setActiveBlock(block.id)}}/>:<Editor references={references} note={{path:mapNotesPath,content:block.text,revision:""}} notes={notes} read floatingText={false} light={settings.theme==="light"} editorRef={blockEditor} onChange={()=>{}} onLink={openLink}/>}</FittedWidget>:<Editor references={references} note={{path:mapNotesPath,content:block.text,revision:''}} notes={notes} read={!active} floatingText={false}
                light={settings.theme==='light'} autoFocus={active} editorRef={blockEditor}
                onChange={text=>updateBlock(block.id,{text})} onLink={openLink}/>}
              {!active&&!block.text&&<p className="subtle">Пустой блок</p>}
            </div>
            <ResizeHandle label={`Размер блока «${position.name}»`} size={{width:position.width,height:position.height}} position={position} step={step} zoom={camera.zoom}
              draft={value=>setSizing(value?{id:dragId,...value}:null)} save={(size,nextPosition)=>updateBlock(block.id,{size,position:nextPosition})}/>
          </article>;
        })}
        {marquee&&<div className="graph-selection-box" style={{left:Math.min(marquee.start.x,marquee.current.x),top:Math.min(marquee.start.y,marquee.current.y),width:Math.abs(marquee.current.x-marquee.start.x),height:Math.abs(marquee.current.y-marquee.start.y)}}/>}
      </div>
    </div>
    </div>
  </div>;
}
