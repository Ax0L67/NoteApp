import {Fragment,useLayoutEffect,useRef,useState} from 'react';
import {Check,DotsSixVertical,Plus,Trash} from '@phosphor-icons/react';
import type {Note,Task,TaskBoard} from './types';
import {title} from './indexing';
import {paletteDragType,readPaletteDrop} from './appearance';
import TaskTextEditor from './TaskTextEditor';

export function newTaskBoard(project:string):TaskBoard {
  const columns=['К выполнению','В работе','Готово'];
  return {id:crypto.randomUUID(),name:'Новая доска',project,columns,tasks:[],columnIds:Object.fromEntries(columns.map(column=>[column,crypto.randomUUID()]))};
}

export function moveTask(tasks:Task[],id:string,column:string,beforeId?:string):Task[] {
  const task=tasks.find(item=>item.id===id);
  if(!task||beforeId===id)return tasks;
  const result=tasks.filter(item=>item.id!==id),index=beforeId?result.findIndex(item=>item.id===beforeId):-1;
  result.splice(index<0?result.length:index,0,{...task,status:column});
  return result;
}

export function moveColumn(columns:string[],name:string,target:string,after=false):string[] {
  if(name===target||!columns.includes(name)||!columns.includes(target))return columns;
  const result=columns.filter(item=>item!==name),index=result.indexOf(target);
  result.splice(index+(after?1:0),0,name);
  return result;
}

export function resolveTaskBoardColumn(board:TaskBoard,column:string):string|undefined {
  const name=Object.entries(board.columnIds??{}).find(([,id])=>id===column)?.[0]??(board.columns.includes(column)?column:board.columnAliases?.[column]);
  return name&&board.columns.includes(name)?name:undefined;
}

export function TaskBoardView({board,notes,change,openNote,editable=true,interactive=true,embedded=false,column,taskId}:{board:TaskBoard;notes:Note[];change:(board:TaskBoard)=>void;openNote?:(path:string)=>void;editable?:boolean;interactive?:boolean;embedded?:boolean;column?:string;taskId?:string}) {
  const [columnName,setColumnName]=useState(''),[expanded,setExpanded]=useState<string|null>(null);
  const [drag,setDrag]=useState<{id:string;column:string;beforeId?:string}|null>(null);
  const [columnDrag,setColumnDrag]=useState<{name:string;target?:string;after?:boolean}|null>(null);
  const root=useRef<HTMLElement>(null),positions=useRef(new Map<string,DOMRect>()),dragFrame=useRef<number|null>(null);
  useLayoutEffect(()=>{
    const next=new Map<string,DOMRect>();
    root.current?.querySelectorAll<HTMLElement>('[data-task-id]').forEach(element=>{
      const id=element.dataset.taskId!,rect=element.getBoundingClientRect(),old=positions.current.get(id);
      next.set(id,rect);
      if(old&&drag&&id!==drag.id&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){const x=old.left-rect.left,y=old.top-rect.top;if(x||y)element.animate([{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:180,easing:'ease-out'});}
    });
    positions.current=next;
  });
  const updateTask=(id:string,patch:Partial<Task>)=>change({...board,tasks:board.tasks.map(task=>task.id===id?{...task,...patch}:task)});
  const tasks=board.tasks;
  const resolvedColumn=column&&resolveTaskBoardColumn(board,column);
  const columns=column?(resolvedColumn?[resolvedColumn]:[]):taskId?[board.tasks.find(task=>task.id===taskId)?.status].filter((value):value is string=>!!value):board.columns;
  const addTask=(name:string,status:string)=>change({...board,tasks:[...board.tasks,{id:crypto.randomUUID(),title:name,description:'',priority:'normal',status,notes:[]}]});
  return <section ref={root} className={`task-board-view${board.palette?` palette-${board.palette}`:''}${taskId?' task-board-single':''}`} aria-label={`Доска задач: ${board.name}`}>
    {column&&!columns.length&&<p>Столбец недоступен</p>}{taskId&&!columns.length&&<p>Задача недоступна</p>}
    <div className="task-board-columns">{columns.map(status=>{
      const shown=tasks.filter(task=>task.status===status&&(!taskId||task.id===taskId));
      return <section key={status} data-kanban-column={status} data-column-drop={columnDrag?.target===status&&columnDrag.name!==status?(columnDrag.after?'after':'before'):undefined} className={`task-board-column${board.columnColors?.[status]?` palette-${board.columnColors[status]}`:''}`} onDragOver={event=>{
        if(columnDrag){event.preventDefault();event.stopPropagation();const rect=event.currentTarget.getBoundingClientRect(),after=event.clientX>rect.left+rect.width/2;if(columnDrag.target!==status||columnDrag.after!==after)setColumnDrag({...columnDrag,target:status,after});return;}
        if(editable&&event.dataTransfer.types.includes(paletteDragType)){event.preventDefault();event.stopPropagation();return;}
        if(!interactive)return;
        if(drag){event.preventDefault();if((event.target as HTMLElement).closest('.task-card-placeholder'))return;const card=(event.target as HTMLElement).closest<HTMLElement>('[data-task-id]');const id=card?.dataset.taskId;const before=id&&id!==drag.id&&event.clientY<card!.getBoundingClientRect().top+card!.offsetHeight/2?id:undefined;
          const nextBefore=before??(id&&id!==drag.id?shown.slice(shown.findIndex(task=>task.id===id)+1).find(task=>task.id!==drag.id)?.id:undefined);
          if(drag.column!==status||drag.beforeId!==nextBefore)setDrag({...drag,column:status,beforeId:nextBefore});}
      }} onDrop={event=>{
        if(columnDrag){event.preventDefault();event.stopPropagation();const rect=event.currentTarget.getBoundingClientRect(),columns=moveColumn(board.columns,columnDrag.name,status,event.clientX>rect.left+rect.width/2);if(columns!==board.columns)change({...board,columns});setColumnDrag(null);return;}
        const color=editable&&readPaletteDrop(event.dataTransfer.getData(paletteDragType));
        if(color){event.preventDefault();event.stopPropagation();change({...board,columnColors:{...board.columnColors,[status]:color.palette}});return;}
        if(interactive&&drag){event.preventDefault();event.stopPropagation();change({...board,tasks:moveTask(board.tasks,drag.id,drag.column,drag.beforeId)});setDrag(null);}
      }}>
        {!taskId&&<header>{interactive&&!column&&board.columns.length>1&&<button type="button" className="task-column-drag" aria-label={`Переместить столбец ${status}`} title="Перетащите столбец или используйте стрелки" draggable onDragStart={event=>{event.stopPropagation();event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-noteapp-kanban-column',status);setColumnDrag({name:status});}} onDragEnd={()=>setColumnDrag(null)} onKeyDown={event=>{const direction=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0;if(!direction)return;event.preventDefault();event.stopPropagation();const target=board.columns[board.columns.indexOf(status)+direction];if(target)change({...board,columns:moveColumn(board.columns,status,target,direction>0)});}}><DotsSixVertical size={16}/></button>}<input aria-label={`Название столбца ${status}`} key={status} defaultValue={status} readOnly={!editable} onBlur={event=>{const name=event.target.value.trim();if(!name||name===status||board.columns.includes(name)){event.target.value=status;return}const colors={...board.columnColors},aliases={...board.columnAliases},ids={...board.columnIds};ids[name]=ids[status]??crypto.randomUUID();delete ids[status];if(colors[status]){colors[name]=colors[status];delete colors[status]}Object.keys(aliases).forEach(key=>{if(aliases[key]===status)aliases[key]=name});aliases[status]=name;change({...board,columns:board.columns.map(item=>item===status?name:item),tasks:board.tasks.map(task=>task.status===status?{...task,status:name}:task),columnColors:colors,columnAliases:aliases,columnIds:ids,hiddenColumns:board.hiddenColumns?.map(item=>item===status?name:item)})}}/><span>{shown.length}</span>
          {editable&&board.columns.length>1&&!column&&<button type="button" title="Удалить столбец" aria-label={`Удалить столбец ${status}`} onClick={()=>{const ids={...board.columnIds};delete ids[status];change({...board,columns:board.columns.filter(value=>value!==status),columnIds:ids,hiddenColumns:board.hiddenColumns?.filter(value=>value!==status),tasks:board.tasks.map(task=>task.status===status?{...task,status:board.columns.find(value=>value!==status)!}:task)})}}><Trash size={15}/></button>}</header>}
        <div className="task-board-card-list">{shown.map(task=><Fragment key={task.id}>{drag?.column===status&&drag.beforeId===task.id&&<div className="task-card-placeholder"/>}<article data-task-id={task.id} className={`task-card${drag?.id===task.id?' dragging':''}`}>
          {interactive&&<button type="button" className="task-card-drag" aria-label={`Переместить задачу ${task.title}`} title="Перетащить задачу" draggable onDragStart={event=>{event.stopPropagation();const card=event.currentTarget.closest<HTMLElement>('.task-card');if(!card)return;const rect=card.getBoundingClientRect();event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/task-id',task.id);event.dataTransfer.setDragImage(card,event.clientX-rect.left,event.clientY-rect.top);dragFrame.current=requestAnimationFrame(()=>{dragFrame.current=null;setDrag({id:task.id,column:status,beforeId:shown[shown.findIndex(item=>item.id===task.id)+1]?.id})})}} onDragEnd={()=>{if(dragFrame.current!==null)cancelAnimationFrame(dragFrame.current);dragFrame.current=null;setDrag(null)}}><DotsSixVertical size={16}/></button>}
          <div className="task-card-title"><TaskTextEditor key={`${task.id}-title`} ariaLabel="Название задачи" value={task.title} onChange={title=>updateTask(task.id,{title})} read={!editable} notes={notes} onLink={openNote}/></div>
          {task.description&&expanded!==task.id&&<TaskTextEditor key={`${task.id}-preview`} ariaLabel="Описание задачи" value={task.description} onChange={()=>{}} read notes={notes} onLink={openNote}/>}
          {!!task.tags?.length&&<div className="task-card-tags">{task.tags.map(tag=><span key={tag}>{tag}</span>)}</div>}
          {!!task.checklist?.length&&<div className="task-checklist">{task.checklist.map(item=><label key={item.id}><input type="checkbox" checked={item.done} disabled={!interactive} onChange={event=>updateTask(task.id,{checklist:task.checklist?.map(value=>value.id===item.id?{...value,done:event.target.checked}:value)})}/><span>{item.text}</span>{editable&&expanded===task.id&&<button type="button" aria-label={`Удалить пункт ${item.text}`} onClick={()=>updateTask(task.id,{checklist:task.checklist?.filter(value=>value.id!==item.id)})}>×</button>}</label>)}</div>}
          {task.notes.length>0&&<div className="task-card-notes">{task.notes.map(path=><button type="button" key={path} onClick={()=>openNote?.(path)}>{title(path)}</button>)}</div>}
          {!editable&&interactive&&<select className="task-card-move" aria-label="Переместить задачу в столбец" value={task.status} onChange={event=>updateTask(task.id,{status:event.target.value})}>{board.columns.map(value=><option key={value}>{value}</option>)}</select>}
          {editable&&<><button type="button" className="task-card-details-toggle" aria-expanded={expanded===task.id} onClick={()=>setExpanded(expanded===task.id?null:task.id)}>{expanded===task.id?'Скрыть':'Подробнее'}</button>
          {expanded===task.id&&<div className="task-card-details"><TaskTextEditor key={`${task.id}-description`} ariaLabel="Описание задачи" placeholder="Описание" value={task.description} onChange={description=>updateTask(task.id,{description})} notes={notes} onLink={openNote}/>
            <form onSubmit={event=>{event.preventDefault();const form=event.currentTarget,text=new FormData(form).get('item')?.toString().trim();if(text){updateTask(task.id,{checklist:[...(task.checklist??[]),{id:crypto.randomUUID(),text,done:false}]});form.reset()}}}><input name="item" aria-label="Новый пункт" placeholder="Пункт списка"/><button type="submit" aria-label="Добавить пункт"><Plus size={15}/></button></form>
            <form onSubmit={event=>{event.preventDefault();const form=event.currentTarget,tag=new FormData(form).get('tag')?.toString().trim();if(tag&&!task.tags?.includes(tag)){updateTask(task.id,{tags:[...(task.tags??[]),tag]});form.reset()}}}><input name="tag" aria-label="Новый тег" placeholder="Тег"/><button type="submit" aria-label="Добавить тег"><Plus size={15}/></button></form>
            {!!task.tags?.length&&<div className="task-card-tags">{task.tags.map(tag=><button key={tag} type="button" onClick={()=>updateTask(task.id,{tags:task.tags?.filter(value=>value!==tag)})} aria-label={`Удалить тег ${tag}`}>{tag} ×</button>)}</div>}
            <div className="task-card-meta"><input aria-label="Срок задачи" type="date" value={task.due??''} onChange={event=>updateTask(task.id,{due:event.target.value||undefined})}/><select aria-label="Приоритет" value={task.priority} onChange={event=>updateTask(task.id,{priority:event.target.value as Task['priority']})}><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option></select></div>
            <select aria-label="Переместить задачу в столбец" value={task.status} onChange={event=>updateTask(task.id,{status:event.target.value})}>{board.columns.map(value=><option key={value}>{value}</option>)}</select>
            <select aria-label="Прикрепить заметку" value="" onChange={event=>{const path=event.target.value;if(path&&!task.notes.includes(path))updateTask(task.id,{notes:[...task.notes,path]})}}><option value="">+ Заметка</option>{notes.filter(note=>!task.notes.includes(note.path)).map(note=><option key={note.path} value={note.path}>{title(note.path)}</option>)}</select>
            <button type="button" className="task-delete" onClick={()=>change({...board,tasks:board.tasks.filter(value=>value.id!==task.id)})}><Trash size={15}/>Удалить задачу</button></div>}</>}
        </article></Fragment>)}{drag?.column===status&&!drag.beforeId&&<div className="task-card-placeholder"/>}</div>
        {editable&&!taskId&&<form className="task-board-add" onSubmit={event=>{event.preventDefault();const form=event.currentTarget,name=new FormData(form).get('task')?.toString().trim();if(name){addTask(name,status);form.reset()}}}><input name="task" aria-label={`Новая задача в столбце ${status}`} placeholder="Новая задача"/><button type="submit" aria-label="Добавить задачу"><Plus size={16}/></button></form>}
      </section>;
    })}{editable&&!embedded&&!column&&!taskId&&<form className="task-board-new-column task-board-add" onSubmit={event=>{event.preventDefault();const value=columnName.trim();if(!value||board.columns.includes(value))return;change({...board,columns:[...board.columns,value],columnIds:{...board.columnIds,[value]:crypto.randomUUID()}});setColumnName('')}}><input aria-label="Название нового столбца" placeholder="Новый столбец" value={columnName} onChange={event=>setColumnName(event.target.value)}/><button type="submit" aria-label="Добавить столбец"><Plus size={16}/></button></form>}</div>
  </section>;
}
export default function TaskBoardManager({boards,notes,project,change,close,openNote}:{boards:TaskBoard[];notes:Note[];project:string;change:(boards:TaskBoard[])=>void;close:()=>void;openNote:(path:string)=>void}) {
  const [selected,setSelected]=useState(boards[0]?.id??'');
  const board=boards.find(value=>value.id===selected);
  const save=(next:TaskBoard)=>change(boards.map(value=>value.id===next.id?next:value));
  return <div className="modal-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)close()}}><section className="modal task-board-manager" role="dialog" aria-modal="true" aria-labelledby="task-board-title">
    <header><h2 id="task-board-title">Задачи</h2><button type="button" aria-label="Закрыть" onClick={close}>×</button></header>
    <div className="task-manager-content"><nav aria-label="Доски задач">{boards.map(value=><button key={value.id} type="button" aria-pressed={selected===value.id} onClick={()=>setSelected(value.id)}>{value.name}</button>)}<button type="button" onClick={()=>{const next=newTaskBoard(project);change([...boards,next]);setSelected(next.id)}}><Plus size={16}/>Новая доска</button>
      {board&&<button className="danger" type="button" onClick={()=>{change(boards.filter(value=>value.id!==board.id));setSelected(boards.find(value=>value.id!==board.id)?.id??'')}}><Trash size={16}/>Удалить доску</button>}</nav>
      {board?<TaskBoardView board={board} notes={notes} change={save} openNote={openNote}/>:<p>Создайте доску, чтобы начать работу.</p>}
    </div>
    <footer className="modal-foot"><button type="button" className="primary" onClick={close}><Check size={17}/>Готово</button></footer>
  </section></div>;
}

