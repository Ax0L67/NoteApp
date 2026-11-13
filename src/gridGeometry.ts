export function snapGrid(value:number,step:number,offset=step/2) {
  return Math.round((value-offset)/step)*step+offset;
}

export function snapGridBounded(value:number,max:number,step:number) {
  const last=Math.floor((max-step/2)/step)*step+step/2;
  return last<step/2?0:Math.max(step/2,Math.min(last,snapGrid(value,step)));
}

export function elementGridStep(element:HTMLElement) {
  return parseFloat(getComputedStyle(element).getPropertyValue('--grid-step'))||22;
}

export function elementScale(element:HTMLElement) {
  return element.offsetWidth?element.getBoundingClientRect().width/element.offsetWidth:1;
}
