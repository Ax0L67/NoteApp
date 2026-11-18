import {expect,it} from 'vitest';
import {EditorState} from '@codemirror/state';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxTree} from '@codemirror/language';
import {markdownTables,standaloneMapTable} from './noteTables';

it('recognizes task formatting and keeps an embedded table as editable source',()=>{
 const doc='**жирный** *курсив* `код` ~~зачёркнутый~~\n\n| A | B |\n| --- | --- |\n| x | y |';
 const field=markdownTables(true),state=EditorState.create({doc,extensions:[markdown({base:markdownLanguage}),field]});
 const tree=syntaxTree(state).toString();
 expect(tree).toContain('StrongEmphasis');
 expect(tree).toContain('Emphasis');
 expect(tree).toContain('InlineCode');
 expect(tree).toContain('Strikethrough');
 let tables=0;state.field(field).between(0,doc.length,()=>{tables++});
 expect(tables).toBe(1);
 expect(standaloneMapTable('| A | B |\n| --- | --- |\n| x | y |')?.rows).toEqual([['A','B'],['x','y']]);
});
