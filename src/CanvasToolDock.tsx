import {useState} from 'react';
import {Cursor,Hand,FrameCorners,Shapes,LineSegment,TextT,ChatCircle,SquaresFour,PencilSimple} from '@phosphor-icons/react';
import {canvasShapes} from './CanvasShapes';
import './canvasToolDock.css';

export type CanvasDockTool='select'|'pan'|'line'|'curve'|'eraser'|'pen'|'marker'|'pencil'|'calligraphy'|'watercolor'|'neon'|'dotted';

export default function CanvasToolDock({tool,brushOpen,placementKind,onTool,onBrush,onFrame,onText,onComment,onShape}:{
 tool:CanvasDockTool;brushOpen:boolean;placementKind?:'frame'|'shape'|'text'|'comment';onTool:(tool:CanvasDockTool)=>void;onBrush:()=>void;
 onFrame:()=>void;onText:()=>void;onComment:()=>void;onShape:(name:string)=>void;
}) {
 const [menu,setMenu]=useState<'interaction'|'shapes'|'line'|null>(null);
 const drawing=brushOpen||!['select','pan'].includes(tool);
 const chooseInteraction=(next:'select'|'pan')=>{if(brushOpen)onBrush();onTool(next);setMenu(null)};
 return <div className="canvas-tool-dock-wrap" onPointerDown={event=>event.stopPropagation()}>
  <div className="canvas-tool-dock" role="toolbar" aria-label="Инструменты полотна" onKeyDown={event=>{if(event.key==='Escape')setMenu(null)}}>
   <div className="canvas-dock-menu" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setMenu(null)}}>
    <button type="button" aria-label="Выбор взаимодействия" title="Выбор взаимодействия" aria-expanded={menu==='interaction'} onClick={()=>setMenu(menu==='interaction'?null:'interaction')}>{tool==='pan'?<Hand size={18}/>:<Cursor size={18}/>}<span className="canvas-dock-chevron">⌄</span></button>
    {menu==='interaction'&&<div className="canvas-dock-popover" role="menu"><button type="button" role="menuitemradio" aria-checked={tool==='select'} onClick={()=>chooseInteraction('select')}><Cursor size={17}/>Выбор</button><button type="button" role="menuitemradio" aria-checked={tool==='pan'} onClick={()=>chooseInteraction('pan')}><Hand size={17}/>Перемещение</button></div>}
   </div>
   <button type="button" aria-label="Создать Frame" aria-pressed={placementKind==='frame'} title="Создать Frame · Ctrl отключает привязку, Shift сохраняет квадрат" onClick={onFrame}><FrameCorners size={19}/></button>
   <div className="canvas-dock-menu" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setMenu(null)}}>
    <button type="button" aria-label="Фигуры" title="Фигуры" aria-pressed={placementKind==='shape'} aria-expanded={menu==='shapes'} onClick={()=>setMenu(menu==='shapes'?null:'shapes')}><Shapes size={19}/><span className="canvas-dock-chevron">⌄</span></button>
    {menu==='shapes'&&<div className="canvas-dock-shapes" role="menu" aria-label="Выбор фигуры">{Object.entries(canvasShapes).map(([name,path])=><button type="button" role="menuitem" key={name} title={name} aria-label={name} onClick={()=>{onShape(name);setMenu(null)}}><svg viewBox="0 0 100 100" aria-hidden="true"><path d={path}/></svg><span>{name}</span></button>)}</div>}
   </div>
   <div className="canvas-dock-menu" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setMenu(null)}}><button type="button" aria-label="Линии" title="Рисование линий" aria-expanded={menu==='line'} aria-pressed={tool==='line'||tool==='curve'} onClick={()=>setMenu(menu==='line'?null:'line')}><LineSegment size={19}/><span className="canvas-dock-chevron">⌄</span></button>{menu==='line'&&<div className="canvas-dock-popover" role="menu"><button type="button" role="menuitemradio" aria-checked={tool==='line'} onClick={()=>{onTool('line');setMenu(null)}}>Прямая с направляющими</button><button type="button" role="menuitemradio" aria-checked={tool==='curve'} onClick={()=>{onTool('curve');setMenu(null)}}>Кривая с направляющими</button></div>}</div>
   <button type="button" aria-label="Добавить текст" aria-pressed={placementKind==='text'} title="Добавить текст" onClick={onText}><TextT size={19}/></button>
   <button type="button" aria-label="Добавить комментарий" aria-pressed={placementKind==='comment'} title="Добавить комментарий" onClick={onComment}><ChatCircle size={19}/></button>
   <span className="canvas-dock-divider"/>
   <button type="button" aria-label="Режим дизайна" title="Режим дизайна" aria-pressed={!drawing} onClick={()=>{if(brushOpen)onBrush();onTool('select')}}><SquaresFour size={18}/></button>
   <button type="button" aria-label="Режим рисования" title="Кисти и цвета" aria-pressed={drawing} aria-expanded={brushOpen} onClick={onBrush}><PencilSimple size={18}/></button>
  </div>
 </div>;
}
