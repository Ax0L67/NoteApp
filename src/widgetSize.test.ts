import {expect,it} from 'vitest';
import {codeOptions} from './noteCode';import {imageLayout} from './noteImages';import {constrainNoteWidgetPosition} from './noteWidgetChrome';
import {widgetBorderWidth} from './noteWidgetChrome';
import {noteTextPosition,noteTextBlocks} from './noteTextBlocks';
import {readingWidgetTables} from './noteTables';
import {EditorState} from '@codemirror/state';
it('keeps identical compact dimensions in code widgets',()=>{expect(codeOptions('cpp',{widget:{x:0,y:0,width:64,height:64,z:1}}).widget).toMatchObject({width:64,height:64});});
it('retains independent image height alongside existing appearance',()=>{expect(imageLayout('image.png#noteapp-width=400&x=0&y=0&z=2&c=aabbcc&s=80&h=300')).toMatchObject({width:400,height:300,color:'#aabbcc',scale:.8});});
it('uses common bounds without rounding exact dimensions to the grid',()=>{expect(constrainNoteWidgetPosition({x:0,y:0,width:375,height:243,z:1},{clientWidth:800} as HTMLElement,22)).toMatchObject({width:375,height:243});});
it('uses a slightly heavier default and bounds custom border widths',()=>{
 expect(widgetBorderWidth()).toBe(1.5);expect(widgetBorderWidth(NaN)).toBe(1.5);
 expect(widgetBorderWidth(0)).toBe(0);expect(widgetBorderWidth(99)).toBe(8);
});
it('retains custom code and image borders with dimensions',()=>{
 expect(codeOptions('cpp',{widget:{x:0,y:0,width:320,height:160,z:1,borderWidth:3}}).widget).toMatchObject({width:320,height:160,borderWidth:3});
 expect(imageLayout('image.png#noteapp-width=320&x=0&y=0&z=2&h=160&bw=6')).toMatchObject({width:320,height:160,borderWidth:3});
});
it('keeps a text widget decorated with a custom border, including zero',()=>{
 const marker='noteapp-widget-16-16-w320-h160-z2-tt-o0';
 expect(noteTextPosition(marker)?.borderWidth).toBe(0);
 const text='```'+marker+'\nText\n```',field=noteTextBlocks('note.md',()=>({editable:true}));
 const state=EditorState.create({doc:text,extensions:[field]});let count=0;
 state.field(field).between(0,text.length,()=>{count++;});expect(count).toBe(1);
});
it('retains the table border when switching to reading mode',()=>{
 const source='<!-- noteapp-table widths=100 x=12 y=34 w=320 h=160 z=2 bw=3 -->\n| Name |\n| :--- |\n| Text |';
 expect(readingWidgetTables(source)).toContain('-tt-o6\n');
});
