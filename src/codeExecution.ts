import {convertFileSrc,invoke,isTauri} from '@tauri-apps/api/core';
import type {CodeLanguage} from './noteCode';

export type CodeRunState={phase:'idle'|'loading'|'running'|'done'|'error'|'stopped';output:string;exitCode?:number;error?:string};
type Session={state:CodeRunState;listeners:Set<()=>void>;stop?:()=>void};
const sessions=new Map<string,Session>();
const initial:CodeRunState={phase:'idle',output:''};
const trusted=new Set<string>();
let active:Session|undefined;
const encoder=new TextEncoder();
const MAX_OUTPUT=1024*1024;
const assets:Record<CodeLanguage,string[]>={python:['pyodide.js','pyodide.asm.js','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json'],cpp:['clang.js','clang.wasm','lld.js','lld.wasm','sysroot.tar']};
const cached=new Map<string,Promise<ArrayBuffer>>();
const sandboxUrl=()=>isTauri()?convertFileSrc('sandbox','note-code'):'/code-runtime/sandbox.html';
let isolationCheck:Promise<void>|undefined;
export function verifyCodeSandbox():Promise<void> {
  return isolationCheck??=new Promise<void>((resolve,reject)=>{
    const frame=document.createElement('iframe'),channel=new MessageChannel();let complete=false;
    frame.hidden=true;frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';frame.src=sandboxUrl();frame.title='Проверка изоляции кода';
    const finish=(error?:Error)=>{if(complete)return;complete=true;clearTimeout(timer);window.removeEventListener('message',ready);channel.port1.postMessage({type:'stop'});channel.port1.close();frame.remove();error?reject(error):resolve()};
    const timer=setTimeout(()=>finish(Error('Проверка изоляции не завершена. Запуск отключён.')),10000);
    const ready=async(event:MessageEvent)=>{
      if(event.source!==frame.contentWindow||event.origin!=='null'||event.data?.type!=='noteapp-sandbox-ready')return;
      window.removeEventListener('message',ready);
      try{const source=await asset('sandbox-probe.js');if(!complete)frame.contentWindow!.postMessage({type:'start',bootstrap:new TextDecoder().decode(source),payload:{}},'*',[channel.port2])}catch(error){finish(Error(String(error)))}
    };
    channel.port1.onmessage=event=>{
      if(event.data?.type==='isolation'&&event.data.safe===true)finish();
      else finish(Error('Не удалось подтвердить изоляцию сети, хранилища и Tauri API. Запуск отключён.'));
    };
    window.addEventListener('message',ready);document.body.append(frame);
  });
}
function asset(path:string,signal?:AbortSignal) {
  let pending=cached.get(path);
  if(!pending){
    pending=fetch('/code-runtime/'+path,{signal}).then(response=>{if(!response.ok)throw Error(`Отсутствует среда выполнения: ${path}`);return response.arrayBuffer()}).catch(error=>{cached.delete(path);throw error});cached.set(path,pending);
  }
  return pending;
}
function getSession(key:string) {
  let session=sessions.get(key);if(!session){session={state:initial,listeners:new Set()};sessions.set(key,session)}return session;
}
export function codeRunSnapshot(key:string){return getSession(key).state}
export function subscribeCodeRun(key:string,listener:()=>void){const session=getSession(key);session.listeners.add(listener);return()=>{session.listeners.delete(listener)}}
function publish(session:Session,next:CodeRunState){session.state=next;for(const listener of session.listeners)listener()}
export function stopCodeRun(key:string){getSession(key).stop?.()}
export function stopNoteCodeRuns(notePath:string){for(const [key,session] of sessions)if(key.startsWith(notePath+'\0')){session.stop?.();sessions.delete(key)}}
export async function confirmCodeRun(key:string,language:CodeLanguage,code:string) {
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(key+'\0'+language+'\0'+code));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(trusted.has(hash))return true;
  if(!confirm('Выполнить этот код в изолированной среде?\n\nЗапускайте только код, который вы проверили. Доступ к сети и файлам компьютера отключён.'))return false;
  trusted.add(hash);return true;
}
export async function startCodeRun(key:string,language:CodeLanguage,code:string,stdin:string) {
  const session=getSession(key);
  if(active){if(active!==session)publish(session,{phase:'error',output:'',error:'Другая программа уже запущена. Сначала остановите её.'});return;}
  if(encoder.encode(code).length>128*1024||encoder.encode(stdin).length>64*1024){publish(session,{phase:'error',output:'',error:'Код: максимум 128 КиБ; входные данные: 64 КиБ.'});return;}
  active=session;const abort=new AbortController(),runId=crypto.randomUUID();
  let frame:HTMLIFrameElement|undefined,channel:MessageChannel|undefined,timer:ReturnType<typeof setTimeout>|undefined,finished=false,reserved=false;
  let received=0,messages=0,running=false;
  const cleanup=()=>{
    abort.abort();if(timer)clearTimeout(timer);window.removeEventListener('message',ready);
    channel?.port1.postMessage({type:'stop'});channel?.port1.close();frame?.remove();
    if(reserved)void invoke('release_code_run',{runId}).catch(()=>{});
    session.stop=undefined;if(active===session)active=undefined;
  };
  const finish=(phase:CodeRunState['phase'],error?:string,exitCode?:number)=>{if(finished)return;finished=true;cleanup();publish(session,{...session.state,phase,error,exitCode})};
  session.stop=()=>finish('stopped');
  const deadline=(ms:number,label:string)=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>finish('error',label),ms)};
  let bootstrap='',payload:Record<string,unknown>={};
  function ready(event:MessageEvent){
    if(event.source!==frame?.contentWindow||event.origin!=='null'||event.data?.type!=='noteapp-sandbox-ready'||!channel)return;
    window.removeEventListener('message',ready);
    frame.contentWindow!.postMessage({type:'start',bootstrap,payload},'*',[channel.port2]);
  }
  publish(session,{phase:'loading',output:''});deadline(60000,'Подготовка или компиляция превысила 60 секунд.');
  try{
    await verifyCodeSandbox();if(finished)return;
    if(isTauri()){await invoke('prepare_code_run',{runId,language,code,stdin});reserved=true;}
    if(finished){if(reserved)void invoke('release_code_run',{runId}).catch(()=>{});return;}
    const folder=language==='python'?'python/':'cpp/';
    const [worker,...buffers]=await Promise.all([asset('worker-runtime.js',abort.signal),...assets[language].map(file=>asset(folder+file,abort.signal))]);
    if(finished)return;
    const decoded=new TextDecoder();let scripts='';
    const files=Object.fromEntries(assets[language].map((name,i)=>[name,buffers[i]]));
    if(language==='python')scripts=decoded.decode(files['pyodide.js'])+'\n'+decoded.decode(files['pyodide.asm.js']);
    else for(const [name,global] of [['clang.js','NoteAppClang'],['lld.js','NoteAppLLD']]){
      const text=decoded.decode(files[name]).replaceAll('import.meta.url',JSON.stringify('https://noteapp.invalid/cpp/'+name)).replace(/export default Module;\s*$/,'return Module;');
      scripts+=`\nself.${global}=(()=>{${text}\n})();\n`;
    }
    bootstrap=scripts+'\n'+decoded.decode(worker);
    payload={language,code,stdin,assets:files};
    channel=new MessageChannel();
    channel.port1.onmessage=event=>{
      if(finished)return;if(++messages>8192){finish('error','Превышен предел сообщений среды выполнения.');return;}const data=event.data;
      if(data?.type==='output'&&typeof data.text==='string'){
        const bytes=encoder.encode(data.text),remaining=MAX_OUTPUT-received;received+=bytes.length;
        publish(session,{...session.state,output:session.state.output+decoded.decode(bytes.subarray(0,Math.max(0,remaining)))});
        if(received>MAX_OUTPUT)finish('error','Превышен предел вывода: 1 МиБ.');
      }else if(data?.type==='running'&&!running){running=true;publish(session,{...session.state,phase:'running'});deadline(10000,'Превышено время выполнения: 10 секунд.')}
      else if(data?.type==='done'&&Number.isInteger(data.exitCode))finish('done',undefined,data.exitCode);
      else if(data?.type==='error'&&typeof data.text==='string')finish('error',data.text.slice(0,8000));
    };
    frame=document.createElement('iframe');frame.hidden=true;frame.title='Изолированная среда кода';frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';
    frame.src=sandboxUrl();
    window.addEventListener('message',ready);document.body.append(frame);
  }catch(error){if(!finished)finish('error',error instanceof Error?error.message:String(error))}
}
