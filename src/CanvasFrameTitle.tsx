import {useEffect} from 'react';
import CodeMirror from '@uiw/react-codemirror';
import {markdown} from '@codemirror/lang-markdown';
import {EditorView} from '@codemirror/view';
import {HighlightStyle,syntaxHighlighting} from '@codemirror/language';
import {tags} from '@lezer/highlight';
import {noteTextColor,stripNoteColor} from './noteTextColor';

const titleExtensions=[markdown(),noteTextColor,syntaxHighlighting(HighlightStyle.define([{tag:tags.strong,fontWeight:'700'},{tag:tags.emphasis,fontStyle:'italic'},{tag:tags.strikethrough,textDecoration:'line-through'}])),EditorView.lineWrapping,EditorView.theme({'&':{backgroundColor:'transparent',font:'inherit'},'.cm-content':{font:'inherit',padding:'0',lineHeight:'1.25',color:'inherit'},'.cm-line':{padding:'0'},'.cm-scroller':{overflow:'visible'},'&.cm-focused':{outline:'none'}})];
const basicSetup={lineNumbers:false,foldGutter:false,highlightActiveLine:false,highlightActiveLineGutter:false,autocompletion:false};
export default function CanvasFrameTitle({text,rich,read,register,change}:{text:string;rich?:string;read:boolean;register:(view:EditorView|null)=>void;change:(rich:string,text:string)=>void}){
 useEffect(()=>()=>register(null),[]);
 return <div className="canvas-frame-title-editor" onPointerDown={event=>event.stopPropagation()}><CodeMirror value={rich??text} editable={!read} readOnly={read} basicSetup={basicSetup} extensions={titleExtensions} aria-label="Название Frame" onCreateEditor={view=>register(view)} onChange={value=>change(value,stripNoteColor(value).replace(/\*\*|~~/g,'').replace(/\n+/g,' '))}/></div>;
}
