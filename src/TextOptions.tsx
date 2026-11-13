import type {TextAppearance} from './types';

export function textAppearanceStyle({lineHeight,textColor}:TextAppearance={}) {
  return {'--note-line-height':lineHeight,'--note-text-color':textColor};
}

export default function TextOptions({value,change}: {
  value?:TextAppearance;
  change:(patch:TextAppearance)=>void;
}) {
  return <>
    <select className="font-picker" aria-label="Межстрочный интервал" title="Межстрочный интервал"
      value={value?.lineHeight??''} onChange={event=>change({lineHeight:Number(event.target.value)||undefined})}>
      <option value="">Межстрочный</option>
      {[1,1.25,1.5,1.65,1.85,2,2.5,3].map(size=><option key={size} value={size}>{String(size).replace('.',',')}</option>)}
    </select>
    {value?.textColor&&<button type="button" className="ribbon-action" onClick={()=>change({textColor:undefined})}>Сбросить цвет</button>}
  </>;
}
