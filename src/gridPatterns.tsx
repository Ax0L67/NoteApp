import type {CSSProperties} from 'react';

export const gridPatterns=[
  {id:'dot',name:'Точки',shape:'<circle cx="12" cy="12" r="1.2" fill="white" stroke="none"/>'},
  {id:'plus',name:'Плюсы',shape:'<path d="M9 12h6m-3-3v6"/>'},
  {id:'cross',name:'Крестики',shape:'<path d="m10 10 4 4m0-4-4 4"/>'},
  {id:'circle',name:'Круги',shape:'<circle cx="12" cy="12" r="2.5"/>'},
  {id:'square',name:'Квадраты',shape:'<rect x="9.5" y="9.5" width="5" height="5" rx=".5"/>'},
  {id:'diamond',name:'Ромбы',shape:'<path d="m12 8 4 4-4 4-4-4Z"/>'},
  {id:'triangle',name:'Треугольники',shape:'<path d="m12 9 3.5 6h-7Z"/>'},
  {id:'hexagon',name:'Шестиугольники',shape:'<path d="m10 8.5 4 0 2 3.5-2 3.5h-4L8 12Z"/>'},
  {id:'star',name:'Звёзды',shape:'<path d="m12 8 1.2 2.6 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4Z"/>'},
  {id:'asterisk',name:'Лучики',shape:'<path d="M12 8v8m-3.5-6 7 4m-7 0 7-4"/>'},
  {id:'dash',name:'Штрихи',shape:'<path d="M9 12h6"/>'},
  {id:'chevron',name:'Уголки',shape:'<path d="m9 10 3 3 3-3"/>'},
  {id:'wave',name:'Волны',shape:'<path d="M7 12q2.5-4 5 0t5 0"/>'},
  {id:'leaf',name:'Листья',shape:'<path d="M9 15c-2-5 1-7 6-6 1 5-1 8-6 6Zm0 0 5-5"/>'},
  {id:'spark',name:'Искры',shape:'<path d="m12 7 1.3 3.7L17 12l-3.7 1.3L12 17l-1.3-3.7L7 12l3.7-1.3Z"/>'},
  {id:'none',name:'Без сетки',shape:''},
];

export function gridStep(value?:string) {
  return (gridPatterns.find(pattern=>pattern.id===value)??gridPatterns[0]).id==='dot'?22:28;
}

export function gridStyle(value?:string,opacity=100):CSSProperties {
  const pattern=gridPatterns.find(pattern=>pattern.id===value)??gridPatterns[0];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">${pattern.shape}</svg>`;
  const intensity=Number.isFinite(opacity)?Math.max(0,Math.min(200,opacity)):100;
  const step=gridStep(value);
  return {'--grid-image':`url("data:image/svg+xml,${encodeURIComponent(svg)}")`,'--grid-size':`${step}px ${step}px`,'--grid-step':`${step}px`,
    '--grid-opacity':Math.min(1,intensity/100),'--grid-boost':`${Math.max(0,intensity-100)*.35}%`} as CSSProperties;
}

export function GridPicker({value,change,opacity=100,changeOpacity}:{value?:string;change:(id:string)=>void;opacity?:number;changeOpacity:(value:number)=>void}) {
  return <><div className="grid-picker" role="group" aria-label="Фоновая сетка">
    {gridPatterns.map(pattern=><button type="button" key={pattern.id} title={pattern.name} aria-label={pattern.name}
      aria-pressed={(value??'dot')===pattern.id} onClick={()=>change(pattern.id)}>
      {pattern.id==='none'?<span aria-hidden="true">—</span>:<span className="grid-preview" style={gridStyle(pattern.id)} aria-hidden="true"/>}
      <span className="grid-pattern-name" aria-hidden="true">{pattern.name}</span>
    </button>)}
  </div><label className="range-label">Видимость сетки <output>{opacity}%</output>
    <input aria-label="Видимость сетки" type="range" min="0" max="200" step="5" value={opacity} onChange={event=>changeOpacity(Number(event.target.value))}/>
  </label></>;
}
