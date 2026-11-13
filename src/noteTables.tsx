import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {createRoot,type Root} from 'react-dom/client';
import {StateField} from '@codemirror/state';
import {Decoration,EditorView,WidgetType,type DecorationSet} from '@codemirror/view';
import {defaultNoteWidgetPosition,noteWidgetChrome,type NoteWidgetPosition} from './noteWidgetChrome';
import {paletteDragType,palettes,readPaletteDrop} from './appearance';
import {textureById} from './textures';

type TableData={rows:string[][];align:('left'|'center'|'right')[];widths:number[];palettes?:(string|null)[]};
type TableRange={from:number;to:number;source:string;header:string;separator:string;body:string[];comment:string;widget?:NoteWidgetPosition};
const tableComment=(line:string)=>/^<!-- noteapp-table(?:\s+[a-z]+=[^\s>]*)+\s+-->$/.test(line);
function markerValues(comment:string){return Object.fromEntries([...comment.matchAll(/([a-z]+)=([^\s>]+)/g)].map(match=>[match[1],match[2]]));}
function parseWidget(comment:string):NoteWidgetPosition|undefined {
  const values=markerValues(comment);if(!['x','y','w','h','z'].every(key=>Number.isFinite(Number(values[key]))))return;
  return {x:Number(values.x),y:Number(values.y),width:Number(values.w),height:Number(values.h),z:Number(values.z),color:values.c?`#${values.c}`:undefined,fill:values.b?`#${values.b}`:undefined,texture:textureById(values.tx)?.id};
}
const roots=new WeakMap<HTMLElement,Root>();
type TableWidgetContext={range:TableRange;position:NoteWidgetPosition;draft:TableData;content:string;root?:Root;actions?:HTMLElement;view:EditorView;render:(range:TableRange)=>void};
const tableContexts=new WeakMap<HTMLElement,TableWidgetContext>();
const splitRow=(line:string)=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(cell=>cell.trim().replace(/\\\|/g,'|'));
const pipeLine=(line:string)=>line.includes('|')&&splitRow(line).length>1;
const alignment=(cell:string):'left'|'center'|'right'=>cell.startsWith(':')&&cell.endsWith(':')?'center':cell.endsWith(':')?'right':'left';
const tableContent=(range:TableRange)=>[range.header,range.separator,...range.body].join('\n');
function parse(range:TableRange):TableData {
  const header=splitRow(range.header),body=range.body.map(splitRow),columns=header.length;
  const widths=markerValues(range.comment).widths?.split(',').map(Number)??Array(columns).fill(Math.floor(100/columns));
  const columnPalettes=markerValues(range.comment).palettes?.split(',')??[];
  return {rows:[header,...body].map(row=>Array.from({length:columns},(_,i)=>row[i]??'')),align:splitRow(range.separator).map(alignment),widths:Array.from({length:columns},(_,i)=>widths[i]??Math.floor(100/columns)),palettes:Array.from({length:columns},(_,i)=>palettes.some(palette=>palette.id===columnPalettes[i])?columnPalettes[i]:null)};
}
function safeCell(value:string){return value.replace(/\r?\n/g,'<br>').replace(/\|/g,'\\|')}
function serialize(table:TableData,widget:NoteWidgetPosition) {
  const columns=table.rows[0]?.length??1;
  const header=`| ${table.rows[0].map(safeCell).join(' | ')} |`;
  const separator=`| ${Array.from({length:columns},(_,i)=>table.align[i]==='center'?':---:':table.align[i]==='right'?'---:':':---').join(' | ')} |`;
  const body=table.rows.slice(1).map(row=>`| ${Array.from({length:columns},(_,i)=>safeCell(row[i]??'')).join(' | ')} |`);
  const comment=`<!-- noteapp-table widths=${table.widths.join(',')} palettes=${(table.palettes??[]).map(value=>value??'').join(',')} x=${widget.x} y=${widget.y} w=${widget.width} h=${widget.height} z=${widget.z}${widget.color?` c=${widget.color.replace('#','')}`:''}${widget.fill?` b=${widget.fill.replace('#','')}`:''}${textureById(widget.texture)?` tx=${widget.texture}`:''} -->\n`;
  return `${comment}${[header,separator,...body].join('\n')}`;
}

function MarkdownTable({table,source,update,markdown,draftChange,menuActions}:{table:TableData;source:string;update:(data:TableData)=>void;markdown:()=>void;draftChange:(data:TableData)=>void;menuActions:HTMLElement}) {
  const [draft,setDraft]=useState(table),[selection,setSelection]=useState({from:[0,0] as [number,number],to:[0,0] as [number,number]});
  useEffect(()=>setDraft(table),[source]);
  const resizing=useRef<{pointer:number;x:number;width:number;column:number;direction:number;widths:number[]}|null>(null);
  const draggingColumn=useRef<number|null>(null),rangeAnchor=useRef<[number,number]>([0,0]),extending=useRef(false);
  const change=(next:TableData)=>{setDraft(next);draftChange(next)};
  const patchCell=(row:number,column:number,text:string)=>change({...draft,rows:draft.rows.map((cells,r)=>cells.map((cell,c)=>r===row&&c===column?text:cell))});
  const paste=(event:React.ClipboardEvent<HTMLTextAreaElement>,row:number,column:number)=>{
    const text=event.clipboardData.getData('text/plain');if(!text.includes('\t')&&!text.includes('\n'))return;
    event.preventDefault();const values=text.replace(/\r/g,'').split('\n').filter((line,index,array)=>line||index<array.length-1).map(line=>line.split('\t'));
    const columns=Math.min(16,Math.max(draft.rows[0].length,column+Math.max(...values.map(line=>line.length))));
    const rows=draft.rows.map(cells=>Array.from({length:columns},(_,index)=>cells[index]??''));
    while(rows.length<row+values.length)rows.push(Array(columns).fill(''));
    values.forEach((line,r)=>line.forEach((value,c)=>{if(column+c<columns)rows[row+r][column+c]=value}));
    change({...draft,rows,align:Array.from({length:columns},(_,index)=>draft.align[index]??'left'),widths:Array.from({length:columns},(_,index)=>draft.widths[index]??Math.max(5,Math.floor(100/columns))),palettes:Array.from({length:columns},(_,index)=>draft.palettes?.[index]??null)});
  };
  const reorder=(from:number,to:number)=>{if(from===to||from<0||to<0||from>=draft.rows[0].length||to>=draft.rows[0].length)return;const move=<T,>(items:T[])=>{const next=[...items],[item]=next.splice(from,1);next.splice(to,0,item);return next};change({...draft,rows:draft.rows.map(move),align:move(draft.align),widths:move(draft.widths),palettes:move(draft.palettes??Array(draft.rows[0].length).fill(null))});setSelection({from:[selection.from[0],to],to:[selection.to[0],to]});};
  const selectedColumn=selection.to[1],selectedRow=Math.max(1,selection.to[0]);
  const cellSelection=(row:number,column:number)=>({onMouseDown:(event:React.MouseEvent<HTMLTextAreaElement>)=>{extending.current=event.shiftKey;if(!event.shiftKey)rangeAnchor.current=[row,column]},onFocus:()=>{if(!extending.current)setSelection({from:[row,column],to:[row,column]})},onClick:(event:React.MouseEvent<HTMLTextAreaElement>)=>{if(event.shiftKey)setSelection({from:rangeAnchor.current,to:[row,column]});else{rangeAnchor.current=[row,column];setSelection({from:[row,column],to:[row,column]})}extending.current=false}});
  const copyRange=async()=>{const [[r1,c1],[r2,c2]]=[selection.from,selection.to],rStart=Math.min(r1,r2),rEnd=Math.max(r1,r2),cStart=Math.min(c1,c2),cEnd=Math.max(c1,c2);const text=draft.rows.slice(rStart,rEnd+1).map(row=>row.slice(cStart,cEnd+1).join('\t')).join('\n');try{await navigator.clipboard.writeText(text)}catch{}}
  const resizeStart=(event:React.PointerEvent<HTMLSpanElement>,boundary:number)=>{const count=draft.widths.length;if(count<2)return;event.preventDefault();event.stopPropagation();const tableWidth=event.currentTarget.closest('.visual-table-overflow')?.querySelector('table')?.getBoundingClientRect().width??0;if(!tableWidth)return;const column=boundary===0?0:Math.min(boundary-1,count-2);resizing.current={pointer:event.pointerId,x:event.clientX,width:tableWidth,column,direction:boundary===0||boundary===count?-1:1,widths:[...draft.widths]};event.currentTarget.setPointerCapture(event.pointerId)};
  const resizeMove=(event:React.PointerEvent<HTMLSpanElement>)=>{const current=resizing.current;if(!current||current.pointer!==event.pointerId)return;const {column,direction,width,widths}=current,delta=(event.clientX-current.x)/width*100*direction,total=widths[column]+widths[column+1],left=Math.max(5,Math.min(total-5,widths[column]+delta));change({...draft,widths:widths.map((value,index)=>index===column?left:index===column+1?total-left:value)})};
  const resizeEnd=(event:React.PointerEvent<HTMLSpanElement>)=>{if(resizing.current?.pointer===event.pointerId)resizing.current=null};
  const resizeKeyboard=(boundary:number,delta:number)=>{const count=draft.widths.length;if(count<2)return;const column=boundary===0?0:Math.min(boundary-1,count-2),direction=boundary===0||boundary===count?-1:1,total=draft.widths[column]+draft.widths[column+1],left=Math.max(5,Math.min(total-5,draft.widths[column]+delta*direction));change({...draft,widths:draft.widths.map((value,index)=>index===column?left:index===column+1?total-left:value)})};
  const dropPalette=(event:React.DragEvent<HTMLElement>,column:number)=>{if(!event.dataTransfer.types.includes(paletteDragType))return false;const value=readPaletteDrop(event.dataTransfer.getData(paletteDragType));if(!value)return false;event.preventDefault();event.stopPropagation();const columnPalettes=[...(draft.palettes??Array(draft.rows[0].length).fill(null))];columnPalettes[column]=value.palette;change({...draft,palettes:columnPalettes});return true;};
  const addColumn=()=>{const count=draft.rows[0].length+1;change({...draft,rows:draft.rows.map(row=>[...row,'']),align:[...draft.align,'left'],widths:[...draft.widths,Math.max(5,100/count)],palettes:[...(draft.palettes??Array(draft.rows[0].length).fill(null)),null]})};
  const removeColumn=()=>{if(draft.rows[0].length<2)return;change({...draft,rows:draft.rows.map(row=>row.filter((_,index)=>index!==selectedColumn)),align:draft.align.filter((_,index)=>index!==selectedColumn),widths:draft.widths.filter((_,index)=>index!==selectedColumn),palettes:(draft.palettes??[]).filter((_,index)=>index!==selectedColumn)})};
  const menu=<div className="visual-table-actions">
    <button type="button" onClick={markdown}>Markdown</button><button type="button" onClick={()=>change({...draft,rows:[...draft.rows,Array(draft.rows[0].length).fill('')]})}>Добавить строку</button>
    <button type="button" onClick={()=>change({...draft,rows:[...draft.rows.slice(0,selectedRow),...draft.rows.slice(selectedRow+1)]})} disabled={draft.rows.length<2}>Удалить строку</button>
    <button type="button" onClick={addColumn}>Добавить столбец</button><button type="button" onClick={removeColumn} disabled={draft.rows[0].length<2}>Удалить столбец</button>
    <label>Выравнивание<select value={draft.align[selectedColumn]??'left'} onChange={event=>change({...draft,align:draft.align.map((value,index)=>index===selectedColumn?event.target.value as TableData['align'][number]:value)})}><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></label>
    <button type="button" onClick={()=>void copyRange()}>Копировать диапазон</button><button type="button" className="primary" onClick={()=>update(draft)}>Сохранить</button>
  </div>;
  return <section className="visual-table-widget" aria-label="Визуальный редактор таблицы" onContextMenu={event=>{event.preventDefault();event.stopPropagation();const menu=event.currentTarget.closest<HTMLElement>('.floating-note-text')?.querySelector<HTMLDetailsElement>('.note-insert-menu');if(menu)menu.open=true}}>
    {createPortal(menu,menuActions)}
    <div className="visual-table-overflow"><table><colgroup>{draft.widths.map((width,index)=><col key={index} style={{width:`${width}%`}}/>)}</colgroup><thead><tr>{draft.rows[0].map((cell,column)=>{
      const palette=draft.palettes?.[column]??null,paint=palette?`palette-${palette}`:undefined;
      return <th key={column} className={paint} data-column-palette={palette||undefined} onDragOver={event=>{if(event.dataTransfer.types.includes(paletteDragType)||draggingColumn.current!==null)event.preventDefault()}} onDrop={event=>{if(dropPalette(event,column))return;event.preventDefault();if(draggingColumn.current!==null)reorder(draggingColumn.current,column);draggingColumn.current=null}}>
        <span className="visual-table-column-drag" draggable aria-label={`Переместить столбец ${column+1}`} onDragStart={event=>{draggingColumn.current=column;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(column))}} onDragEnd={()=>{draggingColumn.current=null}}>⠿</span>
        <textarea aria-label={`Заголовок столбца ${column+1}`} rows={1} value={cell} onChange={event=>patchCell(0,column,event.target.value)} {...cellSelection(0,column)} onPaste={event=>paste(event,0,column)}/>
      </th>})}</tr></thead>
    <tbody>{draft.rows.slice(1).map((row,rowIndex)=><tr key={rowIndex}>{row.map((cell,column)=>{const palette=draft.palettes?.[column]??null;return <td key={column} className={palette?`palette-${palette}`:undefined} data-column-palette={palette||undefined} style={{textAlign:draft.align[column]??'left'}} onDragOver={event=>{if(event.dataTransfer.types.includes(paletteDragType))event.preventDefault()}} onDrop={event=>{dropPalette(event,column)}}><textarea aria-label={`Строка ${rowIndex+1}, столбец ${column+1}`} value={cell} onChange={event=>patchCell(rowIndex+1,column,event.target.value)} {...cellSelection(rowIndex+1,column)} onPaste={event=>paste(event,rowIndex+1,column)}/></td>})}</tr>)}</tbody></table>
    {Array.from({length:draft.widths.length+1},(_,boundary)=>{const left=draft.widths.slice(0,boundary).reduce((sum,value)=>sum+value,0),label=boundary===0?'левый край таблицы':boundary===draft.widths.length?'правый край таблицы':`между столбцами ${boundary} и ${boundary+1}`;return <span key={boundary} className="visual-table-column-resize" style={{left:`calc(${left}% - 6px)`}} role="separator" aria-orientation="vertical" aria-label={`Изменить ширину у границы: ${label}`} tabIndex={0} onPointerDown={event=>resizeStart(event,boundary)} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();resizeKeyboard(boundary,event.key==='ArrowLeft'?-2:2)}}}/>})}
    </div>
  </section>;
}

export function standaloneMapTable(source:string) {
  const lines=source.trim().split('\n');
  const comment=tableComment(lines[0]??'')?lines.shift()!:'';
  const row=(line:string)=>/^\s*\|.*\|\s*$/.test(line);
  if(lines.length<2||!row(lines[0])||!row(lines[1])||!splitRow(lines[1]).every(cell=>/^:?-+:?$/.test(cell))||lines.slice(2).some(line=>!row(line)))return null;
  return parse({from:0,to:source.length,source,header:lines[0],separator:lines[1],body:lines.slice(2),comment});
}

export function MapTable({source,save,markdown}:{source:string;save:(source:string)=>void;markdown:()=>void}) {
  const [actions,setActions]=useState<HTMLDivElement|null>(null);
  const table=standaloneMapTable(source);
  if(!table)return null;
  return <div className="note-feature-widget map-table-widget">
    <details className="note-insert-menu"><summary aria-label="Действия с таблицей"/><div className="note-insert-actions" ref={setActions}/></details>
    {actions&&<MarkdownTable table={table} source={source} menuActions={actions} markdown={markdown} draftChange={()=>{}}
      update={next=>save(serialize(next,defaultNoteWidgetPosition(720,320)))}/>}
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
    const write=()=>{const range=context.range;if(view.state.sliceDoc(range.from,range.to)!==range.source)return;view.dispatch({changes:{from:range.from,to:range.to,insert:serialize(context.draft,context.position)},userEvent:'input.markdown-table'});};
    const chrome=noteWidgetChrome(host,view,context.position,'Таблица',next=>{context.position=next;write();},()=>{const range=context.range;if(view.state.sliceDoc(range.from,range.to)===range.source)view.dispatch({changes:{from:range.from,to:range.to},userEvent:'delete.markdown-table'});});
    const root=createRoot(chrome.body);roots.set(host,root);context.root=root;context.actions=chrome.actions;
    const update=(table:TableData)=>{context.draft=table;write();};
    const markdown=()=>{const range=context.range;if(view.state.sliceDoc(range.from,range.to)!==range.source)return;const insert=serialize(context.draft,context.position),header=range.from+insert.indexOf('\n')+1;view.dispatch({changes:{from:range.from,to:range.to,insert},selection:{anchor:header+1},scrollIntoView:true,userEvent:'select.markdown-table'});view.focus();};
    context.render=range=>{
      context.range=range;context.position=range.widget??context.position;
      const content=tableContent(range);
      if(content!==context.content){context.content=content;context.draft=parse(range);}
      root.render(<MarkdownTable table={parse(range)} source={content} update={update} draftChange={table=>{context.draft=table}} markdown={markdown} menuActions={chrome.actions}/>);
    };
    tableContexts.set(host,context);context.render(this.range);return host;
  }
  destroy(dom:HTMLElement){roots.get(dom)?.unmount();roots.delete(dom);tableContexts.delete(dom);}
}

export function markdownTables(){
  const decorate=(state:EditorView['state']):DecorationSet=>{
    const lines=Array.from({length:state.doc.lines},(_,index)=>state.doc.line(index+1)),widgets=[];
    for(let i=0;i<lines.length-1;i++){
      if(!pipeLine(lines[i].text)||!pipeLine(lines[i+1].text)||!splitRow(lines[i+1].text).every(cell=>/^:?-+:?$/.test(cell)))continue;
      const start=i>0&&tableComment(lines[i-1].text)?i-1:i;
      let end=i+1;while(end+1<lines.length&&pipeLine(lines[end+1].text))end++;
      const from=lines[start].from,to=lines[end].to,source=state.doc.sliceString(from,to),header=lines[i].text,separator=lines[i+1].text,body=lines.slice(i+2,end+1).map(line=>line.text),comment=start<i?lines[start].text:'';
      if(state.selection.ranges.some(range=>range.from>=from&&range.from<to||range.from<to&&range.to>from)){i=end;continue;}
      const table:TableRange={from,to,source,header,separator,body,comment,widget:parseWidget(comment)};widgets.push(Decoration.replace({block:true,widget:new TableWidget(table)}).range(from,to));i=end;
    }
    return Decoration.set(widgets,true);
  };
  return StateField.define<DecorationSet>({create:decorate,update:(value,tr)=>tr.docChanged||tr.selection?decorate(tr.state):value,provide:field=>EditorView.decorations.from(field)});
}
