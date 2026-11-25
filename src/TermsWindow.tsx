import {useMemo,useState} from 'react';
import {BookOpen,MagnifyingGlass,Trash} from '@phosphor-icons/react';
import type {Note} from './types';
import {conceptDefinitions,MarkdownMath} from './noteFeatureBlocks';
import {noteFenceRanges} from './noteFenceRanges';
import './termsWindow.css';

export type TermEntry={term:string;definition:string;path:string};

// Remove only the selected definition, preserving the note and any concept widget.
export function removeTermDefinition(content:string,entry:TermEntry,canvas=false):string|null {
  let changed=false;
  const clear=(value:Record<string,unknown>)=>{
    if(value.term!==entry.term)return false;
    if(value.definition===entry.definition){value.definition='';return true;}
    if(Array.isArray(value.meanings)){
      const index=value.meanings.indexOf(entry.definition);
      if(index>=0){value.meanings=[...value.meanings.slice(0,index),...value.meanings.slice(index+1)];return true;}
    }
    return false;
  };
  const text=(source:string)=>{
    const ranges=noteFenceRanges(source);
    const marker=/<!-- noteapp-definition:(\S+) -->/g;
    let result=source.replace(marker,(match:string,encoded:string,offset:number)=>{
      if(changed||ranges.some(range=>offset>=range.from&&offset<range.to))return match;
      try{const value=JSON.parse(decodeURIComponent(encoded));if(value.term===entry.term&&value.definition===entry.definition){changed=true;return '';}}catch{}
      return match;
    });
    if(changed)return result;
    return result.replace(/^(`{3,})noteapp-concept([^\n]*)\n([\s\S]*?)\n\1[ \t]*$/gm,(match,fence,options,body)=>{
      if(changed)return match;
      try{const value=JSON.parse(body);if(clear(value)){changed=true;return `${fence}noteapp-concept${options}\n${JSON.stringify(value,null,2)}\n${fence}`;}}catch{}
      return match;
    });
  };
  if(!canvas){const updated=text(content);return changed?updated:null;}
  try{
    const data=JSON.parse(content);
    if(!Array.isArray(data.widgets))return null;
    for(const widget of data.widgets){
      if(changed||typeof widget?.text!=='string')continue;
      if(widget.kind==='concept'){
        try{const value=JSON.parse(widget.text);if(clear(value)){widget.text=JSON.stringify(value,null,2);changed=true;continue;}}catch{}
      }
      widget.text=text(widget.text);
    }
    return changed?JSON.stringify(data):null;
  }catch{return null;}
}

export default function TermsWindow({notes,openNote,remove,close}:{notes:Note[];openNote:(path:string)=>void;remove:(entry:TermEntry)=>void;close?:()=>void}){
  const [query,setQuery]=useState('');
  const entries=useMemo(()=>[...conceptDefinitions(notes).values()].sort((a,b)=>a.term.localeCompare(b.term,'ru')),[notes]);
  const filter=query.trim().toLocaleLowerCase();
  const shown=entries.filter(entry=>`${entry.term} ${entry.definition} ${entry.path}`.toLocaleLowerCase().includes(filter));
  return <div className="terms-window-content">
    <header><BookOpen size={20}/><strong>Термины хранилища</strong>{close&&<button aria-label="Закрыть" onClick={close}>×</button>}</header>
    <label className="favorites-search"><MagnifyingGlass size={18}/><input autoFocus aria-label="Поиск терминов" placeholder="Найти термин или определение" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    <div className="terms-window-list">{shown.map((entry,index)=><article key={`${entry.path}:${entry.term}:${index}`}>
      <div><button className="terms-window-name" onClick={()=>openNote(entry.path)}>{entry.term}</button><button className="terms-window-remove" aria-label={`Удалить определение «${entry.term}»`} title="Удалить определение" onClick={()=>remove(entry)}><Trash size={17}/></button></div>
      <MarkdownMath text={entry.definition} notePath={entry.path} openNote={openNote}/><small>{entry.path}</small>
    </article>)}{!shown.length&&<p>{filter?'Ничего не найдено':'Термины пока не добавлены'}</p>}</div>
  </div>;
}
