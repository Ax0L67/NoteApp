import {describe,expect,it} from 'vitest';
import {kanbanNoteBoard,kanbanNoteContent,kanbanNoteId} from './kanbanNote';

describe('Kanban notes',()=>{
  it('recognizes only a complete board marker',()=>{
    expect(kanbanNoteId(kanbanNoteContent('board-1'))).toBe('board-1');
    expect(kanbanNoteId('Text\n'+kanbanNoteContent('board-1'))).toBeUndefined();
  });
  it('keeps board data in the note and rejects damaged data',()=>{
    const board={id:'board-1',name:'Доска',project:'Личное',columns:['Новые'],tasks:[{id:'task-1',title:'Задача',description:'',status:'Новые',priority:'normal' as const,notes:[],tags:['важно'],checklist:[{id:'check-1',text:'Пункт',done:true}]}]};
    const content=kanbanNoteContent(board);
    expect(kanbanNoteId(content)).toBe(board.id);
    expect(kanbanNoteBoard(content)).toEqual(board);
    expect(kanbanNoteBoard(kanbanNoteContent({...board,id:'board-2'}).replace('kanban:board-2','kanban:board-1'))).toBeUndefined();
    expect(kanbanNoteBoard('<!-- noteapp-kanban:board-1 -->\n{"id":"board-1"}')).toBeUndefined();
    expect(kanbanNoteBoard(kanbanNoteContent('board-1'))).toBeUndefined();
  });
});
