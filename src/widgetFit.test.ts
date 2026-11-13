import {describe,expect,it} from 'vitest';
import {widgetFitScale} from './widgetFit';

describe('widget fit',()=>{
  it('fits the entire content into a smaller or larger widget',()=>{
    expect(widgetFitScale(300,150,600,300)).toBe(.5);
    expect(widgetFitScale(1200,600,600,300)).toBe(2);
    expect(widgetFitScale(600,120,600,300)).toBe(.4);
  });
  it('handles unmeasured elements',()=>expect(widgetFitScale(0,0,0,0)).toBe(1));
});
