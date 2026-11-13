import {describe,expect,it,vi} from 'vitest';
import {focusOrCreateDetachedWindow,type NativeDetachedWindow} from './detachedWindow';

class FakeWindow implements NativeDetachedWindow {
  listeners=new Map<string,()=>void>();
  show=vi.fn(async()=>{});
  setFocus=vi.fn(async()=>{});
  once(event:string,handler:()=>void){this.listeners.set(event,handler);}
  emit(event:string){this.listeners.get(event)?.();}
}

describe('создание отдельного окна',()=>{
  it('повторно показывает и фокусирует уже существующее окно',async()=>{
    const existing=new FakeWindow(),create=vi.fn();
    await focusOrCreateDetachedWindow(async()=>existing,create);
    expect(existing.show).toHaveBeenCalledOnce();
    expect(existing.setFocus).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });

  it('ждёт создания нового окна, затем показывает его и переводит на него фокус',async()=>{
    const detached=new FakeWindow(),create=vi.fn(()=>detached);
    const opening=focusOrCreateDetachedWindow(async()=>null,create);
    await vi.waitFor(()=>expect(create).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledOnce();
    expect(detached.show).not.toHaveBeenCalled();
    detached.emit('tauri://created');
    await opening;
    expect(detached.show).toHaveBeenCalledOnce();
    expect(detached.setFocus).toHaveBeenCalledOnce();
  });

  it('возвращает ошибку создания, чтобы вызывающая сторона восстановила состояние',async()=>{
    const detached=new FakeWindow(),opening=focusOrCreateDetachedWindow(async()=>null,()=>detached);
    await vi.waitFor(()=>expect(detached.listeners.has('tauri://error')).toBe(true));
    detached.emit('tauri://error');
    await expect(opening).rejects.toThrow('Не удалось создать отдельное окно');
    expect(detached.show).not.toHaveBeenCalled();
  });
});
