export function mergeTabOrder(saved:string[],available:string[]) {
  const live=new Set(available);
  return [...new Set([...saved.filter(key=>live.has(key)),...available])];
}

export function reorderTab(order:string[],key:string,index:number) {
  const next=order.filter(item=>item!==key);
  next.splice(index,0,key);
  return next;
}
