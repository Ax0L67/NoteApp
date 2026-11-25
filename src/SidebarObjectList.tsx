import {useEffect,useMemo,useRef,useState} from 'react';
import {CaretDown,CaretRight,ChatCircle,FileText,Folder,FrameCorners,Image as ImageIcon,Link,List,MagnifyingGlass,Shapes,SortAscending,SortDescending,Stack,Table,TextT} from '@phosphor-icons/react';
import SortMenu from './SortMenu';
import {canvasShapes} from './CanvasShapes';
import {loadNoteImage} from './noteImages';
import {mapBlocks,mapBlockKey} from './mapBlocks';
import type {ExplorerItem} from './Explorer';
import type {ProjectMap} from './types';
import './noteOutline.css';

export type OutlineItem={id:string;label:string;text:string;parentId?:string;kind?:string;fill?:string;imageSrc?:string;notePath?:string};
export function graphOutlineItems(root:ExplorerItem,childrenOf:(item:ExplorerItem)=>ExplorerItem[],map:ProjectMap):OutlineItem[] {
 const items:OutlineItem[]=[],seen=new Set<string>();
 const visit=(item:ExplorerItem,parentId?:string)=>{const id=item.kind==='note'?item.path:item.kind==='folder'?'folder:'+item.path:'project:'+item.project;if(seen.has(id))return;seen.add(id);items.push({id,parentId,kind:item.kind,label:item.kind==='note'?'Заметка':item.kind==='folder'?'Папка':'Проект',text:item.name});if(item.kind!=='note')childrenOf(item).forEach(child=>visit(child,id))};
 visit(root);
 for(const block of mapBlocks(map))items.push({id:mapBlockKey(block.id),label:'Виджет',text:block.text});
 return items;
}
function LayerPreview({item}:{item:OutlineItem}) {
 const [url,setUrl]=useState('');
 useEffect(()=>{let live=true;if(!item.imageSrc){setUrl('');return}if(/^(?:https?:|data:|blob:)/i.test(item.imageSrc))setUrl(item.imageSrc);else if(item.notePath)void loadNoteImage(item.notePath,item.imageSrc).then(value=>{if(live)setUrl(value)});return()=>{live=false}},[item.imageSrc,item.notePath]);
 if(url)return <span className="canvas-layer-preview"><img src={url} alt=""/></span>;
 if(item.kind==='shape'&&canvasShapes[item.text])return <span className="canvas-layer-preview"><svg viewBox="0 0 100 100"><path d={canvasShapes[item.text]} fill={item.fill??'var(--muted)'}/></svg></span>;
 return <span className="canvas-layer-preview" style={{background:item.fill}} aria-hidden="true">{item.kind==='text'?'Aa':item.kind==='frame'?'#':''}</span>;
}
export default function WidgetOutline({items,onSelect,onLayer,title='Виджеты'}:{items:OutlineItem[];onSelect:(id:string)=>void;onLayer?:(id:string,action:'up'|'down')=>void;title?:string}) {
 const [collapsed,setCollapsed]=useState(false),[sort,setSort]=useState<'order'|'reverse'|'name-asc'|'name-desc'>('order');
 const [sortOpen,setSortOpen]=useState(false),[searchOpen,setSearchOpen]=useState(false),[query,setQuery]=useState('');
 const anchor=useRef<HTMLDivElement>(null);
 const [context,setContext]=useState<{id:string;x:number;y:number}|null>(null);
 const [closed,setClosed]=useState<Set<string>>(()=>new Set());
 const visible=useMemo(()=>{const term=query.trim().toLocaleLowerCase(),values=items.filter(item=>`${item.label} ${item.text}`.toLocaleLowerCase().includes(term));values.sort((a,b)=>sort==='name-asc'?a.text.localeCompare(b.text,'ru',{numeric:true}):sort==='name-desc'?b.text.localeCompare(a.text,'ru',{numeric:true}):sort==='reverse'?items.indexOf(b)-items.indexOf(a):items.indexOf(a)-items.indexOf(b));if(!items.some(item=>item.parentId))return values;const seen=new Set<string>(),result:OutlineItem[]=[];const visit=(item:OutlineItem)=>{if(seen.has(item.id))return;seen.add(item.id);result.push(item);values.filter(child=>child.parentId===item.id).forEach(visit)};values.filter(item=>!item.parentId||!values.some(parent=>parent.id===item.parentId)).forEach(visit);return result;},[items,query,sort]);
 const byId=new Map(items.map(item=>[item.id,item]));
 const depthOf=(item:OutlineItem)=>{let depth=0,parent=item.parentId;while(parent&&depth<20){depth++;parent=byId.get(parent)?.parentId}return depth};
 const isVisible=(item:OutlineItem)=>{if(query.trim())return true;let parent=item.parentId,depth=0;while(parent&&depth++<20){if(closed.has(parent))return false;parent=byId.get(parent)?.parentId}return true};
 const iconOf=(item:OutlineItem)=>({frame:FrameCorners,shape:Shapes,text:TextT,image:ImageIcon,comment:ChatCircle,table:Table,link:Link,note:FileText,folder:Folder,project:Stack,group:Stack} as Record<string,typeof List>)[item.kind??'']??List;
 return <section className="note-outline-panel">
  <div className="note-outline-header"><button className="inspector-title" title={title} aria-label={title} aria-expanded={!collapsed} onClick={()=>setCollapsed(value=>!value)}><List size={20}/><strong>{title}</strong><CaretDown size={14}/></button>
   <div className="note-outline-tools"><div className="note-outline-sort" ref={anchor}><button aria-label={`Сортировка: ${title}`} title="Сортировка" aria-expanded={sortOpen} onClick={()=>setSortOpen(value=>!value)}>{sort==='reverse'||sort==='name-desc'?<SortDescending size={17}/>:<SortAscending size={17}/>}</button>{sortOpen&&<SortMenu anchor={anchor} width={230} close={()=>setSortOpen(false)}>{([['order','По порядку'],['reverse','В обратном порядке'],['name-asc','По имени (от А до Я)'],['name-desc','По имени (от Я до А)']] as const).map(([value,label])=><button key={value} role="menuitemradio" aria-checked={sort===value} onClick={()=>{setSort(value);setSortOpen(false)}}>{label}</button>)}</SortMenu>}</div><button title="Поиск" aria-label={`Поиск: ${title}`} aria-expanded={searchOpen} onClick={()=>{setSearchOpen(value=>!value);setCollapsed(false)}}><MagnifyingGlass size={17}/></button></div>
  </div>
  {!collapsed&&<>{searchOpen&&<label className="note-outline-search"><MagnifyingGlass size={16}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Поиск" aria-label={`Поиск: ${title}`}/></label>}
   <div className="canvas-widget-outline-list">{visible.filter(isVisible).map(item=>{const Icon=iconOf(item),hasChildren=items.some(child=>child.parentId===item.id),name=item.kind==='image'?item.label:item.text.replace(/\s+/g,' ').trim().slice(0,90)||item.label;return <div className="canvas-layer-row" key={item.id} style={{paddingLeft:depthOf(item)*14}}>
    {hasChildren?<button type="button" className="canvas-layer-expand" aria-label={`${closed.has(item.id)?'Развернуть':'Свернуть'} ${name}`} aria-expanded={!closed.has(item.id)} onClick={()=>setClosed(current=>{const next=new Set(current);if(next.has(item.id))next.delete(item.id);else next.add(item.id);return next})}>{closed.has(item.id)?<CaretRight size={13}/>:<CaretDown size={13}/>}</button>:<span className="canvas-layer-expand"/>}
    <button type="button" className="canvas-layer-item" title={`${item.label}: ${name}`} onContextMenu={onLayer&&!item.id.startsWith('group:')?event=>{event.preventDefault();setContext({id:item.id,x:event.clientX,y:event.clientY})}:undefined} onClick={()=>{setContext(null);onSelect(item.id)}}><Icon size={15} aria-hidden="true"/><LayerPreview item={item}/><span>{name}</span></button>
   </div>})}{!visible.length&&<p>{query?'Ничего не найдено':'Здесь пока пусто'}</p>}</div>
   {context&&onLayer&&<div className="canvas-layer-menu" style={{position:'fixed',left:Math.min(context.x,window.innerWidth-180),top:Math.min(context.y,window.innerHeight-90),zIndex:1000}} onMouseLeave={()=>setContext(null)}><button onClick={()=>{onLayer(context.id,'up');setContext(null)}}>Поднять слой</button><button onClick={()=>{onLayer(context.id,'down');setContext(null)}}>Опустить слой</button></div>}
  </>}
 </section>;
}
