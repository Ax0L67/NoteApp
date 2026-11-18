import {expect,it} from 'vitest';
import {kanbanExportWidth} from './notePng';

it('fits the exported board to its columns and margins',()=>{
 expect(kanbanExportWidth([250],10,52)).toBe(302);
 expect(kanbanExportWidth([250,250,250],10,52)).toBe(822);
});
