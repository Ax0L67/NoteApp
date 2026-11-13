import type {Settings,ProjectMap,ProjectConnection} from './types';
import type {Location} from './Explorer';
import {projectOf} from './projects';
import {mapWindowKeys} from './centralWindowState';
import {remapNoteReference} from './noteReferences';

export function movedLocation(value:Location,from:string,to:string,projects:string[]):Location {
  const path=(value:string)=>value===from?to:value.startsWith(from+'/')?to+value.slice(from.length):value;
  if(value.kind==='note')return {...value,path:path(value.path)};
  if(value.kind==='folder'){const next=path(value.path);return {...value,path:next,project:projectOf(next+'/note.md',projects)};}
  if(value.kind==='graph'&&value.project===from)return projects.includes(to)?{...value,project:to}:{kind:'folder',path:to,project:projectOf(to+'/note.md',projects)};
  return value;
}
export function movedSettings(settings:Settings,from:string,to:string,notePaths:string[],projects:string[]):Settings {
  const path=(value:string)=>value===from?to:value.startsWith(from+'/')?to+value.slice(from.length):value;
  const owner=(value:string)=>projectOf(value+'/note.md',projects);
  const location=(value:Location):Location=>{
    if(value.kind==='note')return {...value,path:path(value.path)};
    if(value.kind==='folder'){const next=path(value.path);return {...value,path:next,project:owner(next)};}
    if(value.kind==='graph'&&value.project===from)return projects.includes(to)?{...value,project:to}:{kind:'folder',path:to,project:owner(to)};
    return value;
  };
  const key=(value:string)=>value.startsWith('folder:')?'folder:'+path(value.slice(7)):value==='project:'+from?(projects.includes(to)?'project:':'folder:')+to:path(value);
  const link=(connection:ProjectConnection)=>({...connection,from:key(connection.from),to:key(connection.to)});
  const record=<T,>(value:Record<string,T>|undefined,edit:(value:T)=>T=(entry=>entry))=>value&&Object.fromEntries(Object.entries(value).map(([name,value])=>[name===from?to:name,edit(value)]));
  const text=(value:string)=>notePaths.reduce((text,old)=>remapNoteReference(text,old,path(old)),value);
  return {...settings,projects,projectOrder:[...new Set([...(settings.projectOrder??[]).filter(name=>projects.includes(name)),...projects])],archivedProjects:settings.archivedProjects?.filter(name=>projects.includes(name)),
    active:settings.active&&path(settings.active),favorites:settings.favorites?.map(path),recent:settings.recent?.map(path),
    dailyNotes:settings.dailyNotes&&Object.fromEntries(Object.entries(settings.dailyNotes).map(([day,value])=>[day,path(value)])),
    noteAppearance:settings.noteAppearance&&Object.fromEntries(Object.entries(settings.noteAppearance).map(([name,value])=>[path(name),value])),
    projectNotes:record(settings.projectNotes,path),projectPalettes:record(settings.projectPalettes),projectPaletteBlends:record(settings.projectPaletteBlends),
    projectBackgrounds:record(settings.projectBackgrounds),projectPatterns:record(settings.projectPatterns),projectGridOpacity:record(settings.projectGridOpacity),
    projectConnections:record(settings.projectConnections,links=>links.map(link)),
    projectMaps:record(settings.projectMaps,(map:ProjectMap)=>({...map,cards:map.cards&&Object.fromEntries(Object.entries(map.cards).map(([name,value])=>[key(name),value])),hiddenConnections:map.hiddenConnections?.map(link),text:map.text===undefined?undefined:text(map.text),blocks:map.blocks?.map(block=>({...block,text:text(block.text)}))})),
    centralWindows:settings.centralWindows&&mapWindowKeys(settings.centralWindows,location),
  };
}
