import type {Location} from './Explorer';
import {locationTabKey,tabLocation} from './workspaceTabs';

export const windowLimit=8;
export interface CentralWindow {id:string;tabs:string[];active:string;x:number;y:number;width:number;height:number;mode?:'tiled';palette?:string;blend?:string;tilePath?:string;detached?:boolean}
export function readCentralWindows(value:unknown,fallback?:string):CentralWindow[] {
  const windows=Array.isArray(value)?value:[];
  const result:CentralWindow[]=[];
  for(const entry of windows.slice(0,windowLimit)){
    if(!entry||typeof entry!=='object')continue;
    const tabs=Array.isArray(entry.tabs)?[...new Set<string>(entry.tabs.filter((key:unknown)=>typeof key==='string'&&tabLocation(key)))]:[];
    if(!tabs.length)tabs.push('home');
    const number=(key:string,defaultValue:number)=>typeof entry[key]==='number'&&Number.isFinite(entry[key])?entry[key]:defaultValue;
    result.push({id:typeof entry.id==='string'&&!result.some(item=>item.id===entry.id)?entry.id:crypto.randomUUID(),tabs,
      active:tabs.includes(entry.active)?entry.active:tabs[0],x:number('x',result.length*28),y:Math.max(-52,number('y',result.length*28)),
      width:number('width',0)===0?0:Math.max(320,number('width',0)),height:number('height',0)===0?0:Math.max(240,number('height',0)),mode:entry.mode==='tiled'?'tiled':undefined,palette:typeof entry.palette==='string'?entry.palette:undefined,blend:typeof entry.blend==='string'?entry.blend:undefined,tilePath:typeof entry.tilePath==='string'&&/^[LRTB]*$/.test(entry.tilePath)?entry.tilePath:undefined,detached:entry.detached===true||undefined});
  }
  return result.length?ensureTilePaths(result):[{id:crypto.randomUUID(),tabs:[fallback||'home'],active:fallback||'home',x:0,y:0,width:0,height:0}];
}
export function ensureTilePaths(windows:CentralWindow[]) {
  const tiles=windows.filter(win=>win.mode==='tiled');
  const paths=tiles.map(win=>win.tilePath);
  if(paths.every((path,i)=>path!==undefined&&paths.every((other,j)=>i===j||!other?.startsWith(path))))return windows;
  let index=0;
  return windows.map(win=>win.mode==='tiled'?{...win,tilePath:'R'.repeat(index)+(index++<tiles.length-1?'L':'')}:win);
}
export function removeTile(windows:CentralWindow[],id:string) {
  const path=windows.find(win=>win.id===id&&win.mode==='tiled')?.tilePath;
  if(!path)return windows.filter(win=>win.id!==id);
  const parent=path.slice(0,-1),last=path.slice(-1),sibling=parent+({L:'R',R:'L',T:'B',B:'T'} as Record<string,string>)[last];
  return windows.filter(win=>win.id!==id).map(win=>win.mode==='tiled'&&win.tilePath?.startsWith(sibling)?{...win,tilePath:parent+win.tilePath.slice(sibling.length)}:win);
}
export function tileRect(path:string) {
  let x=0,y=0,width=100,height=100;
  for(const side of path){if(side==='L'||side==='R'){width/=2;if(side==='R')x+=width;}else{height/=2;if(side==='B')y+=height;}}
  return {left:`calc(${x}% + 4px)`,top:`calc(${y}% + 4px)`,width:`calc(${width}% - 8px)`,height:`calc(${height}% - 8px)`};
}
export function remapWindowLocation(location:Location,remap:(path:string)=>string,projectFor:(path:string)=>string):Location {
  if(location.kind==='note')return {...location,path:remap(location.path)};
  if(location.kind==='folder'){const path=remap(location.path);return {...location,path,project:projectFor(path+'/note.md')};}
  return location;
}
export const mapWindowKeys=(windows:CentralWindow[],map:(location:Location)=>Location)=>windows.map(win=>{
  const key=(value:string)=>{const location=tabLocation(value);return location?locationTabKey(map(location)):value;};
  return {...win,tabs:[...new Set(win.tabs.map(key))],active:key(win.active)};
});
