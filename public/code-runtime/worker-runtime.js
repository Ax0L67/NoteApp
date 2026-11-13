/* Trusted worker bootstrap. User source is received as data, never interpolated. */
(() => {
  'use strict';
  const send = self.postMessage.bind(self);
  const encoder = new TextEncoder();
  let outputSize = 0;
  const OUTPUT_LIMIT = 1024 * 1024;
  const decoders={stdout:new TextDecoder(),stderr:new TextDecoder()};
  let pendingText='',lastFlush=0;
  function flush(){if(pendingText){send({type:'output',stream:'stdout',text:pendingText});pendingText='';lastFlush=performance.now()}}
  function outputBytes(bytes,stream='stdout') {
    const remaining = OUTPUT_LIMIT - outputSize;
    if (remaining > 0){pendingText+=decoders[stream].decode(bytes.subarray(0,remaining),{stream:true});if(pendingText.length>=4096||performance.now()-lastFlush>=30)flush();}
    outputSize += bytes.length;
    if (outputSize > OUTPUT_LIMIT) throw new Error('Превышен предел вывода: 1 МиБ.');
  }
  function output(text,stream='stdout'){outputBytes(encoder.encode(String(text)),stream)}
  class Exit extends Error { constructor(code) {super(`Exit ${code}`);this.code=code;} }
  function uint(value) {const bytes=[];do{let b=value&127;value>>>=7;if(value)b|=128;bytes.push(b)}while(value);return bytes;}
  // Bound defined Wasm linear memory before instantiation (compiler and linked program).
  function boundedWasm(input, maxPages) {
    const bytes=new Uint8Array(input),sections=[bytes.subarray(0,8)];let p=8,memories=0;
    const read=()=>{let n=0,shift=0,b;do{if(p>=bytes.length||shift>28)throw Error('Invalid Wasm');b=bytes[p++];n+=(b&127)*2**shift;shift+=7}while(b&128);return n;};
    while(p<bytes.length){
      const start=p,id=bytes[p++],size=read(),end=p+size;if(end>bytes.length)throw Error('Invalid Wasm section');
      if(id!==5){sections.push(bytes.subarray(start,end));p=end;continue;}
      const count=read();if(count!==1)throw Error('Unsupported Wasm memory');memories++;
      const flags=read(),initial=read(),maximum=flags&1?read():maxPages;
      if(flags>1||initial>maxPages||p!==end)throw Error('Wasm memory limit exceeded');
      const section=[...uint(count),1,...uint(initial),...uint(Math.min(maximum,maxPages))];
      sections.push(new Uint8Array([id,...uint(section.length),...section]));
    }
    if(memories!==1)throw Error('Expected a single bounded memory');
    const out=new Uint8Array(sections.reduce((size,section)=>size+section.length,0));let offset=0;
    for(const section of sections){out.set(section,offset);offset+=section.length}return out;
  }
  function wasmFactory(bytes,maxPages) {
    return (imports,callback)=>{
      WebAssembly.instantiate(boundedWasm(bytes,maxPages),imports).then(({instance,module})=>callback(instance,module)).catch(error=>{send({type:'error',text:String(error)});self.close()});
      return {};
    };
  }
  function installSysroot(module,archive) {
    const data=new Uint8Array(archive),decode=new TextDecoder();
    for(let pos=0;pos+512<=data.length;){
      const header=data.subarray(pos,pos+512),name=decode.decode(header.subarray(0,100)).replace(/\0.*$/,'');if(!name)break;
      const size=parseInt(decode.decode(header.subarray(124,136)).replace(/\0.*$/,'').trim(),8)||0;
      if(name.includes('..')||size<0||pos+512+size>data.length)throw Error('Invalid sysroot archive');
      const type=header[156];
      if(!name.endsWith('/')&&(type===0||type===48)){
        const path='/'+name.replace(/^\/+/,''),dir=path.slice(0,path.lastIndexOf('/'));
        if(dir)module.FS.mkdirTree(dir);
        module.FS.writeFile(path,data.subarray(pos+512,pos+512+size));
      }
      pos+=512+Math.ceil(size/512)*512;
    }
  }
  async function compileCpp(assets,source) {
    const base={noInitialRun:true,print:text=>output(text+'\n'),printErr:text=>output(text+'\n','stderr')};
    let driverText='';
    const driver=await self.NoteAppClang({...base,thisProgram:'clang++',instantiateWasm:wasmFactory(assets['clang.wasm'],4096),printErr:text=>{if(driverText.length>65536)throw Error('Compiler driver output limit');driverText+=text+'\n'}});
    driver.FS.writeFile('/main.cpp',source);driver.FS.mkdirTree('/lib/wasm32-wasi');driver.FS.mkdirTree('/include/c++/v1');
    driver.FS.writeFile('/lib/wasm32-wasi/crt1-command.o',new Uint8Array());driver.FS.writeFile('/lib/wasm32-wasi/crt1-reactor.o',new Uint8Array());
    const result=driver.callMain(['/main.cpp','-std=c++17','-O0','-Wl,--max-memory=268435456','-o','/main.wasm','-###']);
    if(result!==0)throw Error(driverText||`Compiler driver exited: ${result}`);
    const argsFor=key=>{
      const line=driverText.split('\n').find(line=>line.includes(key));if(!line)throw Error('Compiler invocation unavailable');
      const args=[...line.matchAll(/"([^"\n]*)"/g)].map(m=>m[1]).slice(1),i=args.indexOf('-o');
      if(i<0||!args[i+1])throw Error('Compiler output unavailable');return {args,path:args[i+1]};
    };
    const cc=argsFor('-cc1'),ld=argsFor('wasm-ld');
    const clang=await self.NoteAppClang({...base,thisProgram:'clang++',instantiateWasm:wasmFactory(assets['clang.wasm'],8192)});
    installSysroot(clang,assets['sysroot.tar']);clang.FS.writeFile('/main.cpp',source);
    let exit=clang.callMain(cc.args);if(exit!==0)throw Error(`Компиляция завершилась с кодом ${exit}.`);
    const object=clang.FS.readFile(cc.path);
    const linker=await self.NoteAppLLD({...base,thisProgram:'wasm-ld',instantiateWasm:wasmFactory(assets['lld.wasm'],4096)});
    installSysroot(linker,assets['sysroot.tar']);linker.FS.writeFile(cc.path,object);
    exit=linker.callMain(ld.args);if(exit!==0)throw Error(`Линковка завершилась с кодом ${exit}.`);
    return boundedWasm(linker.FS.readFile(ld.path),4096);
  }
  async function runWasi(binary,stdin) {
    let memory;const input=encoder.encode(stdin);let position=0;
    const view=()=>new DataView(memory.buffer),buf=()=>new Uint8Array(memory.buffer);
    const clear=(p,n)=>buf().fill(0,p,p+n);
    const fdCheck=fd=>fd>=0&&fd<=2;
    const wasi={
      args_sizes_get:(argc,size)=>{view().setUint32(argc,0,true);view().setUint32(size,0,true);return 0},args_get:()=>0,
      environ_sizes_get:(count,size)=>{view().setUint32(count,0,true);view().setUint32(size,0,true);return 0},environ_get:()=>0,
      fd_write:(fd,iovs,count,written)=>{
        if(fd!==1&&fd!==2)return 8;let total=0;const chunks=[];
        for(let i=0;i<count;i++){const v=view(),p=v.getUint32(iovs+i*8,true),n=v.getUint32(iovs+i*8+4,true);if(total+n>OUTPUT_LIMIT-outputSize)throw Error('Превышен предел вывода: 1 МиБ.');chunks.push(new Uint8Array(memory.buffer,p,n));total+=n;}
        const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
        outputBytes(bytes,fd===2?'stderr':'stdout');view().setUint32(written,total,true);return 0;
      },
      fd_read:(fd,iovs,count,read)=>{
        if(fd!==0)return 8;let total=0;
        for(let i=0;i<count&&position<input.length;i++){const v=view(),p=v.getUint32(iovs+i*8,true),n=Math.min(v.getUint32(iovs+i*8+4,true),input.length-position);new Uint8Array(memory.buffer,p,n).set(input.subarray(position,position+n));position+=n;total+=n;}
        view().setUint32(read,total,true);return 0;
      },
      fd_close:fd=>fdCheck(fd)?0:8,
      fd_fdstat_set_flags:fd=>fdCheck(fd)?0:8,fd_fdstat_set_rights:()=>76,
      fd_pread:()=>8,fd_pwrite:()=>8,fd_readdir:()=>8,fd_allocate:()=>76,fd_advise:fd=>fdCheck(fd)?0:8,
      fd_filestat_set_size:()=>76,fd_filestat_set_times:()=>76,
      fd_fdstat_get:(fd,p)=>{if(!fdCheck(fd))return 8;clear(p,24);view().setUint8(p,2);view().setBigUint64(p+8,fd===0?2n:64n,true);return 0},
      fd_filestat_get:(fd,p)=>{if(!fdCheck(fd))return 8;clear(p,64);view().setUint8(p+16,2);return 0},
      fd_seek:()=>70,fd_tell:()=>70,fd_sync:()=>0,fd_datasync:()=>0,fd_prestat_get:()=>8,fd_prestat_dir_name:()=>8,
      path_open:()=>76,path_filestat_get:()=>76,path_unlink_file:()=>76,path_create_directory:()=>76,path_remove_directory:()=>76,path_rename:()=>76,
      random_get:(p,n)=>{for(let i=0;i<n;i+=65536)crypto.getRandomValues(new Uint8Array(memory.buffer,p+i,Math.min(n-i,65536)));return 0},
      clock_time_get:(id,precision,p)=>{view().setBigUint64(p,BigInt(Math.floor((id===0?Date.now():performance.now())*1e6)),true);return 0},
      clock_res_get:(id,p)=>{view().setBigUint64(p,1000000n,true);return 0},
      sched_yield:()=>0,poll_oneoff:()=>52,proc_exit:code=>{throw new Exit(code)},
    };
    const module=await WebAssembly.compile(binary);
    for(const entry of WebAssembly.Module.imports(module))if(entry.module!=='wasi_snapshot_preview1'||typeof wasi[entry.name]!=='function')throw Error(`Недоступная системная функция: ${entry.module}.${entry.name}`);
    const instance=await WebAssembly.instantiate(module,{wasi_snapshot_preview1:wasi});memory=instance.exports.memory;
    if(!(memory instanceof WebAssembly.Memory)||typeof instance.exports._start!=='function')throw Error('Invalid WASI program');
    try{instance.exports._start();return 0}catch(error){if(error instanceof Exit)return error.code;throw error}
  }
  async function runPython(assets,code,stdin) {
    const files={};for(const [name,bytes] of Object.entries(assets))files['https://noteapp.invalid/python/'+name]=bytes;
    // No native fetch reference is retained by this bridge; CSP also blocks network APIs.
    self.fetch=async resource=>{const url=typeof resource==='string'?resource:resource.url??String(resource);const bytes=files[url];if(!bytes)throw Error('Network and package downloads are disabled');return new Response(bytes,{headers:{'Content-Type':url.endsWith('.wasm')?'application/wasm':'application/octet-stream'}})};
    const factory=_createPyodideModule;
    _createPyodideModule=options=>factory({...options,wasmMemory:new WebAssembly.Memory({initial:320,maximum:4096})});
    const py=await self.loadPyodide({indexURL:'https://noteapp.invalid/python/',stdLibURL:'https://noteapp.invalid/python/python_stdlib.zip',fullStdLib:false});
    const bytes=encoder.encode(stdin);let pos=0;
    py.setStdin({read:target=>{const count=Math.min(target.length,bytes.length-pos);target.set(bytes.subarray(pos,pos+count));pos+=count;return count}});
    const write=stream=>({write:bytes=>{outputBytes(bytes,stream);return bytes.length}});
    py.setStdout(write('stdout'));py.setStderr(write('stderr'));
    send({type:'running'});
    try{const result=py.runPython(code,{filename:'main.py'});result?.destroy?.();return 0}catch(error){
      if(error.type==='SystemExit'){
        const exitCode=py.runPython("(lambda v: 0 if v is None else v % 256 if isinstance(v, int) else 1)(__import__('sys').last_value.code)");
        if(exitCode!==0)output(String(error)+'\n','stderr');return exitCode;
      }
      output(String(error)+'\n','stderr');return 1;
    }
  }
  self.onmessage=async event=>{
    self.onmessage=null;
    try{
      const {language,code,stdin,assets}=event.data;
      if(typeof code!=='string'||encoder.encode(code).length>128*1024||typeof stdin!=='string'||encoder.encode(stdin).length>64*1024)throw Error('Input size limit exceeded');
      let exitCode;
      if(language==='python')exitCode=await runPython(assets,code,stdin);
      else if(language==='cpp'){const binary=await compileCpp(assets,code);send({type:'running'});exitCode=await runWasi(binary,stdin)}
      else throw Error('Unsupported language');
      for(const decoder of Object.values(decoders))pendingText+=decoder.decode();flush();
      send({type:'done',exitCode});
    }catch(error){flush();send({type:'error',text:String(error.stack||error)})}
    finally{self.close()}
  };
})();
