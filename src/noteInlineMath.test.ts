import {expect,it} from 'vitest';
import {inlineMathRanges} from './noteInlineMath';

it('recognizes copied inline formulas outside fenced code',()=>{
 expect(inlineMathRanges('Текст \\(f(a)=b\\)\n```\n\\(x\\)\n```').map(item=>item.source)).toEqual(['f(a)=b']);
});
