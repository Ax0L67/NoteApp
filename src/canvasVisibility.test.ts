import {expect,it} from 'vitest';
import {visibleCanvasRect} from './canvasGeometry';

it('keeps objects visible at the viewport edge and excludes distant objects',()=>{
 const view={x:-500,y:-200,scale:2},viewport={width:800,height:600};
 expect(visibleCanvasRect({x:260,y:110,width:200,height:100},view,viewport,0)).toBe(true);
 expect(visibleCanvasRect({x:2000,y:2000,width:100,height:100},view,viewport,0)).toBe(false);
});
