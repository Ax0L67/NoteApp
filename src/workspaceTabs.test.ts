import {describe,expect,it} from 'vitest';
import {folderTabKey,locationTabKey,replaceTab,tabLocation} from './workspaceTabs';

describe('Вкладки проектов и папок',()=>{
  it('сохраняет личный проект, вложенные папки и имена с разделителями',()=>{
    for(const tab of [{project:'Личное',path:''},{project:'Учёба',path:'Учёба/Раздел/Подраздел'},
      {project:'Исследования [1]',path:'Исследования [1]/Тема, часть 2'}]){
      expect(tabLocation(folderTabKey(tab))).toEqual({kind:'folder',...tab});
    }
  });
  it('различает карты, заметки и ошибочные ключи папок',()=>{
    expect(tabLocation('home')).toEqual({kind:'home'});
    expect(tabLocation('graph:Учёба')).toEqual({kind:'graph',project:'Учёба'});
    expect(tabLocation('Учёба/Заметка.md')).toEqual({kind:'note',path:'Учёба/Заметка.md'});
    expect(tabLocation('folder:bad')).toBeNull();
    expect(tabLocation('folder:[123,"Папка"]')).toBeNull();
  });
  it('продолжает текущую вкладку, сохраняя её место и отдельную вкладку домой',()=>{
    const source=folderTabKey({project:'Учёба',path:'Учёба'});
    const destination=locationTabKey({kind:'note',path:'Учёба/Заметка.md'});
    expect(replaceTab(['home',source,'other.md'],source,destination)).toEqual(['home',destination,'other.md']);
    expect(replaceTab(['home',source,destination],source,destination)).toEqual(['home',destination]);
    expect(replaceTab(['home'],'home',source)).toEqual(['home',source]);
  });
});
