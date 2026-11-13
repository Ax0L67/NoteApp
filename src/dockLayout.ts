export const dockSides=['left','right','top','bottom'] as const;
export const dockPanels=['navigation','inspector'] as const;
export type DockSide=typeof dockSides[number];
export type DockPanel=typeof dockPanels[number];
export type DockLayout={
  sides:Record<DockPanel,DockSide>;
  order:DockPanel[];
  sizes:Record<DockSide,number>;
  weights:Record<DockPanel,number>;
};
const bounded=(value:number|undefined,fallback:number,min:number,max:number)=>
  Number.isFinite(value)?Math.max(min,Math.min(max,value!)):fallback;

export function readDockLayout(value:DockLayout|undefined,left=334,right=282):DockLayout {
  const order=Array.isArray(value?.order)?value.order:[];
  return {
    sides:{
      navigation:dockSides.includes(value?.sides?.navigation!)?value!.sides.navigation:'left',
      inspector:dockSides.includes(value?.sides?.inspector!)?value!.sides.inspector:'right',
    },
    order:[...new Set([...order.filter(id=>dockPanels.includes(id)),...dockPanels])],
    sizes:{
      left:bounded(value?.sizes?.left,bounded(left,334,96,10000),96,10000),
      right:bounded(value?.sizes?.right,bounded(right,282,96,10000),96,10000),
      top:bounded(value?.sizes?.top,220,0,10000),
      bottom:bounded(value?.sizes?.bottom,220,96,10000),
    },
    weights:{
      navigation:bounded(value?.weights?.navigation,1,.1,10),
      inspector:bounded(value?.weights?.inspector,1,.1,10),
    },
  };
}

export function placeDockPanel(layout:DockLayout,panel:DockPanel,side:DockSide,before?:DockPanel):DockLayout {
  const order=layout.order.filter(id=>id!==panel);
  const index=before?order.indexOf(before):-1;
  order.splice(index<0?order.length:index,0,panel);
  const sizes=side==='top'&&layout.sizes.top===0?{...layout.sizes,top:220}:layout.sizes;
  return {...layout,sides:{...layout.sides,[panel]:side},order,sizes};
}

export function dockPanelWeight(layout:DockLayout,panel:DockPanel,group:DockPanel[]) {
  return layout.weights[panel]/group.reduce((sum,id)=>sum+layout.weights[id],0);
}

export function swapDockPanels(layout:DockLayout):DockLayout {
  return {...layout,sides:{navigation:layout.sides.inspector,inspector:layout.sides.navigation},
    order:[...layout.order].reverse()};
}
