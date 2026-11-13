import type {Location} from './Explorer';

export type FolderTab={project:string;path:string};
export const folderTabKey=({project,path}:FolderTab)=>'folder:'+JSON.stringify([project,path]);
export function locationTabKey(location:Location) {
  if(location.kind==='home')return 'home';
  if(location.kind==='graph')return 'graph:'+location.project;
  return location.kind==='folder'?folderTabKey(location):location.path;
}

export function replaceTab(order:string[],source:string,destination:string) {
  if(source==='home'||source===destination)return [...new Set([...order,destination])];
  if(order.includes(destination))return order.filter(key=>key!==source);
  const index=order.indexOf(source);
  if(index<0)return [...order,destination];
  return order.map(key=>key===source?destination:key);
}

export function tabLocation(key:string):Location|null {
  if(key==='home')return {kind:'home'};
  if(key.startsWith('graph:'))return {kind:'graph',project:key.slice(6)};
  if(!key.startsWith('folder:'))return {kind:'note',path:key};
  try{
    const parts:unknown=JSON.parse(key.slice(7));
    if(!Array.isArray(parts)||parts.length!==2||parts.some(part=>typeof part!=='string'))return null;
    return {kind:'folder',project:parts[0],path:parts[1]};
  }catch{return null;}
}
