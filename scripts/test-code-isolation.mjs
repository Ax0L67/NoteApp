import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';

// Offline headless test, without a server or a browser-debugging network socket.
const folder=await fs.mkdtemp(path.join(os.tmpdir(),'noteapp-isolation-test-'));
const browser=process.env.NOTEAPP_TEST_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const probe=await fs.readFile('public/code-runtime/sandbox-probe.js','utf8');
const sandbox=pathToFileURL(path.resolve('public/code-runtime/sandbox.html')).href;
const html=`<!doctype html><meta charset="utf-8"><pre id="result">pending</pre><script>
const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.src=${JSON.stringify(sandbox)};
addEventListener('message',event=>{
  if(event.source!==frame.contentWindow||event.origin!=='null'||event.data?.type!=='noteapp-sandbox-ready')return;
  const channel=new MessageChannel();channel.port1.onmessage=event=>{document.getElementById('result').textContent=JSON.stringify(event.data);channel.port1.postMessage({type:'stop'});frame.remove()};
  frame.contentWindow.postMessage({type:'start',bootstrap:${JSON.stringify(probe)},payload:{}},'*',[channel.port2]);
});document.body.append(frame);
</script>`;
const file=path.join(folder,'test.html');await fs.writeFile(file,html);
try{
  const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--dump-dom','--virtual-time-budget=10000',`--user-data-dir=${path.join(folder,'profile')}`,pathToFileURL(file).href],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
  const exit=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Browser test timed out'))},30000);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve(code)})});
  const value=stdout.match(/<pre id="result">([^<]*)<\/pre>/)?.[1]?.replaceAll('&quot;','"').replaceAll('&amp;','&');
  if(exit!==0||!value||value==='pending')throw Error('No isolation result: '+value+' '+stderr.slice(-1500));
  const result=JSON.parse(value);console.log(JSON.stringify(result));
  if(result.type!=='isolation'||result.safe!==true)throw Error('Browser isolation check failed');
  console.log('PASS real-browser opaque origin, no IPC/storage, CSP network/script isolation');
}finally{
  const resolved=path.resolve(folder),temp=path.resolve(os.tmpdir())+path.sep;
  if(!resolved.startsWith(temp)||!path.basename(resolved).startsWith('noteapp-isolation-test-'))throw Error('Unexpected test directory');
  await fs.rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}
