import {useEffect,useState} from 'react';
import type {EditorView} from '@codemirror/view';
import FontPicker from './FontPicker';
import {applyNoteSize,applyNoteFont} from './noteTextColor';
export default function NoteTypography({getView,size,font}:{getView:()=>EditorView|undefined;size:number;font?:string}) {
 const [current,setCurrent]=useState({size,font:font??''});
 useEffect(()=>{const sync=()=>{const view=getView();if(!view)return;const text=view.state.sliceDoc(0,view.state.selection.main.from),stack:{size?:number;font?:string}[]=[];for(const match of text.matchAll(/<span data-note-(size|font|color)="([^"]+)">|<\/span>/g)){if(match[0]==='</span>')stack.pop();else stack.push(match[1]==='size'?{size:Number(match[2])}:match[1]==='font'?{font:match[2]}:{});}setCurrent(Object.assign({size,font:font??''},...stack));};sync();const timer=setInterval(sync,200);return()=>clearInterval(timer);},[getView,size,font]);
 return <><select className="font-picker" aria-label="Размер шрифта" value={current.size} onChange={e=>{const next=e.target.value==="default"?size:Number(e.target.value);const view=getView();if(view)applyNoteSize(view,next);setCurrent({...current,size:next});}}><option value="default">По умолчанию</option>{Array.from(new Set([current.size,...Array.from({length:41},(_,i)=>i+8)])).sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n} px</option>)}</select><FontPicker value={current.font} inherited="Шрифт по умолчанию" change={value=>{const view=getView();if(view)applyNoteFont(view,value||font||'Inter');}}/></>;
}
