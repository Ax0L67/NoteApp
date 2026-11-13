import {describe,it,expect} from 'vitest';
import {search} from './search';
import type {ExplorerItem} from './Explorer';

const items:ExplorerItem[]=[
  {kind:'project',project:'Учёба',path:'Учёба',name:'Учёба'},
  {kind:'folder',project:'Учёба',path:'Учёба/Практика',name:'Практика'},
  {kind:'folder',project:'Личное',path:'Практика',name:'Практика'},
  {kind:'note',project:'Учёба',path:'Учёба/Практика/Память.md',name:'Память'},
];
const notes=[{path:items[3].path,content:'Интервалы помогают запоминать.',revision:'1'}];
describe('Поиск по хранилищу',()=>{
  it('находит проекты и папки без заметок и различает одинаковые имена',()=>{
    expect(search(notes,' УЧЁБА ',items)[0].item.kind).toBe('project');
    expect(search(notes,'практика',items).filter(result=>result.item.kind==='folder')).toHaveLength(2);
  });
  it('сохраняет поиск по тексту заметок и находит вложенные пути',()=>{
    expect(search(notes,'интервалы',items)[0].snippet).toContain('Интервалы');
    expect(search(notes,'Учёба/Практика',items)).toHaveLength(2);
    expect(search(notes,'несуществующее',items)).toEqual([]);
  });
  it('при пустом запросе показывает все доступные объекты',()=>{
    expect(search(notes,'',items)).toHaveLength(items.length);
  });
});
