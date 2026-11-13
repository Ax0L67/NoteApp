import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';

const folder=await fs.mkdtemp(path.join(os.tmpdir(),'noteapp-png-test-'));
const bundle=await build({entryPoints:['src/notePng.ts'],bundle:true,write:false,format:'iife',globalName:'NotePng',platform:'browser'});
const html=`<!doctype html><meta charset="utf-8"><style>
body{margin:0}#note{width:320px;height:480px;background:#272727;color:white}
.grid::before{content:"";position:absolute;width:320px;height:480px;background:radial-gradient(#777 1px,transparent 1px);background-size:20px 20px}
.card{position:relative;border:1.5px solid #777;border-radius:16px;padding:16px}
</style><div id="note"><div class="grid"></div><div class="card">Заметка<br>Python / C++
<svg width="100" height="40"><path d="M5 30 A15 15 0 0 1 35 30" stroke="white" fill="none"/></svg>
<canvas width="20" height="20"></canvas><input value="stdin"></div></div><pre id="result">pending</pre>
<script>${bundle.outputFiles[0].text}</script><script>
(async()=>{try{
const source=document.querySelector('canvas');source.getContext('2d').fillRect(0,0,20,20);
const blob=await NotePng.captureNotePng(document.getElementById('note'),480);
const bytes=new Uint8Array(await blob.arrayBuffer());if(bytes[0]!==137||bytes[1]!==80)throw Error('Not PNG');
const image=await createImageBitmap(blob);if(image.width!==320||image.height!==480)throw Error('Wrong size');
const canvas=document.createElement('canvas');canvas.width=320;canvas.height=480;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
if(ctx.getImageData(300,450,1,1).data[3]!==255)throw Error('Missing background');
document.getElementById('result').textContent='PASS PNG 320x480: background, SVG, canvas, text, pseudo-elements';
}catch(error){document.getElementById('result').textContent='FAIL '+error.stack;}})();
</script>`;
await fs.writeFile(path.join(folder,'test.html'),html);
const browser=process.env.NOTEAPP_TEST_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--dump-dom','--virtual-time-budget=10000',`--user-data-dir=${path.join(folder,'profile')}`,pathToFileURL(path.join(folder,'test.html')).href],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='',errors='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);
const exit=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('PNG browser test timed out'));},30000);child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);resolve(code);});});
const result=output.match(/<pre id="result">([^<]*)<\/pre>/)?.[1];
if(exit!==0||!result?.startsWith('PASS'))throw Error((result??'No browser result')+' '+errors.slice(-800));
console.log(result);
