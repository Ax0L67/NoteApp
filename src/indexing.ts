import {stripNoteColor} from './noteTextColor';
import type {Note} from './types';
import {parseReference} from './noteReferences';
export const title=(path:string)=>path.split('/').pop()!.replace(/\.md$/i,'');
export const folder=(path:string)=>path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';
export const target=(link:string)=>link.split(/[|#]/)[0].trim().replace(/\.md$/i,'');
export function links(content:string){return [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map(m=>({raw:m[1],target:target(m[1])}));}
export function resolveLink(link:string,notes:Note[]){const t=target(link);return notes.find(n=>n.path.replace(/\.md$/i,'')===t)??notes.find(n=>title(n.path)===t);}
export function backlinks(note:Note,notes:Note[]){return notes.filter(n=>n.path!==note.path&&(
 links(n.content).some(l=>resolveLink(l.target,notes)?.path===note.path)||
 [...n.content.matchAll(/\]\((noteapp-note:[\w-]+)\)/g)].some(match=>parseReference(match[1])?.path===note.path)
));}
export function headings(content:string){return [...content.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m,i)=>({level:m[1].length,text:stripNoteColor(m[2]),offset:m.index!,id:`heading-${i}`}));}
export function tags(content:string){return [...new Set([...content.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map(m=>m[1]))];}
