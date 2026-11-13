import {createRoot,type Root} from 'react-dom/client';
import {StateField} from '@codemirror/state';
import {Decoration,EditorView,WidgetType,type DecorationSet} from '@codemirror/view';
import {NoteCodeCard} from './NoteCodeCard';
import {codeExample,codeMarkdown,noteCodeBlocks,type CodeLanguage,type CodeOptions,type NoteCodeBlock} from './noteCode';
import {initialNoteWidget,noteWidgetChrome} from './noteWidgetChrome';
import {stopCodeRun} from './codeExecution';

const mounted=new WeakMap<HTMLElement,{root:Root;dispose?:()=>void;block:NoteCodeBlock;refresh:(block:NoteCodeBlock)=>void}>();
export function insertCodeWidget(view:EditorView,language:CodeLanguage='cpp') {
  const {from,to}=view.state.selection.main;
  const options:CodeOptions={id:crypto.randomUUID(),fileName:language==='cpp'?'main.cpp':'main.py',stdin:'',widget:initialNoteWidget(view,from,720,480)};
  const source=codeMarkdown(language,codeExample[language],options);
  view.dispatch({changes:{from,to,insert:`\n${source}\n`},selection:{anchor:from},userEvent:'input.code-widget'});
  view.focus();
}
export function codeWidgets(notePath='') {
  class CodeWidget extends WidgetType {
    constructor(readonly block:NoteCodeBlock){super()}
    eq(other:CodeWidget){return other.block.from===this.block.from&&other.block.source===this.block.source}
    ignoreEvent(){return true}
    updateDOM(host:HTMLElement){
      const item=mounted.get(host);
      if(!item||JSON.stringify(item.block.options.widget)!==JSON.stringify(this.block.options.widget))return false;
      item.block=this.block;item.refresh(this.block);return true;
    }
    toDOM(view:EditorView){
      const host=document.createElement('div');host.className='note-code-host';host.contentEditable='false';
      let current=this.block;
      const write=(code:string,language:CodeLanguage,options:CodeOptions)=>{
        if(view.state.sliceDoc(current.from,current.to)!==current.source)return;
        view.dispatch({changes:{from:current.from,to:current.to,insert:codeMarkdown(language,code,options)},userEvent:'input.code-widget'});
      };
      const remove=()=>{if(view.state.sliceDoc(current.from,current.to)===current.source){stopCodeRun(notePath+'\0'+(current.options.id??current.from));view.dispatch({changes:{from:current.from,to:current.to},userEvent:'delete.code-widget'})}};
      let body:HTMLElement=host,menuTarget:HTMLElement|undefined,dispose:(()=>void)|undefined;
      if(current.options.widget){
        host.classList.add('note-feature-host');
        const chrome=noteWidgetChrome(host,view,current.options.widget,'Код',position=>write(current.code,current.language,{...current.options,widget:position}),remove,true,640);
        body=chrome.body;menuTarget=chrome.actions;dispose=chrome.dispose;
      }
      const root=createRoot(body);
      const refresh=(block:NoteCodeBlock)=>{
        current=block;
        root.render(<NoteCodeCard notePath={notePath} block={current} editable menuTarget={menuTarget} save={write} onFloat={current.options.widget?undefined:(code,language,options)=>write(code,language,{...options,id:options.id??crypto.randomUUID(),widget:{...initialNoteWidget(view,current.from,720,480),color:options.color,scale:options.scale}})} onInline={current.options.widget?(code,language,options)=>write(code,language,{...options,color:options.widget?.color??options.color,scale:options.widget?.scale??options.scale,widget:undefined}):undefined} onRemove={current.options.widget?undefined:remove}/>);
      };
      mounted.set(host,{root,dispose,block:current,refresh});refresh(current);
      return host;
    }
    destroy(host:HTMLElement){const item=mounted.get(host);item?.dispose?.();item?.root.unmount();mounted.delete(host)}
  }
  const decorate=(state:EditorView['state']):DecorationSet=>Decoration.set(noteCodeBlocks(state.doc.toString()).map(block=>Decoration.replace({block:true,widget:new CodeWidget(block)}).range(block.from,block.to)),true);
  return StateField.define<DecorationSet>({create:decorate,update:(value,tr)=>tr.docChanged?decorate(tr.state):value,provide:field=>[EditorView.decorations.from(field),EditorView.atomicRanges.of(view=>view.state.field(field))]});
}
