export type ReferenceKind = 'note'|'map';
export type Reference = {kind:ReferenceKind;path:string};
export type ReferenceRange = {from:number;to:number;source:string;url:string};
export type ReferenceTarget = Reference & {name:string;palette:string;background:string|null};

export function referenceUrl({kind,path}:Reference) {
  const bytes=new TextEncoder().encode(path);
  const encoded=btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join(''))
    .replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  return `noteapp-${kind}:${encoded}`;
}

export function parseReference(url:string):Reference|null {
  const match=/^noteapp-(note|map):([\w-]+)$/.exec(url);
  if(!match)return null;
  try {
    const bytes=Uint8Array.from(atob(match[2].replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));
    return {kind:match[1] as ReferenceKind,path:new TextDecoder('utf-8',{fatal:true}).decode(bytes)};
  }catch{return null;}
}

export function referenceMarkdown(target:ReferenceTarget) {
  const name=target.name.replace(/[\\[\]]/g,'\\$&').replace(/[\r\n]/g,' ');
  return `[${name}](${referenceUrl(target)})`;
}

export function remapNoteReference(content:string,from:string,to:string) {
  const oldUrl=referenceUrl({kind:'note',path:from});
  const newUrl=referenceUrl({kind:'note',path:to});
  return content.replaceAll(`](${oldUrl})`,`](${newUrl})`);
}
