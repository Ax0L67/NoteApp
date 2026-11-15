import {EditorState} from '@codemirror/state';
import {describe,expect,it} from 'vitest';
import {featureBlocks,markdownBlock} from './noteFeatureBlocks';
import {noteTextBlocks} from './noteTextBlocks';

describe('widget decorations',()=>{
  it('keeps feature code hidden when the editor selection enters the block',()=>{
    const text=markdownBlock('plot',{expressions:['x']});
    const field=featureBlocks(()=>[],()=>[],()=>{},()=>{});
    const state=EditorState.create({doc:text,selection:{anchor:5},extensions:[field]});
    let count=0;state.field(field).between(0,text.length,()=>{count++;});
    expect(count).toBe(1);
  });
  it('keeps floating text hidden when the editor selection enters the block',()=>{
    const text='```noteapp-widget-16-16-w320-h160-z2-tt\nТекст\n```';
    const field=noteTextBlocks('test.md',()=>({editable:true}));
    const state=EditorState.create({doc:text,selection:{anchor:5},extensions:[field]});
    let count=0;state.field(field).between(0,text.length,()=>{count++;});
    expect(count).toBe(1);
  });
});

it('does not render nested widget source inside a code fence',()=>{
 const fence=String.fromCharCode(96);
 const text=fence.repeat(4)+'cpp\n'+fence.repeat(3)+'noteapp-widget-16-16-w320-h160-z2-tt\nexample\n'+fence.repeat(3)+'\n'+fence.repeat(4);
 const field=noteTextBlocks('test.md',()=>({editable:true}));const state=EditorState.create({doc:text,extensions:[field]});
 let count=0;state.field(field).between(0,text.length,()=>{count++;});expect(count).toBe(0);
});

it('keeps the table hidden when selection enters its source',async()=>{
 const {markdownTables}=await import('./noteTables');
 const field=markdownTables(),doc='<!-- noteapp-table x=0 y=0 w=320 h=180 z=2 -->\n| A | B |\n| --- | --- |\n| x | y |';
 const state=EditorState.create({doc,selection:{anchor:doc.indexOf('A')},extensions:[field]});let count=0;state.field(field).between(0,doc.length,()=>{count++});expect(count).toBe(1);
});
