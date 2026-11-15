import {useState,type ReactNode} from 'react';
import {Gear,Palette,Monitor,PencilSimple,Keyboard,Folder,ArrowCounterClockwise,MagnifyingGlass} from '@phosphor-icons/react';
import type {Settings} from './types';
import {shortcutActions,shortcutBinding,shortcutLabel} from './shortcuts';
import FontPicker from './FontPicker';
import {englishLabel} from './localization';

const interfaceThemes=[["graphite","Графит","По умолчанию · нейтральный серый"],["nord","Nord","Лёд, сталь и голубые акценты"],["gruvbox","Gruvbox","Тёплый уголь, песок и охра"],["everforest","Everforest","Лесные оттенки и мягкий бежевый"],["solarized","Solarized","Глубокая бирюза и солнечная охра"],["catppuccin","Catppuccin","Пастельный персик и прохладный фон"],["rose-pine","Rosé Pine","Пыльная роза, хвоя и жемчуг"],["kanagawa","Kanagawa","Чернила, морская волна и песок"],["github","GitHub","Простой прохладный серый"],["paper","Paper","Серая бумага и мягкий карандаш"],["classic","Классическая","Угольный фон и спокойный синий"],["stone","Камень","Цвета графита с тёмным центром и светлыми панелями"]];

const categories=[{id:'general',label:'Общее',Icon:Gear},{id:'appearance',label:'Оформление',Icon:Palette},{id:'interface',label:'Интерфейс',Icon:Monitor},{id:'editor',label:'Редактор',Icon:PencilSimple},{id:'shortcuts',label:'Горячие клавиши',Icon:Keyboard},{id:'storage',label:'Хранилище',Icon:Folder}] as const;
export default function SettingsPanel({settings,update,appearance,storage}:{settings:Settings;update:(patch:Partial<Settings>)=>void;appearance:ReactNode;storage:ReactNode}){
  const [category,setCategory]=useState<typeof categories[number]['id']>('general');
  const [query,setQuery]=useState('');
  const [error,setError]=useState('');
  return <div className="settings-layout"><div className="settings-category-content">
    {category==='general'&&<section><h3>Общее</h3><label className="setting-row"><span>Язык интерфейса</span><select aria-label="Язык интерфейса" value={settings.language??'ru'} onChange={event=>update({language:event.target.value as 'ru'|'en'})}><option value="ru">Русский</option><option value="en">English</option></select></label><p className="subtle">Заметки сохраняются автоматически в выбранном хранилище. Несохранённые изменения восстанавливаются из локальных черновиков.</p><p className="subtle">Можно открыть до восьми независимых центральных окон. Новое окно копирует вкладки исходного окна.</p></section>}
    {category==='appearance'&&<section><h3>Оформление</h3><details className="theme-menu"><summary><span>Темы</span><small>{interfaceThemes.find(([id])=>id===settings.interfaceTheme)?.[1]??'Графит'}</small></summary><p className="subtle" id="theme-help">Тема задаёт сочетание цветов поверхностей, текста и акцентов. Палитра добавляет выбранный оттенок поверх любой темы.</p><div className="theme-picker" role="group" aria-label="Тема приложения" aria-describedby="theme-help">{interfaceThemes.map(([id,label,description])=><button type="button" className="theme-option" data-theme={id} key={id} aria-pressed={(interfaceThemes.some(([key])=>key===settings.interfaceTheme)?settings.interfaceTheme:'graphite')===id} onClick={()=>update({interfaceTheme:id})}><span className="theme-preview" aria-hidden="true"><i/><i/><i/><i/></span><strong>{label}</strong><small>{description}</small></button>)}</div></details>{appearance}</section>}
    {category==='interface'&&<section><h3>Интерфейс</h3>
      <label className="setting-row settings-ring-toggle"><span>Декоративные кольца в правой панели</span><input type="checkbox" role="switch" checked={settings.decorativeRings??false} onChange={event=>update({decorativeRings:event.target.checked})}/></label>
      <label className="range-label">Масштаб интерфейса <output>{settings.uiScale??100}%</output><input aria-label="Масштаб интерфейса" type="range" min="75" max="150" step="5" value={settings.uiScale??100} onChange={event=>update({uiScale:Number(event.target.value)})}/></label>
      <label className="range-label">Яркость обводки <output>{settings.borderBrightness??20}%</output><input aria-label="Яркость обводки" type="range" min="0" max="100" value={settings.borderBrightness??20} onChange={event=>update({borderBrightness:Number(event.target.value)})}/></label>
      <label className="range-label">Контраст интерфейса <output>{settings.contrast??100}%</output><input type="range" min="70" max="140" value={settings.contrast??100} onChange={event=>update({contrast:Number(event.target.value)})}/></label>
      <label className="range-label">Размер шрифта интерфейса <output>{settings.uiFontSize??14} px</output><input type="range" min="13" max="24" value={settings.uiFontSize??14} onChange={event=>update({uiFontSize:Number(event.target.value)})}/></label>
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
  </div><nav className="settings-categories" aria-label="Категории настроек"><label className="settings-search"><MagnifyingGlass size={17}/><input aria-label="Поиск раздела настроек" placeholder="Поиск раздела..." value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="settings-nav-title">Настройки</div>{categories.filter(({label})=>(label+' '+englishLabel(label)).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(({id,label,Icon})=><button key={id} aria-current={category===id?'page':undefined} onClick={()=>{setCategory(id);setError('');}}><Icon size={18} weight="regular"/><span>{label}</span></button>)}</nav></div>;
}
