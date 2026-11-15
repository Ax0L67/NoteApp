import {describe,it,expect} from 'vitest';
import {alignCanvasWidget} from './canvasGeometry';

describe('привязка блоков полотна',()=>{
 it('выравнивает по центру другого блока и показывает направляющую',()=>{
  expect(alignCanvasWidget({x:198,y:41},{width:100,height:60},[{x:100,y:40,width:300,height:80}],22,false,true)).toMatchObject({x:200,y:40,guideX:250,guideY:40});
 });
 it('отключает направляющие и сетку независимо',()=>{
  expect(alignCanvasWidget({x:23,y:23},{width:100,height:60},[],22,true,false)).toMatchObject({x:22,y:22,guideX:null});
  expect(alignCanvasWidget({x:23,y:23},{width:100,height:60},[],22,false,false)).toMatchObject({x:23,y:23});
 });
});
