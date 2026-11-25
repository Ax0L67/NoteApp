import {describe,expect,it} from 'vitest';
import {customThemeStyle,paletteColors} from './customThemes';

describe('custom themes',()=>{
 it('reads Coolors links and HEX colors without accepting unrelated URLs',()=>{
  expect(paletteColors('https://coolors.co/f0ead2-dde5b6-adc178')).toEqual(['#f0ead2','#dde5b6','#adc178']);
  expect(paletteColors('#123456, abcdef #123456')).toEqual(['#123456','#abcdef']);
  expect(paletteColors('https://example.com/123456-abcdef')).toEqual([]);
 });
 it('uses the darkest and lightest palette colors for the theme',()=>{
  expect(customThemeStyle({id:'test',name:'Test',colors:['#ffffff','#000000','#55aa55']})).toMatchObject({'--theme-deep':'#000000','--theme-pale':'#ffffff'});
 });
});
