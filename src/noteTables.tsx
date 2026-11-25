import CodeMirror from '@uiw/react-codemirror';
import {markdown as markdownLanguage} from '@codemirror/lang-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {DotsThree} from '@phosphor-icons/react';
import {noteTextColor,remarkNoteColor} from './noteTextColor';
import {noteFenceRanges} from './noteFenceRanges';
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {createRoot,type Root} from 'react-dom/client';
import {StateField} from '@codemirror/state';
import {Decoration,EditorView,WidgetType,type DecorationSet} from '@codemirror/view';
import {widgetBorderWidth,defaultNoteWidgetPosition,noteWidgetChrome,tableMinimumSize,type NoteWidgetPosition} from './noteWidgetChrome';
import {elementGridStep} from './gridGeometry';
import {paletteDragType,palettes,readPaletteDrop} from './appearance';
import {textureById} from './textures';
import {inlineMath,mathHtml,prepareMathMarkdown} from './noteInlineMath';

const activeCells=new WeakMap<HTMLElement,EditorView>();
export function activeTableEditor(root:HTMLElement|null) {const view=root?activeCells.get(root):undefined;return view&&root?.contains(view.dom)?view:undefined;}
export function clearActiveTableEditor(root:HTMLElement|null) {if(root)activeCells.delete(root);}
const tableCellExtensions=[markdownLanguage(),inlineMath,noteTextColor,EditorView.lineWrapping,EditorView.domEventHandlers({focus(_event,view){const root=view.dom.closest<HTMLElement>('.main-note-editor');if(root)activeCells.set(root,view);return false;}})];
function TableCell({value,label,change,focus,paste}:{value:string;label:string;change:(value:string)=>void;focus:()=>void;paste:(event:ClipboardEvent)=>boolean}) {
 const pasteRef=useRef(paste);pasteRef.current=paste;
 const extensions=useMemo(()=>[...tableCellExtensions,EditorView.domEventHandlers({paste(event){return pasteRef.current(event);}})],[]);
 return <CodeMirror className="visual-table-cell" value={value.replace(/<br\s*\/?\s*>/gi,'\n')} onChange={change} onFocus={focus} extensions={extensions} basicSetup={{lineNumbers:false,foldGutter:false,highlightActiveLine:false,highlightActiveLineGutter:false,autocompletion:false}} aria-label={label}/>;
}
type TableData={rows:string[][];align:('left'|'center'|'right')[];widths:number[];heights?:number[];palettes?:(string|null)[]};
type TableRange={from:number;to:number;source:string;header:string;separator:string;body:string[];comment:string;widget?:NoteWidgetPosition};
const tableComment=(line:string)=>/^<!-- noteapp-table(?:\s+[a-z]+=[^\s>]*)+\s+-->$/.test(line);
function markerValues(comment:string){return Object.fromEntries([...comment.matchAll(/([a-z]+)=([^\s>]+)/g)].map(match=>[match[1],match[2]]));}
function parseWidget(comment:string):NoteWidgetPosition|undefined {
  const values=markerValues(comment);if(!['x','y','w','h','z'].every(key=>Number.isFinite(Number(values[key]))))return;
  return {borderWidth:values.bw===undefined?undefined:widgetBorderWidth(Number(values.bw)),x:Number(values.x),y:Number(values.y),width:Number(values.w),height:Number(values.h),z:Number(values.z),color:values.c?`#${values.c}`:undefined,fill:values.b?`#${values.b}`:undefined,texture:textureById(values.tx)?.id,scale:values.s?Math.max(0,Math.min(3,Number(values.s)/100)):1};
}
const roots=new WeakMap<HTMLElement,Root>();
type TableWidgetContext={range:TableRange;position:NoteWidgetPosition;draft:TableData;content:string;root?:Root;actions?:HTMLElement;dispose?:()=>void;view:EditorView;render:(range:TableRange)=>void};
const tableContexts=new WeakMap<HTMLElement,TableWidgetContext>();
const splitRow=(line:string)=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(cell=>cell.trim().replace(/\\\|/g,'|'));
const pipeLine=(line:string)=>line.includes('|')&&(splitRow(line).length>1||/^\s*\|.*\|\s*$/.test(line));
const alignment=(cell:string):'left'|'center'|'right'=>cell.startsWith(':')&&cell.endsWith(':')?'center':cell.endsWith(':')?'right':'left';
const tableContent=(range:TableRange)=>[range.header,range.separator,...range.body].join('\n');
function parse(range:TableRange):TableData {
  const header=splitRow(range.header),body=range.body.map(splitRow),columns=header.length;
  const widths=markerValues(range.comment).widths?.split(',').map(Number)??Array(columns).fill(Math.floor(100/columns));
  const columnPalettes=markerValues(range.comment).palettes?.split(',')??[];
  const heights=markerValues(range.comment).heights?.split(',').map(Number).filter(Number.isFinite);
  return {heights,rows:[header,...body].map(row=>Array.from({length:columns},(_,i)=>row[i]??'')),align:splitRow(range.separator).map(alignment),widths:Array.from({length:columns},(_,i)=>widths[i]??Math.floor(100/columns)),palettes:Array.from({length:columns},(_,i)=>palettes.some(palette=>palette.id===columnPalettes[i])?columnPalettes[i]:null)};
}
function safeCell(value:string){return value.replace(/\r?\n/g,'<br>').replace(/\|/g,'\\|')}
function serialize(table:TableData,widget:NoteWidgetPosition) {
  const columns=table.rows[0]?.length??1;
  const header=`| ${table.rows[0].map(safeCell).join(' | ')} |`;
  const separator=`| ${Array.from({length:columns},(_,i)=>table.align[i]==='center'?':---:':table.align[i]==='right'?'---:':':---').join(' | ')} |`;
  const body=table.rows.slice(1).map(row=>`| ${Array.from({length:columns},(_,i)=>safeCell(row[i]??'')).join(' | ')} |`);
  const comment=`<!-- noteapp-table widths=${table.widths.join(',')}${table.heights?.length?` heights=${table.heights.join(',')}`:''} palettes=${(table.palettes??[]).map(value=>value??'').join(',')} x=${widget.x} y=${widget.y} w=${widget.width} h=${widget.height} z=${widget.z}${widget.color?` c=${widget.color.replace('#','')}`:''}${widget.fill?` b=${widget.fill.replace('#','')}`:''}${textureById(widget.texture)?` tx=${widget.texture}`:''} s=${Math.round((widget.scale??1)*100)}${widget.borderWidth!==undefined?` bw=${widgetBorderWidth(widget.borderWidth)}`:''} -->\n`;
  return `${comment}${[header,separator,...body].join('\n')}`;
}

function MarkdownTable({table,source,update,markdown,draftChange,menuActions,openMenu}:{table:TableData;source:string;update:(data:TableData)=>void;markdown:()=>void;draftChange:(data:TableData)=>void;menuActions:HTMLElement;openMenu?:()=>void}) {
  const [context,setContext]=useState<{x:number;y:number}|null>(null);
  const [draft,setDraft]=useState(table),[selection,setSelection]=useState({from:[0,0] as [number,number],to:[0,0] as [number,number]});
  const tableRef=useRef<HTMLTableElement>(null),[rowBoundaries,setRowBoundaries]=useState<number[]>([]);
  useLayoutEffect(()=>{const element=tableRef.current;if(!element)return;const measure=()=>setRowBoundaries(Array.from(element.rows,row=>row.offsetTop+row.offsetHeight));const observer=new ResizeObserver(measure);observer.observe(element);Array.from(element.rows,row=>observer.observe(row));measure();return()=>observer.disconnect();},[draft.rows.length]);
  useEffect(()=>setDraft(table),[source]);
  const resizing=useRef<{pointer:number;x:number;width:number;column:number;direction:number;widths:number[]}|null>(null);
  const rowResize=useRef<{pointer:number;y:number;row:number;height:number}|null>(null);
  const draggingColumn=useRef<number|null>(null),draggingRow=useRef<number|null>(null),rangeAnchor=useRef<[number,number]>([0,0]),extending=useRef(false);
  const saveTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(saveTimer.current),[]);
  const change=(next:TableData)=>{setDraft(next);draftChange(next);clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>update(next),180);};
  const patchCell=(row:number,column:number,text:string)=>change({...draft,rows:draft.rows.map((cells,r)=>cells.map((cell,c)=>r===row&&c===column?text:cell))});
  const paste=(event:ClipboardEvent,row:number,column:number)=>{
    const text=event.clipboardData?.getData('text/plain')??'';if(!text.includes('\t'))return false;
    event.preventDefault();const values=text.replace(/\r/g,'').split('\n').filter((line,index,array)=>line||index<array.length-1).map(line=>line.split('\t'));
    const columns=Math.min(16,Math.max(draft.rows[0].length,column+Math.max(...values.map(line=>line.length))));
    const rows=draft.rows.map(cells=>Array.from({length:columns},(_,index)=>cells[index]??''));
    while(rows.length<row+values.length)rows.push(Array(columns).fill(''));
    values.forEach((line,r)=>line.forEach((value,c)=>{if(column+c<columns)rows[row+r][column+c]=value}));
    change({...draft,rows,align:Array.from({length:columns},(_,index)=>draft.align[index]??'left'),widths:Array.from({length:columns},(_,index)=>draft.widths[index]??Math.max(5,Math.floor(100/columns))),palettes:Array.from({length:columns},(_,index)=>draft.palettes?.[index]??null)});return true;
  };
  const reorder=(from:number,to:number)=>{if(from===to||from<0||to<0||from>=draft.rows[0].length||to>=draft.rows[0].length)return;const move=<T,>(items:T[])=>{const next=[...items],[item]=next.splice(from,1);next.splice(to,0,item);return next};change({...draft,rows:draft.rows.map(move),align:move(draft.align),widths:move(draft.widths),palettes:move(draft.palettes??Array(draft.rows[0].length).fill(null))});setSelection({from:[selection.from[0],to],to:[selection.to[0],to]});};
  const reorderRow=(from:number,to:number)=>{if(from===to||from<0||to<0||from>=draft.rows.length||to>=draft.rows.length)return;const rows=[...draft.rows],[item]=rows.splice(from,1);rows.splice(to,0,item);const heights=draft.heights?[...draft.heights]:undefined;if(heights){const [height]=heights.splice(from,1);heights.splice(to,0,height)}change({...draft,rows,heights});setSelection({from:[to,selection.from[1]],to:[to,selection.to[1]]})};
  const animateColumns=(from:number,to:number,element:HTMLElement)=>{const table=element.closest('table');if(!table||from===to)return;const rows=Array.from(table.rows);for(const row of rows){const a=row.cells[from],b=row.cells[to];if(!a||!b)continue;const dx=b.getBoundingClientRect().left-a.getBoundingClientRect().left;a.animate([{transform:'translateX(0)'},{transform:`translateX(${dx}px)`}],{duration:180,easing:'ease-out'});b.animate([{transform:'translateX(0)'},{transform:`translateX(${-dx}px)`}],{duration:180,easing:'ease-out'});} };
  const selectedColumn=selection.to[1],selectedRow=Math.max(1,selection.to[0]);
  const cellSelection=(row:number,column:number)=>({onMouseDown:(event:React.MouseEvent<HTMLTextAreaElement>)=>{extending.current=event.shiftKey;if(!event.shiftKey)rangeAnchor.current=[row,column]},onFocus:()=>{if(!extending.current)setSelection({from:[row,column],to:[row,column]})},onClick:(event:React.MouseEvent<HTMLTextAreaElement>)=>{if(event.shiftKey)setSelection({from:rangeAnchor.current,to:[row,column]});else{rangeAnchor.current=[row,column];setSelection({from:[row,column],to:[row,column]})}extending.current=false}});
  const copyRange=async()=>{const [[r1,c1],[r2,c2]]=[selection.from,selection.to],rStart=Math.min(r1,r2),rEnd=Math.max(r1,r2),cStart=Math.min(c1,c2),cEnd=Math.max(c1,c2);const text=draft.rows.slice(rStart,rEnd+1).map(row=>row.slice(cStart,cEnd+1).join('\t')).join('\n');try{await navigator.clipboard.writeText(text)}catch{}}
  const resizeStart=(event:React.PointerEvent<HTMLSpanElement>,boundary:number)=>{const count=draft.widths.length;if(count<2)return;event.preventDefault();event.stopPropagation();const tableWidth=event.currentTarget.closest('.visual-table-overflow')?.querySelector('table')?.getBoundingClientRect().width??0;if(!tableWidth)return;const column=boundary===0?0:Math.min(boundary-1,count-2);resizing.current={pointer:event.pointerId,x:event.clientX,width:tableWidth,column,direction:boundary===0||boundary===count?-1:1,widths:[...draft.widths]};event.currentTarget.setPointerCapture(event.pointerId)};
  const resizeMove=(event:React.PointerEvent<HTMLSpanElement>)=>{const current=resizing.current;if(!current||current.pointer!==event.pointerId)return;const {column,direction,width,widths}=current,delta=(event.clientX-current.x)/width*100*direction,total=widths[column]+widths[column+1],minimum=Math.min(total/2,90/width*100),left=Math.max(minimum,Math.min(total-minimum,widths[column]+delta));change({...draft,widths:widths.map((value,index)=>index===column?left:index===column+1?total-left:value)})};
  const resizeEnd=(event:React.PointerEvent<HTMLSpanElement>)=>{if(resizing.current?.pointer===event.pointerId)resizing.current=null};
  const resizeKeyboard=(boundary:number,delta:number)=>{const count=draft.widths.length;if(count<2)return;const column=boundary===0?0:Math.min(boundary-1,count-2),direction=boundary===0||boundary===count?-1:1,total=draft.widths[column]+draft.widths[column+1],width=tableRef.current?.getBoundingClientRect().width??0,minimum=width?Math.min(total/2,90/width*100):5,left=Math.max(minimum,Math.min(total-minimum,draft.widths[column]+delta*direction));change({...draft,widths:draft.widths.map((value,index)=>index===column?left:index===column+1?total-left:value)})};
  const dropPalette=(event:React.DragEvent<HTMLElement>,column:number)=>{if(!event.dataTransfer.types.includes(paletteDragType))return false;const value=readPaletteDrop(event.dataTransfer.getData(paletteDragType));if(!value)return false;event.preventDefault();event.stopPropagation();const columnPalettes=[...(draft.palettes??Array(draft.rows[0].length).fill(null))];columnPalettes[column]=value.palette;change({...draft,palettes:columnPalettes});return true;};
  const addRow=(index=draft.rows.length)=>{const rows=[...draft.rows];rows.splice(index,0,Array(draft.rows[0].length).fill(''));const heights=draft.heights?[...draft.heights]:undefined;if(heights)heights.splice(index,0,32);change({...draft,rows,heights});};
  const removeRow=()=>{if(draft.rows.length<2)return;change({...draft,rows:draft.rows.filter((_,index)=>index!==selectedRow),heights:draft.heights?.filter((_,index)=>index!==selectedRow)});setSelection({from:[0,selectedColumn],to:[0,selectedColumn]});};
  const addColumn=(index=draft.rows[0].length)=>{const count=draft.rows[0].length+1,insert=<T,>(values:T[],value:T)=>{const next=[...values];next.splice(index,0,value);return next};change({...draft,rows:draft.rows.map(row=>insert(row,'')),align:insert(draft.align,'left'),widths:insert(draft.widths.map(width=>width*(count-1)/count),100/count),palettes:insert(draft.palettes??Array(count-1).fill(null),null)});};
  const removeColumn=()=>{if(draft.rows[0].length<2)return;const widths=draft.widths.filter((_,index)=>index!==selectedColumn),total=widths.reduce((a,b)=>a+b,0);change({...draft,rows:draft.rows.map(row=>row.filter((_,index)=>index!==selectedColumn)),align:draft.align.filter((_,index)=>index!==selectedColumn),widths:widths.map(width=>total?width*100/total:100/widths.length),palettes:(draft.palettes??[]).filter((_,index)=>index!==selectedColumn)});const column=Math.min(selectedColumn,widths.length-1);setSelection({from:[0,column],to:[0,column]});};
  const menu=<div className="visual-table-actions">
    <button type="button" onClick={()=>addRow()}>Добавить строку</button>
    <button type="button" onClick={removeRow} disabled={draft.rows.length<2}>Удалить строку</button>
    <button type="button" onClick={()=>addColumn()}>Добавить столбец</button><button type="button" onClick={removeColumn} disabled={draft.rows[0].length<2}>Удалить столбец</button>
    <label>Выравнивание<select value={draft.align[selectedColumn]??'left'} onChange={event=>change({...draft,align:draft.align.map((value,index)=>index===selectedColumn?event.target.value as TableData['align'][number]:value)})}><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></label>
    <button type="button" onClick={()=>void copyRange()}>Копировать диапазон</button>
  </div>;
  return <section className="visual-table-widget" aria-label="Визуальный редактор таблицы" onContextMenu={event=>{event.preventDefault();event.stopPropagation();const cell=(event.target as HTMLElement).closest<HTMLTableCellElement>('td,th');if(cell){const row=cell.parentElement as HTMLTableRowElement;setSelection({from:[row.rowIndex,cell.cellIndex],to:[row.rowIndex,cell.cellIndex]});}setContext({x:Math.min(event.clientX,window.innerWidth-245),y:Math.min(event.clientY,window.innerHeight-390)});}}>
    {createPortal(menu,menuActions)}
    {context&&createPortal(<><div className="note-context-dismiss" onMouseDown={()=>setContext(null)}/><div className="note-context-menu" style={{left:context.x,top:context.y}} role="menu" onMouseDown={e=>e.preventDefault()}>
      <button onClick={()=>{addRow(selection.to[0]+1);setContext(null);}}>Добавить строку снизу</button>
      <button onClick={()=>{removeRow();setContext(null);}}>Удалить строку</button>
      <button onClick={()=>{addColumn(selectedColumn+1);setContext(null);}}>Добавить столбец справа</button>
      <button onClick={()=>{removeColumn();setContext(null);}}>Удалить столбец</button>
      <button disabled={selectedColumn===0} onClick={()=>{reorder(selectedColumn,selectedColumn-1);setContext(null);}}>Переместить столбец влево</button>
      <button disabled={selectedColumn>=draft.widths.length-1} onClick={()=>{reorder(selectedColumn,selectedColumn+1);setContext(null);}}>Переместить столбец вправо</button>
      {(['left','center','right'] as const).map((align,i)=><button key={align} onClick={()=>{change({...draft,align:draft.align.map((v,j)=>j===selectedColumn?align:v)});setContext(null);}}>{['Выровнять по левому краю','Выровнять по центру','Выровнять по правому краю'][i]}</button>)}
      <button onClick={()=>{setContext(null);void copyRange();}}>Копировать выделение</button>
      <button onClick={()=>{setContext(null);if(openMenu)openMenu();else{const details=menuActions.closest('details');if(details)details.open=true;}}}>Настройки таблицы</button>
    </div></>,document.querySelector('.app')??document.body)}
    <div className="visual-table-overflow"><table ref={tableRef}><colgroup>{draft.widths.map((width,index)=><col key={index} style={{width:`${width}%`}}/>)}</colgroup><thead><tr style={{height:draft.heights?.[0]}} onDragOver={event=>{if(draggingRow.current!==null)event.preventDefault()}} onDrop={event=>{if(draggingRow.current!==null){event.preventDefault();reorderRow(draggingRow.current,0);draggingRow.current=null}}}>{draft.rows[0].map((cell,column)=>{
      const palette=draft.palettes?.[column]??null,paint=palette?`palette-${palette}`:undefined;
      return <th key={column} className={paint} data-column-palette={palette||undefined} onDragOver={event=>{if(event.dataTransfer.types.includes(paletteDragType)||draggingColumn.current!==null){event.preventDefault();event.stopPropagation();}}} onDrop={event=>{if(dropPalette(event,column)||draggingRow.current!==null)return;event.preventDefault();event.stopPropagation();if(draggingColumn.current!==null){animateColumns(draggingColumn.current,column,event.currentTarget);reorder(draggingColumn.current,column);}draggingColumn.current=null}}>
        {column===0&&<button type="button" className="visual-table-row-drag" draggable title="Переместить строку" aria-label="Переместить строку 1" onDragStart={event=>{event.stopPropagation();draggingRow.current=0;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain','0')}} onDragEnd={()=>{draggingRow.current=null}}>⠿</button>}
        <button type="button" className="visual-table-column-drag" draggable title="Переместить столбец" aria-label={`Переместить столбец ${column+1}`} onDragStart={event=>{event.stopPropagation();draggingColumn.current=column;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(column));}} onDragEnd={()=>{draggingColumn.current=null}}>⠿</button>
        <TableCell label={`Заголовок столбца ${column+1}`} value={cell} change={value=>patchCell(0,column,value)} focus={()=>setSelection({from:[0,column],to:[0,column]})} paste={event=>paste(event,0,column)}/>
      </th>})}</tr></thead>
    <tbody>{draft.rows.slice(1).map((row,rowIndex)=><tr key={rowIndex} style={{height:draft.heights?.[rowIndex+1]}} onDragOver={event=>{if(draggingRow.current!==null)event.preventDefault()}} onDrop={event=>{if(draggingRow.current!==null){event.preventDefault();reorderRow(draggingRow.current,rowIndex+1);draggingRow.current=null}}}>{row.map((cell,column)=>{const palette=draft.palettes?.[column]??null;return <td key={column} className={palette?`palette-${palette}`:undefined} data-column-palette={palette||undefined} style={{textAlign:draft.align[column]??'left'}} onDragOver={event=>{if(event.dataTransfer.types.includes(paletteDragType)||draggingColumn.current!==null){event.preventDefault();event.stopPropagation();}}} onDrop={event=>{if(dropPalette(event,column))return;if(draggingColumn.current!==null){event.preventDefault();event.stopPropagation();reorder(draggingColumn.current,column);draggingColumn.current=null;}}}>{column===0&&<button type="button" className="visual-table-row-drag" draggable title="Переместить строку" aria-label={`Переместить строку ${rowIndex+2}`} onDragStart={event=>{event.stopPropagation();draggingRow.current=rowIndex+1;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(rowIndex+1))}} onDragEnd={()=>{draggingRow.current=null}}>⠿</button>}<TableCell label={`Строка ${rowIndex+1}, столбец ${column+1}`} value={cell} change={value=>patchCell(rowIndex+1,column,value)} focus={()=>setSelection({from:[rowIndex+1,column],to:[rowIndex+1,column]})} paste={event=>paste(event,rowIndex+1,column)}/></td>})}</tr>)}</tbody></table>
    {Array.from({length:Math.max(0,draft.widths.length-1)},(_,index)=>{const boundary=index+1,left=draft.widths.slice(0,boundary).reduce((sum,value)=>sum+value,0),label=`между столбцами ${boundary} и ${boundary+1}`;return <span key={boundary} className="visual-table-column-resize" style={{left:`calc(${left}% - 6px)`}} role="separator" aria-orientation="vertical" aria-label={`Изменить ширину у границы: ${label}`} tabIndex={0} onPointerDown={event=>resizeStart(event,boundary)} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();resizeKeyboard(boundary,event.key==='ArrowLeft'?-2:2)}}}/>})}
    {draft.rows.slice(0,-1).map((_,row)=><span key={'row-'+row} className="visual-table-row-resize" role="separator" aria-orientation="horizontal" aria-label={`Изменить высоту строки ${row+1}`} style={{top:rowBoundaries[row]??0}} onPointerDown={event=>{event.preventDefault();event.stopPropagation();const tr=tableRef.current?.rows[row];if(!tr)return;rowResize.current={pointer:event.pointerId,y:event.clientY,row,height:tr.offsetHeight};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{const r=rowResize.current,element=tableRef.current;if(!r||r.pointer!==event.pointerId||!element)return;const scale=element.getBoundingClientRect().width/element.offsetWidth||1,heights=Array.from(element.rows,tr=>tr.offsetHeight);heights[row]=Math.max(32,r.height+(event.clientY-r.y)/scale);change({...draft,heights});}} onPointerUp={()=>{rowResize.current=null;}} onPointerCancel={()=>{rowResize.current=null;}}/>)}
    </div>
    <button type="button" className="visual-table-add-row" title="Добавить строку снизу" aria-label="Добавить строку снизу" onClick={()=>addRow()}>+</button>
    <button type="button" className="visual-table-add-column" title="Добавить столбец справа" aria-label="Добавить столбец справа" onClick={()=>addColumn()}>+</button>
  </section>;
}

export function standaloneMapTable(source:string) {
  const lines=source.trim().split('\n');
  const comment=tableComment(lines[0]??'')?lines.shift()!:'';
  const row=(line:string)=>/^\s*\|.*\|\s*$/.test(line);
  if(lines.length<2||!row(lines[0])||!row(lines[1])||!splitRow(lines[1]).every(cell=>/^:?-+:?$/.test(cell))||lines.slice(2).some(line=>!row(line)))return null;
  return parse({from:0,to:source.length,source,header:lines[0],separator:lines[1],body:lines.slice(2),comment});
}

export function readingWidgetTables(source:string) {
  const lines=source.split('\n'),result:string[]=[];
  let fence='';
  for(let i=0;i<lines.length;i++){
    const token=/^ {0,3}(`{3,}|~{3,})/.exec(lines[i])?.[1];
    if(token){if(!fence)fence=token;else if(token[0]===fence[0]&&token.length>=fence.length)fence='';result.push(lines[i]);continue;}
    const widget=!fence&&tableComment(lines[i])?parseWidget(lines[i]):undefined;
    if(!widget||i+2>=lines.length||!pipeLine(lines[i+1])||!pipeLine(lines[i+2])||!splitRow(lines[i+2]).every(cell=>/^:?-+:?$/.test(cell))){result.push(lines[i]);continue;}
    const metadata=lines[i];const body=[lines[++i],lines[++i]];while(i+1<lines.length&&pipeLine(lines[i+1]))body.push(lines[++i]);
    const ticks='`'.repeat(Math.max(3,...[...body.join('\n').matchAll(/`+/g)].map(match=>match[0].length+1)));
    const n=(value:number)=>Math.max(0,Math.round(value));
    const marker=`noteapp-widget-${n(widget.x)}-${n(widget.y)}-w${n(widget.width)}-h${n(widget.height)}-z${n(widget.z)}${widget.color?'-c'+widget.color.slice(1):''}${widget.fill?'-b'+widget.fill.slice(1):''}-tt${textureById(widget.texture)?'-p'+widget.texture!.slice(8):''}${widget.scale!==undefined&&widget.scale!==1?'-s'+Math.round(widget.scale*100):''}${widget.borderWidth!==undefined?'-o'+Math.round(widgetBorderWidth(widget.borderWidth)*2):''}`;
    result.push(`${ticks}${marker}`, metadata,...body,ticks);
  }
  return result.join('\n');
}

export function ReadingTable({source}:{source:string}) {
 const table=standaloneMapTable(source);if(!table)return null;
 const cells=(row:string[],header:boolean)=>row.map((cell,c)=>{const Cell=header?'th':'td';return <Cell key={c} className={table.palettes?.[c]?`palette-${table.palettes[c]}`:undefined} data-column-palette={table.palettes?.[c]||undefined} style={{textAlign:table.align[c]??'left'}}><div className="reading-table-cell"><ReactMarkdown remarkPlugins={[remarkGfm,remarkNoteColor]} components={{code:({children,className})=>{const text=String(children),prefix='noteapp-inline-math:';if(!className&&text.startsWith(prefix)){try{return <span className="note-inline-math" dangerouslySetInnerHTML={{__html:mathHtml(decodeURIComponent(text.slice(prefix.length)))}}/>}catch{return <code>{children}</code>}}return <code className={className}>{children}</code>}}}>{prepareMathMarkdown(cell.replace(/<br\s*\/?\s*>/gi,'\n'))}</ReactMarkdown></div></Cell>});
 return <div className="visual-table-widget reading-table"><div className="visual-table-overflow"><table><colgroup>{table.widths.map((width,i)=><col key={i} style={{width:`${width}%`}}/>)}</colgroup><thead><tr style={{height:table.heights?.[0]}}>{cells(table.rows[0],true)}</tr></thead><tbody>{table.rows.slice(1).map((row,r)=><tr key={r} style={{height:table.heights?.[r+1]}}>{cells(row,false)}</tr>)}</tbody></table></div></div>;
}

export function MapTable({source,save,markdown,menuTarget,inline=false,remove}:{source:string;save:(source:string)=>void;markdown:()=>void;menuTarget?:HTMLDivElement;inline?:boolean;remove?:()=>void}) {
  const [actions,setActions]=useState<HTMLDivElement|null>(null);
  const [menu,setMenu]=useState<{left:number;top:number}|null>(null),trigger=useRef<HTMLButtonElement>(null);
  const openMenu=()=>{const rect=trigger.current?.getBoundingClientRect();if(rect)setMenu({left:Math.max(4,Math.min(rect.left,window.innerWidth-235)),top:Math.max(4,Math.min(rect.bottom,window.innerHeight-320))});};
  useEffect(()=>{if(!menu)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMenu(null);trigger.current?.focus();}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[menu]);
  const table=standaloneMapTable(source);
  if(!table)return null;
  return <div className={`note-feature-widget map-table-widget${inline?' task-inline-table':''}`}>
    {inline?<><button type="button" className="task-table-menu-trigger" ref={trigger} aria-label="Настройки таблицы" aria-expanded={!!menu} onClick={()=>menu?setMenu(null):openMenu()}><DotsThree size={18}/></button>{createPortal(<>{menu&&<div className="note-context-dismiss" onMouseDown={()=>setMenu(null)}/>}<div className="note-context-menu task-table-menu" ref={setActions} style={menu?{left:menu.left,top:menu.top,maxHeight:Math.max(80,window.innerHeight-menu.top-8)}:{display:'none'}}>{remove&&<button type="button" onClick={remove}>Удалить таблицу</button>}</div></>,document.querySelector('.app')??document.body)}</>:!menuTarget&&<details className="note-insert-menu"><summary aria-label="Действия с таблицей"/><div className="note-insert-actions" ref={setActions}/></details>}
    {(menuTarget??actions)&&<MarkdownTable table={table} source={source} menuActions={(menuTarget??actions)!} markdown={markdown} draftChange={()=>{}}
      openMenu={inline?openMenu:undefined} update={next=>save(serialize(next,defaultNoteWidgetPosition(720,320)))}/>}
  </div>;
}

class TableWidget extends WidgetType {
  constructor(readonly range:TableRange) {super();}
  eq(other:TableWidget){return this.range.from===other.range.from&&this.range.source===other.range.source;}
  updateDOM(host:HTMLElement){const context=tableContexts.get(host);if(!context)return false;context.render(this.range);return true;}
  ignoreEvent(){return true;}
  toDOM(view:EditorView){
    const host=document.createElement('div');host.className='visual-table-host';
    const context:TableWidgetContext={range:this.range,position:this.range.widget??defaultNoteWidgetPosition(720,320),draft:parse(this.range),content:tableContent(this.range),view,render:()=>{}};
    const write=()=>{const range=context.range;if(view.state.sliceDoc(range.from,range.to)!==range.source)return;const insert=serialize(context.draft,context.position);view.dispatch({changes:{from:range.from,to:range.to,insert},selection:{anchor:range.from+insert.length},userEvent:'input.markdown-table'});};
    const chrome=noteWidgetChrome(host,view,context.position,'Таблица',next=>{context.position=next;write();},()=>{const range=context.range;if(view.state.sliceDoc(range.from,range.to)===range.source)view.dispatch({changes:{from:range.from,to:range.to},userEvent:'delete.markdown-table'});},true,668);
    context.dispose=chrome.dispose;
    const root=createRoot(chrome.body);roots.set(host,root);context.root=root;context.actions=chrome.actions;
    const update=(table:TableData)=>{context.draft=table;const [minWidth,minHeight]=tableMinimumSize(host),step=elementGridStep(view.contentDOM),width=Math.min(view.contentDOM.clientWidth||1600,1600,Math.max(context.position.width,Math.ceil(minWidth/step)*step)),height=Math.min(1200,Math.max(context.position.height,Math.ceil(minHeight/step)*step));if(width>context.position.width||height>context.position.height){context.position={...context.position,width,height};chrome.setPosition(context.position)}write();};
    const markdown=()=>{const range=context.range;if(view.state.sliceDoc(range.from,range.to)!==range.source)return;const insert=serialize(context.draft,context.position),header=range.from+insert.indexOf('\n')+1;view.dispatch({changes:{from:range.from,to:range.to,insert},selection:{anchor:header+1},scrollIntoView:true,userEvent:'select.markdown-table'});view.focus();};
    context.render=range=>{
      context.range=range;context.position=range.widget??context.position;
      const content=tableContent(range);
      if(content!==context.content){context.content=content;context.draft=parse(range);}
      root.render(<MarkdownTable table={parse(range)} source={content} update={update} draftChange={table=>{context.draft=table}} markdown={markdown} menuActions={chrome.actions}/>);
    };
    tableContexts.set(host,context);context.render(this.range);return host;
  }
  destroy(dom:HTMLElement){tableContexts.get(dom)?.dispose?.();roots.get(dom)?.unmount();roots.delete(dom);tableContexts.delete(dom);}
}

const inlineTables=new WeakMap<HTMLElement,{root:Root;render:(range:TableRange)=>void}>();
class InlineTableWidget extends WidgetType {
  constructor(readonly range:TableRange){super();}
  eq(other:InlineTableWidget){return this.range.from===other.range.from&&this.range.source===other.range.source;}
  updateDOM(host:HTMLElement){const context=inlineTables.get(host);if(!context)return false;context.render(this.range);return true;}
  ignoreEvent(){return true;}
  toDOM(view:EditorView){
    const host=document.createElement('div'),root=createRoot(host);let current=this.range;
    const replace=(insert:string)=>{if(view.state.sliceDoc(current.from,current.to)!==current.source)return;view.dispatch({changes:{from:current.from,to:current.to,insert},userEvent:insert?'input.markdown-table':'delete.markdown-table'});};
    const render=(range:TableRange)=>{current=range;root.render(<MapTable source={range.source} inline save={replace} markdown={()=>{}} remove={()=>replace('')}/>);};
    inlineTables.set(host,{root,render});render(current);return host;
  }
  destroy(host:HTMLElement){inlineTables.get(host)?.root.unmount();inlineTables.delete(host);}
}

export function markdownTables(inline=false){
  const decorate=(state:EditorView['state']):DecorationSet=>{
    const fences=noteFenceRanges(state.doc.toString());
    const lines=Array.from({length:state.doc.lines},(_,index)=>state.doc.line(index+1)),widgets=[];
    for(let i=0;i<lines.length-1;i++){
      if(fences.some(range=>lines[i].from>=range.from&&lines[i].from<=range.to))continue;
      if(!pipeLine(lines[i].text)||!pipeLine(lines[i+1].text)||!splitRow(lines[i+1].text).every(cell=>/^:?-+:?$/.test(cell)))continue;
      const start=i>0&&tableComment(lines[i-1].text)?i-1:i;
      let end=i+1;while(end+1<lines.length&&pipeLine(lines[end+1].text))end++;
      const from=lines[start].from,to=lines[end].to,source=state.doc.sliceString(from,to),header=lines[i].text,separator=lines[i+1].text,body=lines.slice(i+2,end+1).map(line=>line.text),comment=start<i?lines[start].text:'';
      const table:TableRange={from,to,source,header,separator,body,comment,widget:parseWidget(comment)};widgets.push(Decoration.replace({block:true,widget:inline?new InlineTableWidget(table):new TableWidget(table)}).range(from,to));i=end;
    }
    return Decoration.set(widgets,true);
  };
  return StateField.define<DecorationSet>({create:decorate,update:(value,tr)=>tr.docChanged||tr.selection?decorate(tr.state):value,provide:field=>EditorView.decorations.from(field)});
}
