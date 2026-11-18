import type {TaskBoard} from './types';

export const kanbanNoteContent=(board:TaskBoard|string)=>typeof board==='string'?`<!-- noteapp-kanban:${board} -->`:`<!-- noteapp-kanban:${board.id} -->\n${JSON.stringify(board,null,2)}`;
export const kanbanNoteId=(content:string)=>/^<!-- noteapp-kanban:([\w-]+) -->(?:\s*|\s*\n\{[\s\S]*\}\s*)$/.exec(content)?.[1];

export function kanbanNoteBoard(content:string):TaskBoard|undefined {
 const id=kanbanNoteId(content),start=content.indexOf('\n');
 if(!id||start<0)return;
 try {
  const board=JSON.parse(content.slice(start+1));
  const record=(value:unknown)=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const strings=(value:unknown)=>Array.isArray(value)&&value.every(item=>typeof item==='string');
  const stringRecord=(value:unknown)=>record(value)&&Object.values(value as Record<string,unknown>).every(item=>typeof item==='string');
  if(!record(board)||board.id!==id||typeof board.name!=='string'||typeof board.project!=='string'||!strings(board.columns)||!Array.isArray(board.tasks)||!board.tasks.every((task:any)=>record(task)&&typeof task.id==='string'&&typeof task.title==='string'&&typeof task.description==='string'&&typeof task.status==='string'&&['low','normal','high'].includes(task.priority)&&strings(task.notes)&&(task.due===undefined||typeof task.due==='string')&&(task.tags===undefined||strings(task.tags))&&(task.checklist===undefined||Array.isArray(task.checklist)&&task.checklist.every((item:any)=>record(item)&&typeof item.id==='string'&&typeof item.text==='string'&&typeof item.done==='boolean'))))return;
  if((board.hiddenColumns!==undefined&&!strings(board.hiddenColumns))||(board.compact!==undefined&&typeof board.compact!=='boolean')||(board.palette!==undefined&&typeof board.palette!=='string')||(board.columnColors!==undefined&&!stringRecord(board.columnColors))||(board.columnAliases!==undefined&&!stringRecord(board.columnAliases))||(board.columnIds!==undefined&&!stringRecord(board.columnIds)))return;
  return board as TaskBoard;
 }catch{return;}
}
