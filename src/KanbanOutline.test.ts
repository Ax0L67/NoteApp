import {describe,expect,it} from 'vitest';
import {kanbanOutlineColumns} from './KanbanOutline';
import type {TaskBoard} from './types';

const board:TaskBoard={id:'board',name:'Доска',project:'',columns:['В работе','Готово'],tasks:[
 {id:'a',title:'Задача',description:'Описание',priority:'normal',status:'В работе',notes:[],checklist:[{id:'c',text:'Проверить',done:false}]},
 {id:'b',title:'Другое',description:'',priority:'normal',status:'Готово',notes:[]},
]};
describe('оглавление Kanban',()=>{
 it('находит пункты задач и сортирует без изменения доски',()=>{
  expect(kanbanOutlineColumns(board,'order','проверить').map(column=>column.tasks.map(task=>task.id))).toEqual([['a']]);
  expect(kanbanOutlineColumns(board,'reverse','').map(column=>column.name)).toEqual(['Готово','В работе']);
  expect(board.columns).toEqual(['В работе','Готово']);
 });
});
