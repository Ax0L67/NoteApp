import {describe,expect,it} from 'vitest';
import {standaloneMapTable,readingWidgetTables} from './noteTables';

describe('map table parsing',()=>{
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
  expect(readingWidgetTables(source)).toContain('\x60\x60\x60noteapp-widget-12-34-w320-h160-z2-tt\n| Name |');
});
it('does not transform examples inside fenced code',()=>{
  const source='\x60\x60\x60\x60md\n<!-- noteapp-table widths=100 x=12 y=34 w=320 h=160 z=2 -->\n| Name |\n| :--- |\n\x60\x60\x60\x60';
  expect(readingWidgetTables(source)).toBe(source);
});
