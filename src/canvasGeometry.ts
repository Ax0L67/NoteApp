export type Rect={x:number;y:number;width:number;height:number};

export function alignCanvasWidget(position:{x:number;y:number},size:{width:number;height:number},others:Rect[],step:number,grid:boolean,guides:boolean,threshold=8){
 const result={x:grid?Math.round(position.x/step)*step:position.x,y:grid?Math.round(position.y/step)*step:position.y,guideX:null as number|null,guideY:null as number|null};
 if(!guides)return result;
 const snap=(axis:'x'|'y')=>{
  const dimension=axis==='x'?'width':'height';
  const value=result[axis],length=size[dimension];
  let best=threshold;
  for(const other of others){
   for(const target of [other[axis],other[axis]+other[dimension]/2,other[axis]+other[dimension]]){
    for(const offset of [0,length/2,length]){
     const distance=Math.abs(target-(value+offset));
     if(distance<best){best=distance;result[axis]=target-offset;result[axis==='x'?'guideX':'guideY']=target;}
    }
   }
  }
 };
 snap('x');snap('y');return result;
}
