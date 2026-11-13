import {describe,expect,it} from 'vitest';
import {createGraphRouter,graphRoutePath,hierarchyBranchRoutes} from './graphRoutes';

type Box={x:number;y:number;width:number;height:number};

// Sample the rendered straight and quadratic segments, including their rounded corners.
function expectClear(path:string,boxes:Box[]) {
  const commands=[...path.matchAll(/([MLQC])([^MLQC]+)/g)];
  expect(commands.length).toBeGreaterThan(1);
  let start={x:0,y:0};
  for(const [,command,values] of commands){
    const coordinates=values.trim().split(/[ ,]+/).map(Number);
    const end={x:coordinates.at(-2)!,y:coordinates.at(-1)!};
    if(command!=='M')for(let step=0;step<=200;step++){
      const t=step/200,u=1-t;
      const point=command==='C'?{
        x:u*u*u*start.x+3*u*u*t*coordinates[0]+3*u*t*t*coordinates[2]+t*t*t*end.x,
        y:u*u*u*start.y+3*u*u*t*coordinates[1]+3*u*t*t*coordinates[3]+t*t*t*end.y,
      }:command==='Q'?{
        x:u*u*start.x+2*u*t*coordinates[0]+t*t*end.x,
        y:u*u*start.y+2*u*t*coordinates[1]+t*t*end.y,
      }:{x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t};
      for(const box of boxes)expect(point.x>box.x-2&&point.x<box.x+box.width+2&&
        point.y>box.y-2&&point.y<box.y+box.height+2).toBe(false);
    }
    start=end;
  }
}

describe('Связи обходят виджеты карты',()=>{
  const source={x:0,y:0,width:100,height:80};
  const target={x:600,y:0,width:100,height:80};
  it('между рядами выходит снизу и входит сверху без обратных изгибов',()=>{
    const below={x:250,y:200,width:100,height:80};
    const boxes=[source,below],route=createGraphRouter(boxes);
    const points=route(source,below);
    expect(points[0]).toEqual({x:50,y:86});
    expect(points.at(-1)).toEqual({x:300,y:194});
    expect(route(source,below)).toEqual(points);
    const path=graphRoutePath(points,boxes);
    expectClear(path,boxes);
    expect(path).toContain('Q');
    for(let i=1;i<points.length;i++)expect(points[i].x===points[i-1].x||points[i].y===points[i-1].y).toBe(true);
  });
  it('сохраняет центральное подключение, пока оно свободно, и смещает его при препятствии',()=>{
    const root={x:0,y:0,width:200,height:80},child={x:0,y:200,width:200,height:80};
    expect(createGraphRouter([root,child])(root,child,true)[0]).toEqual({x:100,y:86});
    const obstacle={x:90,y:90,width:20,height:20};
    const alternate=createGraphRouter([root,child,obstacle])(root,child,true)[0];
    expect(alternate.y).toBe(86);
    expect(alternate.x).not.toBe(100);
  });
  it('соединяет ближайшие стороны с отступом от карточек',()=>{
    const route=createGraphRouter([source,target])(source,target);
    expect(route[0]).toEqual({x:106,y:40});
    expect(route.at(-1)).toEqual({x:594,y:40});
    const path=graphRoutePath(route,[source,target]);
    expect(path).not.toContain('C');
    expectClear(path,[source,target]);
  });
  it('обходит высокие виджеты и пересчитывает маршрут после перемещения',()=>{
    const obstacle={x:250,y:-200,width:200,height:480};
    const boxes=[source,target,obstacle];
    const path=graphRoutePath(createGraphRouter(boxes)(source,target),boxes);
    expectClear(path,boxes);
    const moved={...obstacle,y:400};
    const next=graphRoutePath(createGraphRouter([source,target,moved])(source,target),[source,target,moved]);
    expect(next).not.toBe(path);
    expectClear(next,[source,target,moved]);
  });
  it('обходит несколько перекрывающихся препятствий, в том числе при обратной связи',()=>{
    const boxes=[source,target,{x:170,y:-160,width:170,height:250},
      {x:300,y:30,width:170,height:270}];
    const route=createGraphRouter(boxes);
    expectClear(graphRoutePath(route(source,target),boxes),boxes);
    expectClear(graphRoutePath(route(target,source),boxes),boxes);
  });
  it('учитывает высоту комментариев, отрицательные координаты и вертикальные связи',()=>{
    const a={x:-200,y:-400,width:180,height:160};
    const b={x:-200,y:350,width:180,height:100};
    const boxes=[a,b,{x:-400,y:-150,width:600,height:380}];
    expectClear(graphRoutePath(createGraphRouter(boxes)(a,b),boxes),boxes);
  });
  it('строит только горизонтальные и вертикальные отрезки при обходе препятствий',()=>{
    const boxes=[source,target,{x:250,y:-200,width:200,height:480}];
    const route=createGraphRouter(boxes);
    for(const [a,b] of [[source,target],[target,source]]){
      const points=route(a,b);
      expect(points.length).toBeGreaterThan(2);
      for(let i=1;i<points.length;i++)expect(points[i].x===points[i-1].x||points[i].y===points[i-1].y).toBe(true);
      expectClear(graphRoutePath(points,boxes),boxes);
    }
  });
  it('ведёт соседние нисходящие связи по общей сеточной магистрали и разветвляет у целей',()=>{
    const root={x:16,y:16,width:96,height:64},first={x:240,y:208,width:96,height:64},second={x:400,y:208,width:96,height:64},step=32;
    const route=createGraphRouter([root,first,second],step),a=route(root,first,true),b=route(root,second,true);
    let shared=0;
    for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){
      const p=a[i-1],q=a[i],r=b[j-1],s=b[j],horizontal=p.y===q.y&&r.y===s.y&&p.y===r.y,vertical=p.x===q.x&&r.x===s.x&&p.x===r.x;
      if(horizontal)shared=Math.max(shared,Math.min(Math.max(p.x,q.x),Math.max(r.x,s.x))-Math.max(Math.min(p.x,q.x),Math.min(r.x,s.x)));
      if(vertical)shared=Math.max(shared,Math.min(Math.max(p.y,q.y),Math.max(r.y,s.y))-Math.max(Math.min(p.y,q.y),Math.min(r.y,s.y)));
    }
    expect(shared).toBeGreaterThanOrEqual(step*2);
    expect(a.at(-1)).not.toEqual(b.at(-1));
    for(const point of [...a,...b])expect([point.x,point.y].every(value=>Math.abs((value-step/2)%step)<1e-6)).toBe(true);
  });
  it('ветвит нисходящую иерархическую связь от общей магистрали по сетке',()=>{
    const parent={x:100,y:20,width:120,height:80},children=[
      {x:0,y:180,width:80,height:60},{x:240,y:180,width:80,height:60},
    ];
    expect(hierarchyBranchRoutes(parent,children,32)).toEqual([
      [{x:160,y:100},{x:160,y:144},{x:40,y:144},{x:40,y:180}],
      [{x:160,y:100},{x:160,y:144},{x:280,y:144},{x:280,y:180}],
    ]);
  });
  it('не рисует линию через полностью перекрытый виджет',()=>{
    const covering={x:-50,y:-50,width:200,height:180};
    expect(createGraphRouter([source,target,covering])(source,target)).toEqual([]);
    expect(graphRoutePath([])).toBe('');
  });
  it('скругляет ортогональные повороты без пересечения соседних виджетов',()=>{
    const points=[{x:0,y:0},{x:32,y:0},{x:32,y:168},{x:200,y:168},{x:200,y:200}];
    const boxes=[{x:130,y:40,width:30,height:40}];
    const path=graphRoutePath(points,boxes);
    expect(path).toContain('Q');
    expectClear(path,boxes);
  });
});

it('keeps a single overlapping child connection vertical',()=>{
  const parent={x:16,y:16,width:160,height:96},child={x:32,y:208,width:96,height:64};
  const [points]=hierarchyBranchRoutes(parent,[child],32);
  expect(points).toHaveLength(2);
  expect(points[0].x).toBe(points[1].x);
});

it('does not bend a straight route to join an earlier route',()=>{
  const a={x:0,y:0,width:100,height:80},b={x:300,y:0,width:100,height:80};
  const c={x:0,y:100,width:100,height:80},d={x:300,y:100,width:100,height:80};
  const route=createGraphRouter([a,b,c,d]);
  route(a,b);
  expect(route(c,d)).toHaveLength(2);
});
