import {fontStack,validFont} from './FontPicker';
import {syntaxTree} from '@codemirror/language';
import {Decoration,EditorView,ViewPlugin,type ViewUpdate} from '@codemirror/view';
import type {Parent,Root,RootContent} from 'mdast';

const opening=/<span data-note-color="(#[\da-f]{6})">/i;
const sizeOpening=/<span data-note-size="(\d{1,4})">/i;
const fontOpening=/<span data-note-font="([A-Za-z0-9 ]{1,50})">/i;
const lineOpening=/<span data-note-line="(\d+(?:\.\d+)?)">/i;
const closing='</span>';
const colorTags=new RegExp(`${opening.source}|${sizeOpening.source}|${fontOpening.source}|${lineOpening.source}|${closing}`,'gi');

export function stripNoteColor(text:string) {
  return text.replace(colorTags,'');
}

export function applyNoteFont(view:EditorView,font:string) {
  if(!validFont(font))return;
  applyNoteSize(view,16,`<span data-note-font="${font}">`);
}

export function applyNoteLineHeight(view:EditorView,value:number) {
  if(!Number.isFinite(value)||value<=0||value>20)return;
  applyNoteSize(view,16,`<span data-note-line="${value}">`);
}

export function applyNoteSize(view:EditorView,size:number,tag?:string) {
  if(!Number.isInteger(size)||size<1||size>1000)return;
  const {state}=view,{from,to}=state.selection.main,open=tag??`<span data-note-size="${size}">`;
  if(from===to){let node=syntaxTree(state).resolveInner(from,1);while(node.parent&&!['FencedCode','CodeBlock'].includes(node.name))node=node.parent;if(node.name==='FencedCode'||node.name==='CodeBlock')return;view.dispatch({changes:{from,insert:open+closing},selection:{anchor:from+open.length},userEvent:'input.text-size'});view.focus();return;}
  const tree=syntaxTree(state),edits:{from:number;to:number;insert:string}[]=[];
  let first:number|undefined,last:number|undefined;
  for(let pos=from;pos<to;){
    const line=state.doc.lineAt(pos),end=Math.min(to,line.to),prefix=/^\s*(?:>\s*)*(?:(?:#{1,6}|[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?/.exec(line.text)![0].length;
    const start=Math.min(end,Math.max(pos,line.from+prefix)),endText=end-(state.sliceDoc(start,end).match(/\s*$/)?.[0].length??0);
    pos=line.to+1;if(start>=endText||!state.sliceDoc(start,endText).trim())continue;
    let node=tree.resolveInner(start,1);while(node.parent&&!['FencedCode','CodeBlock'].includes(node.name))node=node.parent;
    if(node.name==='FencedCode'||node.name==='CodeBlock')continue;
    const existing=!tag?new RegExp(sizeOpening.source+'$', 'i').exec(state.sliceDoc(line.from,start)):null;
    if(existing&&state.sliceDoc(endText,endText+closing.length)===closing){
      edits.push({from:start-existing[0].length,to:start,insert:open});first??=start;last=endText;continue;
    }
    const selected=state.sliceDoc(start,endText); let offset=0;
    for(const boundary of [...selected.matchAll(colorTags),{index:selected.length,0:''}]){
      const fragment=selected.slice(offset,boundary.index);
      if(fragment.trim()){const a=start+offset+fragment.length-fragment.trimStart().length,b=start+offset+fragment.trimEnd().length;edits.push({from:a,to:a,insert:open},{from:b,to:b,insert:closing});first??=a;last=b;}
      offset=boundary.index+boundary[0].length;
    }
  }
  if(first===undefined||last===undefined)return;
  const changes=state.changes(edits);
  view.dispatch({changes,selection:{anchor:changes.mapPos(first,1),head:changes.mapPos(last,-1)},userEvent:'input.text-size'});view.focus();
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
    const styles:{color?:string;fontSize?:number;fontFamily?:string;lineHeight?:number}[]=[];
    function visit(parent:Parent) {
      const depth=styles.length;
      parent.children=parent.children.flatMap((node):RootContent[]=>{
        if(node.type==='html'){
          const color=opening.exec(node.value);
          if(color?.[0]===node.value){styles.push({color:color[1]});return [];}
          const font=fontOpening.exec(node.value);if(font?.[0]===node.value&&validFont(font[1])){styles.push({fontFamily:fontStack(font[1])});return [];}
          const line=lineOpening.exec(node.value);if(line?.[0]===node.value&&Number(line[1])>0&&Number(line[1])<=20){styles.push({lineHeight:Number(line[1])});return [];}
          const size=sizeOpening.exec(node.value);
          if(size?.[0]===node.value&&Number(size[1])>=1&&Number(size[1])<=1000){styles.push({fontSize:Number(size[1])});return [];}
          if(node.value===closing&&styles.length){styles.pop();return [];}
        }
        if('children' in node)visit(node);
        const style=Object.assign({},...styles),css=[style.color&&`color:${style.color}`,style.fontSize&&`font-size:${style.fontSize}px`,style.fontFamily&&`font-family:${style.fontFamily}`,style.lineHeight&&`line-height:${style.lineHeight}`].filter(Boolean).join(';');
        if(css&&(node.type==='text'||node.type==='inlineCode'||node.type==='link'))return [{
          type:'emphasis',data:{hName:'span',hProperties:{style:css}},children:[node],
        }];
        return [node];
      });
      if(['paragraph','heading','tableCell'].includes(parent.type))styles.length=depth;
    }
    visit(root);
  };
}

function colorDecorations(view:EditorView) {
  const ranges:ReturnType<Decoration['range']>[]=[],lineHeights=new Map<number,number>();
  const spans:{color?:string;fontSize?:number;fontFamily?:string;lineHeight?:number;from:number;to:number}[]=[];
  syntaxTree(view.state).iterate({enter(node){
    if(node.name!=='HTMLTag')return;
    const tag=view.state.sliceDoc(node.from,node.to);
    const color=opening.exec(tag);
    const font=fontOpening.exec(tag);if(font?.[0]===tag&&validFont(font[1])){spans.push({fontFamily:fontStack(font[1]),from:node.from,to:node.to});return;}
    const line=lineOpening.exec(tag);if(line?.[0]===tag&&Number(line[1])>0&&Number(line[1])<=20){spans.push({lineHeight:Number(line[1]),from:node.from,to:node.to});return;}
    const size=sizeOpening.exec(tag);
    if(color?.[0]===tag){spans.push({color:color[1],from:node.from,to:node.to});return;}
    if(size?.[0]===tag&&Number(size[1])>=1&&Number(size[1])<=1000){spans.push({fontSize:Number(size[1]),from:node.from,to:node.to});return;}
    if(tag!==closing)return;
    const span=spans.pop();
    if(!span)return;
    if(span.lineHeight&&span.to<node.from){let line=view.state.doc.lineAt(span.to);while(line.from<node.from){lineHeights.set(line.from,span.lineHeight);if(line.number===view.state.doc.lines)break;line=view.state.doc.line(line.number+1);}}
    if(span.to<node.from)ranges.push(Decoration.mark({attributes:{style:[span.color&&`color:${span.color}`,span.fontSize&&`font-size:${span.fontSize}px`,span.fontFamily&&`font-family:${span.fontFamily}`,span.lineHeight&&`line-height:${span.lineHeight}`].filter(Boolean).join(';')}}).range(span.to,node.from));
    ranges.push(Decoration.replace({}).range(span.from,span.to),Decoration.replace({}).range(node.from,node.to));
  }});
  const hidden=new Set<number>();for(const range of ranges)if(range.value instanceof Decoration && range.from!==range.to)hidden.add(range.from);
  const text=view.state.doc.toString(),stack:number[]=[];colorTags.lastIndex=0;
  for(const match of text.matchAll(colorTags)){
    const from=match.index!;
    if(match[0]===closing){if(!stack.length)continue;stack.pop();}else stack.push(from);
    if(!hidden.has(from))ranges.push(Decoration.replace({}).range(from,from+match[0].length));
  }
  for(const [from,height] of lineHeights)ranges.push(Decoration.line({attributes:{style:`line-height:${height}`}}).range(from));
  return Decoration.set(ranges,true);
}

export const noteTextColor=ViewPlugin.fromClass(class {
  decorations;
  constructor(view:EditorView){this.decorations=colorDecorations(view);}
  update(update:ViewUpdate){
    if(syntaxTree(update.state)!==syntaxTree(update.startState))this.decorations=colorDecorations(update.view);
  }
},{decorations:plugin=>plugin.decorations});
