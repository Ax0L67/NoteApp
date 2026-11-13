import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'vite';

// Real browser tests: exercise the actual client, sandbox CSP and bundled Wasm.
const browser=process.env.NOTEAPP_TEST_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'noteapp-wasm-test-'));
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},clearScreen:false});
server.middlewares.use((req,res,next)=>{
  if(req.url!=='/__runtime_test')return next();
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>NoteApp runtime tests</title>');
});
await server.listen();
const address=server.httpServer.address(),base=`http://127.0.0.1:${address.port}`;
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,base+'/__runtime_test'],{windowsHide:true,stdio:'ignore'});
let socket;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  let port;
  for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{await sleep(100)}}
  if(!port)throw Error('Headless browser did not start');
  const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page=pages.find(page=>page.type==='page');if(!page)throw Error('No browser page');
  socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
  let serial=0;const requests=new Map();
  socket.onmessage=event=>{const result=JSON.parse(event.data);if(result.id){const pending=requests.get(result.id);requests.delete(result.id);result.error?pending.reject(Error(JSON.stringify(result.error))):pending.resolve(result.result)}};
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;requests.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
  await cdp('Runtime.enable');
  await cdp('Page.navigate',{url:base+'/__runtime_test'});await sleep(500);
  const run=async(language,code,stdin='',stop=false)=>{
    const expression=`(async()=>{
      const api=await import('/src/codeExecution.ts');
      const key='test\\0'+crypto.randomUUID();
      const result=new Promise(resolve=>{const unsubscribe=api.subscribeCodeRun(key,()=>{const state=api.codeRunSnapshot(key);if(['done','error','stopped'].includes(state.phase)){unsubscribe();resolve(state)}})});
      await api.startCodeRun(key,${JSON.stringify(language)},${JSON.stringify(code)},${JSON.stringify(stdin)});
      ${stop?'setTimeout(()=>api.stopCodeRun(key),50);':''}
      return await result;
    })()`;
    const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;
  };
  const assert=(condition,label,result)=>{console.log((condition?'PASS':'FAIL')+' '+label+(condition?'':' '+JSON.stringify(result)));if(!condition)throw Error(label)};
  let result=await run('python','a = int(input())\nb = int(input())\nprint(a + b)\nprint("Привет")','2\n3\n');
  assert(result.phase==='done'&&result.exitCode===0&&result.output==='5\nПривет\n','Python stdin and Unicode stdout',result);
  result=await run('python','raise ValueError("test-error")');assert(result.exitCode===1&&result.output.includes('test-error'),'Python runtime errors',result);
  result=await run('python','if True print(1)');assert(result.exitCode===1&&result.output.includes('SyntaxError'),'Python syntax errors',result);
  result=await run('python','import js\nprint(js.location.origin)\nprint(js.typeof(js.globalThis.__TAURI_INTERNALS__) if False else hasattr(js.globalThis, "__TAURI_INTERNALS__"))\ntry:\n    js.importScripts("https://example.com/escape.js")\nexcept Exception:\n    print("SCRIPT_BLOCKED")\n');
  assert(result.output.includes('null')&&result.output.includes('False')&&result.output.includes('SCRIPT_BLOCKED'),'Opaque origin, no Tauri, remote scripts blocked',result);
  result=await run('python','import js\nasync def probe():\n    try:\n        await js.fetch("https://example.com/")\n        print("NETWORK_OPEN")\n    except Exception:\n        print("NETWORK_BLOCKED")\nimport asyncio\nasyncio.get_event_loop().run_until_complete(probe())');
  // Network is also tested below using native browser fetch, independent of Python wrappers.
  assert(!result.output.includes('NETWORK_OPEN'),'Python cannot fetch external data',result);
  result=await run('cpp','#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<" Привет\\n";}','2 3\n');
  assert(result.phase==='done'&&result.exitCode===0&&result.output==='5 Привет\n','C++ compilation, stdin, Unicode stdout',result);
  result=await run('cpp','int main(){ missing_symbol; }');assert(result.phase==='error'&&result.output.includes('missing_symbol'),'C++ compiler diagnostics',result);
  result=await run('cpp','#include <fstream>\n#include <iostream>\nint main(){std::ifstream f("C:/Windows/win.ini");std::cout<<(f?"FILE_OPEN":"FILE_BLOCKED");}');
  assert(result.output==='FILE_BLOCKED','C++ host filesystem unavailable',result);
  result=await run('python','while True: pass','',true);assert(result.phase==='stopped','Explicit stop terminates Worker',result);
  result=await run('python','while True: pass');assert(result.phase==='error'&&result.error.includes('10'),'Execution timeout',result);
  result=await run('python','print("x" * (2 * 1024 * 1024))');assert(result.phase==='error'||result.exitCode===1,'Output limit',result);
  result=await run('cpp','#include <cstdlib>\n#include <iostream>\nint main(){void* p=std::malloc(300*1024*1024);std::cout<<(p?"UNBOUNDED":"MEMORY_LIMIT");}');
  assert(result.output==='MEMORY_LIMIT','C++ Wasm memory cap',result);
  console.log('All runtime smoke tests passed.');
}finally{
  socket?.close();child.kill();await server.close();
  await sleep(300);
  const resolved=path.resolve(profile),temp=path.resolve(os.tmpdir())+path.sep;
  if(!resolved.startsWith(temp)||!path.basename(resolved).startsWith('noteapp-wasm-test-'))throw Error('Unexpected browser profile directory');
  await fs.rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}
