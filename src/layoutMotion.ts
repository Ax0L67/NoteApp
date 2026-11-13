export function captureLayout(root:HTMLElement|null,selector='[data-layout-key]') {
  if(!root||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return new Map<string,DOMRect>();
  return new Map(Array.from(root.querySelectorAll<HTMLElement>(selector),
    element=>[element.dataset.layoutKey!,element.getBoundingClientRect()]));
}

export function animateLayout(root:HTMLElement|null,before:Map<string,DOMRect>,selector='[data-layout-key]') {
  if(!root||!before.size)return;
  for(const element of root.querySelectorAll<HTMLElement>(selector)){
    const previous=before.get(element.dataset.layoutKey!);
    if(!previous)continue;
    for(const animation of element.getAnimations())if(animation.id==='workspace-reorder')animation.cancel();
    const after=element.getBoundingClientRect();
    const x=previous.left-after.left,y=previous.top-after.top;
    if(x||y)element.animate([{translate:`${x}px ${y}px`},{translate:'0 0'}],{
      id:'workspace-reorder',duration:230,easing:'cubic-bezier(.2,.75,.25,1)',
    });
  }
}
