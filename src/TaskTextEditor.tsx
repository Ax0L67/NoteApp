import {useId,useRef} from 'react';
import type {ReactCodeMirrorRef} from '@uiw/react-codemirror';
import Editor from './Editor';
import type {Note} from './types';
import './taskTextEditor.css';

const notes:Note[]=[];

export default function TaskTextEditor({value,onChange,ariaLabel,placeholder,read=false,notes:availableNotes=notes,onLink=()=>{}}:{value:string;onChange:(value:string)=>void;ariaLabel:string;placeholder?:string;read?:boolean;notes?:Note[];onLink?:(path:string)=>void}) {
 const ref=useRef<ReactCodeMirrorRef>(null),id=useId();
 return <div className="task-text-editor" aria-label={ariaLabel}>
  {!value&&placeholder&&<span className="task-text-placeholder" aria-hidden="true">{placeholder}</span>}
  <Editor note={{path:`kanban/${id}.md`,content:value,revision:''}} notes={availableNotes} read={read} onChange={onChange} onLink={onLink} editorRef={ref} light={false} autoFocus={false} embedded showZoomControls={false} ariaLabel={ariaLabel} taskText/>
 </div>;
}
