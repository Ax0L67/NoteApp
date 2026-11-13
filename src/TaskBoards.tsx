import {useState} from 'react';
import {Check,Plus,Trash} from '@phosphor-icons/react';
import type {Note,Task,TaskBoard} from './types';
import {title} from './indexing';

export function newTaskBoard(project:string):TaskBoard {
  return {id:crypto.randomUUID(),name:'Новая доска',project,columns:['К выполнению','В работе','Готово'],tasks:[]};
}

export function TaskBoardView({board,notes,change,openNote,editable=true}:{board:TaskBoard;notes:Note[];change:(board:TaskBoard)=>void;openNote?:(path:string)=>void;editable?:boolean}) {
  const [filter,setFilter]=useState(''),[sort,setSort]=useState<'manual'|'due'|'priority'>('manual'),[columnName,setColumnName]=useState('');
  const updateTask=(id:string,patch:Partial<Task>)=>change({...board,tasks:board.tasks.map(task=>task.id===id?{...task,...patch}:task)});
  const tasks=[...board.tasks].filter(task=>!filter||`${task.title} ${task.description}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  if(sort==='due')tasks.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  if(sort==='priority')tasks.sort((a,b)=>['high','normal','low'].indexOf(a.priority)-['high','normal','low'].indexOf(b.priority));
  return <section className={`task-board-view${board.compact?' compact':''}`} aria-label={`Доска задач: ${board.name}`}>
    <header className="task-board-heading">
      {editable?<input aria-label="Название доски" defaultValue={board.name} onBlur={event=>event.target.value.trim()&&event.target.value!==board.name&&change({...board,name:event.target.value.trim()})}/>:<strong>{board.name}</strong>}
      <div><input aria-label="Фильтр задач" placeholder="Фильтр" value={filter} onChange={event=>setFilter(event.target.value)}/>
      <select aria-label="Сортировка задач" value={sort} onChange={event=>setSort(event.target.value as typeof sort)}><option value="manual">Порядок</option><option value="due">Срок</option><option value="priority">Приоритет</option></select>
      {editable&&<button type="button" aria-pressed={!!board.compact} onClick={()=>change({...board,compact:!board.compact})}>Компактно</button>}</div>
    </header>
    <div className="task-board-columns">{board.columns.map(column=>{
      const hidden=board.hiddenColumns?.includes(column);
      return <section key={column} className="task-board-column" onDragOver={event=>{if(editable)event.preventDefault()}} onDrop={event=>{if(!editable)return;event.preventDefault();const id=event.dataTransfer.getData('text/task-id');if(id)updateTask(id,{status:column})}}>
        <header><button type="button" aria-expanded={!hidden} onClick={()=>change({...board,hiddenColumns:hidden?board.hiddenColumns?.filter(value=>value!==column):[...(board.hiddenColumns??[]),column]})}>{column}</button><span>{tasks.filter(task=>task.status===column).length}</span>
          {editable&&board.columns.length>1&&<button type="button" title="Удалить колонку" aria-label={`Удалить колонку ${column}`} onClick={()=>change({...board,columns:board.columns.filter(value=>value!==column),hiddenColumns:board.hiddenColumns?.filter(value=>value!==column),tasks:board.tasks.map(task=>task.status===column?{...task,status:board.columns[0]}:task)})}><Trash size={15}/></button>}</header>
        {!hidden&&<div className="task-board-card-list">{tasks.filter(task=>task.status===column).map(task=><article key={task.id} className="task-card" draggable={editable} onDragStart={event=>event.dataTransfer.setData('text/task-id',task.id)}>
          {editable?<input aria-label="Название задачи" defaultValue={task.title} onBlur={event=>event.target.value!==task.title&&updateTask(task.id,{title:event.target.value})}/>:<strong>{task.title}</strong>}
          {editable?<textarea aria-label="Описание задачи" defaultValue={task.description} onBlur={event=>event.target.value!==task.description&&updateTask(task.id,{description:event.target.value})}/>:task.description&&<p>{task.description}</p>}
          <div className="task-card-meta">{editable?<><input aria-label="Срок задачи" type="date" value={task.due??''} onChange={event=>updateTask(task.id,{due:event.target.value||undefined})}/><select aria-label="Приоритет" value={task.priority} onChange={event=>updateTask(task.id,{priority:event.target.value as Task['priority']})}><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option></select><button type="button" title="Удалить задачу" aria-label={`Удалить задачу ${task.title}`} onClick={()=>change({...board,tasks:board.tasks.filter(value=>value.id!==task.id)})}><Trash size={15}/></button></>:<small>{task.due||''} · {task.priority}</small>}</div>
          {task.notes.length>0&&<div className="task-card-notes">{task.notes.map(path=><button type="button" key={path} onClick={()=>openNote?.(path)}>{title(path)}</button>)}</div>}
          {editable&&<select aria-label="Прикрепить заметку" value="" onChange={event=>{const path=event.target.value;if(path&&!task.notes.includes(path))updateTask(task.id,{notes:[...task.notes,path]})}}><option value="">+ Заметка</option>{notes.filter(note=>!task.notes.includes(note.path)).map(note=><option key={note.path} value={note.path}>{title(note.path)}</option>)}</select>}
        </article>)}</div>}
      </section>;
    })}</div>
    {editable&&<form className="task-board-add" onSubmit={event=>{event.preventDefault();const form=event.currentTarget,name=new FormData(form).get('task')?.toString().trim();if(!name)return;const column=board.columns[0]||'К выполнению';change({...board,tasks:[...board.tasks,{id:crypto.randomUUID(),title:name,description:'',priority:'normal',status:column,notes:[]}]});form.reset()}}><input name="task" aria-label="Новая задача" placeholder="Новая задача"/><button type="submit"><Plus size={16}/>Добавить</button></form>}
    {editable&&<form className="task-board-add" onSubmit={event=>{event.preventDefault();const value=columnName.trim();if(!value||board.columns.includes(value))return;change({...board,columns:[...board.columns,value]});setColumnName('')}}><input aria-label="Название новой колонки" placeholder="Новая колонка" value={columnName} onChange={event=>setColumnName(event.target.value)}/><button type="submit"><Plus size={16}/>Колонка</button></form>}
  </section>;
}

export default function TaskBoardManager({boards,notes,project,change,close,openNote}:{boards:TaskBoard[];notes:Note[];project:string;change:(boards:TaskBoard[])=>void;close:()=>void;openNote:(path:string)=>void}) {
  const [selected,setSelected]=useState(boards[0]?.id??'');
  const board=boards.find(value=>value.id===selected);
  const save=(next:TaskBoard)=>change(boards.map(value=>value.id===next.id?next:value));
  return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)close()}}><section className="modal task-board-manager" role="dialog" aria-modal="true" aria-labelledby="task-board-title">
    <header><h2 id="task-board-title">Задачи</h2><button type="button" aria-label="Закрыть" onClick={close}>×</button></header>
    <div className="task-manager-content"><nav aria-label="Доски задач">{boards.map(value=><button key={value.id} type="button" aria-pressed={selected===value.id} onClick={()=>setSelected(value.id)}>{value.name}</button>)}<button type="button" onClick={()=>{const next=newTaskBoard(project);change([...boards,next]);setSelected(next.id)}}><Plus size={16}/>Новая доска</button>
      {board&&<button className="danger" type="button" onClick={()=>{change(boards.filter(value=>value.id!==board.id));setSelected(boards.find(value=>value.id!==board.id)?.id??'')}}><Trash size={16}/>Удалить доску</button>}</nav>
      {board?<TaskBoardView board={board} notes={notes} change={save} openNote={openNote}/>:<p>Создайте доску, чтобы начать работу.</p>}
    </div>
    <footer className="modal-foot"><button type="button" className="primary" onClick={close}><Check size={17}/>Готово</button></footer>
  </section></div>;
}
