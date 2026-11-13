import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import type {ReactCodeMirrorRef} from '@uiw/react-codemirror';
import type {Note,TaskBoard} from './types';
import type {ReferenceActions} from './ReferenceChip';
import {title} from './indexing';
import Editor from './Editor';
export default function PrintNote({note,notes,references,done,taskBoards=[],changeTaskBoard=()=>{},openNote=()=>{}}:{note:Note;notes:Note[];references:ReferenceActions;done:()=>void;taskBoards?:TaskBoard[];changeTaskBoard?:(board:TaskBoard)=>void;openNote?:(path:string)=>void}){
  const ref=useRef<ReactCodeMirrorRef>(null),root=useRef<HTMLElement>(null),doneRef=useRef(done);doneRef.current=done;
  useEffect(()=>{
    let live=true;const previous=document.title;
    const finish=()=>{document.title=previous;doneRef.current();};
    window.addEventListener('afterprint',finish,{once:true});
    void (async()=>{await document.fonts.ready;await new Promise(resolve=>setTimeout(resolve,600));
      await Promise.all(Array.from(root.current?.querySelectorAll('img')??[]).map(image=>image.decode().catch(()=>{})));
      if(live){document.title=title(note.path);window.print();}
    })();
    return()=>{live=false;document.title=previous;window.removeEventListener('afterprint',finish);};
  },[note.path]);
  return createPortal(<article className="note-print" ref={root}><Editor note={note} notes={notes} read onChange={()=>{}} onLink={()=>{}} editorRef={ref} light autoFocus={false} references={references} taskBoards={taskBoards} changeTaskBoard={changeTaskBoard} openNote={openNote}/></article>,document.body);
}
