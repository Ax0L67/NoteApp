import {useMemo,useRef,useState} from 'react';
import {CaretDown,CaretRight,List,MagnifyingGlass,SortAscending,SortDescending} from '@phosphor-icons/react';
import type {TaskBoard} from './types';
import SortMenu from './SortMenu';
import './noteOutline.css';
import './kanbanOutline.css';

type Sort='order'|'reverse'|'name-asc'|'name-desc';
export function kanbanOutlineColumns(board:TaskBoard,sort:Sort,term:string) {
 const query=term.trim().toLocaleLowerCase();
 const result=board.columns.map(name=>({name,tasks:board.tasks.filter(task=>task.status===name)}))
  .map(column=>({...column,tasks:column.tasks.filter(task=>!query||column.name.toLocaleLowerCase().includes(query)||`${task.title} ${task.description} ${(task.tags??[]).join(' ')} ${(task.checklist??[]).map(item=>item.text).join(' ')}`.toLocaleLowerCase().includes(query))}))
  .filter(column=>!query||column.name.toLocaleLowerCase().includes(query)||column.tasks.length);
 const compare=(a:string,b:string)=>a.localeCompare(b,'ru',{numeric:true});
 if(sort==='reverse')result.reverse();
 if(sort==='name-asc'||sort==='name-desc')result.sort((a,b)=>(sort==='name-asc'?1:-1)*compare(a.name,b.name));
 for(const column of result){if(sort==='reverse')column.tasks.reverse();if(sort==='name-asc'||sort==='name-desc')column.tasks.sort((a,b)=>(sort==='name-asc'?1:-1)*compare(a.title,b.title));}
 return result;
}

export default function KanbanOutline({board,path,collapsed,toggle}:{board:TaskBoard;path:string;collapsed:boolean;toggle:()=>void}) {
 const [sort,setSort]=useState<Sort>('order');
 const [sortOpen,setSortOpen]=useState(false),[searchOpen,setSearchOpen]=useState(false),[query,setQuery]=useState('');
 const [expanded,setExpanded]=useState<string[]>([]),[searchCollapsed,setSearchCollapsed]=useState<string[]>([]),anchor=useRef<HTMLDivElement>(null);
 const term=query.trim().toLocaleLowerCase();
 const columns=useMemo(()=>kanbanOutlineColumns(board,sort,term),[board,sort,term]);
 const focus=(column:string,taskId?:string)=>window.dispatchEvent(new CustomEvent('noteapp-focus-kanban',{detail:{path,column,taskId}}));
 return <section className="note-outline-panel"><div className="note-outline-header"><button className="inspector-title" title="Оглавление" aria-label="Оглавление" aria-expanded={!collapsed} onClick={toggle}><List size={20}/><strong>Оглавление</strong><CaretDown size={14}/></button><div className="note-outline-tools"><div className="note-outline-sort" ref={anchor}><button aria-label="Сортировка оглавления" title="Сортировка оглавления" aria-expanded={sortOpen} onClick={()=>setSortOpen(value=>!value)}>{sort==='reverse'||sort==='name-desc'?<SortDescending size={17}/>:<SortAscending size={17}/>}</button>{sortOpen&&<SortMenu anchor={anchor} width={230} close={()=>setSortOpen(false)}>{([['order','По порядку на доске'],['reverse','В обратном порядке'],['name-asc','По имени (от А до Я)'],['name-desc','По имени (от Я до А)']] as const).map(([value,label])=><button key={value} role="menuitemradio" aria-checked={sort===value} onClick={()=>{setSort(value);setSortOpen(false)}}>{label}</button>)}</SortMenu>}</div><button title="Поиск по доске" aria-label="Поиск по доске" aria-expanded={searchOpen} onClick={()=>{setSearchOpen(value=>!value);if(!searchOpen&&collapsed)toggle()}}><MagnifyingGlass size={17}/></button></div></div>
 {!collapsed&&<>{searchOpen&&<label className="note-outline-search"><MagnifyingGlass size={16}/><input autoFocus value={query} onChange={event=>{setQuery(event.target.value);setSearchCollapsed([])}} placeholder="Поиск по доске" aria-label="Поиск по столбцам и задачам"/></label>}<div className="outline kanban-outline">{columns.map(column=>{const open=term?!searchCollapsed.includes(column.name):expanded.includes(column.name);return <div key={column.name}><div className="kanban-outline-column"><button className="kanban-outline-caret" aria-label={`${open?'Свернуть':'Развернуть'} ${column.name}`} aria-expanded={open} onClick={()=>{const update=(current:string[])=>current.includes(column.name)?current.filter(name=>name!==column.name):[...current,column.name];if(term)setSearchCollapsed(update);else setExpanded(update)}}>{open?<CaretDown size={14}/>:<CaretRight size={14}/>}</button><button onClick={()=>focus(column.name)} title={column.name}>{column.name}</button></div>{open&&<div className="kanban-outline-tasks">{column.tasks.map(task=><button key={task.id} onClick={()=>focus(column.name,task.id)} title={task.title}>{task.title.replace(/\s+/g,' ').trim()||'Без названия'}</button>)}</div>}</div>})}{!columns.length&&<p>{term?'Ничего не найдено':'На доске пока нет столбцов'}</p>}</div></>}
 </section>;
}
