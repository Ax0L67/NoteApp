import {useState,type ReactNode} from 'react';
import {Gear,Palette,Sliders,TextT,Keyboard,Folder,ArrowCounterClockwise} from '@phosphor-icons/react';
import type {Settings} from './types';
import {shortcutActions,shortcutBinding,shortcutLabel} from './shortcuts';
import FontPicker from './FontPicker';

const categories=[{id:'general',label:'Общее',Icon:Gear},{id:'appearance',label:'Оформление',Icon:Palette},{id:'interface',label:'Интерфейс',Icon:Sliders},{id:'editor',label:'Редактор',Icon:TextT},{id:'shortcuts',label:'Горячие клавиши',Icon:Keyboard},{id:'storage',label:'Хранилище',Icon:Folder}] as const;
export default function SettingsPanel({settings,update,appearance,storage}:{settings:Settings;update:(patch:Partial<Settings>)=>void;appearance:ReactNode;storage:ReactNode}){
  const [category,setCategory]=useState<typeof categories[number]['id']>('general');
  const [error,setError]=useState('');
  return <div className="settings-layout"><div className="settings-category-content">
    {category==='general'&&<section><h3>Общее</h3><p className="subtle">Заметки сохраняются автоматически в выбранном хранилище. Несохранённые изменения восстанавливаются из локальных черновиков.</p><p className="subtle">Можно открыть до восьми независимых центральных окон. Новое окно копирует вкладки исходного окна.</p></section>}
    {category==='appearance'&&<section><h3>Оформление</h3>{appearance}</section>}
    {category==='interface'&&<section><h3>Интерфейс</h3>
      <label className="range-label">Яркость обводки <output>{settings.borderBrightness??50}%</output><input aria-label="Яркость обводки" type="range" min="0" max="100" value={settings.borderBrightness??50} onChange={event=>update({borderBrightness:Number(event.target.value)})}/></label>
      <label className="range-label">Контраст интерфейса <output>{settings.contrast??100}%</output><input type="range" min="70" max="140" value={settings.contrast??100} onChange={event=>update({contrast:Number(event.target.value)})}/></label>
      <label className="range-label">Размер шрифта интерфейса <output>{settings.uiFontSize??16} px</output><input type="range" min="13" max="24" value={settings.uiFontSize??16} onChange={event=>update({uiFontSize:Number(event.target.value)})}/></label>
    </section>}
    {category==='editor'&&<section><h3>Редактор</h3><label>Шрифт заметок<FontPicker value={settings.fontFamily} change={fontFamily=>update({fontFamily})}/></label>
      <label className="range-label">Размер текста <output>{settings.fontSize??16} px</output><input type="range" min="12" max="36" value={settings.fontSize??16} onChange={event=>update({fontSize:Number(event.target.value)})}/></label>
      <label className="range-label">Ширина текста <output>{settings.textWidth??810} px</output><input type="range" min="400" max="1400" step="10" value={settings.textWidth??810} onChange={event=>update({textWidth:Number(event.target.value)})}/></label>
      <p className="subtle">Масштаб заметки меняется кнопками − / + в редакторе. Изображения и текстовые блоки перемещаются по сетке.</p>
    </section>}
    {category==='shortcuts'&&<section><h3>Горячие клавиши</h3><p className="subtle">Нажмите на сочетание и введите новое с Ctrl / ⌘ или Alt, без Shift.</p>
      <div className="editable-shortcuts">{shortcutActions.map(action=>{const binding=settings.shortcuts?.[action.id]??action.binding;return <label key={action.id}><span>{action.label}</span><input readOnly aria-label={`Сочетание: ${action.label}`} value={shortcutLabel(binding)} onKeyDown={event=>{
        event.preventDefault();event.stopPropagation();if(event.key==='Escape'){event.currentTarget.blur();return;}
        const next=shortcutBinding(event.nativeEvent);if(!next){setError('Используйте Ctrl / ⌘ или Alt без Shift.');return;}
        const conflict=shortcutActions.find(other=>other.id!==action.id&&(settings.shortcuts?.[other.id]??other.binding)===next);
        if(conflict){setError(`Это сочетание уже выполняет действие «${conflict.label}».`);return;}
        if(next==='Alt+F4'){setError('Alt + F4 зарезервировано для закрытия приложения.');return;}
        setError('');update({shortcuts:{...settings.shortcuts,[action.id]:next}});event.currentTarget.blur();
      }}/></label>;})}</div>{error&&<p className="modal-error" role="alert">{error}</p>}
      <button onClick={()=>{update({shortcuts:undefined});setError('');}}><ArrowCounterClockwise size={18}/>Восстановить сочетания</button>
    </section>}
    {category==='storage'&&<section><h3>Хранилище и сохранность</h3>{storage}</section>}
  </div><nav className="settings-categories" aria-label="Категории настроек">{categories.map(({id,label,Icon})=><button key={id} aria-current={category===id?'page':undefined} onClick={()=>{setCategory(id);setError('');}}><Icon size={20}/><span>{label}</span></button>)}</nav></div>;
}
