import type {ExplorerItem} from './Explorer';
import type {MapCard,ProjectConnection,ProjectMap,Settings} from './types';
import {projectRoot} from './projects';
import {mapBlocks} from './mapBlocks';
import {gridStep} from './gridPatterns';
import {layoutProjectGraph} from './ProjectGraph';
// Colons cannot occur in project folder names on Windows.
export const ALL_PROJECTS=':all-projects:';
export const allProjectsRoot:ExplorerItem={kind:'project',project:ALL_PROJECTS,path:'',name:'Все проекты'};
export function allProjectsGraph(projects:string[],settings:Settings,childrenOf:(item:ExplorerItem)=>ExplorerItem[]) {
 const roots:ExplorerItem[]=projects.map(owner=>({kind:'project',project:owner,path:projectRoot(owner),name:owner}));
 const cards:Record<string,MapCard>={},inherited:ProjectConnection[]=[],hidden:ProjectConnection[]=[];let x=48;
 const global=settings.projectMaps?.[ALL_PROJECTS]??{};
 const plain=(link:ProjectConnection)=>!link.from.startsWith('annotation:')&&!link.to.startsWith('annotation:');
 const same=(a:ProjectConnection,b:ProjectConnection)=>a.from===b.from&&a.to===b.to;
 for(const root of roots){
  const owner=root.project,map=settings.projectMaps?.[owner]??{},step=gridStep(settings.projectPatterns?.[owner]);
  const arranged=layoutProjectGraph(root,childrenOf,{},map.cards,1200,null,step,null);
  const nodes=[...arranged.nodes.values()],left=Math.min(...nodes.map(node=>node.x)),right=Math.max(...nodes.map(node=>node.x+node.width));
  const offset={x:x-left,y:240-arranged.bounds.y};
  for(const [id,node] of arranged.nodes)cards[id]={...map.cards?.[id],position:{x:node.x+offset.x,y:node.y+offset.y}};
  inherited.push(...(settings.projectConnections?.[owner]??[]).filter(plain));hidden.push(...(map.hiddenConnections??[]).filter(plain));
  x+=right-left+64;
 }
 if(roots.length){const step=gridStep(settings.projectPatterns?.[ALL_PROJECTS]),width=Math.round(296/step)*step;cards['project:'+ALL_PROJECTS]={position:{x:(48+x-64-width)/2,y:48}};}
 for(const [id,card] of Object.entries(global.cards??{}))cards[id]={...cards[id],...card};
 const map:ProjectMap={...global,cards,blocks:mapBlocks(global),hiddenConnections:[...hidden,...(global.hiddenConnections??[])]};
 const connections=[...inherited.filter(link=>!global.hiddenConnections?.some(hidden=>same(link,hidden))),...(settings.projectConnections?.[ALL_PROJECTS]??[])];
 return {roots,map,connections,inherited};
}
