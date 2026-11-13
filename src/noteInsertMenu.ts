export function noteInsertMenu(label:string, moving=true) {
  const menu=document.createElement('details');
  menu.className='note-insert-menu';
  const trigger=document.createElement('summary');
  trigger.title=label;
  trigger.setAttribute('aria-label',label);
  const actions=document.createElement('div');
  actions.className='note-insert-actions';
  const move=document.createElement('button');
  move.type='button';
  move.textContent=moving?'Переместить':'Изменить';
  if(moving){
    move.className='note-insert-move';
    move.title='Перетащите кнопку или используйте клавиши со стрелками';
    move.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown ArrowLeft ArrowRight');
  }
  const remove=document.createElement('button');
  remove.type='button';
  remove.textContent='Удалить';
  actions.append(move,remove);
  menu.append(trigger,actions);
  menu.addEventListener('focusout',event=>{
    if(!menu.contains(event.relatedTarget as Node|null))menu.open=false;
  });
  menu.onkeydown=event=>{
    if(event.key!=='Escape'||!menu.open)return;
    event.preventDefault();
    event.stopPropagation();
    menu.open=false;
    trigger.focus();
  };
  return {menu,actions,move,remove};
}
