import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {DotsSixVertical} from '@phosphor-icons/react';
import {animateLayout,captureLayout} from './layoutMotion';
import {dockSides,readDockLayout,placeDockPanel,swapDockPanels,dockPanelWeight,type DockLayout,type DockPanel,type DockSide} from './dockLayout';
import {paletteId,paletteDragType,readPaletteDrop} from './appearance';
import type {PanelAppearance,Settings} from './types';

const labels={navigation:'Проекты',inspector:'Оглавление и связи'};
const sideLabels={left:'Слева',right:'Справа',top:'Сверху',bottom:'Снизу'};
type Phase='start'|'move'|'end'|'cancel';

function ResizeGrip({axis,label,value,resize,toggle}:{axis:'x'|'y';label:string;value:number;resize:(delta:number,phase:Phase)=>void;toggle?:()=>void}) {
  const gesture=useRef<{pointer:number;start:number}|null>(null);
  const coordinate=(event:React.PointerEvent)=>axis==='x'?event.clientX:event.clientY;
  return <div className={`dock-resize dock-resize-${axis}`} role="separator" tabIndex={0}
    aria-label={label} aria-orientation={axis==='x'?'vertical':'horizontal'}
    aria-valuenow={Math.round(value)}
    title={label}
    onDoubleClick={toggle}
    onPointerDown={event=>{
      if(event.button!==0)return;
      event.preventDefault();
      gesture.current={pointer:event.pointerId,start:coordinate(event)};
      event.currentTarget.setPointerCapture(event.pointerId);
      resize(0,'start');
    }}
    onPointerMove={event=>{
      const current=gesture.current;
      if(current?.pointer===event.pointerId)resize(coordinate(event)-current.start,'move');
    }}
    onPointerUp={event=>{
      const current=gesture.current;
      if(current?.pointer!==event.pointerId)return;
      gesture.current=null;
      resize(coordinate(event)-current.start,'end');
    }}
    onPointerCancel={()=>{if(gesture.current){gesture.current=null;resize(0,'cancel');}}}
    onLostPointerCapture={()=>{if(gesture.current){gesture.current=null;resize(0,'cancel');}}}
    onKeyDown={event=>{
      if(event.key==='Enter'&&toggle){event.preventDefault();toggle();return;}
      const negative=axis==='x'?'ArrowLeft':'ArrowUp',positive=axis==='x'?'ArrowRight':'ArrowDown';
      if(event.key!==negative&&event.key!==positive)return;
      event.preventDefault();
      resize(0,'start');
      resize(event.key===negative?-24:24,'end');
    }}/>;
}

export default function WorkspaceLayout({navigation,homeButton,inspector,children,layout,leftWidth,rightWidth,change,focus,palette,blend,appearances,applyPalette}:{
  navigation:ReactNode;inspector:ReactNode;children:ReactNode;layout?:DockLayout;
  homeButton:ReactNode;
  leftWidth?:number;rightWidth?:number;change:(layout:DockLayout)=>void;focus:boolean;
  palette:string;blend?:string;appearances?:Settings['panelAppearance'];applyPalette:(panel:DockPanel,value:PanelAppearance)=>void;
}) {
  const root=useRef<HTMLDivElement>(null);
  const [bounds,setBounds]=useState({width:window.innerWidth,height:window.innerHeight-64});
  const [draft,setDraft]=useState<DockLayout|null>(null);
  const [resizing,setResizing]=useState(false);
  const [dragging,setDragging]=useState<DockPanel|null>(null);
  const [target,setTarget]=useState<{side:DockSide;before?:DockPanel;swap?:DockPanel}|null>(null);
  const [paletteArriving,setPaletteArriving]=useState<DockPanel|null>(null);
  const positions=useRef(new Map<string,DOMRect>());
  const resizeStart=useRef<DockLayout|null>(null);
  const lastTop=useRef(220);
  const model=draft??readDockLayout(layout,leftWidth,rightWidth);
  const panels={navigation:focus?null:navigation,inspector:focus?null:inspector};
  const groups=Object.fromEntries(dockSides.map(side=>[side,
    model.order.filter(id=>panels[id]&&model.sides[id]===side)])) as Record<DockSide,DockPanel[]>;
  const requested=Object.fromEntries(dockSides.map(side=>[side,groups[side].length?model.sizes[side]:0])) as Record<DockSide,number>;
  const horizontal=Math.min(1,Math.max(0,bounds.width-280)/Math.max(1,requested.left+requested.right));
  const vertical=Math.min(1,Math.max(0,bounds.height-180)/Math.max(1,requested.top+requested.bottom));
  const sizes={left:requested.left*horizontal,right:requested.right*horizontal,
    top:requested.top*vertical,bottom:requested.bottom*vertical};
  if(model.sizes.top>0)lastTop.current=model.sizes.top;

  useLayoutEffect(()=>{
    const observer=new ResizeObserver(entries=>{
      const {width,height}=entries[0].contentRect;
      setBounds({width,height});
    });
    observer.observe(root.current!);
    return()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{
    animateLayout(root.current,positions.current,'[data-dock-item]');
    positions.current=new Map();
  },[model.sides.navigation,model.sides.inspector,model.order.join(',')]);

  function commit(next:DockLayout) {
    positions.current=captureLayout(root.current,'[data-dock-item]');
    change(next);
    setDraft(null);
  }
  function finishDrop() {
    if(dragging&&target)commit(target.swap?swapDockPanels(model):
      placeDockPanel(model,dragging,target.side,target.before));
    setDragging(null);
    setTarget(null);
  }
  function toggleTop() {
    change({...model,sizes:{...model.sizes,top:model.sizes.top>0?0:lastTop.current}});
  }
  function resize(side:DockSide,delta:number,phase:Phase,split=false) {
    if(phase==='start'){
      setResizing(true);
      resizeStart.current={...model,sizes:{...model.sizes,[side]:sizes[side]}};
      return;
    }
    const start=resizeStart.current;
    if(!start)return;
    if(phase==='cancel'){setDraft(null);resizeStart.current=null;setResizing(false);return;}
    let next=start;
    if(split){
      const ids=groups[side];
      if(ids.length<2)return;
      const [first,second]=ids;
      const stack=root.current?.querySelector<HTMLElement>(`[data-dock-side="${side}"] .dock-stack`);
      const rect=stack?.getBoundingClientRect();
      if(!rect)return;
      const length=side==='left'||side==='right'?rect.height:rect.width;
      const total=start.weights[first]+start.weights[second];
      const minimum=Math.min(.4,72/Math.max(1,length));
      const fraction=Math.max(minimum,Math.min(1-minimum,start.weights[first]/total+delta/Math.max(1,length)));
      next={...start,weights:{...start.weights,[first]:fraction*total,[second]:(1-fraction)*total}};
    }else{
      const sign=side==='right'||side==='bottom'?-1:1;
      const limit=side==='left'||side==='right'?bounds.width-280:bounds.height-180;
      const minimum=side==='top'?0:96;
      const size=Math.max(minimum,Math.min(Math.max(minimum,limit),start.sizes[side]+delta*sign));
      next={...start,sizes:{...start.sizes,[side]:size}};
    }
    if(phase==='end'){change(next);resizeStart.current=null;setDraft(null);setResizing(false);}
    else setDraft(next);
  }
  return <div ref={root} className={`workspace dock-workspace${focus?' focused':''}`}
    data-resizing={resizing||undefined}
    style={{gridTemplateColumns:`${sizes.left}px minmax(0,1fr) ${sizes.right}px`,
      gridTemplateRows:`${sizes.top}px minmax(0,1fr) ${sizes.bottom}px`}}
    onDragEnd={()=>{setDragging(null);setTarget(null);}}>
    <div className="dock-main" data-layout-key="editor" data-dock-item>
      {groups.top.length>0&&<div className="dock-main-top-edge">
        <ResizeGrip axis="y" value={sizes.top}
          label="Верхняя граница редактора. Потяните вверх, чтобы расширить. Двойной щелчок или Enter — свернуть верхние панели."
          resize={(delta,phase)=>resize('top',delta,phase)} toggle={toggleTop}/>
      </div>}
      {children}
    </div>
    {dockSides.map(side=>groups[side].length>0&&<div key={side} className={`dock-zone dock-zone-${side}`} data-dock-side={side}
      data-collapsed={side==='top'&&sizes.top===0||undefined}>
      {(side==='right'||side==='bottom')&&<ResizeGrip axis={side==='right'?'x':'y'} value={sizes[side]} label={`Размер панелей · ${sideLabels[side]}`} resize={(delta,phase)=>resize(side,delta,phase)}/>}
      <div className="dock-stack">
        {groups[side].map((id,index)=><div className="dock-stack-item" key={id} style={{flex:dockPanelWeight(model,id,groups[side])}}>
          {index>0&&<ResizeGrip axis={side==='left'||side==='right'?'y':'x'} value={100*model.weights[groups[side][0]]/(model.weights[groups[side][0]]+model.weights[id])} label="Соотношение размеров панелей" resize={(delta,phase)=>resize(side,delta,phase,true)}/>}
          <section className={`dock-panel glass-panel project-workspace palette-${paletteId(appearances?.[id]?.palette??palette)}`}
            data-palette-blend={appearances?.[id]?appearances[id]?.blend??'':blend??''}
            data-palette-arriving={paletteArriving===id||undefined} onAnimationEnd={event=>{if(event.target===event.currentTarget)setPaletteArriving(null);}}
            data-panel={id} data-layout-key={id} data-dock-item
            data-drop={target?.swap===id?'swap':target?.side===side&&!target.swap?
              target.before===id?'before':!target.before&&index===groups[side].length-1?'after':undefined:undefined}
            onDragOver={event=>{
              if(event.dataTransfer.types.includes(paletteDragType)){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='copy';return;}
              if(!dragging||dragging===id)return;
              event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';
              const rect=event.currentTarget.getBoundingClientRect();
              const fraction=side==='left'||side==='right'?(event.clientY-rect.top)/rect.height:(event.clientX-rect.left)/rect.width;
              const before=fraction<.5?id:groups[side][index+1];
              setTarget(fraction>.33&&fraction<.67?{side,swap:id}:{side,before});
            }}
            onDropCapture={event=>{
              if(event.dataTransfer.types.includes(paletteDragType)){
                event.preventDefault();event.stopPropagation();
                const value=readPaletteDrop(event.dataTransfer.getData(paletteDragType));
                if(value){applyPalette(id,value);setPaletteArriving(id);}
              }
            }}
            onDrop={event=>{if(dragging){event.preventDefault();event.stopPropagation();finishDrop();}}}>
            <header className="dock-panel-heading">
              {id==='navigation'&&homeButton}
              <button type="button" className="dock-drag-handle" draggable title="Перетащить панель. По краям другой панели — объединить, по центру — поменять местами. С клавиатуры: пробел, стрелка, Enter."
                aria-label={`Переместить панель «${labels[id]}»`}
                aria-pressed={dragging===id}
                onKeyDown={event=>{
                  if(event.key==='Escape'&&dragging===id){
                    event.preventDefault();event.stopPropagation();setDragging(null);setTarget(null);return;
                  }
                  if(event.key===' '||event.key==='Enter'){
                    event.preventDefault();
                    if(dragging===id)finishDrop();
                    else {setDragging(id);setTarget({side});}
                    return;
                  }
                  if(dragging!==id)return;
                  const direction:Record<string,DockSide>={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'top',ArrowDown:'bottom'};
                  const destination=direction[event.key];
                  if(destination){event.preventDefault();setTarget({side:destination});}
                }}
                onDragStart={event=>{
                  event.dataTransfer.setData('application/x-noteapp-panel',id);
                  event.dataTransfer.effectAllowed='move';
                  setDragging(id);
                }}><DotsSixVertical size={17}/><span>{labels[id]}</span></button>
            </header>
            <div className="dock-panel-body">{panels[id]}</div>
          </section>
        </div>)}
      </div>
      {(side==='left'||side==='top')&&<ResizeGrip axis={side==='left'?'x':'y'} value={sizes[side]} label={`Размер панелей · ${sideLabels[side]}`} resize={(delta,phase)=>resize(side,delta,phase)}/>}
    </div>)}
    {dragging&&<div className="dock-drop-overlay" aria-hidden="true">
      {dockSides.map(side=><div key={side} className={`dock-drop-edge dock-drop-${side}`} data-active={target?.side===side&&!target.swap||undefined}
        onDragOver={event=>{
          event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';
          setTarget({side});
        }}
        onDrop={event=>{event.preventDefault();event.stopPropagation();finishDrop();}}>
        {side==='bottom'?'Разместить снизу':sideLabels[side]}
      </div>)}
    </div>}
  </div>;
}
