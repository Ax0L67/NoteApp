import {useEffect,useRef,useState} from 'react';
import {FileText,Graph} from '@phosphor-icons/react';
import {ExplorerTree,itemKey,type ExplorerItem} from './Explorer';
import {folder} from './indexing';
import {referenceUrl,type ReferenceKind,type ReferenceTarget} from './noteReferences';

export default function ReferencePicker({roots,childrenOf,targets,value,kind,choose}: {
  roots:ExplorerItem[];
  childrenOf:(item:ExplorerItem)=>ExplorerItem[];
  targets:ReadonlyMap<string,ReferenceTarget>;
  value:string;
  kind?:ReferenceKind;
  choose:(url:string)=>void;
}) {
  const selected=targets.get(value);
  const tree=useRef<HTMLElement>(null);
  useEffect(()=>{
    const panel=tree.current;
    (panel?.querySelector<HTMLButtonElement>('[aria-current="location"], [aria-pressed="true"]')??
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
  const toggle=(item:ExplorerItem)=>{
    const key=itemKey(item);
    setExpanded(current=>current.includes(key)?current.filter(value=>value!==key):[...current,key]);
  };
  const noteUrl=(item:ExplorerItem)=>referenceUrl({kind:'note',path:item.path});
  return <div className="reference-picker">
    <aside ref={tree} className="reference-picker-tree" aria-label="Цели ссылки">
      {kind!=='map'&&<>
        <h3>Заметки</h3>
        <ExplorerTree roots={roots} childrenOf={childrenOf} expanded={expanded} toggle={toggle}
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
    <div className="reference-picker-selection" aria-live="polite">
      {selected?<>
        {selected.kind==='note'?<FileText size={24}/>:<Graph size={24}/>}
        <strong>{selected.name}</strong>
        <small>{selected.path}</small>
      </>:<p className="subtle">Выберите цель в дереве слева.</p>}
    </div>
  </div>;
}
