import { useEffect, useId, useState, type ReactNode, type MouseEvent } from 'react';
import { CaretRight, Palette, Trash } from '@phosphor-icons/react';
import { request } from './storage';
import type { Settings } from './types';
import {gridStyle} from './gridPatterns';
import {customColor as validCustomColor} from './appearanceSettings';
import {textures,textureById} from './textures';

const mainPalettes = [
  { id: 'lavender', name: 'Лаванда' },
  { id: 'slate', name: 'Сумерки' },
  { id: 'sage', name: 'Шалфей' },
  { id: 'sand', name: 'Песок' },
  { id: 'graphite', name: 'Графит' },
];

const extraPalettes = [
  { id: 'plum', name: 'Слива' },
  { id: 'ochre', name: 'Охра' },
  { id: 'petrol', name: 'Бирюза и персик' },
  { id: 'coral', name: 'Коралл' },
  { id: 'iris', name: 'Ирис' },
  { id: 'lagoon', name: 'Лагуна' },
  { id: 'lime', name: 'Лайм' },
  { id: 'mint', name: 'Мята' },
  { id: 'rose', name: 'Розовый лёд' },
  { id: 'cobalt', name: 'Кобальт и золото' },
  { id: 'nord', name: 'Nord · Север' },
  { id: 'dracula', name: 'Dracula · Орхидея' },
  { id: 'custom', name: 'Свой цвет' },
];

export const palettes = [...mainPalettes, ...extraPalettes, ...textures];
export const paletteId = (value?: string) => palettes.some(p => p.id === value) ? value! : 'graphite';
export const paletteDragType='application/x-noteapp-palette';
export function readPaletteDrop(value:string):{palette:string;blend?:string}|null {
  try {
    const data=JSON.parse(value);
    if(!data||!palettes.some(p=>p.id===data.palette)||
      (data.blend!==undefined&&!palettes.some(p=>p.id===data.blend)))return null;
    return {palette:data.palette,blend:data.blend};
  } catch {return null;}
}

export function ProjectPalettePicker({ value, choose, mix, disabled, autoFocus, blend, customColor, changeCustomColor, textureColors, changeTextureColor }: { value: string; choose: (id: string) => void; mix?:(id:string)=>void; disabled?:string; autoFocus?:boolean; blend?:string|null; customColor?:string; changeCustomColor?:(color:string)=>void; textureColors?:Record<string,string>; changeTextureColor?:(id:string,color:string|undefined)=>void }) {
  const [expanded, setExpanded] = useState(false);
  const [showTextures,setShowTextures]=useState(false);
  const texture=textureById(value);
  const extraId = useId();
  const extra = extraPalettes.find(palette => palette.id === value);
  const label = 'Дополнительные палитры' + (extra ? ` · ${extra.name}` : '');

  function swatch(palette: (typeof palettes)[number]) {
    return <button type="button" key={palette.id} className={`palette-swatch palette-${palette.id}`}
      title={palette.name} aria-label={`Палитра ${palette.name}`} aria-pressed={value === palette.id}
      disabled={palette.id===disabled}
      draggable={palette.id!==disabled}
      onDragStart={event=>{
        event.dataTransfer.setData(paletteDragType,JSON.stringify({palette:palette.id,blend:value===palette.id?blend||undefined:undefined}));
        event.dataTransfer.effectAllowed='copy';
      }}
      autoFocus={autoFocus&&palette.id===palettes.find(item=>item.id!==disabled)?.id}
      onContextMenu={mix?event=>{event.preventDefault();mix(palette.id);}:undefined}
      onClick={() => choose(palette.id)}/>;
  }

  return <>
    <div className="swatches" role="group" aria-label="Основные палитры">
      {mainPalettes.map(swatch)}
      <button type="button" className={`icon-button${extra ? ' chosen' : ''}`}
        title={label} aria-label={label} aria-expanded={expanded} aria-controls={extraId}
        onClick={() => setExpanded(!expanded)}><Palette size={18}/></button>
    </div>
    {!disabled&&<button type="button" className="texture-picker-toggle" aria-expanded={showTextures} onClick={()=>setShowTextures(!showTextures)}>Текстуры</button>}
    {showTextures&&<div className="texture-picker" role="group" aria-label="Текстуры">
      <div className="texture-swatches">{textures.map(item=><button type="button" key={item.id} className={`texture-swatch palette-${item.id}`} title={item.name} aria-label={item.name} aria-pressed={value===item.id} draggable onDragStart={event=>{event.dataTransfer.setData(paletteDragType,JSON.stringify({palette:item.id}));event.dataTransfer.effectAllowed='copy';}} onClick={()=>choose(item.id)}><span>{item.name}</span></button>)}</div>
      {texture&&changeTextureColor&&<div className="texture-color"><label>Цвет текстуры <input type="color" value={textureColors?.[texture.id]??texture.color} onChange={event=>changeTextureColor(texture.id,event.target.value)}/></label><button type="button" onClick={()=>changeTextureColor(texture.id,undefined)}>Исходный цвет</button></div>}
    </div>}
    <div id={extraId} hidden={!expanded} className="swatches" role="group" aria-label="Дополнительные палитры">
      {extraPalettes.map(swatch)}
    </div>
    {changeCustomColor&&(expanded||value==='custom'||blend==='custom')&&<label className="custom-palette-color">
      <span>Свой цвет</span><output>{validCustomColor(customColor).toUpperCase()}</output>
      <input type="color" aria-label="Цвет своей палитры" value={validCustomColor(customColor)} onChange={event=>{
        changeCustomColor(validCustomColor(event.target.value));
        if(!disabled&&value!=='custom')choose('custom');
      }}/>
    </label>}
    {mix&&<button type="button" className="palette-mix-action" onClick={()=>mix(value)}><Palette size={16}/>Смешать палитры</button>}
  </>;
}

function useBackground(path: string | null, root: string) {
  const [asset, setAsset] = useState<{ path: string; root: string; url: string }>();
  useEffect(() => {
    if (!path || path.startsWith('/')) return;
    let live = true;
    request<string>('asset', { path }).then(url => {
      if (live) setAsset({ path, root, url });
    }).catch(() => {});
    return () => { live = false; };
  }, [path, root]);
  if (path?.startsWith('/')) return path;
  return asset && asset.path === path && asset.root === root ? asset.url : '';
}

export function NoteBackdrop({ path, root, grid = false, inline = false }: { path: string | null; root: string; grid?: boolean; inline?: boolean }) {
  const url = useBackground(path, root);
  const Element=inline?'span':'div';
  return <Element className={`note-backdrop${grid ? ' with-grid' : ''}${url ? ' has-image' : ''}`} aria-hidden="true">
    {url && <img key={url} src={url} alt="" draggable={false}/>}
  </Element>;
}

export function CardFace({ heading, path, root, children }: {
  heading: ReactNode;
  path: string | null;
  root: string;
  children: ReactNode;
}) {
  return <>
    <strong>{heading}</strong>
    <span className="project-cover">
      <NoteBackdrop path={path} root={root} grid/>
      <span className="project-sections">{children}</span>
    </span>
  </>;
}

export function ProjectCard({ name, sections, path, root, palette, open, archive, showMenu, blend, pattern, gridOpacity }: {
  name: string;
  sections: string[];
  path: string | null;
  root: string;
  palette: string;
  blend?:string|null;
  pattern?:string;
  gridOpacity?:number;
  open: () => void;
  archive: () => void;
  showMenu?:(event:MouseEvent<HTMLElement>)=>void;
}) {
  return <article className={`project-card palette-${palette}`} data-palette-blend={blend??''} style={gridStyle(pattern,gridOpacity)} onContextMenu={showMenu}>
    <button className="project-open" onClick={open} aria-label={`Открыть проект «${name}»`}
      aria-keyshortcuts="Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight">
      <CardFace heading={<>{name}<CaretRight size={19}/></>} path={path} root={root}>
        {sections.length ? sections.map(section => <span key={section}>{section}</span>) : 'Нет вложенных папок'}
      </CardFace>
    </button>
    <button className="project-archive icon-button" onClick={archive} title="Переместить проект в корзину"
      aria-label={`Удалить проект «${name}»`}><Trash size={19}/></button>
  </article>;
}
