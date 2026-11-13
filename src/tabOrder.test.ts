import {describe,expect,it} from 'vitest';
import {mergeTabOrder,reorderTab} from './tabOrder';

describe('Общий ряд вкладок',()=>{
  it('перемещает заметки и карты вместе, сохраняя каждую вкладку',()=>{
    const initial=['graph:Учёба','Учёба/Конспект.md','Работа/План.md'];
    const next=reorderTab(initial,'Работа/План.md',0);
    expect(next).toEqual(['Работа/План.md','graph:Учёба','Учёба/Конспект.md']);
    expect(initial).toEqual(['graph:Учёба','Учёба/Конспект.md','Работа/План.md']);
  });
  it('удаляет закрытые вкладки и добавляет новые в конец',()=>{
    expect(mergeTabOrder(['b.md','closed.md','a.md'],['a.md','b.md','graph:Работа']))
      .toEqual(['b.md','a.md','graph:Работа']);
    expect(mergeTabOrder(['a.md','a.md'],['a.md','a.md'])).toEqual(['a.md']);
  });
});
