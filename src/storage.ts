import {invoke,isTauri} from '@tauri-apps/api/core';
import type {Note,Snapshot} from './types';
import {folder} from './indexing';
import {welcome} from './templates';
import {remapNoteReference} from './noteReferences';
export const desktop=isTauri();
const key='noteapp-preview-v1';
const revision=(s:string)=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return String(h)};
function addPreviewFolder(snapshot: Snapshot, path: string) {
 const folders = new Set(snapshot.folders);
 for (let dir = path; dir; dir = folder(dir)) folders.add(dir);
 snapshot.folders = [...folders];
}
function rebaseFolderLinks(content:string,oldNote:string,newNote:string,from:string,to:string) {
 const oldDir=folder(oldNote).split('/').filter(Boolean),newDir=folder(newNote).split('/').filter(Boolean);
 const source=from.split('/'),destination=to.split('/');
 return content.replace(/(!?\[[^\]]*\]\()([^\s)]+)(\))/g,(whole,start:string,href:string,end:string)=>{
  if(href.includes(':')||href.startsWith('#')||href.startsWith('/'))return whole;
  const at=href.search(/[#?]/),path=at<0?href:href.slice(0,at),suffix=at<0?'':href.slice(at);
  const parts=[...oldDir];
  try {for(const raw of path.split('/')){const part=decodeURIComponent(raw);if(part.includes('/')||part.includes('\\'))return whole;
   if(part==='..'){if(!parts.length)return whole;parts.pop();}else if(part&&part!=='.')parts.push(part);
  }}catch{return whole;}
  const moved=source.every((part,index)=>parts[index]===part);
  if(moved)parts.splice(0,source.length,...destination);
  if(oldNote===newNote&&!moved)return whole;
  let common=0;while(common<newDir.length&&common<parts.length&&newDir[common]===parts[common])common++;
  const relative='../'.repeat(newDir.length-common)+parts.slice(common).map(part=>encodeURIComponent(part).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
  return `${start}${relative||'.'}${suffix}${end}`;
 });
}
function validFolderPath(path:string) {
 return !!path&&!path.includes('\\')&&path.split('/').every(part=>!!part&&!part.startsWith('.')&&!/[. ]$/.test(part)&&
  !/[<>:"|?*\x00-\x1f]/.test(part)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))&&
  path.split('/')[0].toLowerCase()!=='attachments';
}
function initial():Snapshot {return {root:'browser-preview',name:'Личное',notes:[{path:'Знания/Как устроена память.md',content:welcome,revision:revision(welcome)},{path:'Знания/Интервальное повторение.md',content:'# Интервальное повторение\n\nКак работает память и почему интервальные повторения эффективны: [[Как устроена память]].\n\n#обучение',revision:''},{path:'План развития.md',content:'# План развития\n\n- [ ] Изучить [[Как устроена память]]\n- [ ] Завести привычку записывать идеи\n\n#идеи',revision:''},{path:'Книги для чтения.md',content:'# Книги для чтения\n\n- [ ] Искусство учиться\n\n#книги',revision:''}],folders:['Знания','Дневник'],settings:{favorites:['План развития.md','Книги для чтения.md'],active:'Знания/Как устроена память.md'},trash:[],templates:[]};}
export async function request<T=Snapshot>(op:string,args:Record<string,unknown>={}):Promise<T>{
 if(desktop)return invoke<T>('request',{op,args});
 const s:Snapshot & {removedFolders?: Record<string,{folders:string[];notes:Note[]}>}=JSON.parse(localStorage.getItem(key)||'null')||initial();let result:unknown=s;
 const path=args.path as string;
 if(op==='save'){const n=s.notes.find(n=>n.path===path);if((n?.revision??null)!==args.revision)return {conflict:true,content:n?.content??null,revision:n?.revision??null} as T;const next={path,content:args.content as string,revision:revision(args.content as string)};s.notes=s.notes.filter(n=>n.path!==path).concat(next);addPreviewFolder(s,folder(path));result={revision:next.revision};}
 if(op==='rename'){if(s.notes.some(n=>n.path===args.to))throw Error('Заметка уже существует');const old=path.replace(/\.md$/,'');const name=old.split('/').pop();s.notes=s.notes.map(n=>({...n,path:n.path===path?args.to as string:n.path,content:remapNoteReference(n.content.replace(/\[\[([^\]|#]+)([^\]]*)\]\]/g,(m,t,suffix)=>t===old||t===name?`[[${(args.to as string).replace(/\.md$/,'')}${suffix}]]`:m),path,args.to as string)}));s.notes.forEach(n=>n.revision=revision(n.content));}
 if(op==='trash'){const n=s.notes.find(n=>n.path===path)!;const id=String(Date.now());localStorage.setItem(`trash-${id}`,JSON.stringify(n));s.trash.push({id,path});s.notes=s.notes.filter(n=>n.path!==path);}
 if(op==='restore'){
  const item=s.trash.find(t=>t.id===args.id);
  if(item?.kind==='folder'){
   const removed=s.removedFolders?.[item.id];
   if(!removed)throw Error('Содержимое папки отсутствует в корзине.');
   if(s.folders.some(p=>p===item.path||p.startsWith(item.path+'/'))||s.notes.some(n=>n.path.startsWith(item.path+'/')))throw Error('Папка с таким именем уже существует.');
   const parent=folder(item.path);
   if(parent&&!s.folders.includes(parent)&&!s.notes.some(n=>n.path.startsWith(parent+'/')))throw Error('Сначала восстановите родительскую папку.');
   s.folders.push(...removed.folders);
   s.notes.push(...removed.notes);
   delete s.removedFolders![item.id];
  }else{
   const n=JSON.parse(localStorage.getItem(`trash-${args.id}`)||'null');
   if(n){if(s.notes.some(x=>x.path===n.path))n.path=n.path.replace('.md',` (восстановлено ${Date.now()}).md`);s.notes.push(n);addPreviewFolder(s,folder(n.path));}
  }
  s.trash=s.trash.filter(t=>t.id!==args.id);
 }
 if(op==='settings')s.settings=args;
 if(op==='folder')addPreviewFolder(s,path);
 if(op==='move_folder'){
  let from=args.from as string;const to=args.to as string;
  if(typeof from!=='string'||typeof to!=='string'||!validFolderPath(from)||!validFolderPath(to))throw Error('Недопустимый путь папки.');
  const lower=(value:string)=>value.toLowerCase();
  const inside=(value:string,base:string)=>lower(value)===lower(base)||lower(value).startsWith(lower(base)+'/');
  const depth=from.split('/').length;
  const actual=s.folders.find(p=>lower(p)===lower(from))??s.notes.map(n=>folder(n.path).split('/').slice(0,depth).join('/')).find(p=>lower(p)===lower(from));
  if(!actual)throw Error('Папка уже отсутствует в хранилище.');
  from=actual;
  if(from===to)return s as T;
  if(inside(to,from))throw Error('Нельзя переместить папку внутрь неё самой.');
  if(s.folders.some(p=>inside(p,to))||s.notes.some(n=>inside(n.path,to)))throw Error('По этому пути уже есть файл или папка.');
  const parent=folder(to);
  if(parent&&!s.folders.some(p=>lower(p)===lower(parent))&&!s.notes.some(n=>inside(n.path,parent)))throw Error('Папка назначения отсутствует.');
  const prefix=from+'/';
  const moved=s.notes.filter(note=>note.path.startsWith(prefix)).map(note=>({old:note.path,next:to+note.path.slice(from.length),name:note.path.split('/').at(-1)!.slice(0,-3)}));
  const wiki=/\[\[([^\]|#]+)([^\]]*)\]\]/g;
  s.notes=s.notes.map(note=>{
   const next=moved.find(item=>item.old===note.path)?.next??note.path;
   let content=note.content.replace(wiki,(whole,target:string,suffix:string)=>{
    const item=moved.find(entry=>entry.old.slice(0,-3)===target)??moved.find(entry=>entry.name===target&&s.notes.filter(n=>n.path.split('/').at(-1)!.slice(0,-3)===entry.name).length===1);
    return item?`[[${item.next.slice(0,-3)}${suffix}]]`:whole;
   });
   for(const item of moved)content=remapNoteReference(content,item.old,item.next);
   content=rebaseFolderLinks(content,note.path,next,from,to);
   return {...note,path:next,content,revision:content===note.content?note.revision:revision(content)};
  });
  s.folders=s.folders.map(p=>p===from?to:p.startsWith(prefix)?to+p.slice(from.length):p);
  addPreviewFolder(s,to);
 }
 if(op==='trash_folder'){
  const inside=(value:string)=>value===path||value.startsWith(path+'/');
  const notes=s.notes.filter(note=>inside(note.path));
  const folders=s.folders.filter(inside);
  if(!folders.length&&!notes.length)throw Error('Папка уже отсутствует в хранилище.');
  const id=String(Date.now());
  s.removedFolders={...s.removedFolders,[id]:{folders:[...new Set([path,...folders])],notes}};
  s.trash.push({id,path,kind:'folder'});
  s.folders=s.folders.filter(p=>!inside(p));
  s.notes=s.notes.filter(note=>!inside(note.path));
 }
 if(op==='template')s.templates=s.templates.filter(t=>t.name!==args.name).concat({name:args.name as string,content:args.content as string});
 if(op==='attachment'){const p=`attachments/${Date.now()}-${args.name}`;localStorage.setItem(p,args.data as string);result={path:p};}
 if(op==='asset'){
  const data=localStorage.getItem(path);
  const extension=path.split('.').at(-1)?.toLowerCase();
  const mime=extension==='jpg'?'jpeg':extension;
  result=data&&mime&&['png','jpeg','webp','gif','avif'].includes(mime)?`data:image/${mime};base64,${data}`:'';
 }
 if(['choose','import','export','backup'].includes(op))throw Error('Доступ к папкам доступен в настольной версии. Запустите npm run desktop.');
 localStorage.setItem(key,JSON.stringify(s));return result as T;
}
export async function openSourceLocation(location:string) {
 if(/^(?:https?:\/\/|mailto:)/i.test(location)){
  if(desktop)return request('external',{url:location});
  window.open(location,'_blank','noopener,noreferrer');return;
 }
 if(desktop)return request('open-source',{path:location});
 throw new Error('Локальные источники доступны в настольной версии NoteApp.');
}
export async function chooseSourceLocation() {
 if(!desktop)throw new Error('Выбор локальных источников доступен в настольной версии NoteApp.');
 return request<string|null>('choose-source');
}
