import {syntaxTree} from '@codemirror/language';
import {Decoration,EditorView,ViewPlugin,type ViewUpdate} from '@codemirror/view';
import type {Parent,Root,RootContent} from 'mdast';

const opening=/<span data-note-color="(#[\da-f]{6})">/i;
const closing='</span>';
const colorTags=new RegExp(`${opening.source}|${closing}`,'gi');

export function stripNoteColor(text:string) {
  return text.replace(colorTags,'');
}

export function applyNoteColor(view:EditorView,color:string) {
  const {state}=view;
  const {from,to}=state.selection.main;
  if(from===to||!/^#[\da-f]{6}$/i.test(color))return;
  const startTag=`<span data-note-color="${color}">`;
  const tree=syntaxTree(state);
  const edits:{from:number;to:number;insert:string}[]=[];
  let first:number|undefined,last:number|undefined;
  for(let pos=from;pos<to;){
    const line=state.doc.lineAt(pos);
    const end=Math.min(to,line.to);
    const prefix=/^\s*(?:>\s*)*(?:(?:#{1,6}|[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?/.exec(line.text)![0].length;
    const start=Math.min(end,Math.max(pos,line.from+prefix));
    const endText=end-(state.sliceDoc(start,end).match(/\s*$/)?.[0].length??0);
    pos=line.to+1;
    if(start>=endText)continue;
    let node=tree.resolveInner(start,1);
    while(node.parent&&!['FencedCode','CodeBlock'].includes(node.name)){
      node=node.parent;
    }
    if(node.name==='FencedCode'||node.name==='CodeBlock')continue;
    const existing=new RegExp(`${opening.source}$`,'i').exec(state.sliceDoc(line.from,start));
    if(existing&&state.sliceDoc(endText,endText+closing.length)===closing){
      edits.push({from:start-existing[0].length,to:start,insert:startTag});
      first??=start;
      last=endText;
    }else{
      // Keep new spans inside existing ones, even when a selection crosses their boundaries.
      const selected=state.sliceDoc(start,endText);
      const boundaries=[...selected.matchAll(colorTags)];
      let offset=0;
      for(const tag of [...boundaries,{index:selected.length,0:''}]){
        const fragment=selected.slice(offset,tag.index);
        if(fragment.trim()){
          const a=start+offset+fragment.length-fragment.trimStart().length;
          const b=start+offset+fragment.trimEnd().length;
          edits.push({from:a,insert:startTag,to:a},{from:b,insert:closing,to:b});
          first??=a;
          last=b;
        }
        offset=tag.index+tag[0].length;
      }
    }
  }
  if(first===undefined||last===undefined)return;
  const changes=state.changes(edits);
  view.dispatch({changes,selection:{anchor:changes.mapPos(first,1),head:changes.mapPos(last,-1)},userEvent:'input.text-color'});
}

export function remarkNoteColor() {
  return (root:Root)=>{
    const colors:string[]=[];
    function visit(parent:Parent) {
      const depth=colors.length;
      parent.children=parent.children.flatMap((node):RootContent[]=>{
        if(node.type==='html'){
          const color=opening.exec(node.value);
          if(color?.[0]===node.value){colors.push(color[1]);return [];}
          if(node.value===closing&&colors.length){colors.pop();return [];}
        }
        if('children' in node)visit(node);
        const color=colors.at(-1);
        if(color&&(node.type==='text'||node.type==='inlineCode'))return [{
          type:'emphasis',data:{hName:'span',hProperties:{style:`color:${color}`}},children:[node],
        }];
        return [node];
      });
      if(['paragraph','heading','tableCell'].includes(parent.type))colors.length=depth;
    }
    visit(root);
  };
}

function colorDecorations(view:EditorView) {
  const ranges:ReturnType<Decoration['range']>[]=[];
  const spans:{color:string;from:number;to:number}[]=[];
  syntaxTree(view.state).iterate({enter(node){
    if(node.name!=='HTMLTag')return;
    const tag=view.state.sliceDoc(node.from,node.to);
    const color=opening.exec(tag);
    if(color?.[0]===tag)spans.push({color:color[1],from:node.from,to:node.to});
    if(tag!==closing)return;
    const span=spans.pop();
    if(!span)return;
    if(span.to<node.from)ranges.push(Decoration.mark({attributes:{style:`color:${span.color}`}}).range(span.to,node.from));
    ranges.push(Decoration.replace({}).range(span.from,span.to),Decoration.replace({}).range(node.from,node.to));
  }});
  return Decoration.set(ranges,true);
}

export const noteTextColor=ViewPlugin.fromClass(class {
  decorations;
  constructor(view:EditorView){this.decorations=colorDecorations(view);}
  update(update:ViewUpdate){
    if(syntaxTree(update.state)!==syntaxTree(update.startState))this.decorations=colorDecorations(update.view);
  }
},{decorations:plugin=>plugin.decorations});
