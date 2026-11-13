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
