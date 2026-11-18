import type {Task,TaskBoard} from './types';

function cardHeight(task:Task) {
  const lines=(text:string)=>text.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/26)),0);
  return 48+lines(task.title)*18+(task.description?lines(task.description)*17:0)+(task.tags?.length?24:0)+(task.checklist??[]).reduce((sum,item)=>sum+lines(item.text)*18,0)+(task.notes.length?26:0);
}

export function kanbanWidgetSize(board:TaskBoard|undefined,column?:string,taskId?:string):[number,number] {
  if(!board)return [300,200];
  const selected=column&&(Object.entries(board.columnIds??{}).find(([,id])=>id===column)?.[0]??(board.columns.includes(column)?column:board.columnAliases?.[column]??column));
  const columns=taskId?[board.tasks.find(task=>task.id===taskId)?.status].filter((value):value is string=>!!value):selected?[selected]:board.columns;
  const height=Math.max(120,...columns.map(status=>{
    const tasks=board.tasks.filter(task=>task.status===status&&(!taskId||task.id===taskId));
    return (taskId?20:98)+tasks.reduce((sum,task)=>sum+cardHeight(task)+8,0);
  }));
  return [Math.min(1600,Math.max(280,columns.length*260+40)),Math.min(1200,height+44)];
}
