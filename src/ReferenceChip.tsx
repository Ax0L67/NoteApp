import {syntaxTree} from '@codemirror/language';
import {StateField,type EditorState} from '@codemirror/state';
import {Decoration,EditorView,WidgetType,type DecorationSet} from '@codemirror/view';
import type {ReactNode} from 'react';
import {NoteBackdrop} from './appearance';
import {noteInsertMenu} from './noteInsertMenu';
import {parseReference,type ReferenceRange,type ReferenceTarget} from './noteReferences';
import {request} from './storage';

export type ReferenceActions = {
  targets: ReadonlyMap<string,ReferenceTarget>;
  root: string;
  open: (url:string)=>void;
  edit: (view:EditorView,range:ReferenceRange)=>void;
};

function chipClass(target?:ReferenceTarget) {
  return `reference-chip project-workspace palette-${target?.palette??'graphite'}`;
}

export function ReferenceChip({url,children,actions}: {url:string;children:ReactNode;actions?:ReferenceActions}) {
  const target=actions?.targets.get(url);
  const name=target?.name??children;
  return <span className={chipClass(target)}>
    {target?.background&&<NoteBackdrop path={target.background} root={actions!.root} inline/>}
    <button type="button" className="reference-label" title={target?.name??'Цель недоступна'}
      disabled={!target} onClick={()=>actions?.open(url)}><span>{name}</span></button>
  </span>;
}

export function referenceWidgets(targets:ReferenceActions['targets'],actions:()=>ReferenceActions|undefined) {
  class ReferenceWidget extends WidgetType {
    constructor(readonly range:ReferenceRange) { super(); }
    eq(other:ReferenceWidget) {
      return this.range.from===other.range.from&&this.range.source===other.range.source;
    }
    ignoreEvent() { return true; }
    toDOM(view:EditorView) {
      const {url,from,to,source}=this.range;
      const target=targets.get(url);
      const name=target?.name??parseReference(url)?.path??'Цель недоступна';
      const chip=document.createElement('span');
      chip.className=chipClass(target);
      const label=document.createElement('button');
      label.type='button';
      label.className='reference-label';
      label.title=target?name:'Цель недоступна';
      label.disabled=!target;
      const caption=document.createElement('span');
      caption.textContent=name;
      label.append(caption);
      label.onclick=()=>actions()?.open(url);
      const {menu,move:edit,remove}=noteInsertMenu('Действия со ссылкой',false);
      edit.onclick=()=>{menu.open=false;actions()?.edit(view,this.range);};
      remove.onclick=()=>{
        if(view.state.sliceDoc(from,to)!==source)return;
        view.dispatch({changes:{from,to},selection:{anchor:from},userEvent:'delete.reference'});
        view.focus();
      };
      chip.append(label,menu);
      if(target?.background){
        const backdrop=document.createElement('span');
        backdrop.className='note-backdrop has-image';
        backdrop.setAttribute('aria-hidden','true');
        const img=document.createElement('img');
        img.alt='';
        img.draggable=false;
        const path=target.background;
        const root=actions()?.root;
        const asset=path.startsWith('/')?Promise.resolve(path):request<string>('asset',{path});
        void asset.then(src=>{
          if(!src||root!==actions()?.root)return;
          img.src=src;
          backdrop.append(img);
          chip.prepend(backdrop);
        }).catch(()=>{});
      }
      return chip;
    }
  }
  function decorate(state:EditorState) {
    const widgets:ReturnType<Decoration['range']>[]=[];
    syntaxTree(state).iterate({enter(node){
      if(node.name!=='Link')return;
      const link=node.node.getChild('URL');
      if(!link)return;
      const url=state.sliceDoc(link.from,link.to);
      if(!parseReference(url))return;
      const {from,to}=node;
      widgets.push(Decoration.replace({widget:new ReferenceWidget({from,to,url,source:state.sliceDoc(from,to)})}).range(from,to));
      return false;
    }});
    return Decoration.set(widgets,true);
  }
  return StateField.define<DecorationSet>({
    create:decorate,
    update:(value,tr)=>tr.docChanged||syntaxTree(tr.startState)!==syntaxTree(tr.state)?decorate(tr.state):value,
    provide:field=>[EditorView.decorations.from(field),EditorView.atomicRanges.of(view=>view.state.field(field))],
  });
}
