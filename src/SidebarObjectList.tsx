import {useMemo,useRef,useState} from 'react';
import {CaretDown,List,MagnifyingGlass,SortAscending,SortDescending} from '@phosphor-icons/react';
import SortMenu from './SortMenu';
import {mapBlocks,mapBlockKey} from './mapBlocks';
import type {ExplorerItem} from './Explorer';
import type {ProjectMap} from './types';
import './noteOutline.css';

export type OutlineItem={id:string;label:string;text:string};
export function graphOutlineItems(root:ExplorerItem,childrenOf:(item:ExplorerItem)=>ExplorerItem[],map:ProjectMap):OutlineItem[] {
 const items:OutlineItem[]=[],seen=new Set<string>();
 const visit=(item:ExplorerItem)=>{const id=item.kind==='note'?item.path:item.kind==='folder'?'folder:'+item.path:'project:'+item.project;if(seen.has(id))return;seen.add(id);items.push({id,label:item.kind==='note'?'Заметка':item.kind==='folder'?'Папка':'Проект',text:item.name});if(item.kind!=='note')childrenOf(item).forEach(visit)};
 visit(root);
 for(const block of mapBlocks(map))items.push({id:mapBlockKey(block.id),label:'Виджет',text:block.text});
 return items;
}
export default function WidgetOutline({items,onSelect,title='Виджеты'}:{items:OutlineItem[];onSelect:(id:string)=>void;title?:string}) {
 const [collapsed,setCollapsed]=useState(false),[sort,setSort]=useState<'order'|'reverse'|'name-asc'|'name-desc'>('order');
 const [sortOpen,setSortOpen]=useState(false),[searchOpen,setSearchOpen]=useState(false),[query,setQuery]=useState('');
 const anchor=useRef<HTMLDivElement>(null);
 const visible=useMemo(()=>{const term=query.trim().toLocaleLowerCase(),values=items.filter(item=>`${item.label} ${item.text}`.toLocaleLowerCase().includes(term));return values.sort((a,b)=>sort==='name-asc'?a.text.localeCompare(b.text,'ru',{numeric:true}):sort==='name-desc'?b.text.localeCompare(a.text,'ru',{numeric:true}):sort==='reverse'?items.indexOf(b)-items.indexOf(a):items.indexOf(a)-items.indexOf(b));},[items,query,sort]);
 return <section className="note-outline-panel"><div className="note-outline-header"><button className="inspector-title" title={title} aria-label={title} aria-expanded={!collapsed} onClick={()=>setCollapsed(value=>!value)}><List size={20}/><strong>{title}</strong><CaretDown size={14}/></button><div className="note-outline-tools"><div className="note-outline-sort" ref={anchor}><button aria-label={`Сортировка: ${title}`} title="Сортировка" aria-expanded={sortOpen} onClick={()=>setSortOpen(value=>!value)}>{sort==='reverse'||sort==='name-desc'?<SortDescending size={17}/>:<SortAscending size={17}/>}</button>{sortOpen&&<SortMenu anchor={anchor} width={230} close={()=>setSortOpen(false)}>{([['order','По порядку'],['reverse','В обратном порядке'],['name-asc','По имени (от А до Я)'],['name-desc','По имени (от Я до А)']] as const).map(([value,label])=><button key={value} role="menuitemradio" aria-checked={sort===value} onClick={()=>{setSort(value);setSortOpen(false)}}>{label}</button>)}</SortMenu>}</div><button title="Поиск" aria-label={`Поиск: ${title}`} aria-expanded={searchOpen} onClick={()=>{setSearchOpen(value=>!value);setCollapsed(false)}}><MagnifyingGlass size={17}/></button></div></div>{!collapsed&&<>{searchOpen&&<label className="note-outline-search"><MagnifyingGlass size={16}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Поиск" aria-label={`Поиск: ${title}`}/></label>}<div className="canvas-widget-outline-list">{visible.map(item=><button key={item.id} onClick={()=>onSelect(item.id)}><strong>{item.label}</strong><span>{item.text.replace(/\s+/g,' ').slice(0,90)||'Пустой виджет'}</span></button>)}{!visible.length&&<p>{query?'Ничего не найдено':'Здесь пока пусто'}</p>}</div></>}</section>;
}
