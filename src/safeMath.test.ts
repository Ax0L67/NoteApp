import {expect,it} from 'vitest';
import {evaluateMathVariables} from './safeMath';

it('evaluates each supplied value for a single independent variable',()=>{
 expect(evaluateMathVariables('sin(x) + x^2',[{name:'x1',value:0},{name:'x2',value:2}])).toEqual([
  {target:'x',result:0},{target:'x',result:Math.sin(2)+4},
 ]);
});

it('keeps current values together for expressions with several variables',()=>{
 expect(evaluateMathVariables('x + y',[{name:'x',value:2},{name:'y',value:3}])).toEqual([
  {target:'x',result:5},{target:'y',result:5},
 ]);
});
