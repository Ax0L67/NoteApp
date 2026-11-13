import {expect,it} from 'vitest';
import type {Root} from 'mdast';
import {remarkNoteColor,stripNoteColor} from './noteTextColor';
import {applyNoteSize} from './noteTextColor';
import {EditorState,type TransactionSpec} from '@codemirror/state';
import {markdown} from '@codemirror/lang-markdown';
import type {EditorView} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
function editor(text:string,from:number,to=from){
 let state=EditorState.create({doc:text,selection:{anchor:from,head:to},extensions:[markdown()]});
 return {get state(){return state;},dispatch(spec:TransactionSpec){state=state.update(spec).state;},focus(){}} as unknown as EditorView;
}
it('renders local font and size and removes metadata from plain text',()=>{
 const root:Root={type:'root',children:[{type:'paragraph',children:[{type:'html',value:'<span data-note-font="Manrope">'},{type:'html',value:'<span data-note-size="24">'},{type:'text',value:'Text'},{type:'html',value:'</span>'},{type:'html',value:'</span>'}]}]};
 remarkNoteColor()(root);
 expect(JSON.stringify(root)).toContain('font-size:24px');
 expect(JSON.stringify(root)).toContain('Manrope');
 expect(stripNoteColor('<span data-note-font="Manrope"><span data-note-size="24">Text</span></span>')).toBe('Text');
});
it('applies size to the selected text without changing the rest of the note',()=>{
 const view=editor('Before selected after',7,15);applyNoteSize(view,28);
 expect(view.state.doc.toString()).toBe('Before <span data-note-size="28">selected</span> after');
 expect(view.state.sliceDoc(view.state.selection.main.from,view.state.selection.main.to)).toBe('selected');
});
it('keeps the chosen size around text typed after choosing it at the cursor',()=>{
 const view=editor('Before ',7);applyNoteSize(view,28);view.dispatch(view.state.replaceSelection('Typed'));
 expect(view.state.doc.toString()).toBe('Before <span data-note-size="28">Typed</span>');
 expect(view.state.sliceDoc(0,view.state.selection.main.head)).toBe('Before <span data-note-size="28">Typed');
 expect(syntaxTree(view.state).toString()).toContain('HTMLTag');
});
it('replaces the previous size when resizing the same text back',()=>{
 const view=editor('Example',0,7);applyNoteSize(view,48);applyNoteSize(view,16);
 expect(view.state.doc.toString()).toBe('<span data-note-size="16">Example</span>');
});
