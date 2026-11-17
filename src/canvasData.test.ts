import {describe,it,expect} from 'vitest';
import {canvasFeature,parseCanvas} from './CanvasEditor';

describe('формат полотна',()=>{
 it('читает прежние полотна и сохраняет текст виджета',()=>{
  expect(parseCanvas('{"widgets":[{"id":"a","x":10,"y":20,"text":"**Текст**"}],"strokes":[]}')).toMatchObject({widgets:[{text:'**Текст**'}],snapGrid:true,snapGuides:true});
 });
 it('не считает повреждённое содержимое пустым полотном',()=>{
  expect(parseCanvas('{bad')).toBeNull();
  expect(parseCanvas('{"widgets":[{"x":1}],"strokes":[]}')).toBeNull();
 });
 it('читает все типы виджетов и их настройки без потери данных',()=>{
  for(const kind of ['compare','source','concept','code','table','math','plot','board']){
   const widget={id:kind,x:10,y:20,text:'содержимое',kind,width:720,height:480,borderWidth:2,scale:1.25,color:'#aaaaaa',fill:'#222222'};
   expect(parseCanvas(JSON.stringify({widgets:[widget],strokes:[]}))?.widgets[0]).toEqual(widget);
  }
 });
 it('сохраняет старый блок заметки при изменении виджета полотна',()=>{
  const source='Ссылка на термин\n\n```noteapp-plot\n{"expressions":["x"]}\n```';
  const content=canvasFeature('plot',source);
  const updated=content!.write({...content!.value,plotColor:'#abcdef'});
  expect(updated).toContain('Ссылка на термин\n\n```noteapp-plot');
  expect(canvasFeature('plot',updated)?.value.plotColor).toBe('#abcdef');
 });
});
