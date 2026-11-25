import {useEffect,useState} from 'react';
import type {EditorView} from '@codemirror/view';
import FontPicker from './FontPicker';
import {applyNoteSize,applyNoteFont,applyNoteLineHeight} from './noteTextColor';
export default function NoteTypography({getView,size,font}:{getView:()=>EditorView|undefined;size:number;font?:string}) {
 const [current,setCurrent]=useState({size,font:font??'',line:1.85});
 useEffect(()=>{let lastState:EditorView['state']|undefined;const sync=()=>{const view=getView();if(!view||view.state===lastState)return;lastState=view.state;const text=view.state.sliceDoc(0,view.state.selection.main.from),stack:{size?:number;font?:string;line?:number}[]=[];for(const match of text.matchAll(/<span data-note-(size|font|color|line)="([^"]+)">|<\/span>/g)){if(match[0]==='</span>')stack.pop();else stack.push(match[1]==='size'?{size:Number(match[2])}:match[1]==='font'?{font:match[2]}:match[1]==='line'?{line:Number(match[2])}:{});}const next=Object.assign({size,font:font??'',line:1.85},...stack);setCurrent(previous=>previous.size===next.size&&previous.font===next.font&&previous.line===next.line?previous:next);};sync();const timer=setInterval(sync,200);return()=>clearInterval(timer);},[getView,size,font]);
 const [draft,setDraft]=useState(String(size)),[lineDraft,setLineDraft]=useState('1.85'),[open,setOpen]=useState<'size'|'line'|null>(null);
 useEffect(()=>setDraft(String(current.size)),[current.size]);
 useEffect(()=>setLineDraft(String(current.line)),[current.line]);
 const applySize=(value:string)=>{const n=value===''?size:Number(value.replace(',','.'));if(!Number.isInteger(n)||n<1||n>1000){setDraft(String(current.size));return;}const view=getView();if(view)applyNoteSize(view,n);setCurrent(c=>({...c,size:n}));setDraft(String(n));setOpen(null);};
 const applyLine=(value:string)=>{const n=value===''?1.85:Number(value.replace(',','.'));if(!Number.isFinite(n)||n<=0||n>20){setLineDraft(String(current.line));return;}const view=getView();if(view)applyNoteLineHeight(view,n);setCurrent(c=>({...c,line:n}));setLineDraft(String(n));setOpen(null);};
 const control=(kind:'size'|'line',label:string,value:string,set:(v:string)=>void,apply:(v:string)=>void,options:number[])=> <div className="note-typography-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOpen(null);}}>
  <input className="font-picker" aria-label={label} inputMode="decimal" value={value} onChange={e=>set(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();apply(value);}if(e.key==='Escape')setOpen(null);}} onBlur={()=>{if(value!==String(kind==='size'?current.size:current.line)&&open!==kind)apply(value);}}/>
  <button type="button" aria-label={label+' — варианты'} aria-expanded={open===kind} onMouseDown={e=>e.preventDefault()} onClick={()=>setOpen(open===kind?null:kind)}>▾</button>
  {open===kind&&<div className="note-typography-options" role="listbox"><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>apply('')}>По умолчанию</button>{options.map(n=><button type="button" key={n} onMouseDown={e=>e.preventDefault()} onClick={()=>apply(String(n))}>{String(n).replace('.',',')}{kind==='size'?' px':''}</button>)}</div>}
 </div>;
 return <>{control('size','Размер шрифта',draft,setDraft,applySize,[8,10,12,14,16,18,20,24,28,32,36,48])}{control('line','Межстрочный интервал',lineDraft,setLineDraft,applyLine,[1,1.25,1.5,1.65,1.85,2,2.5,3])}<FontPicker value={current.font} inherited="Шрифт по умолчанию" change={value=>{const view=getView();if(view)applyNoteFont(view,value||font||'Inter');}}/></>;
}
