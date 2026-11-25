import {useEffect,useRef,useState} from 'react';
import {FileText,Graph} from '@phosphor-icons/react';
import {ObjectIcon} from './ObjectIcon';
import {ExplorerTree,itemKey,type ExplorerItem} from './Explorer';
import {folder} from './indexing';
import {referenceUrl,type ReferenceKind,type ReferenceTarget} from './noteReferences';

export default function ReferencePicker({roots,childrenOf,targets,value,kind,choose,icons,excludePath,onlyMarkdown=false}: {
  roots:ExplorerItem[];
  childrenOf:(item:ExplorerItem)=>ExplorerItem[];
  targets:ReadonlyMap<string,ReferenceTarget>;
  value:string;
  kind?:ReferenceKind;
  choose:(url:string)=>void;
  icons?:Record<string,string>;
  excludePath?:string;onlyMarkdown?:boolean;
}) {
  const selected=targets.get(value);
  const tree=useRef<HTMLElement>(null);
  useEffect(()=>{
    const panel=tree.current;
    (panel?.querySelector<HTMLInputElement>('input[type="search"]')??panel?.querySelector<HTMLButtonElement>('[aria-current="location"], [aria-pressed="true"]')??
      panel?.querySelector<HTMLButtonElement>('button'))?.focus();
  },[]);
  const [expanded,setExpanded]=useState(()=>{
    const keys=roots.map(itemKey);
    if(selected?.kind==='note'){
      const root=roots.filter(item=>!item.path||selected.path.startsWith(item.path+'/'))
        .sort((a,b)=>b.path.length-a.path.length)[0];
      if(root)for(let path=folder(selected.path);path&&path!==root.path;path=folder(path)){
        keys.push(itemKey({kind:'folder',project:root.project,path,name:''}));
      }
    }
    return keys;
  });
  const [query,setQuery]=useState('');
  const toggle=(item:ExplorerItem)=>{
    const key=itemKey(item);
    setExpanded(current=>current.includes(key)?current.filter(value=>value!==key):[...current,key]);
  };
  const noteUrl=(item:ExplorerItem)=>referenceUrl({kind:'note',path:item.path});
  const allowed=(item:ExplorerItem)=>item.kind!=='note'||(item.path!==excludePath&&(!onlyMarkdown||!item.path.endsWith('.canvas')));
  const term=query.trim().toLocaleLowerCase();
  const matches=(item:ExplorerItem):boolean=>allowed(item)&&(item.kind==='note'?(!term||`${item.name} ${item.path}`.toLocaleLowerCase().includes(term)):childrenOf(item).some(matches));
  const filteredChildren=(item:ExplorerItem)=>childrenOf(item).filter(matches);
  const searchExpanded:string[]=[];
  const collect=(item:ExplorerItem)=>{if(item.kind==='note')return;searchExpanded.push(itemKey(item));filteredChildren(item).forEach(collect)};
  if(term)roots.filter(matches).forEach(collect);
  return <div className={`reference-picker${onlyMarkdown?' reference-picker-instant':''}`}>
    <aside ref={tree} className="reference-picker-tree" aria-label="Цели ссылки">
      {kind!=='map'&&<>
        <h3>Заметки</h3>
        <input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Поиск заметок" aria-label="Поиск заметок"/>
        <ExplorerTree roots={roots.filter(matches)} childrenOf={filteredChildren} expanded={term?searchExpanded:expanded} toggle={toggle} icons={icons}
          active={item=>item.kind==='note'&&noteUrl(item)===value}
          open={item=>item.kind==='note'?choose(noteUrl(item)):toggle(item)}/>
      </>}
      {kind!=='note'&&<>
        <h3>Карты связей</h3>
        {[...targets].filter(([,target])=>target.kind==='map').map(([url,target])=>
          <button key={url} type="button" className="reference-map-option" aria-pressed={url===value}
            onClick={()=>choose(url)}><Graph size={17}/>{target.path}</button>)}
      </>}
    </aside>
    {!onlyMarkdown&&<div className="reference-picker-selection" aria-live="polite">
      {selected?<>
        {selected.kind==='note'?<ObjectIcon item={{kind:'note',path:selected.path}} icons={icons} size={24}/>:<Graph size={24}/>}
        <strong>{selected.name}</strong>
        <small>{selected.path}</small>
      </>:<p className="subtle">Выберите цель в дереве слева.</p>}
    </div>}
  </div>;
}
