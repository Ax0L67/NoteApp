export interface NativeDetachedWindow {
  once(event:string,handler:(event?:unknown)=>void):unknown;
  show():Promise<unknown>;
  setFocus():Promise<unknown>;
}

export async function focusOrCreateDetachedWindow(
  getExisting:()=>Promise<NativeDetachedWindow|null>,
  create:()=>NativeDetachedWindow|Promise<NativeDetachedWindow>,
) {
  const existing=await getExisting();
  if(existing){await existing.show();await existing.setFocus();return;}
  const detached=await create();
  await new Promise<void>((resolve,reject)=>{
    detached.once('tauri://created',()=>resolve());
    detached.once('tauri://error',()=>reject(new Error('Не удалось создать отдельное окно')));
  });
  await detached.show();
  await detached.setFocus();
}
