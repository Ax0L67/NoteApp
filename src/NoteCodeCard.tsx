import {useCallback,useEffect,useMemo,useState,useSyncExternalStore,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import CodeMirror from '@uiw/react-codemirror';
import {StreamLanguage,HighlightStyle,syntaxHighlighting} from '@codemirror/language';
import {EditorView} from '@codemirror/view';
import {tags} from '@lezer/highlight';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {codeFileName,CODE_LIMIT,STDIN_LIMIT,type CodeLanguage,type CodeOptions,type NoteCodeBlock} from './noteCode';
import './noteCode.css';
import {codeRunSnapshot,confirmCodeRun,startCodeRun,stopCodeRun,subscribeCodeRun,verifyCodeSandbox} from './codeExecution';

type RuntimeStatus={available:boolean;reason:string};
let runtimeStatus:Promise<RuntimeStatus>|undefined;
function getRuntimeStatus():Promise<RuntimeStatus> {
  return runtimeStatus??=(isTauri()?invoke<RuntimeStatus>('code_runtime_status').then(async status=>{if(status.available)await verifyCodeSandbox();return status}):Promise.resolve({available:false as const,reason:'Запуск доступен только в настольном приложении с проверенной изолированной средой.'}))
    .catch(error=>({available:false as const,reason:error instanceof Error?error.message:'Не удалось проверить безопасность среды. Запуск отключён.'}));
}
const keywords={python:new Set('and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield'.split(' ')),cpp:new Set('alignas auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern false float for friend if inline int long namespace new noexcept nullptr operator private protected public register return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while'.split(' '))};
function codeSyntax(language:CodeLanguage) {
  return StreamLanguage.define({
    startState:()=>({comment:false,string:''}),
    token(stream,state){
      if(state.comment){if(stream.skipTo('*/')){stream.match('*/');state.comment=false;}else stream.skipToEnd();return 'comment';}
      if(state.string){if(stream.skipTo(state.string)){stream.match(state.string);state.string='';}else stream.skipToEnd();return 'string';}
      if(stream.eatSpace())return null;
      if(language==='python'&&stream.match('#')||language==='cpp'&&stream.match('//')){stream.skipToEnd();return 'comment';}
      if(language==='cpp'&&stream.match('/*')){state.comment=true;return 'comment';}
      if(language==='python'&&(stream.match('"""')||stream.match("'''"))){state.string=stream.current();return 'string';}
      if(stream.match(/^(?:"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)/))return 'string';
      if(stream.match(/^\b(?:0[xX][\da-fA-F]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)\b/))return 'number';
      if(stream.match(/^[A-Za-z_]\w*/))return keywords[language].has(stream.current())?'keyword':null;
      if(language==='cpp'&&stream.match('#')){stream.eatWhile(/[a-z]/i);return 'meta';}
      stream.next();return null;
    },
  });
}
const highlight=syntaxHighlighting(HighlightStyle.define([
  {tag:tags.keyword,color:'#c8a9ed'},{tag:tags.string,color:'#b6d6a3'},{tag:tags.number,color:'#e3bd8c'},
  {tag:tags.comment,color:'#8d929c',fontStyle:'italic'},{tag:tags.meta,color:'#9ecbe5'},
]));
export function NoteCodeCard({block,notePath='',editable=false,save,menuTarget,onFloat,onInline,onRemove}:{block:NoteCodeBlock;notePath?:string;editable?:boolean;save?:(code:string,language:CodeLanguage,options:CodeOptions)=>void;menuTarget?:HTMLElement;onFloat?:(code:string,language:CodeLanguage,options:CodeOptions)=>void;onInline?:(code:string,language:CodeLanguage,options:CodeOptions)=>void;onRemove?:()=>void}) {
  const [code,setCode]=useState(block.code),[options,setOptions]=useState(block.options),[language,setLanguage]=useState(block.language);
  const [status,setStatus]=useState<RuntimeStatus>(),[consoleOpen,setConsoleOpen]=useState(()=>codeRunSnapshot(notePath+'\0'+(block.options.id??block.from)).phase!=='idle'),[message,setMessage]=useState(''),[copied,setCopied]=useState(false);
  const [starting,setStarting]=useState(false);
  const key=notePath+'\0'+(options.id??block.from);
  const run=useSyncExternalStore(useCallback(listener=>subscribeCodeRun(key,listener),[key]),useCallback(()=>codeRunSnapshot(key),[key]));
  const busy=starting||run.phase==='loading'||run.phase==='running';
  useEffect(()=>{let live=true;void getRuntimeStatus().then(value=>{if(live)setStatus(value)});return()=>{live=false}},[]);
  useEffect(()=>{setCode(block.code);setOptions(block.options);setLanguage(block.language)},[block.source]);
  const extensions=useMemo(()=>[codeSyntax(language),highlight,EditorView.lineWrapping,EditorView.theme({'&':{backgroundColor:'transparent',fontSize:'13px'},'.cm-scroller':{fontFamily:'Consolas, monospace',overflow:'auto'},'.cm-content':{padding:'12px',minHeight:'140px'},'&.cm-focused':{outline:'none'}})],[language]);
  const commit=(nextCode=code,nextLanguage=language,nextOptions=options)=>{
    if(nextCode!==block.code||nextLanguage!==block.language||JSON.stringify(nextOptions)!==JSON.stringify(block.options))save?.(nextCode,nextLanguage,nextOptions);
  };
  const update=(next:CodeOptions)=>{setOptions(next);commit(code,language,next)};
  const execute=async()=>{
    if(busy||!status?.available)return;
    setStarting(true);
    try{
      const next=save?{...options,id:options.id??crypto.randomUUID()}:options;
      const runKey=notePath+'\0'+(next.id??block.from);
      if(!await confirmCodeRun(runKey,language,code))return;
      if(save)update(next);
      setConsoleOpen(true);setMessage('');
      setStarting(false);await startCodeRun(runKey,language,code,options.stdin);
    }catch(error){showError(error)}finally{setStarting(false)}
  };
  const showError=(error:unknown)=>{setMessage(error instanceof Error?error.message:String(error));setConsoleOpen(true)};
  const copy=async()=>{try{await navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),1600)}catch(error){showError(error)}};
  const download=async()=>{
    try{
      const fileName=codeFileName(options.fileName,language);
      if(isTauri())await invoke('save_code_file',{code,fileName,language});
      else {const url=URL.createObjectURL(new Blob([code],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
    }catch(error){showError(error)}
  };
  const runSummary=run.phase==='done'?'Завершено. Код возврата: '+run.exitCode:run.phase==='stopped'?'Программа остановлена.':run.phase==='loading'?'Подготовка среды / компиляция…':run.phase==='running'?'Выполнение…':run.output?'':'Программа ещё не запускалась.';
  const appearanceSettings=editable&&!options.widget?<>
    <label className="note-widget-color">Цвет рамки<input type="color" value={options.color??'#cba6ed'} onChange={event=>update({...options,color:event.target.value})}/></label>
    <button type="button" onClick={()=>update({...options,color:undefined})}>Вернуть обычный цвет рамки</button>
    <label className="note-widget-scale">Масштаб содержимого<output>{Math.round((options.scale??1)*100)}%</output><input type="range" min="50" max="150" step="10" value={Math.round((options.scale??1)*100)} onChange={event=>setOptions({...options,scale:Number(event.target.value)/100})} onBlur={event=>{const next={...options,scale:Number(event.target.value)/100};setOptions(next);commit(code,language,next)}}/></label>
  </>:null;
  const settings=<>{appearanceSettings}
    <label>Язык<select aria-label="Язык программы" value={language} disabled={!editable||busy} onChange={e=>{const next=e.target.value as CodeLanguage;const nextOptions={...options,fileName:next==='python'?'main.py':'main.cpp'};setLanguage(next);setOptions(nextOptions);commit(code,next,nextOptions)}}><option value="python">Python</option><option value="cpp">C++</option></select></label>
    <label>Имя файла<input aria-label="Имя файла программы" value={options.fileName} maxLength={80} readOnly={!editable||busy} onChange={e=>setOptions({...options,fileName:e.target.value})} onBlur={()=>update({...options,fileName:codeFileName(options.fileName,language)})}/></label>
    <button type="button" onClick={()=>void download()}>Сохранить код в файл…</button>
    {editable&&onFloat&&<button type="button" onClick={()=>onFloat(code,language,options)}>Сделать плавающим виджетом</button>}
    {editable&&onInline&&<button type="button" onClick={()=>onInline(code,language,options)}>Вернуть в текст заметки</button>}
    {editable&&onRemove&&<button type="button" onClick={()=>{if(confirm('Удалить этот блок кода?'))onRemove()}}>Удалить блок</button>}
  </>;
  return <section className="note-code-card" style={!options.widget?{borderColor:options.color,zoom:options.scale??1} as CSSProperties:undefined} aria-label={`Код ${language==='cpp'?'C++':'Python'}`} onPointerDown={event=>{if(!(event.target instanceof Element&&event.target.closest('.note-code-heading')))event.stopPropagation()}}>
    <header className="note-code-heading"><span className="note-code-symbol" aria-hidden="true">{'</>'}</span><strong title={options.fileName}>{options.fileName}</strong><span className="note-code-language">{language==='cpp'?'C++':'Python'}</span>
      <div className="note-code-controls"><button type="button" onClick={()=>void copy()}>{copied?'Скопировано':'Копировать'}</button><button type="button" className="note-code-run" disabled={!status?.available||starting} title={status?.reason} onClick={()=>busy?stopCodeRun(key):void execute()}>{busy?"■ Стоп":"▷ Запуск"}</button></div>
      {!menuTarget&&<details className="note-code-menu" onKeyDown={event=>{if(event.key==='Escape')event.currentTarget.open=false}}><summary aria-label="Настройки блока кода" title="Настройки блока кода">⋯</summary><div className="note-code-settings">{settings}</div></details>}
    </header>
    <div className="note-code-editor" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))commit()}}><CodeMirror height="240px" value={code} onChange={value=>{if(new TextEncoder().encode(value).length<=CODE_LIMIT){setCode(value);commit(value)}else showError('Размер кода ограничен 128 КиБ.')}} editable={editable&&!busy} readOnly={!editable||busy} extensions={extensions} basicSetup={{lineNumbers:true,foldGutter:false,highlightActiveLine:false,autocompletion:false}} aria-label="Исходный код программы" theme="dark"/></div>
    <details className="note-code-input"><summary>Входные данные <span>stdin</span></summary><textarea aria-label="Входные данные программы" placeholder="Данные для input() или cin, по строкам" value={options.stdin} maxLength={STDIN_LIMIT} readOnly={!editable||busy} onChange={event=>update({...options,stdin:event.target.value})} onBlur={()=>commit()}/><small>Данные передаются перед запуском. После них программа получает конец ввода.</small></details>
    <div className="note-code-runtime" role="status">{status?.reason??'Проверка среды выполнения…'}</div>
    <button type="button" className="note-code-console-toggle" aria-expanded={consoleOpen} onClick={()=>setConsoleOpen(!consoleOpen)}>{consoleOpen?'Скрыть консоль':'Консоль'}</button>
    {consoleOpen&&<section className="note-code-console" aria-label="Консоль программы"><header><strong>Консоль</strong><button type="button" aria-label="Закрыть консоль" onClick={()=>setConsoleOpen(false)}>×</button></header><pre role="log" aria-live="polite">{run.output?run.output+'\n':''}{message||run.error||runSummary}</pre></section>}
    {menuTarget&&createPortal(<div className="note-code-settings">{settings}</div>,menuTarget)}
  </section>;
}
