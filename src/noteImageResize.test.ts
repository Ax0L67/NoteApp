import {expect,it} from 'vitest';
import {resizeImage} from './noteImages';

it('resizes from an edge while keeping the opposite edge fixed',()=>{
 expect(resizeImage({x:40,y:20,width:160,height:120},'w',32,0,16,500)).toEqual({x:72,y:20,width:128,height:120});
 expect(resizeImage({x:40,y:20,width:160,height:120},'s',0,32,16,500)).toEqual({x:40,y:20,width:160,height:160});
});
