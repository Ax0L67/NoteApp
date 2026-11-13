import {expect,it} from 'vitest';import {widgetOutline} from './widgetOutline';
it('removes the shared seam and rounds a joined rectangle',()=>{const path=widgetOutline([{x:0,y:0,width:100,height:100},{x:100,y:0,width:100,height:100}]);expect((path.match(/A/g)??[]).length).toBe(4);expect(path).not.toContain('L100 0');});
it('rounds inner and outer corners of an offset join',()=>{const path=widgetOutline([{x:0,y:0,width:100,height:100},{x:100,y:50,width:100,height:100}]);expect((path.match(/A/g)??[]).length).toBe(8);expect(path).not.toMatch(/NaN|Infinity/);});

it('merges subpixel seams at editor zoom',()=>{expect((widgetOutline([{x:0,y:0,width:100,height:100},{x:100.2,y:.2,width:100,height:100}]).match(/M/g)??[]).length).toBe(1);});

it('draws the tab and panel as one outline with inward circular joins',()=>{
 const path=widgetOutline([{x:0,y:36,width:600,height:400},{x:24,y:0,width:120,height:37}],12);
 expect((path.match(/M/g)??[]).length).toBe(1);
 expect((path.match(/A/g)??[]).length).toBe(8);
 expect(path).toContain('A12 12 0 0 0');
 expect(path).not.toMatch(/NaN|Infinity|Q/);
});