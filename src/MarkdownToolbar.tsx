import { ListBullets, ListNumbers, Paperclip, CheckSquare, Quotes as Quote, Code, FileText, Graph, TextIndent, TextOutdent } from '@phosphor-icons/react';
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { ReactNode } from 'react';
import {useId,useState} from 'react';
import type {ReferenceKind} from './noteReferences';
import {applyNoteColor} from './noteTextColor';
import {insertFeature,insertTable,type NoteFeature} from './noteFeatureBlocks';
import type {TaskBoard} from './types';
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

function changeIndent(view:EditorView,add:boolean) {
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

function applyFormat(view: EditorView, format: Format) {
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

export default function MarkdownToolbar({ runEdit, disabled, colorDisabled = disabled, typography, insertReference, createWidget,openTasks,insertBoard,taskBoards=[],insertMapFeature }: {
  runEdit: (action: (view: EditorView) => void) => void;
  disabled: boolean;
  colorDisabled?: boolean;
  typography?: ReactNode;
  insertReference?: (kind:ReferenceKind)=>void;
  createWidget: (kind:'text'|'image'|'link')=>void;
  openTasks?:()=>void;
  insertBoard?:(view:EditorView,id?:string)=>void;
  taskBoards?:TaskBoard[];
  insertMapFeature?:(kind:NoteFeature|'table', options?:{rows?:number;columns?:number;boardId?:string})=>void;
}) {
  const [panel,setPanel]=useState<'format'|'insert'>('format');
  const [widgetMenu,setWidgetMenu]=useState(false);
  const [tableMenu,setTableMenu]=useState(false),[tableRows,setTableRows]=useState(3),[tableColumns,setTableColumns]=useState(3);
  const [selectedBoard,setSelectedBoard]=useState('');
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
        <div className="markdown-ribbon-group" role="group" aria-label="Шрифт">
          {typography}
          <input className="ribbon-text-color" type="color" aria-label="Цвет выделенного текста"
            title="Выделите текст в режиме правки, затем выберите цвет" defaultValue="#eeeeee" disabled={colorDisabled}
            onChange={event=>{const color=event.target.value;runEdit(view=>applyNoteColor(view,color));}}/>
        </div>
        <div className="markdown-ribbon-group" role="group" aria-label="Начертание">{tools.map(tool)}</div>
        <div className="markdown-ribbon-group" role="group" aria-label="Абзац">
          {blockTools.map(tool)}
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
          <div className="widget-insert" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setWidgetMenu(false);}}
            onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setWidgetMenu(false);}}}>
            <button type="button" className="ribbon-action" title="Добавить текстовый виджет. Правый клик — другие типы" aria-label="Добавить текстовый виджет"
              aria-haspopup="menu" aria-expanded={widgetMenu} disabled={insertDisabled}
              onMouseDown={event=>{if(event.button===0)event.preventDefault();}} onClick={()=>{setWidgetMenu(false);createWidget('text');}}
              onContextMenu={event=>{event.preventDefault();setWidgetMenu(true);}}><Paperclip size={17}/>Виджет</button>
            {widgetMenu&&<div className="widget-insert-menu" role="menu" aria-label="Тип виджета">
              <button type="button" role="menuitem" onMouseDown={event=>event.preventDefault()} onClick={()=>{setWidgetMenu(false);createWidget('text');}}>Текст</button>
              <button type="button" role="menuitem" onMouseDown={event=>event.preventDefault()} onClick={()=>{setWidgetMenu(false);createWidget('image');}}>Изображение</button>
              <button type="button" role="menuitem" onMouseDown={event=>event.preventDefault()} onClick={()=>{setWidgetMenu(false);createWidget('link');}}>Ссылка</button>
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
        <div className="markdown-ribbon-group feature-insert-actions" role="group" aria-label="Интерактивные блоки">
          <button type="button" title="Сравнительный блок" disabled={insertDisabled} onMouseDown={event=>event.preventDefault()} onClick={()=>addFeature('compare')}>Сравнение</button>
          <button type="button" title="Карточка источника" disabled={insertDisabled} onMouseDown={event=>event.preventDefault()} onClick={()=>addFeature('source')}>Источник</button>
          <button type="button" title="Назначить определение выделенному термину" disabled={insertDisabled} onMouseDown={event=>event.preventDefault()} onClick={()=>addFeature('concept')}>Термин</button>
          <button type="button" title="Вставить виджет Python / C++" disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>runEdit(view=>insertCodeWidget(view))}>Код</button>
          <div className="table-insert">
            <button type="button" title="Вставить таблицу. Правый клик — выбрать размер" aria-expanded={tableMenu} aria-haspopup="menu" disabled={insertDisabled}
              onMouseDown={event=>{if(event.button===0)event.preventDefault();}}
              onClick={()=>{setTableMenu(false);addTable();}}
              onContextMenu={event=>{event.preventDefault();setTableMenu(true);}}>Таблица</button>
            {tableMenu&&<div className="table-insert-popover"><label>Строки<input type="number" min={1} max={30} value={tableRows} onChange={event=>setTableRows(Number(event.target.value))}/></label><label>Столбцы<input type="number" min={1} max={16} value={tableColumns} onChange={event=>setTableColumns(Number(event.target.value))}/></label><button type="button" onMouseDown={event=>event.preventDefault()} onClick={()=>{setTableMenu(false);addTable()}}>Вставить</button></div>}
          </div>
          <button type="button" title="Интерактивная формула" disabled={insertDisabled} onMouseDown={event=>event.preventDefault()} onClick={()=>addFeature('math')}>Формула</button>
          <button type="button" title="График функции" disabled={insertDisabled} onMouseDown={event=>event.preventDefault()} onClick={()=>addFeature('plot')}>График</button>
          <button type="button" title="Открыть общую доску задач" disabled={insertDisabled} onMouseDown={event=>event.preventDefault()} onClick={openTasks}>Задачи</button>
          <select className="font-picker" aria-label="Доска для встраивания" value={selectedBoard} onChange={event=>setSelectedBoard(event.target.value)}><option value="">Новая доска</option>{taskBoards.map(board=><option key={board.id} value={board.id}>{board.name}</option>)}</select>
          <button type="button" title="Встроить доску задач в заметку" disabled={insertDisabled} onMouseDown={event=>event.preventDefault()} onClick={()=>insertMapFeature?insertMapFeature('board',{boardId:selectedBoard||undefined}):runEdit(view=>insertBoard?.(view,selectedBoard||undefined))}>Встроить</button>
        </div>
      </>}
    </div>
    </div>
  </div>;
}
