import {expect,it} from 'vitest';
import {readCentralWindows} from './centralWindowState';

it('restores a window moved close to the top of the application',()=>{
 const [window]=readCentralWindows([{id:'main',tabs:['home'],active:'home',x:0,y:-70,width:400,height:300}]);
 expect(window.y).toBe(-70);
});
