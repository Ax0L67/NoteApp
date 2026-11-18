import {describe,expect,it} from 'vitest';
import {moveColumn,moveTask,resolveTaskBoardColumn} from './TaskBoards';
import type {Task,TaskBoard} from './types';

const task=(id:string,status:string):Task=>({id,status,title:id,description:'',priority:'normal',notes:[]});
it('reorders columns without changing their identifiers',()=>{
  const columns=['one','two','three'];
  expect(moveColumn(columns,'one','three',true)).toEqual(['two','three','one']);
  expect(moveColumn(columns,'three','one')).toEqual(['three','one','two']);
  expect(moveColumn(columns,'missing','one')).toBe(columns);
  expect(columns).toEqual(['one','two','three']);
});
describe('moveTask',()=>{
  it('moves a task before another task and preserves the original list',()=>{
    const tasks=[task('a','todo'),task('b','doing'),task('c','doing')];
    const result=moveTask(tasks,'a','doing','c');
    expect(result.map(item=>item.id)).toEqual(['b','a','c']);
    expect(result[1].status).toBe('doing');
    expect(tasks[0].status).toBe('todo');
  });
  it('appends to an empty column and ignores unknown tasks',()=>{
    const tasks=[task('a','todo'),task('b','todo')];
    expect(moveTask(tasks,'a','done').map(item=>[item.id,item.status])).toEqual([['b','todo'],['a','done']]);
    expect(moveTask(tasks,'missing','done')).toBe(tasks);
  });
});

it('keeps a column reference stable when its old name is reused',()=>{
  const board:TaskBoard={id:'board',name:'Board',project:'',columns:['New','Old'],tasks:[],columnIds:{New:'first-id',Old:'second-id'},columnAliases:{Old:'New'}};
  expect(resolveTaskBoardColumn(board,'first-id')).toBe('New');
  expect(resolveTaskBoardColumn(board,'second-id')).toBe('Old');
  expect(resolveTaskBoardColumn(board,'Old')).toBe('Old');
  expect(resolveTaskBoardColumn(board,'missing')).toBeUndefined();
});
