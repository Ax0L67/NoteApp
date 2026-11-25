import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import type {EditorView} from '@codemirror/view';
import {applyFormat,changeIndent} from './MarkdownToolbar';
import {insertFeature,insertTable} from './noteFeatureBlocks';
import {insertCodeWidget} from './noteCodeWidgets';
import {floatNoteText} from './noteTextBlocks';

type Props={view:EditorView;x:number;y:number;widget?:HTMLElement;close:()=>void;taskText?:boolean};
export default function NoteContextMenu({view,x,y,widget,close,taskText=false}:Props) {
 const [category,setCategory]=useState('');
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[close]);
 const action=(fn:()=>void)=>{close();fn();};
 const format=(prefix:string,suffix?:string,line=false)=>action(()=>applyFormat(view,{prefix,suffix,line}));
 const insert=(text:string)=>action(()=>{view.dispatch(view.state.replaceSelection(text));view.focus();});
 const copy=async(cut:boolean)=>{const {from,to}=view.state.selection.main;if(from===to)return;await navigator.clipboard.writeText(view.state.sliceDoc(from,to));if(cut)view.dispatch({changes:{from,to},userEvent:'delete.cut'});view.focus();};
 const paste=async()=>{const text=await navigator.clipboard.readText();view.dispatch(view.state.replaceSelection(text));view.focus();};
 const selection=view.state.sliceDoc(view.state.selection.main.from,view.state.selection.main.to),parts=selection.split(/[-–—]/),definition=parts.length===2&&parts[0].trim()&&parts[1].trim()?{term:parts[0].trim(),definition:parts[1].trim()}:null;
 const categories:Record<string,[string,()=>void][]>= {
  'Форматирование':[['Жирный',()=>format('**','**')],['Курсив',()=>format('*','*')],['Зачёркивание',()=>format('~~','~~')],['Код',()=>format('`','`')]],
  'Абзац':[['Заголовок',()=>format('# ',undefined,true)],['Маркированный список',()=>format('- ',undefined,true)],['Нумерованный список',()=>format('1. ',undefined,true)],['Список задач',()=>format('- [ ] ',undefined,true)],['Цитата',()=>format('> ',undefined,true)],['Увеличить отступ',()=>action(()=>changeIndent(view,true))],['Уменьшить отступ',()=>action(()=>changeIndent(view,false))]],
  'Вставка':[['Текстовый виджет',()=>action(()=>floatNoteText(view,'text'))],['Изображение',()=>action(()=>floatNoteText(view,'image'))],['Ссылка',()=>action(()=>floatNoteText(view,'link'))],['Таблица',()=>action(()=>insertTable(view))],['Формула',()=>action(()=>insertFeature(view,'math'))],['График',()=>action(()=>insertFeature(view,'plot'))],['Сравнение',()=>action(()=>insertFeature(view,'compare'))],['Источник',()=>action(()=>insertFeature(view,'source'))],['Термин',()=>action(()=>insertFeature(view,'concept'))],['Код',()=>action(()=>insertCodeWidget(view))],['Горизонтальная линия',()=>insert('\n\n---\n\n')]]
 };
 if(taskText)categories['Вставка']=categories['Вставка'].filter(([label])=>label==='Таблица');
 const left=Math.max(4,Math.min(x,window.innerWidth-235)),top=Math.max(4,Math.min(y,window.innerHeight-320));
 return createPortal(<><div className="note-context-dismiss" onMouseDown={close} onContextMenu={e=>{e.preventDefault();close();}}/><div className="note-context-menu" style={{left,top}} role="menu" onMouseDown={e=>e.preventDefault()}>
 {widget?<><button role="menuitem" onClick={()=>action(()=>{const details=widget.querySelector<HTMLDetailsElement>('.note-insert-menu');if(details)details.open=true;})}>Настройки виджета</button><button role="menuitem" onClick={()=>action(()=>{const buttons=widget.querySelectorAll<HTMLButtonElement>('.note-insert-actions button');for(const button of buttons)if(button.textContent?.trim()==='Удалить'){button.click();break;}})}>Удалить виджет</button></>:<>
 <button role="menuitem" onClick={()=>format('[','](https://)')}>Вставить внешнюю ссылку</button>
 {definition&&<button role="menuitem" onClick={()=>action(()=>{const at=view.state.selection.main.to;view.dispatch({changes:{from:at,insert:`<!-- noteapp-definition:${encodeURIComponent(JSON.stringify(definition))} -->`},userEvent:'input.note-definition'});view.focus();})}>Сделать термином</button>}
 {Object.keys(categories).map(name=><div className="note-context-category" key={name} onMouseEnter={()=>setCategory(name)}><button role="menuitem" aria-haspopup="menu" aria-expanded={category===name} onClick={()=>setCategory(name)}>{name}<span>›</span></button>{category===name&&<div className="note-context-submenu" role="menu" style={{right:left+465>window.innerWidth?'100%':undefined,left:left+465>window.innerWidth?'auto':'100%'}}>{categories[name].map(([label,fn])=><button role="menuitem" key={label} onClick={fn}>{label}</button>)}</div>}</div>)}
 <div className="note-context-separator"/><button role="menuitem" disabled={view.state.selection.main.empty} onClick={()=>action(()=>void copy(true))}>Вырезать</button><button role="menuitem" disabled={view.state.selection.main.empty} onClick={()=>action(()=>void copy(false))}>Копировать</button><button role="menuitem" onClick={()=>action(()=>void paste())}>Вставить</button><button role="menuitem" onClick={()=>action(()=>void paste())}>Вставить как обычный текст</button><button role="menuitem" onClick={()=>action(()=>{view.dispatch({selection:{anchor:0,head:view.state.doc.length}});view.focus();})}>Выделить всё</button>
 </>}</div></>,view.dom.closest('.app')??document.body);
}
