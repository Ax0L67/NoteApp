export const shortcutActions=[
  {id:'search',label:'Быстрый поиск',binding:'Mod+KeyK'},
  {id:'new',label:'Новая заметка',binding:'Mod+KeyN'},
  {id:'save',label:'Сохранить',binding:'Mod+KeyS'},
  {id:'read',label:'Чтение / редактирование',binding:'Mod+KeyE'},
  {id:'focus',label:'Фокус',binding:'Mod+Alt+KeyF'},
  {id:'home',label:'Все проекты',binding:'Mod+Alt+KeyH'},
  {id:'closeTabs',label:'Закрыть вкладки окна',binding:'Mod+Alt+KeyW'},
  {id:'back',label:'Назад',binding:'Alt+ArrowLeft'},
  {id:'forward',label:'Вперёд',binding:'Alt+ArrowRight'},
] as const;
export type ShortcutAction=typeof shortcutActions[number]['id'];
export function shortcutBinding(event:Pick<KeyboardEvent,'ctrlKey'|'metaKey'|'altKey'|'shiftKey'|'code'>) {
  if(event.shiftKey||(!event.ctrlKey&&!event.metaKey&&!event.altKey)||['ControlLeft','ControlRight','MetaLeft','MetaRight','AltLeft','AltRight','ShiftLeft','ShiftRight','Escape','Tab'].includes(event.code))return null;
  return [(event.ctrlKey||event.metaKey)&&'Mod',event.altKey&&'Alt',event.code].filter(Boolean).join('+');
}
export const shortcutMatches=(event:KeyboardEvent,binding:string)=>shortcutBinding(event)===binding;
export const shortcutLabel=(binding:string)=>binding.replace('Mod','Ctrl / ⌘').replace('Key','').replace('Digit','').replace('ArrowLeft','←').replace('ArrowRight','→').replaceAll('+',' + ');
