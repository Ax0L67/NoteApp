import { ListBullets, ListNumbers, Paperclip, CheckSquare, Quotes as Quote, Code, FileText, Graph, TextIndent, TextOutdent, Ruler } from '@phosphor-icons/react';
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { ReactNode } from 'react';
import {useId,useState} from 'react';
import type {ReferenceKind} from './noteReferences';
import {applyNoteColor} from './noteTextColor';
import {insertBoard as insertBoardWidget,insertFeature,insertTable,type NoteFeature} from './noteFeatureBlocks';
import type {Note,TaskBoard} from './types';
import {title} from './indexing';
import {insertCodeWidget} from './noteCodeWidgets';

type Format = { prefix: string; suffix?: string; placeholder?: string; line?: boolean; url?: boolean };

const tools = [
  { label: 'Заголовок', icon: 'H1', format: { prefix: '# ', line: true } },
  { label: 'Полужирный', icon: 'B', format: { prefix: '**', suffix: '**' } },
  { label: 'Курсив', icon: <i>I</i>, format: { prefix: '*', suffix: '*' } },
  { label: 'Зачёркивание', icon: <s>S</s>, format: { prefix: '~~', suffix: '~~' } },
];

const blockTools = [
  { label: 'Маркированный список', icon: <ListBullets size={21}/>, format: { prefix: '- ', line: true } },
  { label: 'Нумерованный список', icon: <ListNumbers size={21}/>, format: { prefix: '1. ', line: true } },
  { label: 'Список задач', icon: <CheckSquare size={21}/>, format: { prefix: '- [ ] ', line: true } },
  { label: 'Цитата', icon: <Quote size={21}/>, format: { prefix: '> ', line: true } },
  { label: 'Код', icon: <Code size={21}/>, format: { prefix: '`', suffix: '`' } },
];
const symbols=['©','®','™','§','№','«','»','…','—','–','•','→','←','↔','↑','↓','✓','✗','★','☆','±','×','÷','≠','≤','≥','∞','°','µ','Ω','π','√','₽','€','£'];

export function changeIndent(view:EditorView,add:boolean) {
  const {from,to}=view.state.selection.main;
  const first=view.state.doc.lineAt(from).number;
  const last=view.state.doc.lineAt(to>from?to-1:to).number;
  const changes=Array.from({length:last-first+1},(_,index)=>{
    const line=view.state.doc.line(first+index);
    if(add)return {from:line.from,insert:'\t'};
    const indent=/^(?:\t| {1,4})/.exec(line.text)?.[0].length??0;
    return {from:line.from,to:line.from+indent};
  });
  view.dispatch({changes,userEvent:'input.indent'});
  view.focus();
}

export function applyFormat(view: EditorView, format: Format) {
  const { from, to } = view.state.selection.main;
  if (format.line) {
    const first = view.state.doc.lineAt(from);
    const last = view.state.doc.lineAt(to > from ? to - 1 : to);
    const changes = Array.from({ length: last.number - first.number + 1 }, (_, index) => {
      const line = view.state.doc.line(first.number + index);
      const insert = format.prefix === '1. ' ? `${index + 1}. ` : format.prefix;
      return { from: line.from, insert };
    });
    view.dispatch({ changes });
  } else {
    const selected = view.state.sliceDoc(from, to) || format.placeholder || '';
    const multilineCode = format.prefix === '`' && selected.includes('\n');
    const prefix = multilineCode ? '```\n' : format.prefix;
    const suffix = multilineCode ? '\n```' : format.suffix;
    const textStart = from + prefix.length;
    const textEnd = textStart + selected.length;
    const selection = format.url
      ? EditorSelection.range(textEnd + 2, textEnd + 10)
      : EditorSelection.range(textStart, textEnd);
    view.dispatch({
      changes: { from, to, insert: prefix + selected + (suffix ?? '') },
      selection,
    });
  }
  view.focus();
}

export default function MarkdownToolbar({ runEdit, disabled, colorDisabled = disabled, typography, insertReference, createWidget,taskBoards=[],changeTaskBoard,insertMapFeature,insertCode,insertCanvasNote,insertShape,shapeNames,onRuler,rulerActive }: {
  runEdit: (action: (view: EditorView) => void) => void;
  disabled: boolean;
  colorDisabled?: boolean;
  typography?: ReactNode;
  insertReference?: (kind:ReferenceKind)=>void;
  createWidget: (kind:'text'|'image'|'link')=>void;
  openTasks?:()=>void;
  insertBoard?:(view:EditorView,id?:string)=>void;
  taskBoards?:TaskBoard[];
  changeTaskBoard?:(board:TaskBoard)=>void;
  insertMapFeature?:(kind:NoteFeature|'table', options?:{rows?:number;columns?:number;boardId?:string;column?:string;taskId?:string})=>void;
  insertCode?:()=>void;
  canvasNotes?:Note[];
  insertCanvasNote?:()=>void;
  insertShape?:(name:string)=>void;
  shapeNames?:string[];
  onRuler?:()=>void;
  rulerActive?:boolean;
}) {
  const [panel,setPanel]=useState<'format'|'insert'>('format');
  const [widgetMenu,setWidgetMenu]=useState(false);
  const [shapeMenu,setShapeMenu]=useState(false);
  const [termDraft,setTermDraft]=useState<{view:EditorView;source:string;items:{offset:number;term:string;definition:string;enabled:boolean}[]}|null>(null);
  const [termSearch,setTermSearch]=useState('');
  const [tableMenu,setTableMenu]=useState(false),[tableRows,setTableRows]=useState(1),[tableColumns,setTableColumns]=useState(2);
  const [selectedBoard,setSelectedBoard]=useState(''),[boardMenu,setBoardMenu]=useState(false),[boardPart,setBoardPart]=useState<'board'|'column'|'task'>('board'),[selectedPart,setSelectedPart]=useState('');
  const [noteMenu,setNoteMenu]=useState(false),[selectedNote,setSelectedNote]=useState('');
  const board=taskBoards.find(item=>item.id===selectedBoard);
  const insertDisabled=disabled&&!insertMapFeature;
  const addFeature=(kind:NoteFeature)=>insertMapFeature?insertMapFeature(kind):runEdit(view=>insertFeature(view,kind));
  const addTable=()=>insertMapFeature?insertMapFeature('table',{rows:tableRows,columns:tableColumns}):runEdit(view=>insertTable(view,tableRows,tableColumns));
  const panelId=useId();
  const tool=({ label, icon, format }: (typeof tools)[number] | (typeof blockTools)[number]) =>
    <button key={label} type="button" title={label}
      aria-label={label} disabled={disabled}
      onMouseDown={event => event.preventDefault()}
      onClick={() => runEdit(view => applyFormat(view, format))}>{icon}</button>;
  return <div className="markdown-toolset">
    <div className="markdown-ribbon-tabs" role="group" aria-label="Вкладки редактора">
      <button type="button" aria-pressed={panel==='format'} aria-controls={panelId}
        onMouseDown={event=>event.preventDefault()} onClick={()=>setPanel('format')}>Главная</button>
      <button type="button" aria-pressed={panel==='insert'} aria-controls={panelId}
        onMouseDown={event=>event.preventDefault()} onClick={()=>setPanel('insert')}>Вставка</button>
    </div>
    <div className="markdown-ribbon-controls">
    <div id={panelId} className="markdown-toolbar" role="group" aria-label={panel==='format'?'Форматирование':'Вставка в документ'}>
      {panel==='format'?<>
        {!insertMapFeature&&<button type="button" className="ribbon-action" disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>runEdit(view=>{
          const source=view.state.doc.toString(),items:{offset:number;term:string;definition:string;enabled:boolean}[]=[];
          let offset=0,fence='';
          for(const line of source.split('\n')){
            const marker=/^\s*(`{3,}|~{3,})/.exec(line)?.[1];
            if(marker){if(!fence)fence=marker;else if(marker[0]===fence[0]&&marker.length>=fence.length)fence='';}
            else if(!fence&&!/^\s*(?:#|>|[-*+]\s|\d+[.)]\s)/.test(line)&&!line.includes('noteapp-definition:')){
              const parts=line.split(/\s*[-—–]\s*/);
              if(parts.length===2&&parts[0].trim()&&parts[1].trim()&&parts[0].trim().length<=100)items.push({offset:offset+line.length,term:parts[0].trim(),definition:parts[1].trim(),enabled:true});
            }
            offset+=line.length+1;
          }
          setTermSearch('');setTermDraft({view,source,items});
        })}>Сделать терминами</button>}
        <div className="markdown-ribbon-group" role="group" aria-label="Шрифт">
          {typography}
          <input className="ribbon-text-color" type="color" aria-label="Цвет выделенного текста"
            title="Выделите текст в режиме правки, затем выберите цвет" defaultValue="#eeeeee" disabled={colorDisabled}
            onChange={event=>{const color=event.target.value;runEdit(view=>applyNoteColor(view,color));}}/>
        </div>
        {onRuler&&<div className="markdown-ribbon-group"><button type="button" className="ribbon-action" title="Линейка" aria-label="Линейка" aria-pressed={rulerActive} disabled={disabled} onClick={onRuler}><Ruler size={18}/>Линейка</button></div>}
        <div className="markdown-ribbon-group" role="group" aria-label="Начертание">{tools.map(tool)}</div>
        <div className="markdown-ribbon-group" role="group" aria-label="Абзац">
          {blockTools.map(tool)}
          <button type="button" title="Блок кода" aria-label="Блок кода" disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>runEdit(view=>{const {from,to}=view.state.selection.main,text=view.state.sliceDoc(from,to),ticks=String.fromCharCode(96).repeat(Math.max(3,...[...text.matchAll(/`+/g)].map(match=>match[0].length+1))),insert=`\n${ticks}\n${text}\n${ticks}\n`;view.dispatch({changes:{from,to,insert},selection:{anchor:from+ticks.length+2,head:from+ticks.length+2+text.length}});view.focus();})}>Блок кода</button>
          <button type="button" title="Уменьшить отступ" aria-label="Уменьшить отступ" disabled={disabled}
            onMouseDown={event=>event.preventDefault()} onClick={()=>runEdit(view=>changeIndent(view,false))}><TextOutdent size={21}/></button>
          <button type="button" title="Увеличить отступ" aria-label="Увеличить отступ" disabled={disabled}
            onMouseDown={event=>event.preventDefault()} onClick={()=>runEdit(view=>changeIndent(view,true))}><TextIndent size={21}/></button>
        </div>
      </>:<>
        <div className="markdown-ribbon-group" role="group" aria-label="Ссылки">
          {insertReference&&<>
            <button type="button" className="ribbon-action" onMouseDown={event=>event.preventDefault()}
              onClick={()=>insertReference('note')}><FileText size={17}/>На заметку</button>
            <button type="button" className="ribbon-action" onMouseDown={event=>event.preventDefault()}
              onClick={()=>insertReference('map')}><Graph size={17}/>На карту</button>
          </>}
        </div>
        <div className="markdown-ribbon-group" role="group" aria-label="Объекты">
          {insertCanvasNote&&<button type="button" className="ribbon-action" disabled={insertDisabled} onClick={insertCanvasNote}><FileText size={17}/>Заметка</button>}
          {insertShape&&<div className="widget-insert" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setShapeMenu(false)}}><button type="button" className="ribbon-action" disabled={insertDisabled} aria-expanded={shapeMenu} onClick={()=>setShapeMenu(value=>!value)}>Фигуры</button>{shapeMenu&&<div className="widget-insert-menu canvas-shape-menu">{shapeNames?.map(name=><button type="button" key={name} onClick={()=>{insertShape(name);setShapeMenu(false)}}>{name}</button>)}</div>}</div>}
          <div className="widget-insert" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setWidgetMenu(false);}}
            onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setWidgetMenu(false);}}}>
            <button type="button" className="ribbon-action" title="Выбрать виджет" aria-label="Виджет"
              aria-haspopup="menu" aria-expanded={widgetMenu} disabled={insertDisabled}
              onMouseDown={event=>{if(event.button===0)event.preventDefault();}} onClick={()=>setWidgetMenu(value=>!value)}><Paperclip size={17}/>Виджет</button>
            {widgetMenu&&<div className="widget-insert-menu" role="menu" aria-label="Тип виджета">
              <button type="button" role="menuitem" onMouseDown={event=>event.preventDefault()} onClick={()=>{setWidgetMenu(false);createWidget('text');}}>Текст</button>
              <button type="button" role="menuitem" onMouseDown={event=>event.preventDefault()} onClick={()=>{setWidgetMenu(false);createWidget('image');}}>Изображение</button>
              <button type="button" role="menuitem" onMouseDown={event=>event.preventDefault()} onClick={()=>{setWidgetMenu(false);createWidget('link');}}>Ссылка</button>
              <button type="button" role="menuitem" onMouseDown={event=>event.preventDefault()} onClick={()=>{setWidgetMenu(false);addFeature('compare');}}>Сравнение</button>
              <button type="button" role="menuitem" onMouseDown={event=>event.preventDefault()} onClick={()=>{setWidgetMenu(false);addFeature('source');}}>Источник</button>
              <button type="button" role="menuitem" onMouseDown={event=>event.preventDefault()} onClick={()=>{setWidgetMenu(false);addFeature('concept');}}>Термин</button>
              <button type="button" role="menuitem" onMouseDown={event=>event.preventDefault()} onClick={()=>{setWidgetMenu(false);insertCode?insertCode():runEdit(view=>insertCodeWidget(view));}}>Код</button>
              <button type="button" role="menuitem" onMouseDown={event=>event.preventDefault()} onClick={()=>{setWidgetMenu(false);addTable();}}>Таблица</button>
              <button type="button" role="menuitem" onMouseDown={event=>event.preventDefault()} onClick={()=>{setWidgetMenu(false);addFeature('math');}}>Формула</button>
              <button type="button" role="menuitem" onMouseDown={event=>event.preventDefault()} onClick={()=>{setWidgetMenu(false);addFeature('plot');}}>График</button>
            </div>}
          </div>
          <div className="widget-insert" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setBoardMenu(false);}} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setBoardMenu(false);}}}>
            <button type="button" className="ribbon-action" aria-expanded={boardMenu} disabled={insertDisabled} onMouseDown={event=>event.preventDefault()} onClick={()=>setBoardMenu(value=>!value)}>Kanban доска</button>
            {boardMenu&&<div className="widget-insert-menu" aria-label="Вставить Kanban">
              <select aria-label="Доска Kanban" value={selectedBoard} onChange={event=>{setSelectedBoard(event.target.value);setSelectedPart('');}}><option value="">Выберите доску</option>{taskBoards.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select aria-label="Что вставить" value={boardPart} onChange={event=>{setBoardPart(event.target.value as 'board'|'column'|'task');setSelectedPart('');}}><option value="board">Вся доска</option><option value="column">Столбец</option><option value="task">Задача</option></select>
              {boardPart!=='board'&&<select aria-label={boardPart==='column'?'Столбец Kanban':'Задача Kanban'} value={selectedPart} onChange={event=>setSelectedPart(event.target.value)}><option value="">Выберите {boardPart==='column'?'столбец':'задачу'}</option>{boardPart==='column'?board?.columns.map(column=><option key={column} value={column}>{column}</option>):board?.tasks.map(task=><option key={task.id} value={task.id}>{task.title}</option>)}</select>}
              <button type="button" disabled={!board||(boardPart!=='board'&&!selectedPart)} onMouseDown={event=>event.preventDefault()} onClick={()=>{if(!board)return;let column:string|undefined;if(boardPart==='column'){column=board.columnIds?.[selectedPart];if(!column&&changeTaskBoard){column=crypto.randomUUID();changeTaskBoard({...board,columnIds:{...board.columnIds,[selectedPart]:column}});}column??=selectedPart;}const taskId=boardPart==='task'?selectedPart:undefined;setBoardMenu(false);insertMapFeature?insertMapFeature('board',{boardId:board.id,column,taskId}):runEdit(view=>insertBoardWidget(view,board.id,column,taskId,boardPart==='column'?{...board,columnIds:{...board.columnIds,[selectedPart]:column!}}:board));}}>Вставить</button>
            </div>}
          </div>
          <select className="font-picker" aria-label="Специальные символы" value="" disabled={disabled}
            onChange={event=>{
              const symbol=event.target.value;
              if(symbol)runEdit(view=>{
                view.dispatch(view.state.replaceSelection(symbol));
                view.focus();
              });
            }}>
            <option value="">Символы</option>
            {symbols.map(symbol=><option key={symbol}>{symbol}</option>)}
          </select>
        </div>
        <button type="button" className="ribbon-action" disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>runEdit(view=>{const {from,to}=view.state.selection.main;view.dispatch({changes:{from,to,insert:'\n\n---\n\n'},selection:{anchor:from+7},userEvent:'input.horizontal-rule'});view.focus();})}>Горизонтальная линия</button>
      </>}
    </div>
    {termDraft&&<div className="modal-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)setTermDraft(null)}}>
      <section className="modal term-draft-dialog" role="dialog" aria-modal="true" aria-label="Найденные термины">
        <header><h2>Найденные термины</h2><button type="button" aria-label="Закрыть" onClick={()=>setTermDraft(null)}>×</button></header>
        <div className="term-draft-controls">
          <input type="search" aria-label="Поиск терминов" placeholder="Поиск по терминам и определениям" value={termSearch} onChange={event=>setTermSearch(event.target.value)}/>
          <div><span>Выбрано {termDraft.items.filter(item=>item.enabled).length} из {termDraft.items.length}</span><button type="button" onClick={()=>setTermDraft({...termDraft,items:termDraft.items.map(item=>({...item,enabled:true}))})}>Выбрать все</button><button type="button" onClick={()=>setTermDraft({...termDraft,items:termDraft.items.map(item=>({...item,enabled:false}))})}>Снять выбор</button></div>
        </div>
        <div className="term-draft-list">
          {termDraft.items.map((item,index)=>({item,index})).filter(({item})=>`${item.term} ${item.definition}`.toLocaleLowerCase().includes(termSearch.trim().toLocaleLowerCase())).map(({item,index})=><div key={item.offset} className={!item.enabled?'term-draft-item-disabled':undefined}>
            <label className="term-draft-select"><input type="checkbox" checked={item.enabled} aria-label={`Добавить термин ${item.term}`} onChange={event=>setTermDraft({...termDraft,items:termDraft.items.map((value,i)=>i===index?{...value,enabled:event.target.checked}:value)})}/></label>
            <div className="term-draft-fields"><label>Термин<input value={item.term} onChange={event=>setTermDraft({...termDraft,items:termDraft.items.map((value,i)=>i===index?{...value,term:event.target.value}:value)})}/></label><label>Определение<textarea rows={2} value={item.definition} onChange={event=>setTermDraft({...termDraft,items:termDraft.items.map((value,i)=>i===index?{...value,definition:event.target.value}:value)})}/></label></div>
          </div>)}
          {!termDraft.items.length?<p>Подходящие определения не найдены.</p>:!termDraft.items.some(item=>`${item.term} ${item.definition}`.toLocaleLowerCase().includes(termSearch.trim().toLocaleLowerCase()))&&<p>По вашему запросу ничего не найдено.</p>}
        </div>
        <div className="modal-foot"><button type="button" onClick={()=>setTermDraft(null)}>Отмена</button><button type="button" className="primary" disabled={!termDraft.items.some(item=>item.enabled&&item.term.trim()&&item.definition.trim())} onClick={()=>{const {view,source,items}=termDraft;if(!view.dom.isConnected||view.state.doc.toString()!==source){setTermDraft(null);return}view.dispatch({changes:items.filter(item=>item.enabled&&item.term.trim()&&item.definition.trim()).map(item=>({from:item.offset,insert:`<!-- noteapp-definition:${encodeURIComponent(JSON.stringify({term:item.term.trim(),definition:item.definition.trim()}))} -->`})),userEvent:'input.note-definition'});view.focus();setTermDraft(null)}}>Добавить выбранные</button></div>
      </section>
    </div>}
    </div>
  </div>;
}
