// Run before accepting any note code. Refuse execution if isolation is not observable.
(async()=>{
  try{
    const policies=[];
    self.addEventListener('securitypolicyviolation',event=>policies.push(event.effectiveDirective));
    let networkBlocked=false,scriptsBlocked=false,storageBlocked=false;
    try{await fetch('https://noteapp-sandbox-probe.invalid/')}catch{networkBlocked=true}
    try{importScripts('https://noteapp-sandbox-probe.invalid/script.js')}catch{scriptsBlocked=true}
    try{if(typeof indexedDB==='undefined')storageBlocked=true;else indexedDB.open('noteapp-isolation-probe')}catch{storageBlocked=true}
    await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));
    await new Promise(resolve=>setTimeout(resolve,100));
    const opaque=self.location.origin==='null';
    const noNativeBridge=typeof self.__TAURI_INTERNALS__==='undefined'&&typeof self.__TAURI__==='undefined'&&typeof self.document==='undefined';
    const csp=policies.includes('connect-src')&&policies.some(policy=>policy.startsWith('script-src'));
    self.postMessage({type:'isolation',safe:opaque&&noNativeBridge&&networkBlocked&&scriptsBlocked&&storageBlocked&&csp,checks:{opaque,noNativeBridge,networkBlocked,scriptsBlocked,storageBlocked,csp}});
  }catch(error){self.postMessage({type:'error',text:String(error)})}
  finally{self.close()}
})();
