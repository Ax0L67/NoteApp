import {noteHorizontalRule} from './noteHorizontalRule';
import {useMemo,useEffect,useLayoutEffect,useState,useRef,useCallback,isValidElement,cloneElement,type CSSProperties,type ReactNode,type ReactElement} from 'react';
import CodeMirror,{type ReactCodeMirrorRef} from '@uiw/react-codemirror';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {autocompletion} from '@codemirror/autocomplete';
import {EditorView,ViewPlugin,Decoration,type DecorationSet,type ViewUpdate} from '@codemirror/view';
import {syntaxHighlighting,HighlightStyle} from '@codemirror/language';
import {tags as syntax} from '@lezer/highlight';
import ReactMarkdown,{type Components} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {Minus,Plus} from '@phosphor-icons/react';
import type {Note,TaskBoard} from './types';
import {title,folder} from './indexing';
import {imageLayout,loadNoteImage,noteImagePreviews} from './noteImages';
import {noteTextBlocks,noteTextPosition} from './noteTextBlocks';
import {conceptDefinitions,conceptLinks,featureBlocks,featureFromMarkdown,featureBaseWidth,FeatureBlockView,MarkdownMath,sourcesFromMarkdown,refreshFeatureBlocks,type NoteFeature} from './noteFeatureBlocks';
import {kanbanWidgetSize} from './kanbanWidgetSize';
import {FittedWidget} from './widgetFit';
import {markdownTables,readingWidgetTables,ReadingTable,standaloneMapTable} from './noteTables';
import {openSourceLocation} from './storage';
import {ReferenceChip,referenceWidgets,type ReferenceActions} from './ReferenceChip';
import {parseReference} from './noteReferences';
import {noteIndent,readingIndent} from './noteIndent';
import {noteTextColor,remarkNoteColor} from './noteTextColor';
import {textureById} from './textures';
import {widgetBorderWidth,queueNoteWidgetJoinSync} from './noteWidgetChrome';
import {elementGridStep} from './gridGeometry';
import {codeWidgets,markdownCodeFrame} from './noteCodeWidgets';
import {noteCodeBlocks} from './noteCode';
import {NoteCodeCard} from './NoteCodeCard';
import {stopNoteCodeRuns} from './codeExecution';
import NoteContextMenu from './NoteContextMenu';
import {inlineMath,mathHtml,prepareMathMarkdown} from './noteInlineMath';
import {createRoot} from 'react-dom/client';

const basicSetup={lineNumbers:false,foldGutter:false,highlightActiveLine:false,highlightActiveLineGutter:false,autocompletion:false};
const remarkPlugins=[remarkGfm,remarkNoteColor];
const headingTags=[syntax.heading1,syntax.heading2,syntax.heading3,syntax.heading4,syntax.heading5,syntax.heading6];
const readingParagraph=({children}:{children?:ReactNode})=>children==='NOTEAPPBLANKLINE' ? <div className="reading-blank-line" aria-hidden="true"/> : <p>{(Array.isArray(children)?children:[children]).flatMap((child,index)=>typeof child==='string'?child.split(/(\u00a0{6})/).map((part,partIndex)=>part==='\u00a0'.repeat(6)?<span className="reading-indent-guide" key={`${index}-${partIndex}`}>{part}</span>:part):child)}</p>;
function markTerms(children:ReactNode,terms:string[]):ReactNode {
 if(!terms.length)return children;
 const pattern=new RegExp(terms.map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'giu');
 return (Array.isArray(children)?children:[children]).flatMap((child,index)=>{
  if(typeof child!=='string'){
   if(isValidElement(child)&&child.type!=='code'){
    const element=child as ReactElement<{children?:ReactNode}>;
    if(element.props.children)return cloneElement(element,{children:markTerms(element.props.children,terms)});
   }
   return child;
  }
  const pieces:ReactNode[]=[];let previous=0;
  for(const match of child.matchAll(pattern)){
   const at=match.index!,end=at+match[0].length;
   if(/[\p{L}\p{N}_]/u.test(child[at-1]??'')||/[\p{L}\p{N}_]/u.test(child[end]??''))continue;
   pieces.push(child.slice(previous,at),<span className="reading-term" key={`${index}-${at}`}>{match[0]}</span>);previous=end;
  }
  pieces.push(child.slice(previous));return pieces;
 });
}
function termMarks(terms:string[]) {
 const escaped=terms.map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const pattern=escaped.length?new RegExp(escaped.join('|'),'giu'):null;
 const decorate=(view:EditorView)=>{
  if(!pattern)return Decoration.none;
  const ranges:ReturnType<Decoration['range']>[]=[];
  for(const {from,to} of view.visibleRanges){
   const text=view.state.sliceDoc(from,to);
   for(const match of text.matchAll(pattern)){
    const at=from+match.index!,end=at+match[0].length;
    const before=at?view.state.sliceDoc(at-1,at):'',after=end<view.state.doc.length?view.state.sliceDoc(end,end+1):'';
    if(/[\p{L}\p{N}_]/u.test(before)||/[\p{L}\p{N}_]/u.test(after))continue;
    ranges.push(Decoration.mark({class:'note-term-mark'}).range(at,end));
   }
  }
  return Decoration.set(ranges,true);
 };
 return ViewPlugin.fromClass(class {decorations:DecorationSet;constructor(view:EditorView){this.decorations=decorate(view)}update(update:ViewUpdate){if(update.docChanged||update.viewportChanged)this.decorations=decorate(update.view)}},{decorations:plugin=>plugin.decorations});
}

function LocalImage({src,alt,note}:{src?:string;alt?:string;note:string}) {
 const [asset,setAsset]=useState<{src:string;url:string}>();
 useEffect(()=>{
  if(!src)return;
  let live=true;
  void loadNoteImage(note,src).then(url=>{if(live)setAsset({src,url});});
  return()=>{live=false};
 },[src,note]);
 const url=asset?.src===src?asset?.url:'';
 const {width,height,x,y,z,color,scale,borderWidth}=imageLayout(src??'');
 if(!url)return <span className="image-missing">{asset?.src===src?'Локальное изображение не найдено':'Загрузка изображения…'}{alt?' · '+alt:''}</span>;
 const image=<img src={url} alt={alt} draggable={false} style={{width:x===undefined?width:'100%',height:x===undefined?height:'100%',maxWidth:'100%',maxHeight:'none',objectFit:'contain',transform:`scale(${scale??1})`,transformOrigin:'center'}}/>;
 return x===undefined?image:<span className="reading-floating-image" style={{
  width,height,maxWidth:'100%',maxHeight:'none',left:`min(${x}px, max(0px, 100% - min(${width??'100%'}${typeof width==='number'?'px':''}, 100%)))`,top:y,zIndex:z,borderWidth:widgetBorderWidth(borderWidth),borderColor:color,
 }}>{image}</span>;
}
export default function Editor({note,notes,read,onChange,onLink,editorRef,onReady,light,autoFocus=true,floatingText=true,embedded=false,references,attachWidget,zoom:externalZoom,setZoom:externalSetZoom,showZoomControls=true,taskBoards=[],changeTaskBoard=()=>{},openNote=onLink,ariaLabel='Текст заметки Markdown',taskText=false}:{note:Note;notes:Note[];read:boolean;onChange:(v:string)=>void;onLink:(s:string)=>void;editorRef:React.RefObject<ReactCodeMirrorRef|null>;onReady?:(view:EditorView)=>void;light:boolean;autoFocus?:boolean;floatingText?:boolean;embedded?:boolean;references?:ReferenceActions;attachWidget?:(files:File[],position:number)=>void;zoom?:number;setZoom?:React.Dispatch<React.SetStateAction<number>>;showZoomControls?:boolean;taskBoards?:TaskBoard[];changeTaskBoard?:(board:TaskBoard)=>void;openNote?:(path:string)=>void;ariaLabel?:string;taskText?:boolean}){
 const [localZoom,setLocalZoom]=useState(1),zoom=externalZoom??localZoom,setZoom=externalSetZoom??setLocalZoom;
 const [boardHeights,setBoardHeights]=useState<Record<string,number>>({});
 const [context,setContext]=useState<{x:number;y:number;widget?:HTMLElement}|null>(null);
 const conceptRoot=useRef<HTMLDivElement>(null);
 useEffect(()=>()=>stopNoteCodeRuns(note.path),[note.path]);
 const zoomContent=useRef<HTMLDivElement>(null);
 const [zoomHeight,setZoomHeight]=useState(0);
 const change=useRef(onChange);
 const referenceActions=useRef(references);
 const widgetActions=useRef({attach:attachWidget,references,editable:!read});
 referenceActions.current=references;
 widgetActions.current={attach:attachWidget,references,editable:!read};
 const targets=references?.targets;
 const chips=useMemo(()=>!read&&targets?referenceWidgets(targets,()=>referenceActions.current):[],[read,targets]);
 change.current=onChange;
 const handleChange=useCallback((value:string)=>change.current(value),[]);
 const NoteImage=useMemo(()=>({src,alt}:{src?:string;alt?:string})=><LocalImage src={src} alt={alt} note={note.path}/>,[note.path]);
 const widgetExtension=useMemo(()=>floatingText&&!read?noteTextBlocks(note.path,()=>widgetActions.current):undefined,[note.path,floatingText,read]);
 const notesRef=useRef(notes);notesRef.current=notes;
 const concepts=useMemo(()=>conceptDefinitions(notes),[notes]);
 const conceptEntries=useMemo(()=>[...concepts.values()].filter(item=>item.term.trim()).sort((a,b)=>b.term.length-a.term.length),[concepts]);
 const termsKey=read?'':JSON.stringify([...new Set(conceptEntries.map(item=>item.term.trim()))]);
 const termExtension=useMemo(()=>read?[]:termMarks(JSON.parse(termsKey)),[read,termsKey]);
 const conceptEntriesRef=useRef(conceptEntries);conceptEntriesRef.current=conceptEntries;
 useEffect(()=>{
  const root=conceptRoot.current;if(!root||!conceptEntries.length)return;
  const tip=document.createElement('div');tip.className='concept-hover-tooltip';tip.hidden=true;(root.closest('.app')??document.body).appendChild(tip);
  const tipRoot=createRoot(tip);
  let shown='';
  const hide=()=>{tip.hidden=true};
  const move=(event:MouseEvent)=>{
   const target=event.target as Element;if(!target.closest('.reading,.cm-content')||target.closest('input,textarea,button,.concept-tooltip,.reading-table-widget .note-widget-heading')){hide();return}
   const position=document.caretRangeFromPoint(event.clientX,event.clientY),node=position?.startContainer;
   if(!position||!node||node.nodeType!==Node.TEXT_NODE){hide();return}
   const block=target.closest('.cm-line,.reading p,.reading h1,.reading h2,.reading h3,.reading h4,.reading h5,.reading h6,.reading li,.reading td,.reading th,.reading')??node.parentElement;if(!block||!block.contains(node)){hide();return}
   const prefix=document.createRange();prefix.selectNodeContents(block);prefix.setEnd(node,position.startOffset);
   const content=block.textContent??'',offset=prefix.toString().length,lower=content.toLocaleLowerCase();
   const entries=conceptEntriesRef.current;
   let matched='';for(const entry of entries){const term=entry.term.trim().toLocaleLowerCase();let at=lower.indexOf(term);while(at!==-1){const end=at+term.length,before=content[at-1]??'',after=content[end]??'';if(offset>=at&&offset<=end&&!/[\p{L}\p{N}_]/u.test(before)&&!/[\p{L}\p{N}_]/u.test(after)){matched=term;break}at=lower.indexOf(term,at+1)}if(matched)break}
   if(!matched){hide();return}
   if(shown!==matched){shown=matched;tipRoot.render(<>{entries.filter(entry=>entry.term.trim().toLocaleLowerCase()===matched).map((entry,index)=><div key={index}><MarkdownMath text={entry.definition} notePath={entry.path} openNote={path=>openNoteRef.current(path)}/></div>)}</>)}
   tip.hidden=false;tip.style.left=`${Math.max(8,Math.min(event.clientX+12,window.innerWidth-tip.offsetWidth-8))}px`;tip.style.top=`${Math.max(8,Math.min(event.clientY+18,window.innerHeight-tip.offsetHeight-8))}px`;
  };
  root.addEventListener('mousemove',move);root.addEventListener('mouseleave',hide);return()=>{root.removeEventListener('mousemove',move);root.removeEventListener('mouseleave',hide);tipRoot.unmount();tip.remove()};
 },[conceptEntries]);
 const taskBoardsRef=useRef(taskBoards);taskBoardsRef.current=taskBoards;
 const changeTaskBoardRef=useRef(changeTaskBoard);changeTaskBoardRef.current=changeTaskBoard;
 const openNoteRef=useRef(openNote);openNoteRef.current=openNote;
 const featureExtension=useMemo(()=>floatingText&&!read?featureBlocks(()=>notesRef.current,()=>taskBoardsRef.current,(board)=>changeTaskBoardRef.current(board),path=>openNoteRef.current(path)):undefined,[floatingText,read,note.path]);
 const conceptExtension=useMemo(()=>floatingText&&!read?conceptLinks(()=>notesRef.current,path=>openNoteRef.current(path)):undefined,[floatingText,read,note.path]);
 const tableExtension=useMemo(()=>floatingText&&!read?markdownTables(taskText):undefined,[floatingText,read,taskText]);
 const codeExtension=useMemo(()=>!read?codeWidgets(note.path):[],[read,note.path]);
 useEffect(()=>{refreshFeatureBlocks();},[notes,taskBoards]);
 const notePaths=useMemo(()=>read?'':notes.map(n=>n.path).join('|'),[read,notes]);
 const extensions=useMemo(()=>read?[]:[markdown(taskText?{base:markdownLanguage}:undefined),inlineMath,termExtension,codeExtension,markdownCodeFrame(),noteImagePreviews(note.path),noteIndent,noteTextColor,noteHorizontalRule,...(widgetExtension?[widgetExtension]:[]),...(featureExtension?[featureExtension]:[]),...(conceptExtension?[conceptExtension]:[]),...(tableExtension?[tableExtension]:[]),chips,EditorView.updateListener.of(update=>{if(update.docChanged||update.geometryChanged)queueNoteWidgetJoinSync(update.view.contentDOM,elementGridStep(update.view.contentDOM))}),EditorView.lineWrapping,syntaxHighlighting(HighlightStyle.define([...headingTags.map((tag,index)=>({tag,class:`note-heading-${index+1}`})),{tag:syntax.strong,fontWeight:taskText?'800':'700'},{tag:syntax.emphasis,fontStyle:'italic'},...(taskText?[{tag:syntax.monospace,fontFamily:'monospace',backgroundColor:'var(--input)'},{tag:syntax.strikethrough,textDecoration:'line-through'}]:[]),{tag:syntax.link,color:'var(--accent)'},{tag:syntax.quote,color:'var(--muted)',fontStyle:'italic'}])),autocompletion({override:[ctx=>{const m=ctx.matchBefore(/\[\[[^\]\n]*/);if(!m)return null;return {from:m.from+2,options:notes.map(n=>({label:n.path.replace(/\.(?:md|canvas)$/,''),displayLabel:title(n.path),detail:folder(n.path),type:'text',apply:n.path.replace(/\.(?:md|canvas)$/,'')+']]'}))}}]}),EditorView.theme({'&':{backgroundColor:'transparent',fontSize:'var(--editor-size)'},'.cm-content':{fontFamily:'var(--body-font)',padding:'0',lineHeight:'var(--note-line-height,1.85)',color:'var(--note-text-color,var(--text))'},'.cm-line':{padding:'0'},'.cm-gutters':{display:'none'},'.cm-activeLine':{backgroundColor:'transparent'},'&.cm-focused':{outline:'none'},'.cm-cursor':{borderLeftColor:'var(--accent)'},'.cm-scroller':{overflow:'visible'},'.cm-tooltip':{backgroundColor:'var(--popup)',border:'1px solid var(--line)',borderRadius:'8px'},'.cm-selectionBackground':{backgroundColor:'var(--selection) !important'}})],[read,note.path,notePaths,termExtension,widgetExtension,featureExtension,conceptExtension,tableExtension,codeExtension,chips,taskText]);
 const theme=useMemo(()=>read?undefined:EditorView.theme({}, {dark:!light}),[read,light]);
 useLayoutEffect(()=>{
  const content=zoomContent.current,area=content?.closest<HTMLElement>('.editor-area'),scroll=content?.closest<HTMLElement>('.editor-scroll');
  if(!floatingText||embedded||!content||!area||!scroll)return;
  let frame=0;
  const sync=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   const anchor=content.querySelector<HTMLElement>('.cm-content,.reading');
   if(!anchor)return;
   const rect=anchor.getBoundingClientRect(),bounds=area.getBoundingClientRect();
   area.style.setProperty('--note-grid-x',`${rect.left-bounds.left}px`);
   area.style.setProperty('--note-grid-y',`${rect.top-bounds.top}px`);
   area.style.setProperty('--note-grid-zoom',String(zoom));
   setZoomHeight(content.offsetHeight*zoom);
  });};
  const wheel=(event:WheelEvent)=>{if((event.ctrlKey||event.metaKey)&&event.deltaY){event.preventDefault();const unit=event.deltaMode===1?16:event.deltaMode===2?scroll.clientHeight:1,factor=Math.exp(-event.deltaY*unit*.001);setZoom(value=>Math.max(.5,Math.min(2,value*factor)));}};
  const observer=new ResizeObserver(sync);observer.observe(content);observer.observe(area);
  scroll.addEventListener('scroll',sync);scroll.addEventListener('wheel',wheel,{passive:false});sync();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();scroll.removeEventListener('scroll',sync);scroll.removeEventListener('wheel',wheel);};
 },[zoom,read,note.path,floatingText,embedded]);
 useLayoutEffect(()=>{
  if(!read||!floatingText||embedded)return;
  const root=zoomContent.current?.querySelector<HTMLElement>('.reading');if(!root)return;
  const sync=()=>queueNoteWidgetJoinSync(root,elementGridStep(root));
  const observer=new ResizeObserver(sync);observer.observe(root);for(const widget of root.querySelectorAll<HTMLElement>('.reading-floating-text,.reading-floating-image'))observer.observe(widget);
  root.addEventListener('load',sync,true);
  sync();return()=>{observer.disconnect();root.removeEventListener('load',sync,true)};
 },[read,floatingText,embedded,note.content,zoom]);
 const wrap=(content:ReactNode)=><div ref={conceptRoot} style={{display:'contents'}}>{!floatingText||embedded?content:<>
  {showZoomControls&&<div className="note-zoom-controls" role="group" aria-label="Масштаб заметки">
   <button type="button" aria-label="Отдалить заметку" disabled={zoom<=.5} onClick={()=>setZoom(value=>Math.max(.5,Math.round((value-.1)*10)/10))}><Minus size={15}/></button>
   <button type="button" aria-label={`Масштаб заметки ${Math.round(zoom*100)}%. Сбросить`} onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button>
   <button type="button" aria-label="Приблизить заметку" disabled={zoom>=2} onClick={()=>setZoom(value=>Math.min(2,Math.round((value+.1)*10)/10))}><Plus size={15}/></button>
  </div>}<div className="note-zoom-frame" style={{height:zoomHeight}}><div className="note-zoom-content" ref={zoomContent} style={{transform:`scale(${zoom})`}}>{content}</div></div>
 </>}</div>;
 if(!read)return wrap(<div onContextMenuCapture={event=>{const view=editorRef.current?.view;if(!view)return;const target=event.target as HTMLElement;if(target.closest('.visual-table-widget')||target.closest('.task-text-editor')&&!view.dom.closest('.task-text-editor'))return;const candidate=target.closest<HTMLElement>('.floating-note-text,.note-image-box.floating-image,.note-feature-host.note-feature-widget,.visual-table-host.note-feature-widget'),widget=candidate&&view.dom.contains(candidate)?candidate:null;event.preventDefault();event.stopPropagation();if(!widget&&view.state.selection.main.empty){const pos=view.posAtCoords({x:event.clientX,y:event.clientY});if(pos!==null)view.dispatch({selection:{anchor:pos}});}setContext({x:event.clientX,y:event.clientY,widget:widget??undefined});}}><CodeMirror ref={editorRef} autoFocus={autoFocus} onCreateEditor={onReady} value={note.content} onChange={handleChange} extensions={extensions} theme={theme} basicSetup={basicSetup} aria-label={ariaLabel}/>{context&&editorRef.current?.view&&<NoteContextMenu view={editorRef.current.view} taskText={taskText} {...context} close={()=>setContext(null)}/>}</div>);
 let heading=0;
 const content=prepareMathMarkdown(readingIndent(floatingText&&!taskText?readingWidgetTables(note.content):note.content)).replace(/\[\[([^\]]+)\]\]/g,(_,s:string)=>`[${s.split('|')[1]||s.split('#')[0]}](note:${encodeURIComponent(s)})`);
 const markdownComponents:Components={p:({children})=>readingParagraph({children:children==='NOTEAPPBLANKLINE'?children:markTerms(children,[...new Set(conceptEntries.map(item=>item.term.trim()))])}),a:({href,children})=>{
  const conceptId=href?.startsWith('noteapp-concept:')?href.slice('noteapp-concept:'.length):'';
  const concept=concepts.get(conceptId);
  if(concept)return <span className="concept-term" tabIndex={0}><span>{children}</span><span className="concept-tooltip"><MarkdownMath text={concept.definition||'Определение не заполнено.'} notePath={concept.path} openNote={onLink}/><button type="button" onClick={()=>onLink(concept.path)}>К исходному определению</button></span></span>;
  return href&&parseReference(href)?<ReferenceChip url={href} actions={references}>{children}</ReferenceChip>:<a href={href} onClick={e=>{if(href?.startsWith('note:')){e.preventDefault();onLink(decodeURIComponent(href.slice(5)))}else if(href&&!/^https?:|mailto:/.test(href)){e.preventDefault();onLink(href.replace(/\.md$/,''))}}} target={href?.startsWith('http')?'_blank':undefined} rel="noreferrer">{children}</a>;
 },img:NoteImage,code:({children,className})=>{const text=String(children),prefix='noteapp-inline-math:';if(!className&&text.startsWith(prefix)){try{return <span className="note-inline-math" dangerouslySetInnerHTML={{__html:mathHtml(decodeURIComponent(text.slice(prefix.length)))}}/>}catch{return <code>{children}</code>}}return <code className={className}>{children}</code>}};
 const urlTransform=(url:string)=>/^(note:|noteapp-concept:|https?:|mailto:)/.test(url)||parseReference(url)||!url.includes(':')?url:'';
 const sourceList=sourcesFromMarkdown(note.content);
 const readingCode=noteCodeBlocks(content);
 const storedCode=noteCodeBlocks(note.content);
 return wrap(<article className="reading"><ReactMarkdown remarkPlugins={remarkPlugins} urlTransform={urlTransform} components={{pre:({children,node})=>{
  const start=node?.position?.start.offset;
  const codeIndex=readingCode.findIndex(block=>start!==undefined&&start>=block.from&&start-block.from<=3&&!content.slice(block.from,start).trim());
  const runnable=codeIndex<0?undefined:storedCode[codeIndex];
  if(runnable){
   const position=floatingText&&runnable.options.widget;
   if(position)return <div className={`note-code-host note-feature-host note-feature-widget reading-floating-text${textureById(position.texture)?` palette-${position.texture}`:''}`} style={{left:`min(${position.x}px, max(0px, 100% - min(${position.width}px, 100%)))`,top:position.y,width:`min(${position.width}px, 100%)`,height:position.height,zIndex:position.z,borderWidth:widgetBorderWidth(position.borderWidth),borderColor:position.color,background:position.fill} as CSSProperties}><div className="note-widget-heading">Код</div><div className="note-widget-body"><FittedWidget baseWidth={640} scale={position.scale}><NoteCodeCard notePath={note.path} block={runnable}/></FittedWidget></div></div>;
   return <NoteCodeCard notePath={note.path} block={runnable}/>;
  }
  const code=isValidElement<{className?:string;children?:ReactNode}>(children)?children.props:undefined;
  const position=floatingText&&noteTextPosition(code?.className?.replace(/^language-/,'')??'');
  if(!position){
   const language=code?.className?.match(/^language-noteapp-(compare|source|concept|math|plot|board)$/)?.[1];
   const value=language&&featureFromMarkdown(language,String(code?.children??'').replace(/\n$/,''));
   if(!language||!value)return <pre>{children}</pre>;
   const widget=value.widget,board=language==='board'?taskBoards.find(item=>item.id===value.id):undefined;
   const automatic=language==='board'&&widget&&(widget.autoSize??(widget.width===760&&widget.height===480));
   const measured=automatic?kanbanWidgetSize(board,value.column,value.taskId):undefined;
   const width=measured?.[0]??widget?.width,height=automatic?Math.min(1200,boardHeights[String(start)]??measured![1]):widget?.height;
   const featureProps={kind:language as 'compare'|'source'|'concept'|'math'|'plot'|'board',value,notes,boards:taskBoards,changeBoard:changeTaskBoard,openNote,onBoardHeight:automatic?(size:number)=>setBoardHeights(current=>{const next=size+48,key=String(start);return current[key]===next?current:{...current,[key]:next}}):undefined};
   if(floatingText&&widget&&[widget.x,widget.y,width,height].every(Number.isFinite))return <div className={`reading-floating-text reading-note-feature-widget note-feature-host note-feature-widget note-feature-${language}${textureById(widget.texture)?` palette-${widget.texture}`:''}`} style={{left:`min(${widget.x}px, max(0px, 100% - min(${width}px, 100%)))`,top:widget.y,zIndex:widget.z??2,width:`min(${width}px, 100%)`,height,borderWidth:widgetBorderWidth(widget.borderWidth),borderColor:widget.color,background:widget.fill,'--widget-height':`${height}px`} as CSSProperties & {'--widget-height':string}}><div className="note-widget-heading">{language==='board'?'Доска задач':'Блок заметки'}</div><div className="note-widget-body"><FittedWidget baseWidth={featureBaseWidth(language as NoteFeature,board,value.column,value.taskId)} scale={widget.scale}><FeatureBlockView {...featureProps}/></FittedWidget></div></div>;
   return <FeatureBlockView {...featureProps}/>;
  }
   const tableSource=String(code?.children??'').replace(/\n$/,'');
   if(standaloneMapTable(tableSource))return <div className="reading-floating-text reading-table-widget visual-table-host note-feature-widget" style={{left:`min(${position.x}px, max(0px, 100% - min(${position.width??320}px, 100%)))`,top:position.y,zIndex:position.z,width:`min(${position.width??320}px, 100%)`,height:position.height,borderWidth:position.borderWidth??1,borderColor:position.color,background:position.fill} as CSSProperties}><div className="note-widget-heading">Таблица</div><div className="note-widget-body"><ReadingTable source={tableSource}/></div></div>;
   return <div className={`reading-floating-text${textureById(position.texture)?` palette-${position.texture}`:''}`}
     style={{left:`min(${position.x}px, max(0px, 100% - min(${position.width??320}px, 100%)))`,top:position.y,zIndex:position.z,width:`min(${position.width??320}px, 100%)`,height:position.height,borderColor:position.color,background:position.fill,'--widget-height':`${position.height??160}px`} as CSSProperties & {'--widget-height':string} }>
    <div className="note-widget-heading">Текст</div><FittedWidget baseWidth={String(code?.children??'').trimStart().startsWith('|')?668:268} scale={position.scale}><ReactMarkdown remarkPlugins={remarkPlugins} urlTransform={urlTransform} components={markdownComponents}>
      {String(code?.children??'').replace(/\n$/,'')}
    </ReactMarkdown></FittedWidget>
  </div>;
 },h1:({children})=><h1 id={`heading-${heading++}`}>{markTerms(children,[...new Set(conceptEntries.map(item=>item.term.trim()))])}</h1>,h2:({children})=><h2 id={`heading-${heading++}`}>{markTerms(children,[...new Set(conceptEntries.map(item=>item.term.trim()))])}</h2>,h3:({children})=><h3 id={`heading-${heading++}`}>{markTerms(children,[...new Set(conceptEntries.map(item=>item.term.trim()))])}</h3>,h4:({children})=><h4 id={`heading-${heading++}`}>{markTerms(children,[...new Set(conceptEntries.map(item=>item.term.trim()))])}</h4>,h5:({children})=><h5 id={`heading-${heading++}`}>{markTerms(children,[...new Set(conceptEntries.map(item=>item.term.trim()))])}</h5>,h6:({children})=><h6 id={`heading-${heading++}`}>{markTerms(children,[...new Set(conceptEntries.map(item=>item.term.trim()))])}</h6>,...markdownComponents}}>{content}</ReactMarkdown>
  {sourceList.length>0&&<section className="note-source-list"><h2>Источники</h2><ol>{sourceList.map((source,index)=><li key={index}><strong>{source.title||source.url}</strong>{source.author&&` — ${source.author}`}{source.date&&`, ${source.date}`}{source.page&&`, стр. ${source.page}`} {source.url&&<button type="button" onClick={()=>void openSourceLocation(source.url).catch(error=>alert(error.message))}>Открыть</button>}</li>)}</ol></section>}</article>);
}
