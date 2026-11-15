import {describe,it,expect} from 'vitest';
import {parseCanvas} from './CanvasEditor';

describe('формат полотна',()=>{
 it('читает прежние полотна и сохраняет текст виджета',()=>{
  expect(parseCanvas('{"widgets":[{"id":"a","x":10,"y":20,"text":"**Текст**"}],"strokes":[]}')).toMatchObject({widgets:[{text:'**Текст**'}],snapGrid:true,snapGuides:true});
 });
 it('не считает повреждённое содержимое пустым полотном',()=>{
  expect(parseCanvas('{bad')).toBeNull();
  expect(parseCanvas('{"widgets":[{"x":1}],"strokes":[]}')).toBeNull();
 });
});
