import {createGraphRouter,graphRoutePath} from './graphRoutes';
import './canvasConnections.css';

export type CanvasConnection={id:string;from:string;to:string};
type ObjectBox={id:string;x:number;y:number;width?:number;height?:number};

export function CanvasConnections({connections,widgets,step}:{connections:CanvasConnection[];widgets:ObjectBox[];step:number}){
 if(!connections.length)return null;
 const boxes=widgets.map(item=>({id:item.id,x:item.x,y:item.y,width:item.width??300,height:item.height??140}));
 const byId=new Map(boxes.map(box=>[box.id,box]));
 return <svg className="canvas-strokes canvas-object-connections" overflow="visible" aria-hidden="true">{connections.map(connection=>{const from=byId.get(connection.from),to=byId.get(connection.to);if(!from||!to)return null;const contains=(outer:ObjectBox,inner:ObjectBox)=>outer.x<=inner.x&&outer.y<=inner.y&&outer.x+(outer.width??300)>=inner.x+(inner.width??300)&&outer.y+(outer.height??140)>=inner.y+(inner.height??140),obstacles=boxes.filter(box=>box===from||box===to||!contains(box,from)&&!contains(box,to)),route=createGraphRouter(obstacles,step),points=route(from,to);if(points.length<2){const a={x:from.x+from.width/2,y:from.y+from.height},b={x:to.x+to.width/2,y:to.y},mid=Math.round((a.y+b.y)/2/step)*step;points.push(a,{x:a.x,y:mid},{x:b.x,y:mid},b)}const path=graphRoutePath(points,obstacles,step);return <path key={connection.id} d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke"/>})}</svg>;
}
