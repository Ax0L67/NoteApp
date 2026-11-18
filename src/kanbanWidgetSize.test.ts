import {describe,expect,it} from 'vitest';
import {kanbanWidgetSize} from './kanbanWidgetSize';
import type {TaskBoard} from './types';

describe('размер виджета Kanban',()=>{
  it('учитывает выбранную часть доски и содержимое карточек',()=>{
    const board:TaskBoard={id:'b',name:'Доска',project:'p',columns:['A','B'],columnIds:{A:'a'},tasks:[{id:'t',title:'Задача',description:'Описание',status:'A',priority:'normal',notes:[],checklist:[{id:'c',text:'Пункт',done:false}]}]};
    expect(kanbanWidgetSize(board)[0]).toBeGreaterThan(kanbanWidgetSize(board,'a')[0]);
    expect(kanbanWidgetSize(board,'a')[1]).toBeGreaterThan(kanbanWidgetSize(board,'B')[1]);
    expect(kanbanWidgetSize(board,undefined,'t')[0]).toBe(kanbanWidgetSize(board,'a')[0]);
  });
});
