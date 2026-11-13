import {useMemo,useEffect,useLayoutEffect,useState,useRef,useCallback,isValidElement,type CSSProperties,type ReactNode} from 'react';
import CodeMirror,{type ReactCodeMirrorRef} from '@uiw/react-codemirror';
import {markdown} from '@codemirror/lang-markdown';
import {autocompletion} from '@codemirror/autocomplete';
import {EditorView} from '@codemirror/view';
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
import {FittedWidget} from './widgetFit';
import {markdownTables,readingWidgetTables} from './noteTables';
import {openSourceLocation} from './storage';
import {ReferenceChip,referenceWidgets,type ReferenceActions} from './ReferenceChip';
import {parseReference} from './noteReferences';
import {noteIndent,readingIndent} from './noteIndent';
import {noteTextColor,remarkNoteColor} from './noteTextColor';
import {textureById} from './textures';
import {widgetBorderWidth,queueNoteWidgetJoinSync} from './noteWidgetChrome';
import {elementGridStep} from './gridGeometry';
import {codeWidgets} from './noteCodeWidgets';
import {noteCodeBlocks} from './noteCode';
import {NoteCodeCard} from './NoteCodeCard';
import {stopNoteCodeRuns} from './codeExecution';

const basicSetup={lineNumbers:false,foldGutter:false,highlightActiveLine:false,highlightActiveLineGutter:false,autocompletion:false};
const remarkPlugins=[remarkGfm,remarkNoteColor];
const headingTags=[syntax.heading1,syntax.heading2,syntax.heading3,syntax.heading4,syntax.heading5,syntax.heading6];

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
 return url?<img src={url} alt={alt} draggable={false} className={x===undefined?'':'reading-floating-image'} style={{
  width,height,maxWidth:'100%',maxHeight:'none',objectFit:'contain',left:x===undefined?undefined:`min(${x??0}px, max(0px, 100% - min(${width??'100%'}${typeof width==='number'?'px':''}, 100%)))`,top:y,zIndex:z,borderWidth:widgetBorderWidth(borderWidth),borderColor:color,transform:`scale(${Math.min(1,scale??1)})`,transformOrigin:'center',
 }}/ >:
  <span className="image-missing">{asset?.src===src?'Локальное изображение не найдено':'Загрузка изображения…'}{alt?' · '+alt:''}</span>;
}
export default function Editor({note,notes,read,onChange,onLink,editorRef,onReady,light,autoFocus=true,floatingText=true,references,attachWidget,zoom:externalZoom,setZoom:externalSetZoom,showZoomControls=true,taskBoards=[],changeTaskBoard=()=>{},openNote=onLink}:{note:Note;notes:Note[];read:boolean;onChange:(v:string)=>void;onLink:(s:string)=>void;editorRef:React.RefObject<ReactCodeMirrorRef|null>;onReady?:(view:EditorView)=>void;light:boolean;autoFocus?:boolean;floatingText?:boolean;references?:ReferenceActions;attachWidget?:(files:File[],position:number)=>void;zoom?:number;setZoom?:React.Dispatch<React.SetStateAction<number>>;showZoomControls?:boolean;taskBoards?:TaskBoard[];changeTaskBoard?:(board:TaskBoard)=>void;openNote?:(path:string)=>void}){
 const [localZoom,setLocalZoom]=useState(1),zoom=externalZoom??localZoom,setZoom=externalSetZoom??setLocalZoom;
 useEffect(()=>()=>stopNoteCodeRuns(note.path),[note.path]);
 const zoomContent=useRef<HTMLDivElement>(null);
 const [zoomHeight,setZoomHeight]=useState(0);
 const change=useRef(onChange);
 const referenceActions=useRef(references);
 const widgetActions=useRef({attach:attachWidget,references,editable:!read});
 referenceActions.current=references;
 widgetActions.current={attach:attachWidget,references,editable:!read};
 const targets=references?.targets;
 const chips=useMemo(()=>targets?referenceWidgets(targets,()=>referenceActions.current):[],[targets]);
 change.current=onChange;
 const handleChange=useCallback((value:string)=>change.current(value),[]);
 const NoteImage=useMemo(()=>({src,alt}:{src?:string;alt?:string})=><LocalImage src={src} alt={alt} note={note.path}/>,[note.path]);
 const widgetExtension=useMemo(()=>floatingText?noteTextBlocks(note.path,()=>widgetActions.current):undefined,[note.path,floatingText,read]);
 const notesRef=useRef(notes);notesRef.current=notes;
 const taskBoardsRef=useRef(taskBoards);taskBoardsRef.current=taskBoards;
 const changeTaskBoardRef=useRef(changeTaskBoard);changeTaskBoardRef.current=changeTaskBoard;
 const openNoteRef=useRef(openNote);openNoteRef.current=openNote;
 const featureExtension=useMemo(()=>floatingText&&!read?featureBlocks(()=>notesRef.current,()=>taskBoardsRef.current,(board)=>changeTaskBoardRef.current(board),path=>openNoteRef.current(path)):undefined,[floatingText,read,note.path]);
 const conceptExtension=useMemo(()=>floatingText&&!read?conceptLinks(()=>notesRef.current,path=>openNoteRef.current(path)):undefined,[floatingText,read,note.path]);
 const tableExtension=useMemo(()=>floatingText&&!read?markdownTables():undefined,[floatingText,read]);
 const codeExtension=useMemo(()=>!read?codeWidgets(note.path):[],[read,note.path]);
 useEffect(()=>{refreshFeatureBlocks();},[notes,taskBoards]);
 const extensions=useMemo(()=>[markdown(),codeExtension,noteImagePreviews(note.path),noteIndent,noteTextColor,...(widgetExtension?[widgetExtension]:[]),...(featureExtension?[featureExtension]:[]),...(conceptExtension?[conceptExtension]:[]),...(tableExtension?[tableExtension]:[]),chips,EditorView.lineWrapping,syntaxHighlighting(HighlightStyle.define([...headingTags.map((tag,index)=>({tag,class:`note-heading-${index+1}`})),{tag:syntax.strong,fontWeight:'700'},{tag:syntax.emphasis,fontStyle:'italic'},{tag:syntax.link,color:'var(--accent)'},{tag:syntax.quote,color:'var(--muted)',fontStyle:'italic'}])),autocompletion({override:[ctx=>{const m=ctx.matchBefore(/\[\[[^\]\n]*/);if(!m)return null;return {from:m.from+2,options:notes.map(n=>({label:n.path.replace(/\.md$/,''),displayLabel:title(n.path),detail:folder(n.path),type:'text',apply:n.path.replace(/\.md$/,'')+']]'}))}}]}),EditorView.theme({'&':{backgroundColor:'transparent',fontSize:'var(--editor-size)'},'.cm-content':{fontFamily:'var(--body-font)',padding:'0',lineHeight:'var(--note-line-height,1.85)',color:'var(--note-text-color,var(--text))'},'.cm-line':{padding:'0'},'.cm-gutters':{display:'none'},'.cm-activeLine':{backgroundColor:'transparent'},'&.cm-focused':{outline:'none'},'.cm-cursor':{borderLeftColor:'var(--accent)'},'.cm-scroller':{overflow:'visible'},'.cm-tooltip':{backgroundColor:'var(--popup)',border:'1px solid var(--line)',borderRadius:'8px'},'.cm-selectionBackground':{backgroundColor:'var(--selection) !important'}})],[note.path,notes.map(n=>n.path).join('|'),widgetExtension,featureExtension,conceptExtension,tableExtension,codeExtension,chips]);
 const theme=useMemo(()=>EditorView.theme({}, {dark:!light}),[light]);
 useLayoutEffect(()=>{
  const content=zoomContent.current,area=content?.closest<HTMLElement>('.editor-area'),scroll=content?.closest<HTMLElement>('.editor-scroll');
  if(!floatingText||!content||!area||!scroll)return;
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
  const wheel=(event:WheelEvent)=>{if((event.ctrlKey||event.metaKey)&&event.deltaY){event.preventDefault();setZoom(value=>Math.max(.5,Math.min(2,Math.round((value+(event.deltaY<0 ? .1 : -.1))*10)/10)));}};
  const observer=new ResizeObserver(sync);observer.observe(content);observer.observe(area);
  scroll.addEventListener('scroll',sync);scroll.addEventListener('wheel',wheel,{passive:false});sync();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();scroll.removeEventListener('scroll',sync);scroll.removeEventListener('wheel',wheel);};
 },[zoom,read,note.path,floatingText]);
 useLayoutEffect(()=>{
  if(!read||!floatingText)return;
  const root=zoomContent.current?.querySelector<HTMLElement>('.reading');if(!root)return;
  const sync=()=>queueNoteWidgetJoinSync(root,elementGridStep(root));
  const observer=new ResizeObserver(sync);for(const widget of root.querySelectorAll<HTMLElement>('.reading-floating-text'))observer.observe(widget);
  sync();return()=>observer.disconnect();
 },[read,floatingText,note.content,zoom]);
 const wrap=(content:ReactNode)=>!floatingText?content:<>
  {showZoomControls&&<div className="note-zoom-controls" role="group" aria-label="Масштаб заметки">
   <button type="button" aria-label="Отдалить заметку" disabled={zoom<=.5} onClick={()=>setZoom(value=>Math.max(.5,Math.round((value-.1)*10)/10))}><Minus size={15}/></button>
   <button type="button" aria-label={`Масштаб заметки ${Math.round(zoom*100)}%. Сбросить`} onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button>
   <button type="button" aria-label="Приблизить заметку" disabled={zoom>=2} onClick={()=>setZoom(value=>Math.min(2,Math.round((value+.1)*10)/10))}><Plus size={15}/></button>
  </div>}<div className="note-zoom-frame" style={{height:zoomHeight}}><div className="note-zoom-content" ref={zoomContent} style={{transform:`scale(${zoom})`}}>{content}</div></div>
 </>;
 const concepts=useMemo(()=>conceptDefinitions(notes),[notes]);
 if(!read)return wrap(<CodeMirror ref={editorRef} autoFocus={autoFocus} onCreateEditor={onReady} value={note.content} onChange={handleChange} extensions={extensions} theme={theme} basicSetup={basicSetup} aria-label="Текст заметки Markdown"/>);
 let heading=0;
 const content=readingIndent(floatingText?readingWidgetTables(note.content):note.content).replace(/\[\[([^\]]+)\]\]/g,(_,s:string)=>`[${s.split('|')[1]||s.split('#')[0]}](note:${encodeURIComponent(s)})`);
 const markdownComponents:Components={a:({href,children})=>{
  const conceptId=href?.startsWith('noteapp-concept:')?href.slice('noteapp-concept:'.length):'';
  const concept=concepts.get(conceptId);
  if(concept)return <span className="concept-term" tabIndex={0}><span>{children}</span><span className="concept-tooltip"><MarkdownMath text={concept.definition||'Определение не заполнено.'} notePath={concept.path} openNote={onLink}/><button type="button" onClick={()=>onLink(concept.path)}>К исходному определению</button></span></span>;
  return href&&parseReference(href)?<ReferenceChip url={href} actions={references}>{children}</ReferenceChip>:<a href={href} onClick={e=>{if(href?.startsWith('note:')){e.preventDefault();onLink(decodeURIComponent(href.slice(5)))}else if(href&&!/^https?:|mailto:/.test(href)){e.preventDefault();onLink(href.replace(/\.md$/,''))}}} target={href?.startsWith('http')?'_blank':undefined} rel="noreferrer">{children}</a>;
 },img:NoteImage};
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
   if(position)return <div className={`note-code-host note-feature-host note-feature-widget reading-floating-text${textureById(position.texture)?` palette-${position.texture}`:''}`} style={{left:`min(${position.x}px, max(0px, 100% - min(${position.width}px, 100%)))`,top:position.y,width:`min(${position.width}px, 100%)`,height:position.height,zIndex:position.z,borderWidth:widgetBorderWidth(position.borderWidth),borderColor:position.color,background:position.fill} as CSSProperties}><div className="note-widget-body"><FittedWidget baseWidth={640} scale={position.scale}><NoteCodeCard notePath={note.path} block={runnable}/></FittedWidget></div></div>;
   return <NoteCodeCard notePath={note.path} block={runnable}/>;
  }
  const code=isValidElement<{className?:string;children?:ReactNode}>(children)?children.props:undefined;
  const position=floatingText&&noteTextPosition(code?.className?.replace(/^language-/,'')??'');
  if(!position){
   const language=code?.className?.match(/^language-noteapp-(compare|source|concept|math|plot|board)$/)?.[1];
   const value=language&&featureFromMarkdown(language,String(code?.children??'').replace(/\n$/,''));
   if(!language||!value)return <pre>{children}</pre>;
   const featureProps={kind:language as 'compare'|'source'|'concept'|'math'|'plot'|'board',value,notes,boards:taskBoards,changeBoard:changeTaskBoard,openNote};
   const widget=value.widget;
   if(floatingText&&widget&&[widget.x,widget.y,widget.width,widget.height].every(Number.isFinite))return <div className={`reading-floating-text reading-note-feature-widget note-feature-host note-feature-widget note-feature-${language}${textureById(widget.texture)?` palette-${widget.texture}`:''}`} style={{left:`min(${widget.x}px, max(0px, 100% - min(${widget.width}px, 100%)))`,top:widget.y,zIndex:widget.z??2,width:`min(${widget.width}px, 100%)`,height:widget.height,borderWidth:widgetBorderWidth(widget.borderWidth),borderColor:widget.color,background:widget.fill,'--widget-height':`${widget.height}px`} as CSSProperties & {'--widget-height':string}}><div className="note-widget-body"><FittedWidget baseWidth={featureBaseWidth(language as NoteFeature)} scale={widget.scale}><FeatureBlockView {...featureProps}/></FittedWidget></div></div>;
   return <FeatureBlockView {...featureProps}/>;
  }
   return <div className={`reading-floating-text${textureById(position.texture)?` palette-${position.texture}`:''}`}
     style={{left:`min(${position.x}px, max(0px, 100% - min(${position.width??320}px, 100%)))`,top:position.y,zIndex:position.z,width:`min(${position.width??320}px, 100%)`,height:position.height,borderColor:position.color,background:position.fill,'--widget-height':`${position.height??160}px`} as CSSProperties & {'--widget-height':string} }>
    <FittedWidget baseWidth={String(code?.children??'').trimStart().startsWith('|')?668:268} scale={position.scale}><ReactMarkdown remarkPlugins={remarkPlugins} urlTransform={urlTransform} components={markdownComponents}>
      {String(code?.children??'').replace(/\n$/,'')}
    </ReactMarkdown></FittedWidget>
  </div>;
 },h1:({children})=><h1 id={`heading-${heading++}`}>{children}</h1>,h2:({children})=><h2 id={`heading-${heading++}`}>{children}</h2>,h3:({children})=><h3 id={`heading-${heading++}`}>{children}</h3>,h4:({children})=><h4 id={`heading-${heading++}`}>{children}</h4>,h5:({children})=><h5 id={`heading-${heading++}`}>{children}</h5>,h6:({children})=><h6 id={`heading-${heading++}`}>{children}</h6>,...markdownComponents}}>{content}</ReactMarkdown>
  {sourceList.length>0&&<section className="note-source-list"><h2>Источники</h2><ol>{sourceList.map((source,index)=><li key={index}><strong>{source.title||source.url}</strong>{source.author&&` — ${source.author}`}{source.date&&`, ${source.date}`}{source.page&&`, стр. ${source.page}`} {source.url&&<button type="button" onClick={()=>void openSourceLocation(source.url).catch(error=>alert(error.message))}>Открыть</button>}</li>)}</ol></section>}</article>);
}
