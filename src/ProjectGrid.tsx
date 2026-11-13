import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';

function moved(order: string[], name: string, index: number) {
  const next=order.filter(project=>project!==name);
  next.splice(index,0,name);
  return next;
}

export default function ProjectGrid({projects, renderCard, saveOrder}: {
  projects: string[];
  renderCard: (name: string) => ReactNode;
  saveOrder: (order: string[]) => void;
}) {
  const grid=useRef<HTMLDivElement>(null);
  const drag=useRef<{name:string;order:string[]}|null>(null);
  const previousPositions=useRef(new Map<string,DOMRect>());
  const [preview,setPreview]=useState<string[]|null>(null);
  const order=preview??projects;

  function cards() {
    return Array.from(grid.current!.querySelectorAll<HTMLElement>('[data-project-slot]'));
  }
  function capturePositions() {
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    previousPositions.current=new Map(cards().map(slot=>[slot.dataset.projectSlot!,slot.firstElementChild!.getBoundingClientRect()]));
  }
  useLayoutEffect(()=>{
    const previous=previousPositions.current;
    if(!previous.size)return;
    previousPositions.current=new Map();
    for(const slot of cards()){
      const before=previous.get(slot.dataset.projectSlot!);
      if(!before)continue;
      const card=slot.firstElementChild!;
      for(const animation of card.getAnimations())if(animation.id==='project-reorder')animation.cancel();
      const after=card.getBoundingClientRect();
      const x=before.left-after.left, y=before.top-after.top;
      if(x||y)card.animate([{translate:`${x}px ${y}px`},{translate:'0 0'}],{
        id:'project-reorder',duration:230,easing:'cubic-bezier(.2,.75,.25,1)',
      });
    }
  },[order]);

  function finish(save: boolean) {
    const current=drag.current;
    if(!current)return;
    capturePositions();
    drag.current=null;
    setPreview(null);
    if(save&&current.order!==projects)saveOrder(current.order);
  }

  return <div className="project-grid" ref={grid}
    onDragOver={event=>{
      const current=drag.current;
      if(!current)return;
      event.preventDefault();
      event.dataTransfer.dropEffect='move';
      if(current.order!==order)return;
      const target=cards().find(slot=>{
        const {left,right,top,bottom}=slot.getBoundingClientRect();
        return event.clientX>=left&&event.clientX<=right&&event.clientY>=top&&event.clientY<=bottom;
      })?.dataset.projectSlot;
      if(!target||target===current.name)return;
      const index=current.order.indexOf(target);
      if(index<0)return;
      capturePositions();
      current.order=moved(current.order,current.name,index);
      setPreview(current.order);
    }}
    onDrop={event=>{
      if(!drag.current)return;
      event.preventDefault();
      finish(true);
    }}>
    {order.map((name,index)=><div key={name} className="project-slot" data-project-slot={name}
      data-reordering={drag.current?.name===name||undefined} draggable={projects.length>1}
      onDragStart={event=>{
        if(event.target!==event.currentTarget){event.preventDefault();return;}
        event.dataTransfer.setData('application/x-noteapp-project',name);
        event.dataTransfer.effectAllowed='move';
        drag.current={name,order:projects};
        setPreview(projects);
      }}
      onDragEnd={()=>finish(false)}
      onKeyDown={event=>{
        if(event.target!==event.currentTarget.querySelector('.project-open')||!event.shiftKey||event.altKey||
          !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
        event.preventDefault();
        const next=index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1);
        if(next<0||next>=order.length)return;
        capturePositions();
        saveOrder(moved(order,name,next));
      }}>{renderCard(name)}</div>)}
  </div>;
}
