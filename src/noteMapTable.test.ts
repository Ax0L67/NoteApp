import {describe,expect,it} from 'vitest';
import {standaloneMapTable} from './noteTables';

describe('map table parsing',()=>{
  it('accepts a single-column table with saved metadata',()=>{
    const source='<!-- noteapp-table widths=100 palettes= x=0 y=0 w=720 h=320 z=2 -->\n| Name |\n| :--- |\n| Text |';
    expect(standaloneMapTable(source)?.rows).toEqual([['Name'],['Text']]);
  });
  it('does not treat a mixed note as a standalone table',()=>{
    expect(standaloneMapTable('| Name | Value |\n| :--- | :--- |\nOther text')).toBeNull();
  });
});
