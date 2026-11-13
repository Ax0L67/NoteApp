import {describe,it,expect} from 'vitest';
import {chromeStyle,chromeTransparency,customColor,resetActivePalette} from './appearanceSettings';
import type {Settings} from './types';

describe('Оформление текущего окна',()=>{
  const settings:Settings={overviewPalette:'sage',overviewPaletteBlend:'sand',
    projectPalettes:{Личное:'lavender',Работа:'nord'},projectPaletteBlends:{Личное:'slate',Работа:'sand'},
    panelAppearance:{navigation:{palette:'dracula'}}};
  it('сбрасывает текущий проект и панели, сохраняя оформление остальных окон',()=>{
    const next={...settings,...resetActivePalette(settings,'Личное')};
    expect(next.projectPalettes).toEqual({Личное:null,Работа:'nord'});
    expect(next.projectPaletteBlends).toEqual({Личное:null,Работа:'sand'});
    expect(next.overviewPalette).toBe('sage');
    expect(next.panelAppearance).toEqual({});
    expect(settings.projectPalettes?.Личное).toBe('lavender');
  });
  it('сброс «Все проекты» не меняет палитры проектов',()=>{
    const next={...settings,...resetActivePalette(settings,null)};
    expect(next.overviewPalette).toBeUndefined();
    expect(next.overviewPaletteBlend).toBeUndefined();
    expect(next.projectPalettes).toEqual(settings.projectPalettes);
  });
  it('ограничивает прозрачность и принимает только безопасный HEX-цвет',()=>{
    expect(chromeStyle()).toHaveProperty('--chrome-opacity','100%');
    expect(chromeStyle(100)).toHaveProperty('--chrome-opacity','0%');
    const transparent=chromeStyle(100) as Record<string,number>;
    expect(transparent['--chrome-line-solid']).toBeGreaterThan(transparent['--chrome-control-solid']);
    expect(chromeTransparency(-5)).toBe(0);expect(chromeTransparency(200)).toBe(100);
    expect(chromeTransparency(NaN)).toBe(0);
    expect(customColor('#12AbF0')).toBe('#12AbF0');
    expect(customColor('red;display:none')).toBe(customColor());
  });
});
