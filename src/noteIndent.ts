import {codeFolding,foldedRanges,foldEffect,unfoldEffect,indentUnit} from '@codemirror/language';
import {EditorState} from '@codemirror/state';
import {Decoration,EditorView,ViewPlugin,WidgetType,type ViewUpdate} from '@codemirror/view';

const guide=Decoration.mark({class:'note-indent-guide'});
class FoldToggle extends WidgetType {
  constructor(readonly from:number,readonly to:number,readonly kind:'heading'|'indent',readonly collapsed:boolean){super();}
  eq(other:FoldToggle){return this.from===other.from&&this.to===other.to&&this.kind===other.kind&&this.collapsed===other.collapsed;}
  ignoreEvent(){return true;}
  toDOM(view:EditorView){
    const button=document.createElement('button');button.type='button';button.className='note-fold-toggle';button.dataset.kind=this.kind;button.setAttribute('aria-expanded',String(!this.collapsed));button.setAttribute('aria-label',this.collapsed?'Развернуть текст':'Свернуть текст');button.title=button.getAttribute('aria-label')!;button.onmousedown=event=>event.preventDefault();
    button.onclick=event=>{event.preventDefault();event.stopPropagation();view.dispatch({effects:(this.collapsed?unfoldEffect:foldEffect).of({from:this.from,to:this.to})});};return button;
  }
}
function headingFold(view:EditorView,line:ReturnType<EditorView['state']['doc']['line']>) {
  const heading=/^ {0,3}(#{1,6})\s+/.exec(line.text);if(!heading)return null;
  let fence='',to=view.state.doc.length;
  for(let number=line.number+1;number<=view.state.doc.lines;number++){
    const next=view.state.doc.line(number),marker=/^ {0,3}(`{3,}|~{3,})/.exec(next.text)?.[1];
    if(marker){if(!fence)fence=marker;else if(marker[0]===fence[0]&&marker.length>=fence.length)fence='';continue;}
    if(fence)continue;
    const nextHeading=/^ {0,3}(#{1,6})\s+/.exec(next.text);
    if(nextHeading&&nextHeading[1].length<=heading[1].length){to=next.from;break;}
  }
  return to>line.to?{from:line.to,to}:null;
}
function indentFold(view:EditorView,line:ReturnType<EditorView['state']['doc']['line']>) {
  const indent=/^\t+/.exec(line.text)?.[0].length??0;if(!indent||line.number>=view.state.doc.lines)return null;
  let from=0,to=0,blank=0;
  for(let number=line.number+1;number<=view.state.doc.lines;number++){
    const next=view.state.doc.line(number),depth=/^\t+/.exec(next.text)?.[0].length??0;
    if(!next.text.trim()){if(from)to=next.to;else if(!blank)blank=next.from;continue;}
    if(depth<=indent)break;
    if(!from)from=blank||next.from;to=next.to;
  }
  return from&&to>from?{from,to}:null;
}
export function readingIndent(content:string) {
  let fence='';
  return content.split('\n').map(line=>{
    const marker=/^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if(marker){
      if(!fence)fence=marker;
      else if(marker[0]===fence[0]&&marker.length>=fence.length)fence='';
      return line;
    }
    return fence||/^\t+(?:[-+*]|\d+[.)])\s/.test(line)?line:line.replace(/^\t+/,tabs=>'\u00a0'.repeat(tabs.length*6));
  }).join('\n');
}
function guides(view:EditorView) {
  const ranges:ReturnType<Decoration['range']>[]=[];
  const folded=foldedRanges(view.state);
  let previousLine=0;
  for(const {from,to} of view.visibleRanges){
    for(let pos=from;pos<to;){
      const line=view.state.doc.lineAt(pos);
      const tabs=/^\t+/.exec(line.text)?.[0].length??0;
      if(line.number!==previousLine){
        if(tabs)ranges.push(Decoration.line({attributes:{style:`background-image:repeating-linear-gradient(to right, transparent 0 19px, var(--edge) 19px 21px, transparent 21px 40px);background-size:${tabs*40}px 100%;background-repeat:no-repeat`}}).range(line.from));
        for(let i=0;i<tabs;i++)ranges.push(guide.range(line.from+i,line.from+i+1));
        const heading=/^ {0,3}(#{1,6})\s+/.test(line.text),target=heading?headingFold(view,line):indentFold(view,line);
        if(target){let collapsed=false;folded.between(target.from,target.to,()=>{collapsed=true;});ranges.push(Decoration.widget({widget:new FoldToggle(target.from,target.to,heading?'heading':'indent',collapsed),side:-1}).range(line.from));}
        previousLine=line.number;
      }
      pos=line.to+1;
    }
  }
  return Decoration.set(ranges,true);
}

export const noteIndent=[
  codeFolding(),indentUnit.of('\t'), EditorState.tabSize.of(4),
  ViewPlugin.fromClass(class {
    decorations;
    constructor(view:EditorView){this.decorations=guides(view);}
    update(update:ViewUpdate){
      if(update.docChanged||update.viewportChanged||update.transactions.some(transaction=>transaction.effects.some(effect=>effect.is(foldEffect)||effect.is(unfoldEffect))))this.decorations=guides(update.view);
    }
  },{decorations:plugin=>plugin.decorations}),
];
