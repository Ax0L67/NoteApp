import {useEffect,useMemo,useRef,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {syntaxTree} from '@codemirror/language';
import {StateField,type EditorState} from '@codemirror/state';
import {Decoration,EditorView,WidgetType,type DecorationSet} from '@codemirror/view';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type {Note,TaskBoard} from './types';
import {TaskBoardView} from './TaskBoards';
import {evaluateMath} from './safeMath';
import {chooseSourceLocation,openSourceLocation} from './storage';
import {loadNoteImage} from './noteImages';
import {defaultNoteWidgetPosition,initialNoteWidget,noteWidgetChrome,type NoteWidgetPosition} from './noteWidgetChrome';

export type NoteFeature='compare'|'source'|'concept'|'math'|'plot'|'board';
type FeatureValue=Record<string,any>;
type BlockRange={from:number;to:number;source:string;fence:string;kind:NoteFeature;value:FeatureValue};
const fenceBlock=/^(`{3,})(noteapp-(compare|source|concept|math|plot|board))[^\n]*\n([\s\S]*?)\n\1[ \t]*$/gm;
const roots=new WeakMap<HTMLElement,Root>(),refreshByHost=new WeakMap<HTMLElement,()=>void>(),refreshers=new Set<()=>void>();
export function refreshFeatureBlocks(){for(const refresh of refreshers)refresh();}

export function featureDefaults(kind:NoteFeature,term=''):FeatureValue {
  if(kind==='compare')return {title:'Сравнение',orientation:'horizontal',traits:['Характеристика 1','Характеристика 2'],items:[{name:'Объект 1',values:['','']},{name:'Объект 2',values:['','']}]};
  if(kind==='source')return {type:'Сайт',title:'',author:'',url:'',date:'',page:'',comment:'',compact:false};
  if(kind==='concept')return {id:crypto.randomUUID(),term:term||'Термин',definition:'',meanings:[]};
  if(kind==='math')return {id:crypto.randomUUID(),latex:'{{x}}^2',expression:'x^2',variables:[{name:'x',min:0,max:10,step:1,value:2}]};
  if(kind==='plot')return {expressions:['sin(x)'],minX:-10,maxX:10,minY:-5,maxY:5,variables:{}};
  return {id:'',mode:'compact'};
}

export function markdownBlock(kind:NoteFeature,value:FeatureValue) {
  const body=JSON.stringify(value,null,2),ticks='`'.repeat(Math.max(3,...[...body.matchAll(/`+/g)].map(match=>match[0].length+1)));
  return `${ticks}noteapp-${kind}\n${body}\n${ticks}`;
}

function insertText(view:EditorView,text:string,from=view.state.selection.main.from,to=view.state.selection.main.to) {
  const doc=view.state.doc,before=from&&doc.sliceString(from-1,from)!=='\n'?'\n\n':'',after=to<doc.length&&doc.sliceString(to,to+1)!=='\n'?'\n\n':'';
  const insert=before+text+after;view.dispatch({changes:{from,to,insert},selection:{anchor:from+insert.length},userEvent:'input.note-feature'});view.focus();
}

export function insertFeature(view:EditorView,kind:NoteFeature) {
  if(kind==='concept'){
    const {from,to}=view.state.selection.main,selected=view.state.sliceDoc(from,to).trim();
    const term=selected||'Термин',value=featureDefaults('concept',term),link=`[${term.replace(/[\\[\]]/g,'\\$&')}](noteapp-concept:${value.id})`;
    value.widget=initialNoteWidget(view,from,520,320);
    const source=markdownBlock('concept',value),doc=view.state.doc,at=selected?to:from,before=at&&doc.sliceString(at-1,at)!=='\n'?'\n\n':'',after=at<doc.length&&doc.sliceString(at,at+1)!=='\n'?'\n\n':'';
    const text=(selected?link:link)+'\n\n'+source;
    view.dispatch({changes:{from,to:at,insert:before+text+after},selection:{anchor:from+before.length+link.length},userEvent:'input.note-concept'});view.focus();return;
  }
  const value=featureDefaults(kind),size=kind==='compare'?[720,350]:kind==='source'?[520,360]:kind==='math'?[440,330]:kind==='plot'?[680,500]:[760,480];
  value.widget=initialNoteWidget(view,view.state.selection.main.from,size[0],size[1]);
  insertText(view,markdownBlock(kind,value));
}

export function insertTable(view:EditorView,rows=3,columns=3) {
  rows=Math.max(1,Math.min(30,Math.floor(rows)));columns=Math.max(1,Math.min(16,Math.floor(columns)));
  const cells=Array.from({length:columns},(_,index)=>`Колонка ${index+1}`);
  const source=[`| ${cells.join(' | ')} |`,`| ${cells.map(()=>':---').join(' | ')} |`,...Array.from({length:rows},()=>`| ${cells.map(()=> ' ').join(' | ')} |`)].join('\n');
  const width=720,height=Math.min(760,180+rows*48),widget=initialNoteWidget(view,view.state.selection.main.from,width,height),widths=Array(columns).fill(Math.floor(100/columns));
  widths[columns-1]+=100-widths.reduce((sum,value)=>sum+value,0);
  insertText(view,`<!-- noteapp-table widths=${widths.join(',')} x=${widget.x} y=${widget.y} w=${widget.width} h=${widget.height} z=${widget.z} -->\n${source}`);
}

export function insertBoard(view:EditorView,id:string) {insertText(view,markdownBlock('board',{id,mode:'compact',widget:initialNoteWidget(view,view.state.selection.main.from,760,480)}));}

export function featureBlocks(getNotes:()=>Note[],getBoards:()=>TaskBoard[],changeBoard:(board:TaskBoard)=>void,openNote:(path:string)=>void) {
  class FeatureWidget extends WidgetType {
    constructor(readonly block:BlockRange) {super();}
    eq(other:FeatureWidget) {return this.block.from===other.block.from&&this.block.source===other.block.source;}
    ignoreEvent() {return true;}
    toDOM(view:EditorView) {
      const host=document.createElement('div');host.className=`note-feature-host note-feature-${this.block.kind}`;
      let value=this.block.value;
      const size=this.block.kind==='board'?[760,480]:this.block.kind==='plot'?[680,500]:this.block.kind==='compare'?[720,350]:[520,360];
      const fallback=defaultNoteWidgetPosition(size[0],size[1]),stored=value.widget as Partial<NoteWidgetPosition>|undefined;
      let position=stored&&Number.isFinite(stored.x)&&Number.isFinite(stored.y)?{...fallback,...stored} as NoteWidgetPosition:fallback;
      const write=(next:FeatureValue)=>{
        const end=this.block.to;if(view.state.sliceDoc(this.block.from,end)!==this.block.source)return;
        if(next.__delete){view.dispatch({changes:{from:this.block.from,to:end},userEvent:'delete.note-feature'});return;}
        const block=markdownBlock(this.block.kind,{...next,widget:position});
        view.dispatch({changes:{from:this.block.from,to:end,insert:block},userEvent:'input.note-feature'});
      };
      const chrome=noteWidgetChrome(host,view,position,this.block.kind==='board'?'Доска задач':'Блок заметки',next=>{position=next;write(value);},()=>write({__delete:true}));
      const root=createRoot(chrome.body);roots.set(host,root);
      const refresh=()=>root.render(<FeatureCard kind={this.block.kind} value={value} editable notes={getNotes()} boards={getBoards()} save={next=>{value=next;write(next);}} draftChange={next=>{value=next;}} changeBoard={changeBoard} openNote={openNote}/>);
      refresh();refreshers.add(refresh);refreshByHost.set(host,refresh);
      return host;
    }
    destroy(dom:HTMLElement) {const refresh=refreshByHost.get(dom);if(refresh)refreshers.delete(refresh);roots.get(dom)?.unmount();roots.delete(dom);}
  }
  const decorate=(state:EditorView['state']):DecorationSet=>{
    const widgets=[];fenceBlock.lastIndex=0;
    for(const match of state.doc.toString().matchAll(fenceBlock)){
      let value:FeatureValue;try{value=JSON.parse(match[4]);if(!value||typeof value!=='object'||Array.isArray(value))continue;}catch{continue;}
      const from=match.index!,to=from+match[0].length;
      if(state.selection.ranges.some(range=>range.from<to&&range.to>from))continue;
      const block:BlockRange={from,to,source:match[0],fence:match[1],kind:match[3] as NoteFeature,value};
      widgets.push(Decoration.replace({block:true,widget:new FeatureWidget(block)}).range(from,to));
    }
    return Decoration.set(widgets,true);
  };
  return StateField.define<DecorationSet>({create:decorate,update:(value,tr)=>tr.docChanged||tr.selection?decorate(tr.state):value,provide:field=>EditorView.decorations.from(field)});
}

export function featureFromMarkdown(kind:string,body:string) {
  if(!['compare','source','concept','math','plot','board'].includes(kind))return null;
  try{const value=JSON.parse(body);return value&&typeof value==='object'&&!Array.isArray(value)?value as FeatureValue:null;}catch{return null;}
}

export function conceptDefinitions(notes:Note[]) {
  const result=new Map<string,{term:string;definition:string;path:string}>();
  for(const note of notes){fenceBlock.lastIndex=0;for(const match of note.content.matchAll(fenceBlock))if(match[3]==='concept'){
    const value=featureFromMarkdown('concept',match[4]);if(value?.id)result.set(String(value.id),{term:String(value.term??''),definition:String(value.definition??''),path:note.path});
  }}
  return result;
}

export function conceptLinks(getNotes:()=>Note[],openNote:(path:string)=>void) {
  class ConceptWidget extends WidgetType {
    constructor(readonly from:number,readonly to:number,readonly source:string,readonly id:string) {super();}
    eq(other:ConceptWidget){return this.from===other.from&&this.source===other.source;}
    ignoreEvent(){return true;}
    toDOM(){
      const host=document.createElement('span'),root=createRoot(host);
      host.className='concept-term';host.tabIndex=0;roots.set(host,root);
      const refresh=()=>{const definition=conceptDefinitions(getNotes()).get(this.id);root.render(<><span>{this.source.replace(/^\[([\s\S]*)\]\(noteapp-concept:[^)]+\)$/,'$1')}</span><span className="concept-tooltip"><MarkdownMath text={definition?.definition||'Определение не заполнено.'} notePath={definition?.path} openNote={openNote}/>{definition&&<button type="button" onClick={()=>openNote(definition.path)}>К исходному определению</button>}</span></>);};
      refresh();refreshers.add(refresh);refreshByHost.set(host,refresh);
      return host;
    }
    destroy(dom:HTMLElement){const refresh=refreshByHost.get(dom);if(refresh)refreshers.delete(refresh);roots.get(dom)?.unmount();roots.delete(dom);}
  }
  const decorate=(state:EditorState):DecorationSet=>{
    const widgets:ReturnType<Decoration['range']>[]=[];syntaxTree(state).iterate({enter(node){
      if(node.name!=='Link')return;
      const url=node.node.getChild('URL');if(!url)return;
      const match=/^noteapp-concept:([\w-]+)$/.exec(state.sliceDoc(url.from,url.to));if(!match)return;
      widgets.push(Decoration.replace({widget:new ConceptWidget(node.from,node.to,state.sliceDoc(node.from,node.to),match[1])}).range(node.from,node.to));return false;
    }});
    return Decoration.set(widgets,true);
  };
  return StateField.define<DecorationSet>({create:decorate,update:(value,tr)=>tr.docChanged||syntaxTree(tr.startState)!==syntaxTree(tr.state)?decorate(tr.state):value,provide:field=>[EditorView.decorations.from(field),EditorView.atomicRanges.of(view=>view.state.field(field))]});
}

export function sourcesFromMarkdown(content:string) {
  const result:FeatureValue[]=[];fenceBlock.lastIndex=0;
  for(const match of content.matchAll(fenceBlock))if(match[3]==='source'){const value=featureFromMarkdown('source',match[4]);if(value?.title||value?.url)result.push(value);}
  return result;
}

function mathSources(notes:Note[]) {
  const result:{id:string;label:string;variables:Record<string,number>}[]=[];
  for(const note of notes){let index=0;fenceBlock.lastIndex=0;for(const match of note.content.matchAll(fenceBlock))if(match[3]==='math'){
    index++;const value=featureFromMarkdown('math',match[4]);if(value?.id)result.push({id:String(value.id),label:`Формула ${index} · ${note.path}`,variables:Object.fromEntries((value.variables??[]).map((entry:{name:string;value:number})=>[entry.name,Number(entry.value)]))});
  }}
  return result;
}

function publishMathValues(id:string,variables:{name:string;value:number}[]) {
  if(id)window.dispatchEvent(new CustomEvent('noteapp:math-values',{detail:{id,variables:Object.fromEntries(variables.map(item=>[item.name,Number(item.value)]))}}));
}

export function FeatureCard({kind,value,editable,notes,boards,save,draftChange,changeBoard,openNote}:{kind:NoteFeature;value:FeatureValue;editable:boolean;notes:Note[];boards:TaskBoard[];save?:(value:FeatureValue)=>void;draftChange?:(value:FeatureValue)=>void;changeBoard:(board:TaskBoard)=>void;openNote:(path:string)=>void}) {
  const [draft,setDraft]=useState(()=>structuredClone(value));
  const [saved,setSaved]=useState(false);
  const draftRef=useRef(draft);draftRef.current=draft;
  const update=(patch:FeatureValue)=>{const next={...draftRef.current,...patch};draftRef.current=next;setDraft(next);draftChange?.(next);setSaved(false);if(kind==='math')publishMathValues(String(next.id??''),next.variables??[]);};
  useEffect(()=>{if(kind==='math')publishMathValues(String(draft.id??''),draft.variables??[]);},[kind,draft.id,JSON.stringify(draft.variables)]);
  const formulas=mathSources(notes);
  const header=kind==='compare'?'Сравнение':kind==='source'?'Источник':kind==='concept'?'Понятие':kind==='math'?'Формула':kind==='plot'?'График':'Доска задач';
  if(kind==='board'){
    const board=boards.find(item=>item.id===value.id);
    return board?<TaskBoardView board={board} notes={notes} change={changeBoard} openNote={openNote}/>:<article className="note-feature-card"><strong>Доска задач недоступна</strong></article>;
  }
  return <form className={`note-feature-card note-feature-${kind}-card`} onSubmit={event=>{event.preventDefault();save?.(draft);setSaved(true);}}>
    <header><strong>{kind==='compare'?draft.title||header:kind==='source'?draft.title||header:kind==='concept'?draft.term||header:header}</strong>
      {!editable&&kind==='source'&&draft.url&&<button className="note-feature-open" type="button" onClick={()=>void openSourceLocation(draft.url).catch(error=>alert(error.message))}>Открыть источник</button>}
    </header>
    {kind==='compare'&&<CompareEditor value={draft} editable={editable} change={update}/>}
    {kind==='source'&&<SourceEditor value={draft} editable={editable} change={update}/>}
    {kind==='concept'&&<ConceptEditor value={draft} editable={editable} change={update} notes={notes} openNote={openNote}/>}
    {kind==='math'&&<MathEditor value={draft} editable={editable} change={update}/>}
    {kind==='plot'&&<PlotEditor value={draft} editable={editable} change={update} formulas={formulas}/>}
    {editable&&<footer><button type="submit">{saved?'Сохранено':'Сохранить'}</button></footer>}
  </form>;
}

function CompareEditor({value,editable,change}:{value:FeatureValue;editable:boolean;change:(value:FeatureValue)=>void}) {
  const traits:string[]=value.traits??[],items: {name:string;values:string[]}[]=value.items??[];
  const patchItem=(index:number,patch:Partial<(typeof items)[number]>)=>change({items:items.map((item,i)=>i===index?{...item,...patch}:item)});
  return <div className="comparison-block">
    {editable&&<div className="comparison-tools"><input aria-label="Название сравнения" value={value.title??''} onChange={event=>change({title:event.target.value})}/><select aria-label="Расположение карточек" value={value.orientation??'horizontal'} onChange={event=>change({orientation:event.target.value})}><option value="horizontal">По горизонтали</option><option value="vertical">По вертикали</option></select></div>}
    <div className={`comparison-items ${value.orientation==='vertical'?'vertical':''}`}>{items.map((item,index)=><section key={index} className="comparison-item">
      {editable?<input aria-label={`Название объекта ${index+1}`} value={item.name} onChange={event=>patchItem(index,{name:event.target.value})}/>:<h3>{item.name}</h3>}
      {traits.map((trait,row)=>{const values=items.map(entry=>entry.values?.[row]??''),common=values.every(text=>text===values[0]&&text!=='');const hidden=value.hidden?.includes(row);
        return <div key={row} className={`comparison-trait ${common?'common':'different'}`}>
          <button type="button" className="comparison-trait-label" aria-expanded={!hidden} onClick={()=>change({hidden:hidden?value.hidden.filter((item:number)=>item!==row):[...(value.hidden??[]),row]})}>{trait||`Характеристика ${row+1}`}</button>
          {!hidden&&(editable?<textarea aria-label={`${item.name}: ${trait}`} value={item.values?.[row]??''} onChange={event=>patchItem(index,{values:items[index].values.map((text,i)=>i===row?event.target.value:text)})}/>:<p>{item.values?.[row]||'—'}</p>)}
        </div>;
      })}
    </section>)}</div>
    {editable&&<div className="comparison-actions"><button type="button" onClick={()=>change({items:[...items,{name:`Объект ${items.length+1}`,values:traits.map(()=> '')}]})}>+ Объект</button><button type="button" onClick={()=>change({traits:[...traits,`Характеристика ${traits.length+1}`],items:items.map(item=>({...item,values:[...item.values,'']}))})}>+ Характеристика</button></div>}
  </div>;
}

function SourceEditor({value,editable,change}:{value:FeatureValue;editable:boolean;change:(value:FeatureValue)=>void}) {
  const fields:{key:string;label:string;options?:string[]}[]=[{key:'type',label:'Тип',options:['Сайт','Книга','PDF','Научная статья']},{key:'title',label:'Название'},{key:'author',label:'Автор'},{key:'url',label:'Ссылка или путь'},{key:'date',label:'Дата'},{key:'page',label:'Страница'},{key:'comment',label:'Комментарий'}];
  return <div className={`source-card-body ${value.compact?'is-compact':''}`}>
    {editable&&fields.map(({key,label,options})=><label key={key}>{label}{options?<select value={value[key]??'Сайт'} onChange={event=>change({[key]:event.target.value})}>{options.map(option=><option key={option}>{option}</option>)}</select>:key==='comment'?<textarea value={value.comment??''} onChange={event=>change({comment:event.target.value})}/>:<><input type={key==='date'?'date':'text'} value={value[key]??''} onChange={event=>change({[key]:event.target.value})}/>{key==='url'&&<button type="button" onClick={()=>void chooseSourceLocation().then(path=>path&&change({url:path})).catch(error=>alert(error.message))}>Выбрать файл</button>}</>}</label>)}
    {!editable&&<><p><b>{value.type||'Источник'}</b>{value.author?` · ${value.author}`:''}{value.date?` · ${value.date}`:''}{value.page?` · стр. ${value.page}`:''}</p>{value.comment&&!value.compact&&<p>{value.comment}</p>}</>}
    {editable&&<label className="source-compact"><input type="checkbox" checked={!!value.compact} onChange={event=>change({compact:event.target.checked})}/>Компактный вид</label>}
  </div>;
}

export function FeatureBlockView({kind,value,notes,boards,changeBoard,openNote}:{kind:NoteFeature;value:FeatureValue;notes:Note[];boards:TaskBoard[];changeBoard:(board:TaskBoard)=>void;openNote:(path:string)=>void}) {
  return <FeatureCard kind={kind} value={value} editable={false} notes={notes} boards={boards} changeBoard={changeBoard} openNote={openNote}/>;
}

function ConceptEditor({value,editable,change,notes,openNote}:{value:FeatureValue;editable:boolean;change:(value:FeatureValue)=>void;notes:Note[];openNote:(path:string)=>void}) {
  const meanings:string[]=value.meanings??[];
  const sourceNote=notes.find(note=>note.content.includes(`\"id\": \"${value.id}\"`));
  return <div className="concept-card-body">
    {editable?<><label>Термин<input value={value.term??''} onChange={event=>change({term:event.target.value})}/></label><label>Определение<textarea value={value.definition??''} onChange={event=>change({definition:event.target.value})} placeholder="Можно использовать Markdown, формулы и ссылки"/></label>{meanings.map((meaning,index)=><label key={index}>Ещё одно значение<textarea value={meaning} onChange={event=>change({meanings:meanings.map((text,i)=>i===index?event.target.value:text)})}/></label>)}<button type="button" onClick={()=>change({meanings:[...meanings,'']})}>+ Значение</button></>:<><MarkdownMath text={value.definition||'Определение не заполнено.'} notePath={sourceNote?.path} openNote={openNote}/>{meanings.map((meaning,index)=><details key={index}><summary>Значение {index+2}</summary><MarkdownMath text={meaning} notePath={sourceNote?.path} openNote={openNote}/></details>)}</>}
    {!editable&&<button type="button" className="concept-source" onClick={()=>{const source=notes.find(note=>note.content.includes(`\"id\": \"${value.id}\"`));if(source)openNote(source.path)}}>К исходному определению</button>}
  </div>;
}

function FeatureImage({src,alt,notePath}:{src?:string;alt?:string;notePath?:string}) {
  const [url,setUrl]=useState('');
  useEffect(()=>{if(!src||!notePath||/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(src))return;let live=true;void loadNoteImage(notePath,src).then(value=>{if(live)setUrl(value)});return()=>{live=false};},[src,notePath]);
  if(!src)return null;
  if(!notePath||/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(src))return <img src={src} alt={alt??''}/>;
  return url?<img src={url} alt={alt??''}/>:<span className="image-missing">Загрузка изображения…</span>;
}

export function MarkdownMath({text,notePath,openNote}:{text:string;notePath?:string;openNote?:(path:string)=>void}) {
  const formulas:string[]=[],marker='NOTEAPPMATHTOKEN';
  const source=text.replace(/\[\[([^\]]+)\]\]/g,(_,target:string)=>{const [path,label]=target.split('|');return `[${label||path}](note:${encodeURIComponent(path)})`}).replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g,(_,display:string|undefined,inline:string|undefined)=>{const index=formulas.push(display!==undefined?`\\displaystyle ${display}`:inline??'')-1;return `\`${marker}${index}END\``});
  return <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={url=>url.startsWith('note:')||/^https?:|^mailto:/i.test(url)||!url.includes(':')?url:''} components={{img:({src,alt})=><FeatureImage src={src} alt={alt} notePath={notePath}/>,a:({href,children})=><a href={href} target={/^https?:/i.test(href??'')?'_blank':undefined} rel="noreferrer" onClick={event=>{if(href?.startsWith('note:')){event.preventDefault();openNote?.(decodeURIComponent(href.slice(5)))}else if(href&&!/^(?:https?:|mailto:|#)/i.test(href)){event.preventDefault();openNote?.(href.replace(/\.md$/,''))}}}>{children}</a>,code:({children})=>{
    const value=String(children),match=new RegExp(`^${marker}(\\d+)END$`).exec(value);
    if(!match)return <code>{children}</code>;
    const source=formulas[Number(match[1])],display=source.startsWith('\\displaystyle ');let html='';try{html=katex.renderToString(display?source.slice(14):source,{displayMode:display,throwOnError:false,trust:false,strict:'ignore'});}catch{html=katex.renderToString('\\text{Некорректная формула}',{throwOnError:false,trust:false});}
    return <span className="concept-math" dangerouslySetInnerHTML={{__html:html}}/>;
  }}}>{source}</ReactMarkdown>;
}

function MathEditor({value,editable,change}:{value:FeatureValue;editable:boolean;change:(value:FeatureValue)=>void}) {
  const vars:{name:string;min:number;max:number;step:number;value:number}[]=value.variables??[];
  const values=Object.fromEntries(vars.map(variable=>[variable.name,Number(variable.value)]));
  const latex=String(value.latex??'').replace(/\{\{([a-zA-Z_]\w*)\}\}/g,(_,name:string)=>String(values[name]??0));
  let rendered='';try{rendered=katex.renderToString(latex,{throwOnError:false,trust:false,strict:'ignore'});}catch{rendered=katex.renderToString('\\text{Некорректная формула}',{throwOnError:false,trust:false});}
  const result=evaluateMath(String(value.expression??''),values);
  return <div className="math-block">
    {editable&&<><label>LaTeX<input value={value.latex??''} onChange={event=>change({latex:event.target.value})}/></label><label>Выражение для результата<input value={value.expression??''} onChange={event=>change({expression:event.target.value})}/></label></>}
    <div className="math-render" aria-label="Формула" dangerouslySetInnerHTML={{__html:rendered}}/>
    {vars.map((variable,index)=><div className="math-variable" key={index}><label>{variable.name}<input type="number" value={variable.value} min={variable.min} max={variable.max} step={variable.step} onChange={event=>change({variables:vars.map((entry,i)=>i===index?{...entry,value:Number(event.target.value)}:entry)})}/></label><input aria-label={`Ползунок ${variable.name}`} type="range" value={variable.value} min={variable.min} max={variable.max} step={variable.step} onChange={event=>change({variables:vars.map((entry,i)=>i===index?{...entry,value:Number(event.target.value)}:entry)})}/>{editable&&<button type="button" onClick={()=>change({variables:vars.filter((_,i)=>i!==index)})}>×</button>}</div>)}
    {editable&&<button type="button" onClick={()=>change({variables:[...vars,{name:`x${vars.length+1}`,min:0,max:10,step:1,value:1}]})}>+ Переменная</button>}
    <output className="math-result">Результат: {result===null?'—':Number(result.toPrecision(8))}</output>
  </div>;
}

function PlotEditor({value,editable,change,formulas}:{value:FeatureValue;editable:boolean;change:(value:FeatureValue)=>void;formulas:{id:string;label:string;variables:Record<string,number>}[]}) {
  const canvas=useRef<HTMLCanvasElement>(null),[range,setRange]=useState({minX:Number(value.minX??-10),maxX:Number(value.maxX??10),minY:Number(value.minY??-5),maxY:Number(value.maxY??5)}),[point,setPoint]=useState('');
  const linked=formulas.find(formula=>formula.id===value.mathId),[linkedVariables,setLinkedVariables]=useState<Record<string,number>>(()=>linked?.variables??{});
  useEffect(()=>{setLinkedVariables(linked?.variables??{});},[value.mathId,JSON.stringify(linked?.variables)]);
  useEffect(()=>{const update=(event:Event)=>{const detail=(event as CustomEvent<{id:string;variables:Record<string,number>}>).detail;if(detail.id===value.mathId)setLinkedVariables(detail.variables);};window.addEventListener('noteapp:math-values',update);return()=>window.removeEventListener('noteapp:math-values',update);},[value.mathId]);
  const variables=value.mathId?linkedVariables:value.variables??{};
  const expressions:string[]=value.expressions??['sin(x)'];
  useEffect(()=>{
    const element=canvas.current;if(!element)return;const rect=element.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
    element.width=Math.max(1,Math.round(rect.width*ratio));element.height=Math.max(1,Math.round(rect.height*ratio));
  const ctx=element.getContext('2d');if(!ctx)return;ctx.scale(ratio,ratio);ctx.clearRect(0,0,rect.width,rect.height);
    const x=(v:number)=>(v-range.minX)/(range.maxX-range.minX)*rect.width,y=(v:number)=>rect.height-(v-range.minY)/(range.maxY-range.minY)*rect.height;
    ctx.strokeStyle=getComputedStyle(element).getPropertyValue('--line').trim()||'#777';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,y(0));ctx.lineTo(rect.width,y(0));ctx.moveTo(x(0),0);ctx.lineTo(x(0),rect.height);ctx.stroke();
    expressions.filter(Boolean).forEach((source,index)=>{ctx.beginPath();ctx.strokeStyle=`hsl(${(index*83+270)%360} 65% 58%)`;ctx.lineWidth=2;let open=false;
      for(let px=0;px<=Math.min(1000,Math.ceil(rect.width));px++){const xv=range.minX+px/rect.width*(range.maxX-range.minX),yv=evaluateMath(source,{x:xv,...variables});if(yv===null||yv<range.minY-(range.maxY-range.minY)||yv>range.maxY+(range.maxY-range.minY)){open=false;continue;}const py=y(yv);if(open)ctx.lineTo(px,py);else{ctx.moveTo(px,py);open=true;}}
      ctx.stroke();
    });
  },[expressions.join('|'),range.minX,range.maxX,range.minY,range.maxY,JSON.stringify(variables)]);
  const pointer=useRef<{x:number;y:number;range:typeof range}|null>(null);
  return <div className="plot-widget"><canvas ref={canvas} aria-label="График математических функций" onPointerDown={event=>{pointer.current={x:event.clientX,y:event.clientY,range};event.currentTarget.setPointerCapture(event.pointerId)}} onPointerMove={event=>{if(!pointer.current)return;const rect=event.currentTarget.getBoundingClientRect(),start=pointer.current;const dx=(event.clientX-start.x)/rect.width*(start.range.maxX-start.range.minX),dy=(event.clientY-start.y)/rect.height*(start.range.maxY-start.range.minY);setRange({minX:start.range.minX-dx,maxX:start.range.maxX-dx,minY:start.range.minY+dy,maxY:start.range.maxY+dy})}} onPointerUp={event=>{pointer.current=null;change({...range})}} onWheel={event=>{event.preventDefault();const factor=event.deltaY>0?1.1:.9;setRange(current=>{const cx=(current.minX+current.maxX)/2,cy=(current.minY+current.maxY)/2,rx=(current.maxX-current.minX)*factor/2,ry=(current.maxY-current.minY)*factor/2;const next={minX:cx-rx,maxX:cx+rx,minY:cy-ry,maxY:cy+ry};change(next);return next})}} onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();const x=range.minX+(event.clientX-rect.left)/rect.width*(range.maxX-range.minX);setPoint(`x=${x.toFixed(3)}`)}}/>
    {point&&<output>{point}</output>}
    {editable&&<div className="plot-options">{expressions.map((expression,index)=><label key={index}>f{index+1}(x)<input value={expression} onChange={event=>change({expressions:expressions.map((value,i)=>i===index?event.target.value:value)})}/><button type="button" onClick={()=>change({expressions:expressions.filter((_,i)=>i!==index)})}>×</button></label>)}<button type="button" onClick={()=>change({expressions:[...expressions,'x']})}>+ Функция</button>
      <label>Параметры формулы<select value={value.mathId??''} onChange={event=>change({mathId:event.target.value})}><option value="">Без связи</option>{formulas.map(formula=><option key={formula.id} value={formula.id}>{formula.label}</option>)}</select></label>
      {(['minX','maxX','minY','maxY'] as const).map(key=><label key={key}>{key}<input type="number" value={range[key]} onChange={event=>{const next={...range,[key]:Number(event.target.value)};setRange(next);change(next)}}/></label>)}</div>}
  </div>;
}
