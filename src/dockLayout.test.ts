import {describe,expect,it} from 'vitest';
import {dockPanelWeight,placeDockPanel,readDockLayout,swapDockPanels,type DockLayout} from './dockLayout';

describe('Размещение панелей',()=>{
  it('поддерживает старые настройки размеров и повреждённую раскладку',()=>{
    expect(readDockLayout(undefined,500,450).sizes).toMatchObject({left:500,right:450});
    const malformed={sides:{navigation:'outside'},order:['inspector','inspector','unknown'],
      sizes:{left:NaN,right:50000},weights:{navigation:-1}} as unknown as DockLayout;
    const layout=readDockLayout(malformed);
    expect(layout.sides).toEqual({navigation:'left',inspector:'right'});
    expect(layout.order).toEqual(['inspector','navigation']);
    expect(layout.sizes.left).toBe(334);
    expect(layout.sizes.right).toBe(10000);
    expect(layout.weights.navigation).toBe(.1);
  });
  it('объединяет панели, меняет их порядок и сохраняет обе при обмене',()=>{
    const original=readDockLayout(undefined);
    const stacked=placeDockPanel(original,'inspector','left','navigation');
    expect(stacked.sides).toEqual({navigation:'left',inspector:'left'});
    expect(stacked.order).toEqual(['inspector','navigation']);
    expect(swapDockPanels(stacked).order).toEqual(['navigation','inspector']);
    expect(swapDockPanels(original).sides).toEqual({navigation:'right',inspector:'left'});
    expect(original.sides).toEqual({navigation:'left',inspector:'right'});
  });
  it('сохраняет нижнее размещение и полностью свёрнутую верхнюю панель',()=>{
    const initial=readDockLayout(undefined);
    const bottom=placeDockPanel(initial,'inspector','bottom');
    expect(readDockLayout(bottom).sides.inspector).toBe('bottom');
    expect(readDockLayout({...bottom,sizes:{...bottom.sizes,top:0}}).sizes.top).toBe(0);
  });
  it('разворачивает отделённую панель после изменения пропорций группы',()=>{
    const original=readDockLayout(undefined);
    const stacked=placeDockPanel({...original,weights:{navigation:.1,inspector:1.9}},'inspector','left');
    const separated=placeDockPanel(stacked,'navigation','right');
    expect(dockPanelWeight(separated,'navigation',['navigation'])).toBe(1);
    expect(dockPanelWeight(separated,'inspector',['inspector'])).toBe(1);
    expect(dockPanelWeight(stacked,'navigation',['navigation','inspector'])+
      dockPanelWeight(stacked,'inspector',['navigation','inspector'])).toBe(1);
  });
  it('открывает свёрнутую верхнюю сторону при переносе панели',()=>{
    const original=readDockLayout(undefined);
    expect(placeDockPanel({...original,sizes:{...original.sizes,top:0}},'navigation','top').sizes.top).toBe(220);
  });
});
