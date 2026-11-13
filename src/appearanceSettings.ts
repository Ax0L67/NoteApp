import type {CSSProperties} from 'react';
import type {Settings} from './types';

export const customColor=(value?:string)=>/^#[\da-f]{6}$/i.test(value??'')?value!:'#8f9bb3';

export function chromeTransparency(value=0) {
  return Number.isFinite(value)?Math.max(0,Math.min(100,value)):0;
}

export function chromeStyle(value?:number):CSSProperties {
  const transparency=chromeTransparency(value);
  return {'--chrome-opacity':`${100-transparency}%`,'--chrome-solid':1-transparency/100,
    '--chrome-control-solid':1-transparency/100*.9,'--chrome-line-solid':1-transparency/100*.55} as CSSProperties;
}

export function resetActivePalette(settings:Settings,project:string|null):Partial<Settings> {
  return project===null?{overviewPalette:undefined,overviewPaletteBlend:undefined,panelAppearance:{}}:{
    projectPalettes:{...settings.projectPalettes,[project]:null},
    projectPaletteBlends:{...settings.projectPaletteBlends,[project]:null},panelAppearance:{},
  };
}
