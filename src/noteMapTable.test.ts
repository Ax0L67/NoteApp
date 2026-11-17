import {describe,expect,it} from 'vitest';
import {standaloneMapTable,readingWidgetTables} from './noteTables';

describe('map table parsing',()=>{
  it('accepts the new empty 2×2 grid',()=>{
    expect(standaloneMapTable('|  |  |\n| :--- | :--- |\n|   |   |')?.rows).toEqual([['',''],['','']]);
  });
  it('accepts a single-column table with saved metadata',()=>{
    const source='<!-- noteapp-table widths=100 palettes= x=0 y=0 w=720 h=320 z=2 -->\n| Name |\n| :--- |\n| Text |';
    expect(standaloneMapTable(source)?.rows).toEqual([['Name'],['Text']]);
  });
  it('does not treat a mixed note as a standalone table',()=>{
    expect(standaloneMapTable('| Name | Value |\n| :--- | :--- |\nOther text')).toBeNull();
  });
});

it('keeps a floating table positioned in reading mode',()=>{
  const source='<!-- noteapp-table widths=100 x=12 y=34 w=320 h=160 z=2 -->\n| Name |\n| :--- |\n| Text |';
  expect(readingWidgetTables(source)).toContain('\x60\x60\x60noteapp-widget-12-34-w320-h160-z2-tt\n<!-- noteapp-table widths=100 x=12 y=34 w=320 h=160 z=2 -->\n| Name |');
});
it('does not transform examples inside fenced code',()=>{
  const source='\x60\x60\x60\x60md\n<!-- noteapp-table widths=100 x=12 y=34 w=320 h=160 z=2 -->\n| Name |\n| :--- |\n\x60\x60\x60\x60';
  expect(readingWidgetTables(source)).toBe(source);
});

it('preserves saved column widths and row heights in reading data',()=>{
 const source='<!-- noteapp-table widths=35,65 heights=48,80 x=12 y=34 w=320 h=160 z=2 -->\n| A | B |\n| --- | --- |\n| C | D |';
 const read=readingWidgetTables(source);
 const body=read.split('\n').slice(1,-1).join('\n');
 expect(standaloneMapTable(body)).toMatchObject({widths:[35,65],heights:[48,80]});
});

it('retains per-cell formatting and escaped pipes when parsing a table',()=>{
 const source='<!-- noteapp-table widths=100 x=0 y=0 w=320 h=160 z=2 -->\n| <span data-note-size="24">Large</span> |\n| --- |\n| left \\| right |';
 expect(standaloneMapTable(source)?.rows).toEqual([['<span data-note-size="24">Large</span>'],['left | right']]);
});

it('renders saved cell font size in reading mode',async()=>{
 const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');const {ReadingTable}=await import('./noteTables');
 const source='<!-- noteapp-table widths=100 x=0 y=0 w=320 h=160 z=2 -->\n| <span data-note-size="24">Large</span> |\n| --- |\n| Text |';
 const html=renderToStaticMarkup(React.createElement(ReadingTable,{source}));
 expect(html).toContain('font-size:24px');expect(html).toContain('Large');
});
