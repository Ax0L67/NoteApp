import type {Note} from './types';
import type {ExplorerItem} from './Explorer';

export function search(notes:Note[],query:string,items:ExplorerItem[]) {
  const canvasText=(content:string)=>{try{const widgets=JSON.parse(content).widgets;return Array.isArray(widgets)?widgets.map(widget=>typeof widget?.text==='string'?widget.text:'').join(' '):''}catch{return ''}};
  const q=query.trim().toLocaleLowerCase(),contents=new Map(notes.map(note=>[note.path,note.path.endsWith('.canvas')?canvasText(note.content):note.content]));
  return items.map(item=>{
    const content=item.kind==='note'?contents.get(item.path)??'':'';
    const index=content.toLocaleLowerCase().indexOf(q),name=item.name.toLocaleLowerCase();
    const score=name===q?4:name.includes(q)?3:item.path.toLocaleLowerCase().includes(q)?2:content&&index>=0?1:0;
    return {item,score,snippet:content.slice(Math.max(0,index-45),Math.max(0,index-45)+180).replace(/\n/g,' ')};
  }).filter(result=>!q||result.score>0).sort((a,b)=>b.score-a.score||a.item.name.localeCompare(b.item.name,'ru')||a.item.path.localeCompare(b.item.path,'ru'));
}
