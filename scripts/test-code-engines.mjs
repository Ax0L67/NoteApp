import fs from 'node:fs';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {webcrypto} from 'node:crypto';

// Engine tests only. This browser-like Worker fixture is NOT a security boundary.
if(!isMainThread){
  const folder='public/code-runtime/'+(workerData.language==='python'?'python/':'cpp/');
  const names=workerData.language==='python'?['pyodide.js','pyodide.asm.js','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json']:['clang.js','clang.wasm','lld.js','lld.wasm','sysroot.tar'];
  const assets=Object.fromEntries(names.map(name=>[name,new Uint8Array(fs.readFileSync(folder+name))]));
  let scripts='';
  if(workerData.language==='python')scripts=fs.readFileSync(folder+'pyodide.js','utf8')+'\n'+fs.readFileSync(folder+'pyodide.asm.js','utf8');
  else for(const [name,global] of [['clang.js','NoteAppClang'],['lld.js','NoteAppLLD']])scripts+=`self.${global}=(()=>{${fs.readFileSync(folder+name,'utf8').replaceAll('import.meta.url',JSON.stringify('https://noteapp.invalid/'+name)).replace(/export default Module;\s*$/,'return Module;')}\n})();\n`;
  Object.assign(globalThis,{self:globalThis,process:undefined,postMessage:message=>parentPort.postMessage(message),close:()=>{},importScripts:()=>{throw Error('No script downloads in engine tests')},location:{href:'blob:null/test',origin:'null',toString(){return this.href}}});
  (0,eval)(scripts+'\n'+fs.readFileSync('public/code-runtime/worker-runtime.js','utf8'));
  self.onmessage({data:{...workerData,assets}});
}else{
  async function run(language,code,stdin='',stop=false){
    return new Promise((resolve,reject)=>{
      const worker=new Worker(new URL(import.meta.url),{workerData:{language,code,stdin}});let output='',timer,running=false;
      const finish=result=>{clearTimeout(timer);void worker.terminate();resolve({...result,output})};
      timer=setTimeout(()=>finish({phase:'error',error:'compile timeout'}),60000);
      worker.on('error',reject);
      worker.on('message',data=>{
        if(data.type==='output')output+=data.text;
        else if(data.type==='running'&&!running){running=true;clearTimeout(timer);timer=setTimeout(()=>finish({phase:stop?'stopped':'error',error:stop?undefined:'10 second timeout'}),stop?50:10000)}
        else if(data.type==='error')finish({phase:'error',error:data.text});
        else if(data.type==='done')finish({phase:'done',exitCode:data.exitCode});
      });
    });
  }
  function check(pass,name,result){console.log((pass?'PASS ':'FAIL ')+name);if(!pass){console.log(JSON.stringify(result));throw Error(name)}}
  let result;const only=process.env.NOTEAPP_TEST_LANGUAGE;
  if(only!=='cpp'){
  result=await run('python','a=int(input())\nb=int(input())\nprint(a+b)\nprint("Привет")','2\n3\n');
  check(result.exitCode===0&&result.output==='5\nПривет\n','Python stdin/stdout Unicode',result);
  result=await run('python','raise ValueError("test-error")');check(result.exitCode===1&&result.output.includes('test-error'),'Python runtime error',result);
  result=await run('python','if True print(1)');check(result.exitCode===1&&result.output.includes('SyntaxError'),'Python syntax error',result);
  result=await run('python','import sys\nsys.exit(7)');check(result.exitCode===7,'Python exit code',result);
  result=await run('python','try:\n    input()\nexcept EOFError:\n    print("EOF")');check(result.output==='EOF\n','Python EOF',result);
  result=await run('python','try:\n    b = bytearray(300*1024*1024)\n    print("UNBOUNDED")\nexcept MemoryError:\n    print("MEMORY_LIMIT")');check(result.output==='MEMORY_LIMIT\n','Python linear memory limit',result);
  result=await run('python','import sys\nfor byte in "Привет".encode():\n    sys.stdout.buffer.write(bytes([byte]))\n    sys.stdout.buffer.flush()');check(result.output==='Привет','Python split UTF-8 writes',result);
  }
  if(only!=='python'){
  result=await run('cpp','#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<" Привет\\n";}','2 3\n');
  check(result.exitCode===0&&result.output==='5 Привет\n','C++ compile and stdin/stdout Unicode',result);
  result=await run('cpp','int main(){ missing_symbol; }');check(result.phase==='error'&&result.output.includes('missing_symbol'),'C++ compiler errors',result);
  result=await run('cpp','int main(){return 7;}');check(result.exitCode===7,'C++ nonzero exit code',result);
  result=await run('cpp','#include <fstream>\n#include <iostream>\nint main(){std::ifstream f("C:/Windows/win.ini");std::cout<<(f?"FILE_OPEN":"FILE_BLOCKED");}');check(result.output==='FILE_BLOCKED','WASI cannot open host files',result);
  result=await run('cpp','#include <cstdlib>\n#include <iostream>\nint main(){void* p=std::malloc(300*1024*1024);std::cout<<(p?"UNBOUNDED":"MEMORY_LIMIT");}');check(result.output==='MEMORY_LIMIT','C++ linear memory limit',result);
  }
  if(only!=='cpp'){
  result=await run('python','print("x" * (2*1024*1024))');check(result.phase==='error'||result.exitCode===1,'Output limit',result);
  result=await run('python','while True: pass','',true);check(result.phase==='stopped','Forced Worker stop',result);
  result=await run('python','while True: pass');check(result.error?.includes('10 second'),'Execution timeout',result);
  }
  console.log('All engine tests passed. Browser security tests are separate.');
}
