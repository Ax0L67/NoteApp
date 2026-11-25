import katex from 'katex';
import {StateField,type EditorState} from '@codemirror/state';
import {Decoration,EditorView,WidgetType,type DecorationSet} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {noteFenceRanges} from './noteFenceRanges';

export function inlineMathRanges(text:string) {
 const fences=noteFenceRanges(text);
 return [...text.matchAll(/\\{1,2}\(([^\n]+?)\\{1,2}\)/g)].filter(match=>!fences.some(range=>match.index!>=range.from&&match.index!<range.to)&&((text.slice(text.lastIndexOf('\n',match.index!-1)+1,match.index!).match(/`/g)?.length??0)%2===0)).map(match=>({from:match.index!,to:match.index!+match[0].length,source:match[1]}));
}
export function prepareMathMarkdown(text:string){for(const range of inlineMathRanges(text).reverse())text=text.slice(0,range.from)+'`noteapp-inline-math:'+encodeURIComponent(range.source)+'`'+text.slice(range.to);return text;}
export function mathHtml(source:string) {return katex.renderToString(source,{throwOnError:false,trust:false,strict:'ignore'});}
class MathWidget extends WidgetType {
 constructor(readonly source:string,readonly from:number){super();}
 eq(other:MathWidget){return this.source===other.source&&this.from===other.from;}
 toDOM(view:EditorView){const element=document.createElement('span');element.className='note-inline-math';element.innerHTML=mathHtml(this.source);element.title='Нажмите для редактирования формулы';element.onmousedown=event=>{event.preventDefault();view.dispatch({selection:{anchor:this.from+2}});view.focus()};return element;}
 ignoreEvent(){return false;}
}
export const inlineMath=StateField.define<DecorationSet>({
 create:decorate,
 update(value,tr){return tr.docChanged||tr.selection?decorate(tr.state):value;},
 provide:field=>EditorView.decorations.from(field),
});
function decorate(state:EditorState) {
 const selection=state.selection.main;
 return Decoration.set(inlineMathRanges(state.doc.toString()).filter(range=>{
  if(selection.empty?selection.from>range.from&&selection.from<range.to:selection.from<range.to&&selection.to>range.from)return false;
  return !/Code/.test(syntaxTree(state).resolveInner(range.from,1).name);
 }).map(range=>Decoration.replace({widget:new MathWidget(range.source,range.from)}).range(range.from,range.to)),true);
}
